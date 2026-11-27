/**
 * Single source of truth for ProTimer application version in the renderer bundle.
 * Value is injected at build time from package.json via vite.config.ts (`__APP_VERSION__`).
 */

declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0
    ? __APP_VERSION__.trim()
    : '3.0.2';

export const APP_VERSION_TAG: string = `v${APP_VERSION}`;
