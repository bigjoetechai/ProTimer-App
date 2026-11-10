/**
 * Monitor Detection Service.
 * Bridges React UI with Electron native Windows monitor detection API and Web Multi-Screen API.
 * Maintains completely independent state and window lifecycle for Fullscreen and Multi FS outputs.
 */

import { DetectedMonitor, DisplayTarget } from '../types';
import { displaySyncService } from './displaySyncService';

export type MonitorChangeListener = (displays: DetectedMonitor[]) => void;
export type OutputStateListener = (isActive: boolean) => void;

class MonitorDetectionService {
  private displays: DetectedMonitor[] = [];
  private selectedMonitorId: string = 'Auto';
  private isFullscreenActive: boolean = false;
  private isMultiFullscreenActive: boolean = false;

  private fullscreenBrowserWindow: Window | null = null;
  private multiFullscreenBrowserWindow: Window | null = null;
  private browserWindowCheckTimer: number | null = null;

  private monitorListeners: Set<MonitorChangeListener> = new Set();
  private outputListeners: Set<OutputStateListener> = new Set();
  private multiOutputListeners: Set<OutputStateListener> = new Set();

  private unsubscribeElectronDisplays?: () => void;
  private unsubscribeElectronOutput?: () => void;
  private unsubscribeElectronMultiOutput?: () => void;
  private isInitialized: boolean = false;

  constructor() {
    this.init();
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

        // Listen for single Fullscreen output window closed
        this.unsubscribeElectronOutput = window.electronAPI!.onOutputClosed(() => {
          this.isFullscreenActive = false;
          this.notifyOutputListeners();
        });

        // Listen for Multi FS output window closed (independent from Fullscreen)
        if (window.electronAPI!.onMultiOutputClosed) {
          this.unsubscribeElectronMultiOutput = window.electronAPI!.onMultiOutputClosed(() => {
            this.isMultiFullscreenActive = false;
            this.notifyMultiOutputListeners();
          });
        }

        const active = await window.electronAPI!.isFullscreenOutputActive();
        this.isFullscreenActive = active;
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
      // If multi-screen API already populated multiple displays, keep them updated
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

      // If browser reports extended screen topology before permission prompt, expose External Display option
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
      if (this.fullscreenBrowserWindow && this.fullscreenBrowserWindow.closed) {
        this.fullscreenBrowserWindow = null;
        if (this.isFullscreenActive) {
          this.isFullscreenActive = false;
          this.notifyOutputListeners();
        }
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

    // Verify if currently selected monitor still exists
    if (this.selectedMonitorId !== 'Auto') {
      const exists = this.displays.some((d) => String(d.id) === String(this.selectedMonitorId));
      if (!exists) {
        this.selectedMonitorId = 'Auto';
      }
    }

    this.notifyMonitorListeners();
  }

  public getDisplays(): DetectedMonitor[] {
    return this.displays;
  }

  public getSelectedMonitorId(): string {
    return this.selectedMonitorId;
  }

  public setSelectedMonitorId(id: string): void {
    this.selectedMonitorId = id;
  }

  public isOutputActive(): boolean {
    return this.isFullscreenActive;
  }

  public isMultiOutputActive(): boolean {
    return this.isMultiFullscreenActive;
  }

  private resolveTargetMonitorBounds(monitorId: string): DetectedMonitor | undefined {
    if (monitorId && monitorId !== 'Auto') {
      const matched = this.displays.find((d) => String(d.id) === String(monitorId));
      if (matched) return matched;
    }
    // When Auto is selected, prefer an external connected display if available
    const external = this.displays.find((d) => !d.isPrimary);
    return external || this.displays[0];
  }

  /**
   * Launch or move single Fullscreen output window on the selected monitor.
   * Completely independent from Multi FS.
   */
  public async openFullscreen(
    monitorId?: string,
    target: DisplayTarget = 'fullscreen'
  ): Promise<{ success: boolean; displayId?: string | number; error?: string }> {
    const targetMonitorId = monitorId || this.selectedMonitorId;
    this.selectedMonitorId = targetMonitorId;

    if (this.isElectronAvailable()) {
      try {
        const result = await window.electronAPI!.openFullscreenOutput({
          monitorId: targetMonitorId,
          displayTarget: target,
        });
        if (result.success) {
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
        this.fullscreenBrowserWindow = displaySyncService.openDisplayWindow('fullscreen', targetMonitor?.bounds);
      }
      this.isFullscreenActive = true;
      this.notifyOutputListeners();
      return { success: true, displayId: targetMonitor?.id || 'browser' };
    }
  }

  /**
   * Close single Fullscreen output without affecting running timers or Multi FS.
   */
  public async closeFullscreen(): Promise<boolean> {
    if (this.isElectronAvailable()) {
      try {
        const closed = await window.electronAPI!.closeFullscreenOutput();
        this.isFullscreenActive = false;
        this.notifyOutputListeners();
        return closed;
      } catch (err) {
        console.error('Electron closeFullscreenOutput error:', err);
        return false;
      }
    } else {
      if (this.fullscreenBrowserWindow && !this.fullscreenBrowserWindow.closed) {
        this.fullscreenBrowserWindow.close();
      }
      this.fullscreenBrowserWindow = null;
      this.isFullscreenActive = false;
      this.notifyOutputListeners();
      return true;
    }
  }

  /**
   * Toggle single Fullscreen on selected monitor.
   */
  public async toggleFullscreen(monitorId?: string): Promise<void> {
    if (this.isFullscreenActive && (!monitorId || monitorId === this.selectedMonitorId)) {
      await this.closeFullscreen();
    } else {
      await this.openFullscreen(monitorId, 'fullscreen');
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
    listener(this.isFullscreenActive);
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  public subscribeMultiOutputState(listener: OutputStateListener): () => void {
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
    this.outputListeners.forEach((fn) => fn(this.isFullscreenActive));
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
