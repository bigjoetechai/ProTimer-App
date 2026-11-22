/**
 * Window Manager Service.
 * Manages professional window dimensions, resolution responsiveness,
 * maximize/minimize/restore controls, and independent Application Fullscreen mode.
 */

import { WindowStateInfo } from '../types';

export type WindowStateListener = (state: WindowStateInfo) => void;

class WindowManagerService {
  private isMaximized: boolean = false;
  private isAppFullscreen: boolean = false;
  private width: number = 1200;
  private height: number = 800;
  private listeners: Set<WindowStateListener> = new Set();
  private isInitialized: boolean = false;
  private unsubscribeElectronState?: () => void;

  constructor() {
    this.init();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof window !== 'undefined') {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
    }

    if (this.isElectronAvailable()) {
      try {
        const isMax = await window.electronAPI!.isMaximized();
        const isFS = await window.electronAPI!.isAppFullscreen();
        const bounds = await window.electronAPI!.getWindowBounds();

        this.isMaximized = isMax;
        this.isAppFullscreen = isFS;
        if (bounds) {
          this.width = bounds.width;
          this.height = bounds.height;
        }

        this.unsubscribeElectronState = window.electronAPI!.onWindowStateChanged((state) => {
          this.isMaximized = state.isMaximized;
          this.isAppFullscreen = state.isFullScreen;
          this.width = state.width;
          this.height = state.height;
          this.notifyListeners();
        });
      } catch (err) {
        console.warn('Could not initialize Electron window state:', err);
        this.initBrowserEvents();
      }
    } else {
      this.initBrowserEvents();
    }
  }

  private initBrowserEvents(): void {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.isAppFullscreen = Boolean(document.fullscreenElement);
      // In web browser, maximized is approximated when window dimensions fill screen
      this.isMaximized = window.innerWidth >= window.screen.availWidth - 10 && window.innerHeight >= window.screen.availHeight - 10;
      this.notifyListeners();
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleResize);
    handleResize();
  }

  public isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  }

  public getState(): WindowStateInfo {
    return {
      isMaximized: this.isMaximized,
      isFullScreen: this.isAppFullscreen,
      width: this.width,
      height: this.height,
    };
  }

  public subscribe(listener: WindowStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (err) {
        console.error('Error notifying window state listener:', err);
      }
    });
  }

  // ===========================================================================
  // WINDOW CONTROLS
  // ===========================================================================

  public async minimize(): Promise<void> {
    if (this.isElectronAvailable()) {
      await window.electronAPI!.minimizeWindow();
    }
  }

  public async maximize(): Promise<void> {
    if (this.isElectronAvailable()) {
      await window.electronAPI!.maximizeWindow();
    } else {
      // In browser, enter fullscreen as maximize equivalent
      try {
        await document.documentElement.requestFullscreen();
      } catch {}
    }
  }

  public async restore(): Promise<void> {
    if (this.isElectronAvailable()) {
      await window.electronAPI!.restoreWindow();
    } else {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {}
    }
  }

  public async toggleMaximize(): Promise<boolean> {
    if (this.isElectronAvailable()) {
      const res = await window.electronAPI!.toggleMaximize();
      this.isMaximized = res;
      this.notifyListeners();
      return res;
    } else {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.isMaximized = false;
        this.isAppFullscreen = false;
      } else {
        await document.documentElement.requestFullscreen();
        this.isMaximized = true;
        this.isAppFullscreen = true;
      }
      this.notifyListeners();
      return this.isMaximized;
    }
  }

  public async close(): Promise<void> {
    if (this.isElectronAvailable()) {
      await window.electronAPI!.closeWindow();
    } else {
      window.close();
    }
  }

  /**
   * Mode A: APPLICATION FULLSCREEN.
   * Expands the entire operator interface to fill the target monitor or current monitor.
   * Completely independent from Mode B (Timer Output Fullscreen).
   */
  public async toggleAppFullscreen(monitorId?: string | number): Promise<boolean> {
    if (this.isElectronAvailable()) {
      const res = await window.electronAPI!.toggleAppFullscreen(monitorId);
      this.isAppFullscreen = res;
      this.notifyListeners();
      return res;
    } else {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.isAppFullscreen = false;
      } else {
        await document.documentElement.requestFullscreen();
        this.isAppFullscreen = true;
      }
      this.notifyListeners();
      return this.isAppFullscreen;
    }
  }

  /**
   * Reset application window size back to the default 1200 × 800 pixels.
   */
  public async resetToDefaultSize(): Promise<void> {
    if (this.isElectronAvailable()) {
      await window.electronAPI!.resetWindowSize();
    }
  }
}

export const windowManagerService = new WindowManagerService();
