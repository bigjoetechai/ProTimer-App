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

  constructor(channelName: string = 'protimer_sync_v1') {
    this.channelName = channelName;
    this.sourceId = `win_${Math.random().toString(36).substring(2, 9)}`;

    const hasWindow = typeof window !== 'undefined';
    if (hasWindow && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
        this.dispatch(event.data);
      };
    } else if (hasWindow) {
      window.addEventListener('storage', this.handleStorageEvent);
    }
  }

  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key === `__bus_${this.channelName}` && e.newValue) {
      try {
        const envelope = JSON.parse(e.newValue) as BroadcastEnvelope;
        if (envelope.sourceId !== this.sourceId) {
          this.dispatch(envelope);
        }
      } catch {
        // ignore malformed storage message
      }
    }
  };

  public post<T>(type: string, payload: T): void {
    const envelope: BroadcastEnvelope<T> = {
      type,
      payload,
      sourceId: this.sourceId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(envelope);
    } else if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`__bus_${this.channelName}`, JSON.stringify(envelope));
      } catch {
        // storage quota / disabled
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageEvent);
    }
    this.listeners.clear();
  }
}
