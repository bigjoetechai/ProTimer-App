/**
 * Unified Software Update Service for ProTimer.
 * Coordinates GitHub Releases update checking, download progress, and one-click installation
 * across both Electron desktop (electron-updater + GitHub API fallback) and Web/LAN server modes.
 */

import { UpdateStatusInfo, UpdateState } from '../types';
import { APP_VERSION } from '../constants/appVersion';
import { resolveApiUrl } from '../utils/apiUrl';
import { storageService } from './storageService';

type UpdateSubscriber = (info: UpdateStatusInfo) => void;

const DEFAULT_RELEASES_URL = 'https://github.com/bigjoetechai/ProTimer-App/releases';

function normalizeIncomingStatus(raw: any): UpdateStatusInfo {
  if (!raw || typeof raw !== 'object') {
    return createInitialStatus();
  }

  // Backward-compatible mapping in case an older preload/main payload uses `state`/`progressPercent`
  const rawState = String(raw.status || raw.state || 'idle');
  let normalizedStatus: UpdateState = 'idle';
  if (
    rawState === 'checking' ||
    rawState === 'available' ||
    rawState === 'downloading' ||
    rawState === 'downloaded' ||
    rawState === 'up-to-date' ||
    rawState === 'error'
  ) {
    normalizedStatus = rawState;
  } else if (rawState === 'not-available' || rawState === 'dev-mode') {
    normalizedStatus = 'up-to-date';
  }

  const currentVersion =
    typeof raw.currentVersion === 'string' && raw.currentVersion.trim()
      ? raw.currentVersion.trim()
      : APP_VERSION;

  const availableVersion =
    typeof raw.availableVersion === 'string' && raw.availableVersion.trim()
      ? raw.availableVersion.trim()
      : typeof raw.version === 'string' &&
          raw.version.trim() &&
          raw.version.trim() !== currentVersion
        ? raw.version.trim()
        : null;

  const percent =
    typeof raw.percent === 'number'
      ? raw.percent
      : typeof raw.progressPercent === 'number'
        ? raw.progressPercent
        : normalizedStatus === 'downloaded' || normalizedStatus === 'up-to-date'
          ? 100
          : 0;

  return {
    status: normalizedStatus,
    currentVersion,
    availableVersion,
    percent: Math.min(100, Math.max(0, Math.round(percent))),
    bytesPerSecond: typeof raw.bytesPerSecond === 'number' ? raw.bytesPerSecond : 0,
    transferredBytes: typeof raw.transferredBytes === 'number' ? raw.transferredBytes : 0,
    totalBytes: typeof raw.totalBytes === 'number' ? raw.totalBytes : 0,
    message:
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message
        : `ProTimer v${currentVersion} is up to date.`,
    error: typeof raw.error === 'string' && raw.error.trim() ? raw.error : null,
    releaseUrl:
      typeof raw.releaseUrl === 'string' && raw.releaseUrl.trim()
        ? raw.releaseUrl
        : DEFAULT_RELEASES_URL,
    downloadUrl:
      typeof raw.downloadUrl === 'string' && raw.downloadUrl.trim() ? raw.downloadUrl : null,
    releaseNotes:
      typeof raw.releaseNotes === 'string' && raw.releaseNotes.trim() ? raw.releaseNotes : null,
    publishedAt:
      typeof raw.publishedAt === 'string' && raw.publishedAt.trim() ? raw.publishedAt : null,
    canAutoInstall: Boolean(raw.canAutoInstall),
    checkedAt: typeof raw.checkedAt === 'number' ? raw.checkedAt : null,
    source: raw.source === 'electron-updater' ? 'electron-updater' : 'github-api',
  };
}

function createInitialStatus(): UpdateStatusInfo {
  return {
    status: 'idle',
    currentVersion: APP_VERSION,
    availableVersion: null,
    percent: 0,
    bytesPerSecond: 0,
    transferredBytes: 0,
    totalBytes: 0,
    message: `ProTimer v${APP_VERSION} is ready.`,
    error: null,
    releaseUrl: DEFAULT_RELEASES_URL,
    downloadUrl: null,
    releaseNotes: null,
    publishedAt: null,
    canAutoInstall: false,
    checkedAt: null,
    source: 'github-api',
  };
}

class UpdateService {
  private status: UpdateStatusInfo = createInitialStatus();
  private subscribers: Set<UpdateSubscriber> = new Set();
  private initialized = false;
  private inFlightCheck: Promise<UpdateStatusInfo> | null = null;

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    const api = window.electronAPI;
    if (api?.getUpdateStatus) {
      api
        .getUpdateStatus()
        .then((st) => {
          if (st) this.setStatus(normalizeIncomingStatus(st));
        })
        .catch(() => {});
    }

