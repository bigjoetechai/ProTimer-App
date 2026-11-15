/**
 * Monitor Detection Service.
 * Bridges React UI with Electron native Windows monitor detection API and Web Multi-Screen API.
 * Maintains completely independent monitor selection and Fullscreen window lifecycle for each list tab,
 * as well as independent Multi FS output.
 */

import { DetectedMonitor, DisplayTarget } from '../types';
import { displaySyncService } from './displaySyncService';

export type MonitorChangeListener = (displays: DetectedMonitor[]) => void;
export type OutputStateListener = (
  isActive: boolean,
  activeByList: Record<string, boolean>,
  monitorsByList: Record<string, string>
) => void;
export type MultiOutputStateListener = (isActive: boolean) => void;

const LIST_MONITORS_STORAGE_KEY = 'protimer_list_fullscreen_monitors_v1';

class MonitorDetectionService {
  private displays: DetectedMonitor[] = [];
  private selectedMonitorId: string = 'Auto';
  private selectedMonitorsByList: Record<string, string> = {};
  private activeFullscreenByList: Record<string, boolean> = {};
  private isFullscreenActive: boolean = false;
  private isMultiFullscreenActive: boolean = false;

  private fullscreenBrowserWindow: Window | null = null;
  private fullscreenBrowserWindowsByList: Map<string, Window> = new Map();
  private multiFullscreenBrowserWindow: Window | null = null;
  private browserWindowCheckTimer: number | null = null;

  private monitorListeners: Set<MonitorChangeListener> = new Set();
  private outputListeners: Set<OutputStateListener> = new Set();
  private multiOutputListeners: Set<MultiOutputStateListener> = new Set();

  private unsubscribeElectronDisplays?: () => void;
  private unsubscribeElectronOutput?: () => void;
  private unsubscribeElectronMultiOutput?: () => void;
  private isInitialized: boolean = false;

  constructor() {
    this.loadSavedMonitorsByList();
    this.init();
  }

