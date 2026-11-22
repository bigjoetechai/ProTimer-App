/**
 * Display Style & Sizes/Positions Helper.
 * Ensures all Preferences (Fonts, Font Styles, Sizes & Positions, Colon Offset,
 * Shadow, Crop & Scale, Progress Bar, Images, Alerts, Colors & Animations,
 * and General Countdown/Clock/Date formatting) are applied consistently and
 * reactively across all displays (Fullscreen, Multi FS, Preview, Presenter,
 * NDI, Stage, LAN, and Main Console).
 */

import React, { useEffect, useState } from 'react';
import {
  AppPreferences,
  DEFAULT_PREFERENCES,
  DEFAULT_TARGET_ELEMENTS_CONFIG,
  DEFAULT_TARGET_EXTRAS_CONFIG,
  SizesPositionElementConfig,
  SizesPositionElementId,
  SizesPositionTargetExtras,
  SizesPositionTargetTab,
} from '../types';
import { storageService } from '../services/storageService';

export function sanitizeImageUrl(url?: string | null): string {
  if (!url || url === '__CACHED__') return '';
  return url;
}

/**
 * Reactive hook that keeps any display component in sync with saved preferences
 * via localStorage, custom events, and DisplaySyncPayload.
 */
export function useLivePreferences(payloadPrefs?: AppPreferences): AppPreferences {
  const [localPrefs, setLocalPrefs] = useState<AppPreferences>(() =>
    storageService.getPreferences()
  );

  useEffect(() => {
    const refresh = () => {
      setLocalPrefs({ ...storageService.getPreferences() });
    };
    window.addEventListener('protimer-prefs-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('protimer-prefs-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (payloadPrefs) {
    const hasPayloadListBg =
      payloadPrefs.listBackgroundImages &&
      Object.keys(payloadPrefs.listBackgroundImages).length > 0;
    const hasPayloadListLogo =
      payloadPrefs.listLogoImages &&
      Object.keys(payloadPrefs.listLogoImages).length > 0;

    return {
      ...DEFAULT_PREFERENCES,
      ...localPrefs,
      ...payloadPrefs,
      backgroundImageDataUrl:
        sanitizeImageUrl(payloadPrefs.backgroundImageDataUrl) ||
        sanitizeImageUrl(localPrefs.backgroundImageDataUrl),
      logoImageDataUrl:
        sanitizeImageUrl(payloadPrefs.logoImageDataUrl) ||
        sanitizeImageUrl(localPrefs.logoImageDataUrl),
      listBackgroundImages: hasPayloadListBg
        ? payloadPrefs.listBackgroundImages
        : localPrefs.listBackgroundImages || {},
      listLogoImages: hasPayloadListLogo
        ? payloadPrefs.listLogoImages
        : localPrefs.listLogoImages || {},
    };
  }

  return localPrefs;
}

export const COMMON_SYSTEM_FONTS: string[] = [
  'Verdana',
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Bahnschrift',
  'Book Antiqua',
  'Bookman Old Style',
  'Calibri',
  'Cambria',
  'Candara',
  'Cascadia Code',
  'Cascadia Mono',
  'Century Gothic',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Ebrima',
  'Franklin Gothic Medium',
  'Futura',
  'Gabriola',
  'Gadugi',
  'Garamond',
  'Geneva',
  'Georgia',
  'Gill Sans',
  'Helvetica',
  'Helvetica Neue',
  'Impact',
  'Ink Free',
  'Inter',
  'JetBrains Mono',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Malgun Gothic',
  'Marlett',
  'Microsoft Himalaya',
  'Microsoft JhengHei',
  'Microsoft New Tai Lue',
  'Microsoft PhagsPa',
  'Microsoft Sans Serif',
  'Microsoft Tai Le',
  'Microsoft YaHei',
  'Microsoft Yi Baiti',
  'MingLiU-ExtB',
  'Monaco',
  'Mongolian Baiti',
  'Montserrat',
  'MS Gothic',
  'MV Boli',
  'Myanmar Text',
  'Nirmala UI',
  'Open Sans',
  'Optima',
  'Oswald',
  'Palatino Linotype',
  'Poppins',
  'Roboto',
  'Roboto Condensed',
  'Roboto Mono',
  'Rockwell',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Black',
  'Segoe UI Historic',
  'Segoe UI Semibold',
  'Segoe UI Symbol',
  'SimSun',
  'Sitka Banner',
  'Sitka Display',
  'Sitka Heading',
  'Sitka Small',
  'Sitka Subheading',
  'Sitka Text',
  'Sylfaen',
  'System UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Ubuntu',
  'Ubuntu Mono',
  'Yu Gothic',
];

let cachedDetectedFonts: string[] | null = null;
let pendingFontDetectionPromise: Promise<string[]> | null = null;

function detectCanvasInstalledFonts(candidates: string[]): string[] {
  if (typeof document === 'undefined') return candidates;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return candidates;

    const testText = 'mmmmmmmmmmlli100:00WW';
    const testSize = '72px';
    const baseFonts = ['monospace', 'sans-serif', 'serif'] as const;
    const baseWidths: Record<string, number> = {};

    for (const base of baseFonts) {
      ctx.font = `${testSize} ${base}`;
      baseWidths[base] = ctx.measureText(testText).width;
    }

    const available: string[] = [];
    for (const font of candidates) {
      if (font === 'System UI' || font === 'Verdana' || font === 'Arial' || font === 'Segoe UI') {
        available.push(font);
        continue;
      }
      const isInstalled = baseFonts.some((base) => {
        ctx.font = `${testSize} "${font}", ${base}`;
        return ctx.measureText(testText).width !== baseWidths[base];
      });
      if (isInstalled) {
        available.push(font);
      }
    }
    return available;
  } catch {
    return candidates;
  }
}

export async function loadAllSystemFonts(): Promise<string[]> {
  if (cachedDetectedFonts && cachedDetectedFonts.length > 0) {
    return cachedDetectedFonts;
  }
  if (pendingFontDetectionPromise) {
    return pendingFontDetectionPromise;
  }

  pendingFontDetectionPromise = (async () => {
    const fontSet = new Set<string>(COMMON_SYSTEM_FONTS);

    // 1. Canvas check across common system fonts
    for (const f of detectCanvasInstalledFonts(COMMON_SYSTEM_FONTS)) {
      fontSet.add(f);
    }

    // 2. Native OS fonts via Electron IPC (Windows / macOS / Linux)
    if (typeof window !== 'undefined' && window.electronAPI?.getSystemFonts) {
      try {
        const osFonts = await window.electronAPI.getSystemFonts();
        if (Array.isArray(osFonts)) {
          for (const name of osFonts) {
            const clean = typeof name === 'string' ? name.trim() : '';
            if (clean && !clean.startsWith('@')) {
              fontSet.add(clean);
            }
          }
        }
      } catch {
        // Ignore Electron IPC error
      }
    }

    // 3. Chromium Local Font Access API (window.queryLocalFonts)
    if (typeof window !== 'undefined' && typeof (window as any).queryLocalFonts === 'function') {
      try {
        const localFonts = await (window as any).queryLocalFonts();
        if (Array.isArray(localFonts)) {
          for (const item of localFonts) {
            const family = typeof item?.family === 'string' ? item.family.trim() : '';
            if (family && !family.startsWith('@')) {
              fontSet.add(family);
            }
          }
        }
      } catch {
        // Permission denied or unsupported in current context
      }
    }

    const sorted = Array.from(fontSet).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );
    cachedDetectedFonts = sorted;
    return sorted;
  })();

  return pendingFontDetectionPromise;
}

/**
 * Hook that returns all available system fonts (common + OS installed fonts).
 */
export function useSystemFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(() =>
    cachedDetectedFonts && cachedDetectedFonts.length > 0
      ? cachedDetectedFonts
      : [...COMMON_SYSTEM_FONTS].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        )
  );

  useEffect(() => {
    let mounted = true;
    loadAllSystemFonts().then((resolved) => {
      if (mounted && resolved.length > 0) {
        setFonts(resolved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return fonts;
}

/**
 * Maps user-selected font family names (including any installed OS system font) to complete CSS font stacks.
 */
export function resolveFontFamily(fontName?: string): string {
  if (!fontName || !fontName.trim()) {
    return 'Verdana, Geneva, Tahoma, sans-serif';
  }
  const clean = fontName.trim();
  switch (clean) {
    case 'System UI':
      return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    case 'Verdana':
      return 'Verdana, Geneva, Tahoma, sans-serif';
    case 'Arial':
      return 'Arial, Helvetica, sans-serif';
    case 'Inter':
      return 'Inter, system-ui, -apple-system, sans-serif';
    case 'Segoe UI':
      return '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
    case 'Tahoma':
      return 'Tahoma, Verdana, Segoe, sans-serif';
    case 'Trebuchet MS':
      return '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif';
    case 'Roboto Mono':
    case 'Consolas':
    case 'Cascadia Mono':
    case 'Cascadia Code':
    case 'Lucida Console':
      return `"${clean.replace(/"/g, '')}", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    case 'Courier New':
      return '"Courier New", Courier, "Lucida Sans Typewriter", monospace';
    case 'Georgia':
    case 'Times New Roman':
    case 'Cambria':
    case 'Garamond':
    case 'Palatino Linotype':
      return `"${clean.replace(/"/g, '')}", Georgia, Cambria, "Times New Roman", Times, serif`;
    case 'Impact':
      return 'Impact, Haettenschweiler, "Franklin Gothic Bold", Charcoal, sans-serif';
    default: {
      const escaped = clean.replace(/"/g, '');
      return `"${escaped}", local("${escaped}"), system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    }
  }
}

/**
 * Maps 'Normal' | 'Bold' | 'Italic' | 'Bold Italic' to explicit CSS fontWeight & fontStyle.
 */
export function resolveFontStyleCss(styleName?: string): React.CSSProperties {
  const normalized = (styleName || 'Normal').toLowerCase();
  const isBold = normalized.includes('bold');
  const isItalic = normalized.includes('italic');
  return {
    fontWeight: isBold ? 800 : 400,
    fontStyle: isItalic ? 'italic' : 'normal',
  };
}

/**
 * Returns completemerged element configurations for a target display tab.
 */
export function getTargetElements(
  prefs: AppPreferences | null | undefined,
  target: SizesPositionTargetTab
): Record<SizesPositionElementId, SizesPositionElementConfig> {
  const effectivePrefs = prefs || DEFAULT_PREFERENCES;
  const targetMap = effectivePrefs.sizesAndPositionsByTarget?.[target];
  const fallbackMap = effectivePrefs.sizesAndPositionsByTarget?.fullscreen_ndi_preview;

  const result = {} as Record<SizesPositionElementId, SizesPositionElementConfig>;
  (Object.keys(DEFAULT_TARGET_ELEMENTS_CONFIG) as SizesPositionElementId[]).forEach((key) => {
    result[key] = {
      ...DEFAULT_TARGET_ELEMENTS_CONFIG[key],
      ...(fallbackMap?.[key] || {}),
      ...(targetMap?.[key] || {}),
    };
  });
  return result;
}

/**
 * Returns complete merged Shadow & Crop/Scale extras for a target display tab.
 */
export function getTargetExtras(
  prefs: AppPreferences | null | undefined,
  target: SizesPositionTargetTab
): SizesPositionTargetExtras {
  const effectivePrefs = prefs || DEFAULT_PREFERENCES;
  const targetExtras = effectivePrefs.sizesAndPositionsExtrasByTarget?.[target];
  const fallbackExtras = effectivePrefs.sizesAndPositionsExtrasByTarget?.fullscreen_ndi_preview;
  return {
    ...DEFAULT_TARGET_EXTRAS_CONFIG,
    ...(fallbackExtras || {}),
    ...(targetExtras || {}),
  };
}

/**
 * Computes CSS text-shadow string from target extras.
 */
export function getTargetShadowCss(extras?: SizesPositionTargetExtras): string | undefined {
  if (!extras || !extras.enableShadow) return undefined;
  const x = extras.shadowXOffset ?? 5;
  const y = -(extras.shadowYOffset ?? -5);
  const blur = Math.max(0, extras.shadowBlur ?? 0);
  const color = extras.shadowColor || '#000000';
  return `${x}px ${y}px ${blur}px ${color}`;
}

/**
 * Computes CSS transform for an element's Horiz and Vert offset values.
 * Positive Vert moves UP (matching broadcast convention where +Vert raises the element),
 * Positive Horiz moves RIGHT.
 */
export function getElementOffsetTransform(
  cfg?: SizesPositionElementConfig,
  pxPerUnit = 3
): string | undefined {
  if (!cfg) return undefined;
  const h = cfg.horiz ?? 0;
  const v = cfg.vert ?? 0;
  if (h === 0 && v === 0) return undefined;
  return `translate(${h * pxPerUnit}px, ${-v * pxPerUnit}px)`;
}

/**
 * Computes typography + transform style for a configured display element.
 */
export function getElementStyle(
  cfg?: SizesPositionElementConfig,
  options?: {
    baseFontSizePx?: number;
    defaultSizePercent?: number;
    pxPerOffsetUnit?: number;
    textShadow?: string;
    color?: string;
  }
): React.CSSProperties {
  const defaultSizePct = options?.defaultSizePercent ?? 33;
  const currentSizePct = cfg?.sizePercent ?? defaultSizePct;
  const scaleRatio = Math.max(0.15, currentSizePct / defaultSizePct);

  const style: React.CSSProperties = {
    fontFamily: resolveFontFamily(cfg?.font),
    ...resolveFontStyleCss(cfg?.fontStyle),
  };

  if (options?.baseFontSizePx !== undefined) {
    style.fontSize = `${Math.max(9, Math.round(options.baseFontSizePx * scaleRatio))}px`;
  }

  const offsetTransform = getElementOffsetTransform(cfg, options?.pxPerOffsetUnit ?? 2.5);
  if (offsetTransform) {
    style.transform = offsetTransform;
  }

  if (options?.textShadow) {
    style.textShadow = options.textShadow;
  }

  if (options?.color) {
    style.color = options.color;
  }

  return style;
}

/**
 * Computes Crop, Corner Radius, BG Key Color, and overall Zoom/Position for a display container.
 */
export function getTargetCanvasStyles(
  extras?: SizesPositionTargetExtras,
  hasBackgroundImage?: boolean
): {
  outerStyle: React.CSSProperties;
  innerTransformStyle: React.CSSProperties;
} {
  if (!extras) {
    return { outerStyle: {}, innerTransformStyle: {} };
  }

  const outerStyle: React.CSSProperties = {
    backgroundColor: hasBackgroundImage ? '#000000' : extras.bgKeyColor || '#000000',
  };

  if (extras.cornerRadius && extras.cornerRadius > 0) {
    outerStyle.borderRadius = `${extras.cornerRadius}px`;
  }

  if (extras.enableCrop) {
    const top = Math.max(0, Math.min(95, extras.cropTopPercent ?? 0));
    const right = Math.max(0, Math.min(95, extras.cropRightPercent ?? 0));
    const bottom = Math.max(0, Math.min(95, extras.cropBottomPercent ?? 0));
    const left = Math.max(0, Math.min(95, extras.cropLeftPercent ?? 0));
    outerStyle.clipPath = `inset(${top}% ${right}% ${bottom}% ${left}%)`;
  }

  const zoom = (extras.scaleZoomPercent ?? 100) / 100;
  const posX = (extras.positionOffsetX ?? 0) * 6;
  const posY = (extras.positionOffsetY ?? 0) * 6;

  const innerTransformStyle: React.CSSProperties = {};
  if (zoom !== 1 || posX !== 0 || posY !== 0) {
    innerTransformStyle.transform = `translate(${posX}px, ${posY}px) scale(${zoom})`;
    innerTransformStyle.transformOrigin = 'center center';
  }

  return { outerStyle, innerTransformStyle };
}

/**
 * Resolves the active digit color based on timer status, alert state, and Preferences.
 */
export function resolveDisplayDigitColor(params: {
  isOvertime?: boolean;
  isPaused?: boolean;
  activeAlertLevel?: 'none' | 'warning' | 'danger';
  alertColor?: string;
  prefs?: AppPreferences | null;
}): string {
  const { isOvertime, activeAlertLevel, alertColor, prefs } = params;
  const p = prefs || DEFAULT_PREFERENCES;

  if (isOvertime) {
    return p.overtimeDigitsColor || alertColor || '#ef4444';
  }
  if (activeAlertLevel === 'danger') {
    return p.dangerDigitsColor || alertColor || '#ef4444';
  }
  if (activeAlertLevel === 'warning') {
    return p.warningDigitsColor || alertColor || '#eab308';
  }
  if (alertColor) {
    return alertColor;
  }
  return p.normalDigitsColor || '#ffffff';
}

/**
 * Renders formatted time string while applying the vertical colon offset (`colon.vert`)
 * from Sizes & Positions.
 */
export function renderTimeWithColonOffset(
  displayTime: string,
  colonVert?: number
): React.ReactNode {
  const offset = colonVert ?? 0;
  if (!offset || !displayTime.includes(':')) {
    return displayTime;
  }
  const parts = displayTime.split(':');
  return parts.map((part, idx) => (
    <React.Fragment key={idx}>
      <span>{part}</span>
      {idx < parts.length - 1 && (
        <span
          style={{
            display: 'inline-block',
            transform: `translateY(${-offset * 0.035}em)`,
          }}
        >
          :
        </span>
      )}
    </React.Fragment>
  ));
}

/**
 * Resolves CSS positioning classes for Logo location ('TopRight', 'TopLeft', 'BottomRight', 'BottomLeft', 'Top', 'Middle', 'Bottom').
 */
export function getLogoLocationClasses(location?: string): string {
  switch (location) {
    case 'TopLeft':
      return 'top-4 left-6';
    case 'BottomRight':
      return 'bottom-4 right-6';
    case 'BottomLeft':
      return 'bottom-4 left-6';
    case 'Top':
      return 'top-4 left-1/2 -translate-x-1/2';
    case 'Middle':
      return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
    case 'Bottom':
      return 'bottom-4 left-1/2 -translate-x-1/2';
    case 'TopRight':
    default:
      return 'top-4 right-6';
  }
}
