/**
 * Local-First Storage Service using IndexedDB for timer lists & runs of show,
 * localStorage for application preferences, and native Windows AppData
 * (%APPDATA%\ProTimer\protimer-user-data.json) synchronization + automatic
 * backup when running inside the packaged Electron desktop application.
 */

import { openDB, IDBPDatabase } from 'idb';
import { TimerItem, TimerList, TimerRunLogEntry, AppPreferences, DEFAULT_PREFERENCES } from '../types';

const DB_NAME = 'protimer_local_db';
const LEGACY_DB_NAME = 'cuetimer_local_db';
const DB_VERSION = 1;
const TIMERS_STORE = 'timers';
const LISTS_STORE = 'lists';
const PREFS_KEY = 'protimer_preferences';
const LEGACY_PREFS_KEY = 'cuetimer_preferences';
const RUN_LOGS_KEY = 'protimer_run_logs';

class StorageService {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private nativeHydratedPromise: Promise<void> | null = null;
  private cachedPreferences: AppPreferences | null = null;

  constructor() {
    this.initDB();
  }

  private initDB() {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (e) => {
      if (e.key === PREFS_KEY) {
        this.cachedPreferences = null;
        window.dispatchEvent(new CustomEvent('protimer-prefs-updated'));
      }
    });

    // Migrate legacy preferences if needed
    try {
      if (!localStorage.getItem(PREFS_KEY)) {
        const legacyPrefs = localStorage.getItem(LEGACY_PREFS_KEY);
        if (legacyPrefs) {
          localStorage.setItem(PREFS_KEY, legacyPrefs);
        }
      }
    } catch {
      // Ignore storage access errors
    }

    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(TIMERS_STORE)) {
          const timerStore = db.createObjectStore(TIMERS_STORE, { keyPath: 'id' });
          timerStore.createIndex('order', 'order');
        }
        if (!db.objectStoreNames.contains(LISTS_STORE)) {
          db.createObjectStore(LISTS_STORE, { keyPath: 'id' });
        }
      },
    });

    this.nativeHydratedPromise = this.hydrateFromInitialSources();
  }

  /**
   * Hydrate from Electron's %APPDATA%\ProTimer\protimer-user-data.json (or legacy IndexedDB)
   * if the current IndexedDB is empty (e.g. after a ProTimer version upgrade or reinstall).
   */
  private async hydrateFromInitialSources(): Promise<void> {
    if (!this.dbPromise || typeof window === 'undefined') return;

    try {
      const db = await this.dbPromise;
      const existingLists = await db.getAll(LISTS_STORE);
      const existingTimers = await db.getAll(TIMERS_STORE);

      // 1. Check Electron native AppData storage first
      if (window.electronAPI?.readUserData) {
        const nativeData = await window.electronAPI.readUserData();
        if (nativeData) {
          if (nativeData.preferences && !localStorage.getItem(PREFS_KEY)) {
            localStorage.setItem(PREFS_KEY, JSON.stringify(nativeData.preferences));
          }
          if (Array.isArray((nativeData as { runLogs?: unknown }).runLogs) && !localStorage.getItem(RUN_LOGS_KEY)) {
            localStorage.setItem(RUN_LOGS_KEY, JSON.stringify((nativeData as { runLogs?: unknown }).runLogs));
          }
          if (existingLists.length === 0 && Array.isArray(nativeData.lists) && nativeData.lists.length > 0) {
            const tx = db.transaction(LISTS_STORE, 'readwrite');
            for (const list of nativeData.lists as TimerList[]) {
              tx.store.put(list);
            }
            await tx.done;
          }
          if (existingTimers.length === 0 && Array.isArray(nativeData.timers) && nativeData.timers.length > 0) {
            const tx = db.transaction(TIMERS_STORE, 'readwrite');
            for (const timer of nativeData.timers) {
              tx.store.put(timer);
            }
            await tx.done;
          }
          return;
        }
      }

      // 2. Fallback migration from legacy IndexedDB if present
      if (existingLists.length === 0 && existingTimers.length === 0) {
        try {
          const legacyDb = await openDB(LEGACY_DB_NAME, DB_VERSION);
          if (
            legacyDb.objectStoreNames.contains(LISTS_STORE) &&
            legacyDb.objectStoreNames.contains(TIMERS_STORE)
          ) {
            const legacyLists = await legacyDb.getAll(LISTS_STORE);
            const legacyTimers = await legacyDb.getAll(TIMERS_STORE);
            if (legacyLists.length > 0) {
              const tx = db.transaction(LISTS_STORE, 'readwrite');
              for (const l of legacyLists) tx.store.put(l);
              await tx.done;
            }
            if (legacyTimers.length > 0) {
              const tx = db.transaction(TIMERS_STORE, 'readwrite');
              for (const t of legacyTimers) tx.store.put(t);
              await tx.done;
            }
          }
          legacyDb.close();
        } catch {
          // No legacy DB to migrate
        }
      }
    } catch (err) {
      console.warn('Initial storage hydration warning:', err);
    }
  }

  /**
   * Persist a complete snapshot to Windows AppData (%APPDATA%\ProTimer) when running in Electron.
   */
  private scheduleNativeSync(): void {
    if (typeof window === 'undefined' || !window.electronAPI?.writeUserData) return;
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(async () => {
      try {
        if (!this.dbPromise) return;
        const db = await this.dbPromise;
        const [timers, lists] = await Promise.all([
          db.getAll(TIMERS_STORE),
          db.getAll(LISTS_STORE),
        ]);
        const preferences = this.getPreferences();
        const runLogs = this.getRunLogs();
        await window.electronAPI?.writeUserData({
          timers,
          lists,
          preferences,
          runLogs,
          updatedAt: Date.now(),
        });
      } catch (e) {
        console.warn('Failed to sync user data to native AppData:', e);
      }
    }, 250);
  }

  // --- PREFERENCES (localStorage + Electron AppData) ---
  public getPreferences(): AppPreferences {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
    if (this.cachedPreferences) {
      return this.cachedPreferences;
    }
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const merged: AppPreferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
        this.cachedPreferences = merged;
        return merged;
      }
    } catch (e) {
      console.warn('Failed to read preferences from localStorage:', e);
    }
    this.cachedPreferences = { ...DEFAULT_PREFERENCES };
    return this.cachedPreferences;
  }

  public savePreferences(prefs: AppPreferences): void {
    if (typeof window === 'undefined') return;
    this.cachedPreferences = { ...DEFAULT_PREFERENCES, ...prefs };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.cachedPreferences));
    } catch (e) {
      console.warn('Failed to save preferences to localStorage:', e);
    }
    window.dispatchEvent(new CustomEvent('protimer-prefs-updated'));
    this.scheduleNativeSync();
  }

  // --- TIMER RUN LOGS (localStorage + Electron AppData) ---
  public getRunLogs(): TimerRunLogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RUN_LOGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to read timer run logs from localStorage:', e);
    }
    return [];
  }

  public saveRunLogs(logs: TimerRunLogEntry[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(RUN_LOGS_KEY, JSON.stringify(logs));
      this.scheduleNativeSync();
    } catch (e) {
      console.warn('Failed to save timer run logs to localStorage:', e);
    }
  }

  // --- TIMERS (IndexedDB + Electron AppData) ---
  public async getAllTimers(): Promise<TimerItem[]> {
    if (!this.dbPromise) return [];
    try {
      if (this.nativeHydratedPromise) {
        await this.nativeHydratedPromise;
      }
      const db = await this.dbPromise;
      return await db.getAll(TIMERS_STORE);
    } catch (e) {
      console.error('Failed to load timers from IndexedDB:', e);
      return [];
    }
  }

  public async saveTimer(timer: TimerItem): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.put(TIMERS_STORE, timer);
    this.scheduleNativeSync();
  }

  public async saveTimersBatch(timers: TimerItem[]): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    const tx = db.transaction(TIMERS_STORE, 'readwrite');
    for (const timer of timers) {
      tx.store.put(timer);
    }
    await tx.done;
    this.scheduleNativeSync();
  }

  public async deleteTimer(id: string): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.delete(TIMERS_STORE, id);
    this.scheduleNativeSync();
  }

  // --- LISTS (IndexedDB + Electron AppData) ---
  public async getAllLists(): Promise<TimerList[]> {
    if (!this.dbPromise) return [];
    try {
      if (this.nativeHydratedPromise) {
        await this.nativeHydratedPromise;
      }
      const db = await this.dbPromise;
      const lists = await db.getAll(LISTS_STORE);
      return lists.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch (e) {
      console.error('Failed to load lists from IndexedDB:', e);
      return [];
    }
  }

  public async saveList(list: TimerList): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.put(LISTS_STORE, list);
    this.scheduleNativeSync();
  }

  public async saveListsBatch(lists: TimerList[]): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    const tx = db.transaction(LISTS_STORE, 'readwrite');
    for (const l of lists) {
      tx.store.put(l);
    }
    await tx.done;
    this.scheduleNativeSync();
  }

  public async deleteList(id: string): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    await db.delete(LISTS_STORE, id);
    this.scheduleNativeSync();
  }

  public async replaceAllListsAndTimers(lists: TimerList[], timers: TimerItem[]): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    const tx = db.transaction([LISTS_STORE, TIMERS_STORE], 'readwrite');
    const listStore = tx.objectStore(LISTS_STORE);
    const timerStore = tx.objectStore(TIMERS_STORE);
    await listStore.clear();
    await timerStore.clear();
    for (const l of lists) {
      await listStore.put(l);
    }
    for (const t of timers) {
      await timerStore.put(t);
    }
    await tx.done;
    this.scheduleNativeSync();
  }
}

export const storageService = new StorageService();