  private loadSavedMonitorsByList(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LIST_MONITORS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.selectedMonitorsByList = parsed;
        }
      }
    } catch {
      // Ignore storage parse error
    }
  }

  private saveMonitorsByList(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        LIST_MONITORS_STORAGE_KEY,
        JSON.stringify(this.selectedMonitorsByList)
      );
    } catch {
      // Ignore storage write error
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.isElectronAvailable()) {
      try {
        const electronDisplays = await window.electronAPI!.getDisplays();
        this.updateDisplays(electronDisplays);

        // Listen for hardware monitor events (display-added, display-removed, display-metrics-changed)
        this.unsubscribeElectronDisplays = window.electronAPI!.onDisplaysChanged((displays) => {
          this.updateDisplays(displays);
        });

        // Listen for per-list Fullscreen output window closed
        this.unsubscribeElectronOutput = window.electronAPI!.onOutputClosed((info) => {
          if (info && Array.isArray(info.activeListIds)) {
            const nextMap: Record<string, boolean> = {};
            for (const id of info.activeListIds) {
              nextMap[id] = true;
            }
            this.activeFullscreenByList = nextMap;
            this.isFullscreenActive = info.activeListIds.length > 0;
          } else if (info && info.listId) {
            delete this.activeFullscreenByList[info.listId];
            this.isFullscreenActive = Object.values(this.activeFullscreenByList).some(Boolean);
          } else {
            this.activeFullscreenByList = {};
            this.isFullscreenActive = false;
          }
          this.notifyOutputListeners();
        });

        // Listen for Multi FS output window closed (independent from Fullscreen)
        if (window.electronAPI!.onMultiOutputClosed) {
          this.unsubscribeElectronMultiOutput = window.electronAPI!.onMultiOutputClosed(() => {
            this.isMultiFullscreenActive = false;
            this.notifyMultiOutputListeners();
          });
        }

        if (window.electronAPI!.getActiveFullscreenLists) {
          const activeLists = await window.electronAPI!.getActiveFullscreenLists();
          const nextMap: Record<string, boolean> = {};
          if (Array.isArray(activeLists)) {
            for (const id of activeLists) {
              nextMap[id] = true;
            }
          }
          this.activeFullscreenByList = nextMap;
          this.isFullscreenActive = Object.values(nextMap).some(Boolean);
        } else {
          const active = await window.electronAPI!.isFullscreenOutputActive();
          this.isFullscreenActive = active;
        }
        this.notifyOutputListeners();

        if (window.electronAPI!.isMultiFullscreenOutputActive) {
          const multiActive = await window.electronAPI!.isMultiFullscreenOutputActive();
          this.isMultiFullscreenActive = multiActive;
          this.notifyMultiOutputListeners();
        }
      } catch (err) {
        console.error('Failed to initialize Electron display detection:', err);
        this.initBrowserFallback();
      }
    } else {
      this.initBrowserFallback();
    }
  }

  private isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  }

  /**
   * Attempt to query multi-monitor details in supporting Chromium browsers.
   */
  public async requestBrowserScreenDetails(): Promise<void> {
    if (typeof window === 'undefined' || this.isElectronAvailable()) return;
    const win = window as unknown as {
      getScreenDetails?: () => Promise<{
        screens: Array<{
          label?: string;
          isPrimary?: boolean;
          left: number;
          top: number;
          width: number;
          height: number;
          availLeft: number;
          availTop: number;
          availWidth: number;
          availHeight: number;
          devicePixelRatio?: number;
          orientation?: { angle?: number };
        }>;
        addEventListener?: (event: string, cb: () => void) => void;
      }>;
    };

    if (typeof win.getScreenDetails !== 'function') return;

    try {
      const screenDetails = await win.getScreenDetails();
      const mapScreens = () => {
        if (!screenDetails.screens || screenDetails.screens.length === 0) return;
        const detected: DetectedMonitor[] = screenDetails.screens.map((s, idx) => ({
          id: `screen_${idx + 1}`,
          displayIndex: idx + 1,
          name: s.label ? `Display ${idx + 1} (${s.label})` : `Display ${idx + 1}`,
          isPrimary: Boolean(s.isPrimary ?? idx === 0),
          resolution: `${s.width} × ${s.height}`,
          bounds: {
            x: s.left,
            y: s.top,
            width: s.width,
            height: s.height,
          },
          workArea: {
            x: s.availLeft,
            y: s.availTop,
            width: s.availWidth,
            height: s.availHeight,
          },
          scaleFactor: s.devicePixelRatio || 1,
          rotation: s.orientation?.angle || 0,
        }));
        this.updateDisplays(detected);
      };

      mapScreens();
      screenDetails.addEventListener?.('screenschange', mapScreens);
    } catch {
      // Permission not granted yet or requires user gesture; fallback display list remains active
    }
  }

  private initBrowserFallback(): void {
    if (typeof window === 'undefined') return;

    const updateBrowserScreen = () => {
      if (this.displays.length > 1) return;

      const primaryDisplay: DetectedMonitor = {
        id: 'primary',
        displayIndex: 1,
        name: 'Display 1',
        isPrimary: true,
        resolution: `${window.screen.width} × ${window.screen.height}`,
        bounds: {
          x: (window.screen as unknown as { availLeft?: number }).availLeft || 0,
          y: (window.screen as unknown as { availTop?: number }).availTop || 0,
          width: window.screen.width,
          height: window.screen.height,
        },
        workArea: {
          x: (window.screen as unknown as { availLeft?: number }).availLeft || 0,
          y: (window.screen as unknown as { availTop?: number }).availTop || 0,
          width: window.screen.availWidth,
          height: window.screen.availHeight,
        },
        scaleFactor: window.devicePixelRatio || 1,
        rotation: (window.screen.orientation && window.screen.orientation.angle) || 0,
      };

      const list: DetectedMonitor[] = [primaryDisplay];

      const isExtended = Boolean((window.screen as unknown as { isExtended?: boolean }).isExtended);
      if (isExtended) {
        list.push({
          id: 'external_2',
          displayIndex: 2,
          name: 'Display 2 (External)',
          isPrimary: false,
          resolution: `${window.screen.width} × ${window.screen.height}`,
          bounds: {
            x: window.screen.width,
            y: 0,
            width: window.screen.width,
            height: window.screen.height,
          },
          workArea: {
            x: window.screen.width,
            y: 0,
            width: window.screen.availWidth,
            height: window.screen.availHeight,
          },
          scaleFactor: window.devicePixelRatio || 1,
          rotation: 0,
        });
      }

      this.updateDisplays(list);
    };

    updateBrowserScreen();
    this.requestBrowserScreenDetails();
    window.addEventListener('resize', updateBrowserScreen);

    // Monitor opened browser popup windows so active states stay accurate when closed
    this.browserWindowCheckTimer = window.setInterval(() => {
      let changed = false;
      for (const [listKey, win] of Array.from(this.fullscreenBrowserWindowsByList.entries())) {
        if (!win || win.closed) {
          this.fullscreenBrowserWindowsByList.delete(listKey);
          if (this.activeFullscreenByList[listKey]) {
            delete this.activeFullscreenByList[listKey];
            changed = true;
          }
        }
      }
      if (this.fullscreenBrowserWindow && this.fullscreenBrowserWindow.closed) {
        this.fullscreenBrowserWindow = null;
        changed = true;
      }
      if (changed) {
        this.isFullscreenActive = Object.values(this.activeFullscreenByList).some(Boolean);
        this.notifyOutputListeners();
      }

      if (this.multiFullscreenBrowserWindow && this.multiFullscreenBrowserWindow.closed) {
        this.multiFullscreenBrowserWindow = null;
        if (this.isMultiFullscreenActive) {
          this.isMultiFullscreenActive = false;
          this.notifyMultiOutputListeners();
        }
      }
    }, 600);
  }

  private updateDisplays(newDisplays: DetectedMonitor[]): void {
    this.displays = newDisplays;

    if (this.selectedMonitorId !== 'Auto') {
      const exists = this.displays.some((d) => String(d.id) === String(this.selectedMonitorId));
      if (!exists) {
        this.selectedMonitorId = 'Auto';
      }
    }

    let mapModified = false;
    for (const [listId, monId] of Object.entries(this.selectedMonitorsByList)) {
      if (monId !== 'Auto') {
        const exists = this.displays.some((d) => String(d.id) === String(monId));
        if (!exists) {
          this.selectedMonitorsByList[listId] = 'Auto';
          mapModified = true;
        }
      }
    }
    if (mapModified) {
      this.saveMonitorsByList();
    }

    this.notifyMonitorListeners();
    this.notifyOutputListeners();
  }

  public getDisplays(): DetectedMonitor[] {
    return this.displays;
  }

  public getSelectedMonitorId(listId?: string): string {
    if (listId && this.selectedMonitorsByList[listId]) {
      return this.selectedMonitorsByList[listId];
    }
    return this.selectedMonitorId || 'Auto';
  }

  public getSelectedMonitorsByList(): Record<string, string> {
    return { ...this.selectedMonitorsByList };
  }

  public setSelectedMonitorId(id: string, listId?: string): void {
    if (listId) {
      this.selectedMonitorsByList = {
        ...this.selectedMonitorsByList,
        [listId]: id,
      };
      this.saveMonitorsByList();
    } else {
      this.selectedMonitorId = id;
    }
    this.notifyOutputListeners();
  }

  public isOutputActive(listId?: string): boolean {
    if (listId) {
      return Boolean(this.activeFullscreenByList[listId]);
    }
    return this.isFullscreenActive || Object.values(this.activeFullscreenByList).some(Boolean);
  }

  public getActiveFullscreenByList(): Record<string, boolean> {
    return { ...this.activeFullscreenByList };
  }

  public isMultiOutputActive(): boolean {
    return this.isMultiFullscreenActive;
  }

  private resolveTargetMonitorBounds(monitorId: string): DetectedMonitor | undefined {
    if (monitorId && monitorId !== 'Auto') {
      const matched = this.displays.find((d) => String(d.id) === String(monitorId));
      if (matched) return matched;
    }
    const external = this.displays.find((d) => !d.isPrimary);
    return external || this.displays[0];
  }

  /**
   * Launch or move Fullscreen output window for a specific list tab on its dedicated monitor.
   * Completely independent per list tab and independent from Multi FS.
   */
  public async openFullscreen(
    monitorId?: string,
    target: DisplayTarget = 'fullscreen',
    listId?: string
  ): Promise<{ success: boolean; displayId?: string | number; error?: string }> {
    const key = listId || 'default';
    const targetMonitorId = monitorId || this.getSelectedMonitorId(listId);
    this.setSelectedMonitorId(targetMonitorId, listId);

    if (this.isElectronAvailable()) {
      try {
        const result = await window.electronAPI!.openFullscreenOutput({
          monitorId: targetMonitorId,
          displayTarget: target,
          listId: key,
        });
        if (result.success) {
          this.activeFullscreenByList = {
            ...this.activeFullscreenByList,
            [key]: true,
          };
          this.isFullscreenActive = true;
          this.notifyOutputListeners();
        }
        return result;
      } catch (err: unknown) {
        console.error('Electron openFullscreenOutput error:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      await this.requestBrowserScreenDetails();
      const targetMonitor = this.resolveTargetMonitorBounds(targetMonitorId);
      const isInIframe = typeof window !== 'undefined' && window.top !== window.self;
      if (!isInIframe) {
        const win = displaySyncService.openDisplayWindow(
          'fullscreen',
          targetMonitor?.bounds,
          key !== 'default' ? key : undefined
        );
        if (win) {
          this.fullscreenBrowserWindowsByList.set(key, win);
          this.fullscreenBrowserWindow = win;
        }
      }
      this.activeFullscreenByList = {
        ...this.activeFullscreenByList,
        [key]: true,
      };
      this.isFullscreenActive = true;
      this.notifyOutputListeners();
      return { success: true, displayId: targetMonitor?.id || 'browser' };
    }
  }

  /**
   * Close Fullscreen output for a specific list tab (or all if listId is omitted)
   * without affecting other list tabs, running timers, or Multi FS.
   */
  public async closeFullscreen(listId?: string): Promise<boolean> {
    const key = listId || undefined;

    if (this.isElectronAvailable()) {
      try {
        const closed = await window.electronAPI!.closeFullscreenOutput(key);
        if (key) {
          const next = { ...this.activeFullscreenByList };
          delete next[key];
          this.activeFullscreenByList = next;
        } else {
          this.activeFullscreenByList = {};
        }
        this.isFullscreenActive = Object.values(this.activeFullscreenByList).some(Boolean);
        this.notifyOutputListeners();
        return closed;
      } catch (err) {
        console.error('Electron closeFullscreenOutput error:', err);
        return false;
      }
    } else {
      if (key) {
        const win = this.fullscreenBrowserWindowsByList.get(key);
        if (win && !win.closed) {
          win.close();
        }
        this.fullscreenBrowserWindowsByList.delete(key);
        const next = { ...this.activeFullscreenByList };
        delete next[key];
        this.activeFullscreenByList = next;
      } else {
        for (const win of this.fullscreenBrowserWindowsByList.values()) {
          if (win && !win.closed) win.close();
        }
        this.fullscreenBrowserWindowsByList.clear();
        if (this.fullscreenBrowserWindow && !this.fullscreenBrowserWindow.closed) {
          this.fullscreenBrowserWindow.close();
        }
        this.fullscreenBrowserWindow = null;
        this.activeFullscreenByList = {};
      }
      this.isFullscreenActive = Object.values(this.activeFullscreenByList).some(Boolean);
      this.notifyOutputListeners();
      return true;
    }
  }

  /**
   * Toggle Fullscreen output independently for a specific list tab on its selected monitor.
   */
  public async toggleFullscreen(monitorId?: string, listId?: string): Promise<void> {
    const key = listId || 'default';
    const isListActive = Boolean(this.activeFullscreenByList[key]);
    const currentMon = this.getSelectedMonitorId(listId);

    if (isListActive && (!monitorId || monitorId === currentMon)) {
      await this.closeFullscreen(key);
    } else {
      await this.openFullscreen(monitorId || currentMon, 'fullscreen', key);
    }
  }

  /**
   * Launch or move Multi FS (All List Tabs Active Cue) output window.
   * Completely independent from single Fullscreen output.
   */
  public async openMultiFullscreen(
    monitorId?: string
  ): Promise<{ success: boolean; displayId?: string | number; error?: string }> {
    const targetMonitorId = monitorId || this.selectedMonitorId;

    if (this.isElectronAvailable() && window.electronAPI?.openMultiFullscreenOutput) {
      try {
        const result = await window.electronAPI.openMultiFullscreenOutput({
          monitorId: targetMonitorId,
        });
        if (result.success) {
          this.isMultiFullscreenActive = true;
          this.notifyMultiOutputListeners();
        }
        return result;
      } catch (err: unknown) {
        console.error('Electron openMultiFullscreenOutput error:', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      await this.requestBrowserScreenDetails();
      const targetMonitor = this.resolveTargetMonitorBounds(targetMonitorId);
      const isInIframe = typeof window !== 'undefined' && window.top !== window.self;
      if (!isInIframe) {
        this.multiFullscreenBrowserWindow = displaySyncService.openDisplayWindow(
          'multi_fullscreen',
          targetMonitor?.bounds
        );
      }
      this.isMultiFullscreenActive = true;
      this.notifyMultiOutputListeners();
      return { success: true, displayId: targetMonitor?.id || 'browser' };
    }
  }

  /**
   * Close Multi FS output without affecting single Fullscreen output or running timers.
   */
  public async closeMultiFullscreen(): Promise<boolean> {
    if (this.isElectronAvailable() && window.electronAPI?.closeMultiFullscreenOutput) {
      try {
        const closed = await window.electronAPI.closeMultiFullscreenOutput();
        this.isMultiFullscreenActive = false;
        this.notifyMultiOutputListeners();
        return closed;
      } catch (err) {
        console.error('Electron closeMultiFullscreenOutput error:', err);
        return false;
      }
    } else {
      if (this.multiFullscreenBrowserWindow && !this.multiFullscreenBrowserWindow.closed) {
        this.multiFullscreenBrowserWindow.close();
      }
      this.multiFullscreenBrowserWindow = null;
      this.isMultiFullscreenActive = false;
      this.notifyMultiOutputListeners();
      return true;
    }
  }

  /**
   * Toggle Multi FS output independently.
   */
  public async toggleMultiFullscreen(monitorId?: string): Promise<void> {
    if (this.isMultiFullscreenActive) {
      await this.closeMultiFullscreen();
    } else {
      await this.openMultiFullscreen(monitorId);
    }
  }

  public subscribeMonitors(listener: MonitorChangeListener): () => void {
    this.monitorListeners.add(listener);
    listener(this.displays);
    return () => {
      this.monitorListeners.delete(listener);
    };
  }

  public subscribeOutputState(listener: OutputStateListener): () => void {
    this.outputListeners.add(listener);
    listener(
      this.isFullscreenActive,
      { ...this.activeFullscreenByList },
      { ...this.selectedMonitorsByList }
    );
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  public subscribeMultiOutputState(listener: MultiOutputStateListener): () => void {
    this.multiOutputListeners.add(listener);
    listener(this.isMultiFullscreenActive);
    return () => {
      this.multiOutputListeners.delete(listener);
    };
  }

  private notifyMonitorListeners(): void {
    this.monitorListeners.forEach((fn) => fn(this.displays));
  }

  private notifyOutputListeners(): void {
    const activeCopy = { ...this.activeFullscreenByList };
    const monitorsCopy = { ...this.selectedMonitorsByList };
    this.outputListeners.forEach((fn) =>
      fn(this.isFullscreenActive, activeCopy, monitorsCopy)
    );
  }

  private notifyMultiOutputListeners(): void {
    this.multiOutputListeners.forEach((fn) => fn(this.isMultiFullscreenActive));
  }

  public destroy(): void {
    if (this.unsubscribeElectronDisplays) {
      this.unsubscribeElectronDisplays();
    }
    if (this.unsubscribeElectronOutput) {
      this.unsubscribeElectronOutput();
    }
    if (this.unsubscribeElectronMultiOutput) {
      this.unsubscribeElectronMultiOutput();
    }
    if (this.browserWindowCheckTimer) {
      clearInterval(this.browserWindowCheckTimer);
    }
    this.monitorListeners.clear();
    this.outputListeners.clear();
    this.multiOutputListeners.clear();
  }
}

export const monitorDetectionService = new MonitorDetectionService();
