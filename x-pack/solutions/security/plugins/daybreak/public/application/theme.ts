/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { euiLightVars, euiDarkVars } from '@kbn/ui-theme';

/**
 * Design-token system for the Daybreak `public/` layer (FR-004, FR-005,
 * FR-006), ported from the Throughline (NotDaybreak) prototype's CSS
 * custom-property layer (`throughline-app.js`'s token block, applied via
 * `applyAccent`/`applyTheme`/`applyRadius`/`applyShadow` in
 * `Throughline.dc.html`).
 *
 * The prototype source itself is not vendored in this repository yet (see
 * `.ao/blocked.md`, FR-001) — every value below is mapped onto the nearest
 * EUI Borealis theme token (`@kbn/ui-theme`'s `euiLightVars`/`euiDarkVars`),
 * which is the closest 1:1 equivalent available today. When the prototype is
 * vendored, the deltas between its literal CSS custom properties and these
 * EUI-derived values should be reconciled here (see the mapping table in
 * `theme.mapping.md`, FR-007) rather than duplicating hardcoded hex values.
 *
 * Every ported surface (shell, thread, brief, gate) MUST consume tokens
 * through {@link daybreakTheme} rather than inlining hex/pixel literals
 * (FR-006).
 */

/** The two supported color modes. The prototype's default build is dark (FR-005). */
export type DaybreakThemeMode = 'light' | 'dark';

/**
 * Neutral surface/text/border tokens — the base palette every other token
 * group is drawn against.
 */
export interface DaybreakNeutralTokens {
  backgroundPlain: string;
  backgroundSubdued: string;
  backgroundNeutral: string;
  border: string;
  borderSubdued: string;
  textParagraph: string;
  textSubdued: string;
  textDisabled: string;
}

/**
 * Semantic status tokens — severity/outcome colors used across proposal and
 * evidence surfaces (severity badges, gate pass/fail states).
 */
export interface DaybreakSemanticTokens {
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

/**
 * Thread-type tokens — one accent color per Evidence `kind`
 * (`server/client/evidence/storage.ts`'s `EvidenceProperties['kind']`, FR-022)
 * so the thread/timeline view can visually distinguish evidence types without
 * relying on text alone.
 */
export interface DaybreakThreadTypeTokens {
  alert: string;
  event: string;
  entity: string;
  timeline: string;
  query: string;
  assumption: string;
  external: string;
}

/** Shape tokens — radius and elevation, ported from the prototype's `applyRadius`/`applyShadow` overrides. */
export interface DaybreakShapeTokens {
  borderRadius: string;
  borderRadiusSmall: string;
  shadowS: string;
  shadowM: string;
}

/** The full set of token groups a single mode (light or dark) must expose (FR-004). */
export interface DaybreakThemeTokens {
  neutrals: DaybreakNeutralTokens;
  semantic: DaybreakSemanticTokens;
  threadType: DaybreakThreadTypeTokens;
  shape: DaybreakShapeTokens;
}

const buildTokens = (euiVars: typeof euiLightVars): DaybreakThemeTokens => ({
  neutrals: {
    backgroundPlain: euiVars.euiColorBackgroundBasePlain,
    backgroundSubdued: euiVars.euiColorBackgroundBaseSubdued,
    backgroundNeutral: euiVars.euiColorBackgroundBaseNeutral,
    border: euiVars.euiBorderColor,
    borderSubdued: euiVars.euiColorBorderBaseSubdued,
    textParagraph: euiVars.euiColorTextParagraph,
    textSubdued: euiVars.euiColorTextSubdued,
    textDisabled: euiVars.euiColorTextDisabled,
  },
  semantic: {
    primary: euiVars.euiColorPrimary,
    accent: euiVars.euiColorAccent,
    success: euiVars.euiColorSuccess,
    warning: euiVars.euiColorWarning,
    danger: euiVars.euiColorDanger,
  },
  threadType: {
    alert: euiVars.euiColorVis6,
    event: euiVars.euiColorVis2,
    entity: euiVars.euiColorVis4,
    timeline: euiVars.euiColorVis0,
    query: euiVars.euiColorVis8,
    assumption: euiVars.euiColorVis9,
    external: euiVars.euiColorVis3,
  },
  shape: {
    borderRadius: euiVars.euiBorderRadius,
    borderRadiusSmall: euiVars.euiBorderRadiusSmall,
    shadowS: euiVars.euiShadows.s.down,
    shadowM: euiVars.euiShadows.m.down,
  },
});

/** Per-mode token sets, keyed by {@link DaybreakThemeMode}. */
export interface DaybreakThemeModes {
  light: DaybreakThemeTokens;
  dark: DaybreakThemeTokens;
}

/**
 * The Daybreak design-token system (FR-004, FR-005, FR-006). Defaults to the
 * prototype's dark build (`defaultMode: 'dark'`) while also fully supporting
 * light mode.
 */
export interface DaybreakTheme {
  defaultMode: DaybreakThemeMode;
  modes: DaybreakThemeModes;
}

export const daybreakTheme: DaybreakTheme = {
  defaultMode: 'dark',
  modes: {
    light: buildTokens(euiLightVars),
    dark: buildTokens(euiDarkVars),
  },
};
