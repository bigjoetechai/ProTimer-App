/**
 * Resilient Cross-Window / Cross-Tab communication channel using BroadcastChannel API
 * with automatic fallback to localStorage storage-events.
 */

export interface BroadcastEnvelope<T = unknown> {
  type: string;
  payload: T;
  sourceId: string;
  timestamp: number;
}

export type BroadcastListener<T = unknown> = (data: BroadcastEnvelope<T>) => void;

export class CrossWindowBus {
  private channelName: string;
  private channel: BroadcastChannel | null = null;
  private listeners: Map<string, Set<BroadcastListener>> = new Map();
  private sourceId: string;
  private unsubscribeIpc: (() => void) | null = null;
  private recentMessageIds: Set<string> = new Set();

  constructor(channelName: string = 'protimer_sync_v1') {
    this.channelName = channelName;
    this.sourceId = `win_${Math.random().toString(36).substring(2, 9)}`;

    const hasWindow = typeof window !== 'undefined';
    if (hasWindow && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
          this.handleIncoming(event.data);
        };
      } catch {
        this.channel = null;
      }
    }
    if (hasWindow) {
      window.addEventListener('storage', this.handleStorageEvent);
      const electronApi = (window as any).electronAPI;
      if (electronApi && typeof electronApi.onBusMessage === 'function') {
        this.unsubscribeIpc = electronApi.onBusMessage((envelope: any) => {
          if (envelope && (!envelope.channelName || envelope.channelName === this.channelName)) {
            this.handleIncoming(envelope);
          }
        });
      }
    }
  }

  private handleIncoming(envelope: BroadcastEnvelope & { msgId?: string }) {
    if (!envelope || envelope.sourceId === this.sourceId) return;
    if (envelope.msgId) {
      if (this.recentMessageIds.has(envelope.msgId)) return;
      this.recentMessageIds.add(envelope.msgId);
      if (this.recentMessageIds.size > 200) {
        const first = this.recentMessageIds.values().next().value;
        if (first) this.recentMessageIds.delete(first);
      }
    }
    this.dispatch(envelope);
  }

  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key === `__bus_${this.channelName}` && e.newValue) {
      try {
        const envelope = JSON.parse(e.newValue) as BroadcastEnvelope & { msgId?: string };
        this.handleIncoming(envelope);
      } catch {
        // ignore malformed storage message
      }
    }
  };

  public post<T>(type: string, payload: T): void {
    const envelope: BroadcastEnvelope<T> & { channelName?: string; msgId?: string } = {
      type,
      payload,
      sourceId: this.sourceId,
      timestamp: Date.now(),
      channelName: this.channelName,
      msgId: `${this.sourceId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };

    if (this.channel) {
      try {
        this.channel.postMessage(envelope);
      } catch {
        // Ignore BroadcastChannel error on file://
      }
    }

    if (typeof window !== 'undefined') {
      const electronApi = (window as any).electronAPI;
      if (electronApi && typeof electronApi.postBusMessage === 'function') {
        try {
          electronApi.postBusMessage(envelope);
        } catch {
          // Ignore IPC serialization warning
        }
      }

      if (!this.channel) {
        try {
          localStorage.setItem(`__bus_${this.channelName}`, JSON.stringify(envelope));
        } catch {
          // storage quota / disabled
        }
      }
    }
  }

  public subscribe<T>(type: string, listener: BroadcastListener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const set = this.listeners.get(type)!;
    set.add(listener as BroadcastListener);

    return () => {
      set.delete(listener as BroadcastListener);
      if (set.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  private dispatch(envelope: BroadcastEnvelope): void {
    const set = this.listeners.get(envelope.type);
    if (set) {
      set.forEach(cb => {
        try {
          cb(envelope);
        } catch (err) {
          console.error('[CrossWindowBus] listener error:', err);
        }
      });
    }

    // Wildcard listeners
    const all = this.listeners.get('*');
    if (all) {
      all.forEach(cb => {
        try {
          cb(envelope);
        } catch (err) {
          console.error('[CrossWindowBus] wildcard listener error:', err);
        }
      });
    }
  }

  public destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.unsubscribeIpc) {
      this.unsubscribeIpc();
      this.unsubscribeIpc = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageEvent);
    }
    this.listeners.clear();
  }
}

