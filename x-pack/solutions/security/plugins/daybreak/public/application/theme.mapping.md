<!--
Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
or more contributor license agreements. Licensed under the Elastic License
2.0; you may not use this file except in compliance with the Elastic License
2.0.
-->

# Daybreak token → EUI mapping (FR-007)

This table is the reference companion to [`theme.ts`](./theme.ts). It exists so
future ported surfaces (shell, thread, brief, gate) map new values onto the
**same** EUI token every time, instead of re-deriving hex/pixel literals
per-component.

## Status note (FR-001)

The Throughline (NotDaybreak) prototype source (`Throughline.dc.html`,
`throughline-app.js`, `support.js`) is **not vendored in this repository**
(see `.ao/blocked.md`). Every `daybreakTheme` value is therefore mapped onto
the **nearest EUI Borealis token** (`@kbn/ui-theme`'s `euiLightVars` /
`euiDarkVars`), not onto a literal prototype CSS custom property. The
"Prototype token" column below records the *expected* prototype variable name
per the proposal's token groups (neutrals / semantic / thread-type / shape) so
that when the prototype is vendored, each row can be re-verified 1:1 against
the real value instead of re-deriving the whole table from scratch.

## Neutral tokens (`daybreakTheme.modes[mode].neutrals`)

| Daybreak token       | EUI token (`@kbn/ui-theme`)         | Light value | Dark value | Prototype token (expected, unverified) |
|-----------------------|--------------------------------------|-------------|------------|------------------------------------------|
| `backgroundPlain`     | `euiColorBackgroundBasePlain`         | `#FFFFFF`   | `#0B1628`  | `--tl-bg` |
| `backgroundSubdued`   | `euiColorBackgroundBaseSubdued`       | `#F6F9FC`   | `#07101F`  | `--tl-bg-subdued` |
| `backgroundNeutral`   | `euiColorBackgroundBaseNeutral`       | `#ECFBFF`   | `#002938`  | `--tl-bg-neutral` |
| `border`              | `euiBorderColor`                      | `#E3E8F2`   | `#2B394F`  | `--tl-border` |
| `borderSubdued`       | `euiColorBorderBaseSubdued`           | `#E3E8F2`   | `#2B394F`  | `--tl-border-subdued` |
| `textParagraph`       | `euiColorTextParagraph`               | `#1D2A3E`   | `#CAD3E2`  | `--tl-text` |
| `textSubdued`         | `euiColorTextSubdued`                 | `#516381`   | `#98A8C3`  | `--tl-text-subdued` |
| `textDisabled`        | `euiColorTextDisabled`                | `#798EAF`   | `#6A7FA0`  | `--tl-text-disabled` |

## Semantic tokens (`daybreakTheme.modes[mode].semantic`)

| Daybreak token | EUI token (`@kbn/ui-theme`) | Light value | Dark value | Prototype token (expected, unverified) |
|-----------------|-------------------------------|-------------|------------|------------------------------------------|
| `primary`       | `euiColorPrimary`             | `#0B64DD`   | `#61A2FF`  | `--tl-accent` |
| `accent`        | `euiColorAccent`              | `#BC1E70`   | `#EE72A6`  | `--tl-accent-alt` |
| `success`       | `euiColorSuccess`             | `#008A5E`   | `#24C292`  | `--tl-ok` (gate pass / `approved`) |
| `warning`       | `euiColorWarning`             | `#FACB3D`   | `#FACB3D`  | `--tl-warn` (`needs-evidence` / `deferred`) |
| `danger`        | `euiColorDanger`              | `#C61E25`   | `#F6726A`  | `--tl-danger` (gate fail / `escalated`) |

## Thread-type tokens (`daybreakTheme.modes[mode].threadType`)

One accent per Evidence `kind` (`server/client/evidence/storage.ts`'s
`EvidenceProperties['kind']`, FR-022), so the thread/timeline view can
distinguish evidence types visually without relying on text alone. Mapped onto
the EUI qualitative visualization palette (`euiColorVis*`) to keep hues
distinct and accessible; assignment is arbitrary (no prototype value to match
yet) but stable once ported components consume it.

| Evidence `kind` | Daybreak token | EUI token        | Light value | Dark value |
|-------------------|------------------|-------------------|-------------|------------|
| `alert`            | `alert`          | `euiColorVis6`    | `#F6726A`   | `#F6726A`  |
| `event`            | `event`          | `euiColorVis2`    | `#61A2FF`   | `#61A2FF`  |
| `entity`           | `entity`         | `euiColorVis4`    | `#EE72A6`   | `#EE72A6`  |
| `timeline`         | `timeline`       | `euiColorVis0`    | `#16C5C0`   | `#16C5C0`  |
| `query`            | `query`          | `euiColorVis8`    | `#EAAE01`   | `#EAAE01`  |
| `assumption`       | `assumption`     | `euiColorVis9`    | `#FCD883`   | `#FCD883`  |
| `external`         | `external`       | `euiColorVis3`    | `#BFDBFF`   | `#BFDBFF`  |

## Shape tokens (`daybreakTheme.modes[mode].shape`)

Ported from the prototype's `applyRadius`/`applyShadow` overrides
(`Throughline.dc.html`, unverified per FR-001).

| Daybreak token       | EUI token (`@kbn/ui-theme`) | Light/Dark value                                                                                   |
|-----------------------|-------------------------------|------------------------------------------------------------------------------------------------------|
| `borderRadius`        | `euiBorderRadius`             | `4px` |
| `borderRadiusSmall`   | `euiBorderRadiusSmall`        | `4px` |
| `shadowS`             | `euiShadows.s.down`           | `0px 0px 2px 0px hsl(216.67deg 29.51% 23.92% / 0.16), 0px 2px 7px 0px hsl(216.67deg 29.51% 23.92% / 0.08), 0px 4px 11px 0px hsl(216.67deg 29.51% 23.92% / 0.05)` |
| `shadowM`             | `euiShadows.m.down`           | `0px 0px 2px 0px hsl(216.67deg 29.51% 23.92% / 0.16), 0px 3px 10px 0px hsl(216.67deg 29.51% 23.92% / 0.1), 0px 6px 14px 0px hsl(216.67deg 29.51% 23.92% / 0.06)` |

## Maintenance rule

Every new ported surface (shell, thread, brief, gate) that needs a color,
radius, or shadow value MUST:

1. Check this table first for an existing Daybreak token that already covers
   the need.
2. If none exists, add a new token to the relevant `Daybreak*Tokens` interface
   in `theme.ts`, wire it in `buildTokens()`, and add a row here in the same
   commit — never inline a hex/pixel literal in a component (FR-006).
