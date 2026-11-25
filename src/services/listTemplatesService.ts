import { EndAction, TimerAlert, TimerItem, TimerList, TimerType } from '../types';

export type ListTemplateCategory =
  | 'worship'
  | 'sports'
  | 'conference'
  | 'broadcast'
  | 'education'
  | 'custom';

export type TemplateLoadMode = 'new_tab' | 'append' | 'replace';

export interface TemplateCueItem {
  name: string;
  durationSeconds: number;
  type: TimerType;
  endAction: EndAction;
  speed?: number;
  colorTag?: string;
  alert1?: TimerAlert;
  alert2?: TimerAlert;
  notes?: string;
}

export interface ListTemplate {
  id: string;
  name: string;
  description: string;
  category: ListTemplateCategory;
  color?: string;
  isBuiltIn: boolean;
  createdAt: number;
  cues: TemplateCueItem[];
}

export const TEMPLATE_CATEGORIES: { id: ListTemplateCategory; label: string }[] = [
  { id: 'custom', label: 'My Templates' },
  { id: 'worship', label: 'Worship' },
  { id: 'sports', label: 'Sports' },
  { id: 'conference', label: 'Conference' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'education', label: 'Workshop' },
];

const STORAGE_KEY = 'protimer_list_templates_v1';

function makeAlert(
  id: string,
  timeSeconds: number,
  color: string,
  flash = false,
  onOff = false
): TimerAlert {
  return {
    id,
    timeSeconds,
    color,
    flash,
    onOff,
    soundEnabled: false,
  };
}

