/**
 * Audio Alert System.
 * Synthesized broadcast acoustic alerts (Beep, Chime, Pulse, Bell, Alarm).
 */

import { AlertSoundType } from '../types';

class AudioController {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8; // 0 to 1

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  public playBeep(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.45;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playWarningChime(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.45;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1174, now + 0.15);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  public playDangerChime(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.5;

    [0, 0.11, 0.22].forEach((delay) => {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1318.5, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    });
  }

  public playPulse(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.4;

    [0, 0.14, 0.28, 0.42].forEach((delay, idx) => {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx % 2 === 0 ? 980 : 1240, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainValue, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    });
  }

  public playBell(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.4;
    const now = ctx.currentTime;

    [523.25, 1046.5, 1567.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const amp = gainValue / (idx + 1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (0.6 - idx * 0.1));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);
    });
  }

  public playAlarm(customVol?: number): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const gainValue = (customVol !== undefined ? customVol : this.volume) * 0.45;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.linearRampToValueAtTime(1100, now + 0.12);
    osc.frequency.linearRampToValueAtTime(700, now + 0.24);
    osc.frequency.linearRampToValueAtTime(1100, now + 0.36);
    osc.frequency.linearRampToValueAtTime(700, now + 0.48);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainValue * 0.6, now + 0.02);
    gain.gain.setValueAtTime(gainValue * 0.6, now + 0.46);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.56);
  }

  public playSound(soundType: AlertSoundType = 'beep', volume?: number): void {
    if (this.isMuted) return;
    const effectiveVolume = volume !== undefined ? volume : this.volume;

    switch (soundType) {
      case 'chime':
        this.playWarningChime(effectiveVolume);
        break;
      case 'pulse':
        this.playPulse(effectiveVolume);
        break;
      case 'alarm':
        this.playAlarm(effectiveVolume);
        break;
      case 'bell':
        this.playBell(effectiveVolume);
        break;
      case 'beep':
      default:
        this.playBeep(effectiveVolume);
        break;
    }
  }

  public playCueTick(): void {
    this.playBeep(0.15);
  }
}

export const audioController = new AudioController();
