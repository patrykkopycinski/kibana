/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Literal Throughline prototype CSS custom properties.
 *
 * Source of truth:
 * - Light / day: `throughline-app.js` → `TL_CSS` → `:root` block
 * - Dark: `Throughline.dc.html` → `applyTheme()` → `body.theme-dark` block
 * - Nightshift accent shift: `throughline-app.js` → `body.mode-night` block
 *
 * Do not invent hex values here — reconcile from prototype on re-vendor.
 */

export type ThroughlineSurfaceMode = 'light' | 'dark' | 'nightshift';

/** CSS declarations (without selector) for injection into `.daybreakVisualShell`. */
export const THROUGHLINE_TOKEN_BLOCKS: Record<ThroughlineSurfaceMode, string> = {
  light: `
  --ink-0:#15171c; --ink-1:#2b2f38; --ink-2:#4a505d; --ink-3:#69707d; --ink-4:#98a0b0; --ink-5:#c3c9d6;
  --bg:#f5f6fa; --bg-2:#eef0f6; --panel:#ffffff; --panel-2:#fbfcfe;
  --line:#e6e9f0; --line-2:#d6dbe6; --line-strong:#c2c9d6;
  --blue:#0b64dd; --blue-d:#0a55bd; --blue-bg:#e8f1fd; --blue-ring:rgba(11,100,221,.35);
  --green:#149a6f; --green-d:#149a6f; --green-bg:#e4f5ee;
  --teal:#0e9ca0; --teal-bg:#e2f4f4;
  --amber:#c0820f; --amber-d:#c0820f; --amber-bg:#fbf2dd;
  --red:#c42e3a; --red-d:#a3242f; --red-bg:#fcebec;
  --violet:#7a4fd0; --violet-bg:#f1ebfb;
  --t-case:#0b64dd; --t-inv:#0e9ca0; --t-hunt:#7a4fd0; --t-incident:#c42e3a; --t-custom:#5a6270;
  --accent:#e0892b; --accent-d:#a96414; --accent-bg:#fbf0e1; --accent-ring:rgba(224,137,43,.30);
  --r-xs:5px; --r-sm:7px; --r-md:10px; --r-lg:14px; --r-pill:999px;
  --shell:#edecea; --shell-line:#e4e2de; --rail-w:64px;
  --sh-xs:0 1px 2px rgba(20,25,40,.06);
  --sh-sm:0 1px 2px rgba(20,25,40,.05),0 2px 5px rgba(20,25,40,.05);
  --sh-md:0 4px 14px rgba(20,25,40,.10),0 2px 6px rgba(20,25,40,.06);
  --sh-lg:0 18px 50px rgba(20,25,40,.18),0 4px 12px rgba(20,25,40,.08);
  --panel-shadow:0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06);
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  `,

  dark: `
  --ink-0:#E7ECF5; --ink-1:#C8D2E2; --ink-2:#A6B4CD; --ink-3:#8294B0; --ink-4:#74849F; --ink-5:#56657F;
  --bg:#07101F; --bg-2:#18263C; --panel:#0B1628; --panel-2:#11203A;
  --line:#1E2C42; --line-2:#2C3B53; --line-strong:#3C4D68;
  --blue:#61A2FF; --blue-d:#9CC4FF; --blue-bg:#11233E; --blue-ring:rgba(97,162,255,.40);
  --green:#2BC79A; --green-d:#74E6C4; --green-bg:#0E2A22;
  --teal:#1EC8C3; --teal-bg:#0E2A2A;
  --amber:#FBD06B; --amber-d:#FBD06B; --amber-bg:#2A2413;
  --red:#F6726A; --red-d:#FF9F98; --red-bg:#2C1A1B;
  --violet:#B794F4; --violet-bg:#221A33;
  --t-case:#61A2FF; --t-inv:#1EC8C3; --t-hunt:#B794F4; --t-incident:#F6726A; --t-custom:#A6B4CD;
  --accent:#61A2FF; --accent-d:#9CC4FF; --accent-bg:#11233E; --accent-on:#06101e; --accent-ring:rgba(97,162,255,.40);
  --r-xs:5px; --r-sm:7px; --r-md:10px; --r-lg:14px; --r-pill:999px;
  --shell:#060B15; --shell-line:#18263C; --rail-w:64px;
  --sh-xs:0 1px 2px rgba(0,0,0,.45);
  --sh-sm:0 1px 2px rgba(0,0,0,.45),0 2px 5px rgba(0,0,0,.40);
  --sh-md:0 4px 14px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.45);
  --sh-lg:0 18px 50px rgba(0,0,0,.65),0 4px 12px rgba(0,0,0,.50);
  --panel-shadow:0 1px 3px rgba(20,23,28,.05),0 10px 30px rgba(20,23,28,.06);
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  `,

  nightshift: `
  --accent:#6e5fe0; --accent-d:#473ba6; --accent-bg:#edebfb; --accent-ring:rgba(110,95,224,.30);
  --bg:#f4f4fb; --bg-2:#ecebf7; --shell:#eae8f4; --shell-line:#e0def0;
  `,
};

export const resolveThroughlineSurfaceMode = (
  kibanaColorMode: string | undefined,
  nightshiftToggle: boolean
): ThroughlineSurfaceMode => {
  if (nightshiftToggle) {
    return 'nightshift';
  }
  return kibanaColorMode === 'DARK' ? 'dark' : 'light';
};

export const buildThroughlineTokenCss = (mode: ThroughlineSurfaceMode): string => {
  const base = mode === 'dark' ? THROUGHLINE_TOKEN_BLOCKS.dark : THROUGHLINE_TOKEN_BLOCKS.light;
  const overlay = mode === 'nightshift' ? THROUGHLINE_TOKEN_BLOCKS.nightshift : '';
  return `${base}${overlay}`;
};