export const BUILT_IN_TEMPLATES: ListTemplate[] = [
  {
    id: 'builtin-sunday-service',
    name: 'Sunday Service',
    description: 'Complete worship service order from pre-service countdown through sermon and benediction.',
    category: 'worship',
    color: '#9333ea',
    isBuiltIn: true,
    createdAt: 1700000001000,
    cues: [
      {
        name: 'Pre-Service Countdown',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 120, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Welcome & Call to Worship',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#9333ea',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Praise & Worship Set',
        durationSeconds: 20 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#2563eb',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Announcements & Offering',
        durationSeconds: 8 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Scripture Reading & Prayer',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Main Sermon / Message',
        durationSeconds: 35 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#ff2a2a',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Altar Call & Response',
        durationSeconds: 7 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#9333ea',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Benediction & Dismissal',
        durationSeconds: 3 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
    ],
  },
  {
    id: 'builtin-sports-match',
    name: 'Sports Match',
    description: 'Game-day production rundown with warmup, halves, halftime intermission, and post-game press.',
    category: 'sports',
    color: '#00c853',
    isBuiltIn: true,
    createdAt: 1700000002000,
    cues: [
      {
        name: 'Pre-Game Warmup',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Team Lineups & Anthem',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#2563eb',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
      {
        name: '1st Half / Period 1',
        durationSeconds: 45 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Halftime Intermission',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: '2nd Half / Period 2',
        durationSeconds: 45 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Post-Game Interviews',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#ff6d00',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
    ],
  },
  {
    id: 'builtin-conference-summit',
    name: 'Conference & Summit',
    description: 'Full stage schedule for keynotes, Q&A sessions, coffee breaks, panels, and fireside chats.',
    category: 'conference',
    color: '#00d2ff',
    isBuiltIn: true,
    createdAt: 1700000003000,
    cues: [
      {
        name: 'Doors Open / Walk-In',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#7c8b9e',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Opening Remarks',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Keynote Presentation',
        durationSeconds: 30 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#2563eb',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Audience Q&A',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Coffee & Networking Break',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Panel Discussion',
        durationSeconds: 40 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#9333ea',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Fireside Chat',
        durationSeconds: 25 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#ff6d00',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Closing Summary',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
    ],
  },
  {
    id: 'builtin-live-broadcast',
    name: 'Live Broadcast / TV Show',
    description: 'Studio show segments timed with automatic commercial break handoffs and tight wrap cues.',
    category: 'broadcast',
    color: '#ff2a2a',
    isBuiltIn: true,
    createdAt: 1700000004000,
    cues: [
      {
        name: 'Standby / Pre-Roll',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#7c8b9e',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 10, '#ef4444', true),
      },
      {
        name: 'Cold Open & Headlines',
        durationSeconds: 3 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ff2a2a',
        alert1: makeAlert('a1', 45, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
      {
        name: 'Segment A: Lead Story',
        durationSeconds: 12 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#2563eb',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Commercial Break 1',
        durationSeconds: 150,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 30, '#eab308', false),
        alert2: makeAlert('a2', 10, '#ef4444', true),
      },
      {
        name: 'Segment B: Live Interview',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 45, '#ef4444', true),
      },
      {
        name: 'Commercial Break 2',
        durationSeconds: 150,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 30, '#eab308', false),
        alert2: makeAlert('a2', 10, '#ef4444', true),
      },
      {
        name: 'Segment C: Wrap & Credits',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#ff2a2a',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
    ],
  },
  {
    id: 'builtin-workshop-training',
    name: 'Workshop & Training',
    description: 'Structured classroom or seminar flow with core modules, hands-on lab, break, and review.',
    category: 'education',
    color: '#ffb300',
    isBuiltIn: true,
    createdAt: 1700000005000,
    cues: [
      {
        name: 'Welcome & Objectives',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Module 1: Core Concepts',
        durationSeconds: 30 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#2563eb',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Hands-On Lab Exercise',
        durationSeconds: 25 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
      {
        name: 'Short Break',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Module 2: Deep Dive',
        durationSeconds: 30 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#9333ea',
        alert1: makeAlert('a1', 5 * 60, '#eab308', false),
        alert2: makeAlert('a2', 2 * 60, '#ef4444', true),
      },
      {
        name: 'Group Review & Q&A',
        durationSeconds: 15 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#ff6d00',
        alert1: makeAlert('a1', 3 * 60, '#eab308', false),
        alert2: makeAlert('a2', 60, '#ef4444', true),
      },
    ],
  },
  {
    id: 'builtin-pitch-night',
    name: 'Pitch Night / Lightning Talks',
    description: 'Fast-paced presenter slots with consistent pitch timers, judging deliberation, and awards.',
    category: 'conference',
    color: '#f50076',
    isBuiltIn: true,
    createdAt: 1700000006000,
    cues: [
      {
        name: 'Host Intro & Rules',
        durationSeconds: 5 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#00d2ff',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
      {
        name: 'Presenter 1 + Q&A',
        durationSeconds: 8 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#f50076',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Presenter 2 + Q&A',
        durationSeconds: 8 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#f50076',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Presenter 3 + Q&A',
        durationSeconds: 8 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#f50076',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Presenter 4 + Q&A',
        durationSeconds: 8 * 60,
        type: 'countdown',
        endAction: 'count_up',
        colorTag: '#f50076',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Judges Deliberation',
        durationSeconds: 10 * 60,
        type: 'countdown',
        endAction: 'next_timer',
        colorTag: '#ffb300',
        alert1: makeAlert('a1', 2 * 60, '#eab308', false),
        alert2: makeAlert('a2', 30, '#ef4444', true),
      },
      {
        name: 'Awards & Closing',
        durationSeconds: 7 * 60,
        type: 'countdown',
        endAction: 'stop',
        colorTag: '#00c853',
        alert1: makeAlert('a1', 60, '#eab308', false),
        alert2: makeAlert('a2', 15, '#ef4444', true),
      },
    ],
  },
];

export function getTemplateTotalSeconds(template: Pick<ListTemplate, 'cues'>): number {
  return template.cues.reduce((acc, cue) => acc + Math.max(0, cue.durationSeconds || 0), 0);
}

export function formatTemplateDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

export function formatCueMMSS(durationSeconds: number): string {
  const safe = Math.max(0, Math.floor(durationSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

class ListTemplatesService {
  private customTemplates: ListTemplate[] = [];
  private listeners = new Set<() => void>();
  private cachedAll: ListTemplate[] | null = null;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.loadFromStorage();
          this.emit();
        }
      });
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) {
        this.customTemplates = [];
        this.cachedAll = null;
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.customTemplates = parsed.filter(
          (t): t is ListTemplate =>
            Boolean(t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.cues))
        );
      } else {
        this.customTemplates = [];
      }
      this.cachedAll = null;
    } catch {
      this.customTemplates = [];
      this.cachedAll = null;
    }
  }

  private persist(): void {
    this.cachedAll = null;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customTemplates));
      }
    } catch {
      // Ignore storage quota issues
    }
    this.emit();
  }

  private emit(): void {
    this.cachedAll = null;
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getAllTemplates(): ListTemplate[] {
    if (this.cachedAll) return this.cachedAll;
    this.cachedAll = [...this.customTemplates, ...BUILT_IN_TEMPLATES];
    return this.cachedAll;
  }

  public getCustomTemplates(): ListTemplate[] {
    return this.customTemplates;
  }

  public saveListAsTemplate(
    list: TimerList,
    timers: TimerItem[],
    options?: {
      name?: string;
      description?: string;
      category?: ListTemplateCategory;
    }
  ): ListTemplate {
    const trimmedName = (options?.name || list.name || 'Custom Template').trim();
    const trimmedDesc =
      (options?.description || list.description || '').trim() ||
      `Saved from "${list.name}" (${timers.length} cue${timers.length === 1 ? '' : 's'}).`;

    const cues: TemplateCueItem[] = timers.map((t) => ({
      name: t.name,
      durationSeconds: t.durationSeconds,
      type: t.type,
      endAction: t.endAction,
      speed: t.speed || 100,
      colorTag: t.colorTag,
      alert1: t.alert1 ? { ...t.alert1 } : undefined,
      alert2: t.alert2 ? { ...t.alert2 } : undefined,
      notes: t.notes,
    }));

    const template: ListTemplate = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      description: trimmedDesc,
      category: options?.category || 'custom',
      color: list.color,
      isBuiltIn: false,
      createdAt: Date.now(),
      cues,
    };

    this.customTemplates = [template, ...this.customTemplates];
    this.persist();
    return template;
  }

  public deleteCustomTemplate(templateId: string): boolean {
    const prevLen = this.customTemplates.length;
    this.customTemplates = this.customTemplates.filter((t) => t.id !== templateId);
    if (this.customTemplates.length !== prevLen) {
      this.persist();
      return true;
    }
    return false;
  }
}

export const listTemplatesService = new ListTemplatesService();
