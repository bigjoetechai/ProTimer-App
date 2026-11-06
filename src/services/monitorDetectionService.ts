/**
 * Monitor Detection Service.
 * Bridges React UI with Electron native Windows monitor detection API.
 * Provides real-time monitor hardware detection, hotplug notifications, and fallback for web mode.
 */

import { DetectedMonitor, DisplayTarget } from '../types';
import { displaySyncService } from './displaySyncService';

export type MonitorChangeListener = (displays: DetectedMonitor[]) => void;
export type OutputStateListener = (isActive: boolean) => void;

class MonitorDetectionService {
  private displays: DetectedMonitor[] = [];
  private selectedMonitorId: string = 'Auto';
  private isFullscreenActive: boolean = false;
  private monitorListeners: Set<MonitorChangeListener> = new Set();
  private outputListeners: Set<OutputStateListener> = new Set();
  private unsubscribeElectronDisplays?: () => void;
  private unsubscribeElectronOutput?: () => void;
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

        // Listen for output window closed (e.g. via Escape key or operator close)
        this.unsubscribeElectronOutput = window.electronAPI!.onOutputClosed(() => {
          this.isFullscreenActive = false;
          this.notifyOutputListeners();
        });

        const active = await window.electronAPI!.isFullscreenOutputActive();
        this.isFullscreenActive = active;
        this.notifyOutputListeners();
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

  private initBrowserFallback(): void {
    if (typeof window === 'undefined') return;

    // Detect browser screen info
    const updateBrowserScreen = () => {
      const primaryDisplay: DetectedMonitor = {
        id: 'primary',
        displayIndex: 1,
        name: 'Display 1',
        isPrimary: true,
        resolution: `${window.screen.width} × ${window.screen.height}`,
        bounds: {
          x: 0,
          y: 0,
          width: window.screen.width,
          height: window.screen.height,
        },
        workArea: {
          x: 0,
          y: 0,
          width: window.screen.availWidth,
          height: window.screen.availHeight,
        },
        scaleFactor: window.devicePixelRatio || 1,
        rotation: (window.screen.orientation && window.screen.orientation.angle) || 0,
      };

      this.updateDisplays([primaryDisplay]);
    };

    updateBrowserScreen();
    window.addEventListener('resize', updateBrowserScreen);
  }

  private updateDisplays(newDisplays: DetectedMonitor[]): void {
    this.displays = newDisplays;

    // Verify if currently selected monitor still exists
    if (this.selectedMonitorId !== 'Auto') {
      const exists = this.displays.some((d) => String(d.id) === String(this.selectedMonitorId));
      if (!exists) {
        // Fall back safely to Auto (Primary Monitor)
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

  /**
   * Launch or move fullscreen output window on the selected monitor.
   */
  public async openFullscreen(monitorId?: string, target: DisplayTarget = 'fullscreen'): Promise<{ success: boolean; displayId?: string | number; error?: string }> {
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
      // Browser fallback: launch fullscreen popup or route
      displaySyncService.openDisplayWindow(target);
      this.isFullscreenActive = true;
      this.notifyOutputListeners();
      return { success: true, displayId: 'browser' };
    }
  }

  /**
   * Close fullscreen output without affecting running timers.
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
      this.isFullscreenActive = false;
      this.notifyOutputListeners();
      return true;
    }
  }

  /**
   * Toggle fullscreen on selected monitor.
   */
  public async toggleFullscreen(monitorId?: string): Promise<void> {
    if (this.isFullscreenActive && (!monitorId || monitorId === this.selectedMonitorId)) {
      await this.closeFullscreen();
    } else {
      await this.openFullscreen(monitorId);
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

  private notifyMonitorListeners(): void {
    this.monitorListeners.forEach((fn) => fn(this.displays));
  }

  private notifyOutputListeners(): void {
    this.outputListeners.forEach((fn) => fn(this.isFullscreenActive));
  }

  public destroy(): void {
    if (this.unsubscribeElectronDisplays) {
      this.unsubscribeElectronDisplays();
    }
    if (this.unsubscribeElectronOutput) {
      this.unsubscribeElectronOutput();
    }
    this.monitorListeners.clear();
    this.outputListeners.clear();
  }
}

export const monitorDetectionService = new MonitorDetectionService();
