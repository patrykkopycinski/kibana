import React from 'react';
import type { ChromeAppHeaderConfig } from '@kbn/core-chrome-browser';
/**
 * Low-level registration hook for wrappers that need Chrome-owned header placement.
 * Prefer rendering `AppHeader` directly. New uses should be reviewed by `@elastic/appex-sharedux`.
 */
export declare const useChromeAppHeaderRegistration: (config: ChromeAppHeaderConfig) => void;
/**
 * Registers header configuration for Chrome-owned top-bar placement.
 * Prefer rendering `AppHeader` directly. Use this only when sticky or shared top navigation, or
 * other layout constraints, require Chrome to own the header slot. New uses should be reviewed by
 * `@elastic/appex-sharedux`.
 */
export declare const ChromeAppHeaderRegistration: React.NamedExoticComponent<ChromeAppHeaderConfig>;
