# Throughline (NotDaybreak) Design Prototype

This directory is the designated landing zone for the **Throughline** design
prototype source that PD-4 ports into the daybreak plugin's `public/` layer.

## Required artifacts (FR-001)

Per the PD-4 proposal and `research.md` §1, the following source files MUST be
vendored here before any UI surface is ported:

| File | Role |
|------|------|
| `Throughline.dc.html` | Entry document — theme overrides (`applyAccent` / `applyTheme` / `applyRadius` / `applyShadow`), DOM mount |
| `throughline-app.js` | Application logic — CSS custom-property token layer, render functions (`renderApp`, `renderInspector`, `briefView`, `renderSuggest`), `freshState()` seed |
| `support.js` | Helpers used by the app |

## Status

**BLOCKED — source unavailable to the autonomous agent.**

The Throughline prototype is absent from:
- This working tree (`find . -iname '*throughline*'` returns nothing)
- All git history (`git log --all -- '*throughline*'` returns nothing)
- The local filesystem (`find /Users/mac -name 'Throughline.dc.html'` returns nothing)

The prototype is an external design artifact that the operator must provide.
It cannot be fabricated (no-evidence rule) and no download URL is available to
the autonomous agent.

Once the operator provides the three files above, drop them into this directory
and commit. The no-symlink gate (`git ls-files -s docs-site/prototype/ | awk
'$1=="120000"'`) MUST print nothing after vendoring — re-run it as a pre-flight.

## Symlink gate (FR-001, no-symlinks rule)

```sh
git ls-files -s docs-site/prototype/ | awk '$1=="120000"'
```

This command MUST print nothing. Mode `120000` is git's symlink mode; the
Kibana no-symlinks rule forbids tracked symlinks. Verified clean on
2026-07-09 (directory contains no symlinks).