    if (api?.onUpdateStatus) {
      api.onUpdateStatus((st) => {
        if (st) this.setStatus(normalizeIncomingStatus(st));
      });
    } else {
      // In Web/Server mode, perform a quiet background check on startup if enabled
      const prefs = storageService.getPreferences();
      if (prefs.checkForUpdatesAutomatically !== false) {
        window.setTimeout(() => {
          this.checkForUpdates(true).catch(() => {});
        }, 5000);
      }
    }
  }

  private setStatus(next: UpdateStatusInfo): void {
    this.status = next;
    this.subscribers.forEach((cb) => {
      try {
        cb(this.status);
      } catch (err) {
        console.error('UpdateService subscriber error:', err);
      }
    });
  }

  public getStatus(): UpdateStatusInfo {
    this.init();
    return this.status;
  }

  public subscribe(cb: UpdateSubscriber): () => void {
    this.init();
    this.subscribers.add(cb);
    cb(this.status);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  public async checkForUpdates(silent = false): Promise<UpdateStatusInfo> {
    this.init();

    // Do not disrupt an in-progress download or overwrite a downloaded update
    if (this.status.status === 'downloading' || this.status.status === 'downloaded') {
      return this.status;
    }

    if (this.inFlightCheck) {
      return this.inFlightCheck;
    }

    const run = async (): Promise<UpdateStatusInfo> => {
      if (!silent) {
        this.setStatus({
          ...this.status,
          status: 'checking',
          message: 'Checking GitHub Releases for updates...',
          error: null,
        });
      }

      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (api?.checkForUpdates) {
        try {
          const res = await api.checkForUpdates();
          const normalized = normalizeIncomingStatus(res);
          this.setStatus(normalized);
          return normalized;
        } catch (err: any) {
          const errStatus: UpdateStatusInfo = {
            ...this.status,
            status: silent ? 'idle' : 'error',
            message: silent
              ? `ProTimer v${APP_VERSION} is ready.`
              : 'Could not reach GitHub Releases update server.',
            error: silent ? null : err?.message || 'Update check failed.',
            checkedAt: Date.now(),
          };
          this.setStatus(errStatus);
          return errStatus;
        }
      }

      // Non-Electron Web / Node server mode: query `/api/lan/updates/check`
      try {
        const res = await fetch(resolveApiUrl('/api/lan/updates/check'), {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Update server returned HTTP ${res.status}`);
        }
        const data = await res.json();
        const normalized = normalizeIncomingStatus(data);
        if (silent && normalized.status === 'error') {
          return this.status;
        }
        this.setStatus(normalized);
        return normalized;
      } catch (err: any) {
        if (silent) return this.status;
        const errStatus: UpdateStatusInfo = {
          ...this.status,
          status: 'error',
          message: 'Could not reach GitHub Releases update server.',
          error: err?.message || 'Network error while checking GitHub Releases.',
          checkedAt: Date.now(),
        };
        this.setStatus(errStatus);
        return errStatus;
      }
    };

    this.inFlightCheck = run().finally(() => {
      this.inFlightCheck = null;
    });
    return this.inFlightCheck;
  }

  public async downloadUpdate(): Promise<UpdateStatusInfo> {
    this.init();
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.downloadUpdate) {
      try {
        const res = await api.downloadUpdate();
        const normalized = normalizeIncomingStatus(res);
        this.setStatus(normalized);
        return normalized;
      } catch (err: any) {
        const errStatus: UpdateStatusInfo = {
          ...this.status,
          status: 'error',
          message: 'Could not start update download.',
          error: err?.message || 'Download failed.',
        };
        this.setStatus(errStatus);
        return errStatus;
      }
    }
    return this.status;
  }

  public async openExternalReleaseLink(url?: string | null): Promise<boolean> {
    const target = (url || this.status.downloadUrl || this.status.releaseUrl || DEFAULT_RELEASES_URL).trim();
    if (!/^https:\/\//i.test(target)) return false;

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.openExternalUrl) {
      return api.openExternalUrl(target);
    }

    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = target;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
    return false;
  }

  public async quitAndInstall(): Promise<boolean> {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.quitAndInstallUpdate) {
      return api.quitAndInstallUpdate();
    }
    return false;
  }
}

export const updateService = new UpdateService();
