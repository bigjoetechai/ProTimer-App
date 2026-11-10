/**
 * Preload script for ProTimer Electron application.
 * Exposes secure, isolated monitor, window management, and AppData persistence APIs
 * to the renderer process.
 * Security: contextIsolation: true, nodeIntegration: false.
 */

const { contextBridge, ipcRenderer } = require('electron');

const VALID_DISPLAY_TARGETS = new Set([
  'presenter',
  'preview',
  'stage',
  'fullscreen',
  'multi_fullscreen',
  'ndi',
  'lan_control',
  'lan_display',
]);

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // ===========================================================================
  // 1. MONITOR DETECTION
  // ===========================================================================

  /**
   * Get all connected physical displays detected by Windows.
   */
  getDisplays: () => ipcRenderer.invoke('get-displays'),

  /**
   * Listen for monitor connection, disconnection, or metric changes.
   * @param {Function} callback
   */
  onDisplaysChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, displays) => callback(displays);
    ipcRenderer.on('displays-changed', handler);
    return () => {
      ipcRenderer.removeListener('displays-changed', handler);
    };
  },

  // ===========================================================================
  // 2. MODE B: TIMER OUTPUT FULLSCREEN & INDEPENDENT MULTI FULLSCREEN
  // ===========================================================================

  /**
   * Open or move dedicated fullscreen output window to target monitor.
   * @param {Object} options
   * @param {string|number} options.monitorId
   * @param {string} [options.displayTarget='fullscreen']
   */
  openFullscreenOutput: (options = {}) => {
    const monitorId =
      options && (typeof options.monitorId === 'string' || typeof options.monitorId === 'number')
        ? options.monitorId
        : 'Auto';
    const displayTarget =
      options && typeof options.displayTarget === 'string' && VALID_DISPLAY_TARGETS.has(options.displayTarget)
        ? options.displayTarget
        : 'fullscreen';
    return ipcRenderer.invoke('open-fullscreen-output', { monitorId, displayTarget });
  },

  /**
   * Close the fullscreen output window without affecting running timers.
   */
  closeFullscreenOutput: () => ipcRenderer.invoke('close-fullscreen-output'),

  /**
   * Check if fullscreen output window is currently active.
   */
  isFullscreenOutputActive: () => ipcRenderer.invoke('is-fullscreen-output-active'),

  /**
   * Listen for when the output window is closed (e.g. by Escape key or user).
   * @param {Function} callback
   */
  onOutputClosed: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('output-closed', handler);
    return () => {
      ipcRenderer.removeListener('output-closed', handler);
    };
  },

  /**
   * Open independent Multi Fullscreen output window showing active cues across all list tabs.
   */
  openMultiFullscreenOutput: (options = {}) => {
    const monitorId =
      options && (typeof options.monitorId === 'string' || typeof options.monitorId === 'number')
        ? options.monitorId
        : 'Auto';
    return ipcRenderer.invoke('open-multi-fullscreen-output', { monitorId });
  },

  /**
   * Close the independent Multi Fullscreen output window.
   */
  closeMultiFullscreenOutput: () => ipcRenderer.invoke('close-multi-fullscreen-output'),

  /**
   * Check if the Multi Fullscreen output window is currently active.
   */
  isMultiFullscreenOutputActive: () => ipcRenderer.invoke('is-multi-fullscreen-output-active'),

  /**
   * Listen for when the Multi Fullscreen output window is closed.
   */
  onMultiOutputClosed: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('multi-output-closed', handler);
    return () => {
      ipcRenderer.removeListener('multi-output-closed', handler);
    };
  },

  // ===========================================================================
  // 3. MODE A: APPLICATION FULLSCREEN & WINDOW SIZE MANAGEMENT
  // ===========================================================================

  /**
   * Minimize main application window to taskbar.
   */
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),

  /**
   * Maximize main application window to fill desktop workspace.
   */
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),

  /**
   * Restore main application window from maximized state.
   */
  restoreWindow: () => ipcRenderer.invoke('window-restore'),

  /**
   * Toggle maximize / restore.
   */
  toggleMaximize: () => ipcRenderer.invoke('window-toggle-maximize'),

  /**
   * Check if main window is currently maximized.
   */
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  /**
   * Close main application window.
   */
  closeWindow: () => ipcRenderer.invoke('window-close'),

  /**
   * Toggle Application Fullscreen (Mode A) on current or target monitor.
   * @param {string|number} [monitorId]
   */
  toggleAppFullscreen: (monitorId) => {
    const safeId =
      typeof monitorId === 'string' || typeof monitorId === 'number' ? monitorId : undefined;
    return ipcRenderer.invoke('toggle-app-fullscreen', safeId);
  },

  /**
   * Check if Application Fullscreen (Mode A) is currently active.
   */
  isAppFullscreen: () => ipcRenderer.invoke('is-app-fullscreen'),

  /**
   * Reset application window dimensions back to default 1200 × 800 pixels.
   */
  resetWindowSize: () => ipcRenderer.invoke('window-reset-size'),

  /**
   * Get current window bounds (width, height, x, y).
   */
  getWindowBounds: () => ipcRenderer.invoke('window-get-bounds'),

  /**
   * Listen for window state changes (maximized, fullscreen, dimensions).
   * @param {Function} callback
   */
  onWindowStateChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', handler);
    return () => {
      ipcRenderer.removeListener('window-state-changed', handler);
    };
  },

  // ===========================================================================
  // 4. PERSISTENT USER DATA (%APPDATA%\ProTimer) & APP METADATA
  // ===========================================================================

  /**
   * Read saved user data from Windows AppData (%APPDATA%\ProTimer\protimer-user-data.json).
   */
  readUserData: () => ipcRenderer.invoke('user-data-read'),

  /**
   * Write user data to Windows AppData with automatic backup rotation.
   * @param {Object} data
   */
  writeUserData: (data) => {
    if (!data || typeof data !== 'object') return Promise.resolve(false);
    return ipcRenderer.invoke('user-data-write', data);
  },

  /**
   * Retrieve application metadata and runtime paths.
   */
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
});
