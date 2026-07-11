/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

const styles = `
.daybreakVisualShell {
  --db-ink-0: #111318;
  --db-ink-1: #252a35;
  --db-ink-2: #5c6574;
  --db-ink-3: #7e8796;
  --db-panel: #ffffff;
  --db-panel-muted: #f7f8fb;
  --db-line: #e4e7ee;
  --db-line-strong: #d4d9e3;
  --db-blue: #1769d3;
  --db-blue-dark: #0c4d9e;
  --db-blue-bg: #eaf2ff;
  --db-shell: #ecebe8;
  --db-amber: #a56505;
  --db-radius: 14px;
  --db-radius-sm: 10px;
  --db-shadow: 0 1px 2px rgba(20, 25, 35, .06), 0 12px 28px rgba(20, 25, 35, .06);
  height: 100%;
  background: var(--db-shell);
  color: var(--db-ink-1);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.daybreakVisualShell .daybreakRail,
.daybreakVisualShell .daybreakStage {
  background: var(--db-panel);
  border: 1px solid rgba(20, 25, 35, .1);
  border-radius: var(--db-radius);
  box-shadow: var(--db-shadow);
  margin: 8px 8px 8px 0;
  overflow: hidden;
}
.daybreakVisualShell .daybreakRail {
  width: 296px;
  margin-left: 8px;
}
.daybreakRailHeader { padding: 20px 18px 13px; }
.daybreakEyebrow { color: var(--db-blue-dark); font-size: 10px; font-weight: 750; letter-spacing: .075em; text-transform: uppercase; }
.daybreakRailTitle { color: var(--db-ink-0) !important; letter-spacing: -.02em; }
.daybreakReviewBadge { border-radius: 999px !important; font-weight: 700; }
.daybreakRailSummary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-top: 1px solid var(--db-line);
  border-bottom: 1px solid var(--db-line);
  color: var(--db-ink-3);
  font-size: 10px;
  font-weight: 650;
}
.daybreakRailLoading, .daybreakRailEmpty { display: block; padding: 18px; }
.daybreakRailList { padding: 8px !important; }
.daybreakRailList .euiListGroupItem {
  align-items: stretch;
  border: 1px solid transparent;
  border-radius: var(--db-radius-sm);
  margin-bottom: 5px;
  min-height: 84px;
  padding: 10px 11px;
  transition: background .14s, border-color .14s, box-shadow .14s;
}
.daybreakRailList .euiListGroupItem:hover { background: var(--db-panel-muted); border-color: var(--db-line); }
.daybreakRailList .euiListGroupItem-isActive { background: var(--db-blue-bg) !important; border-color: rgba(23, 105, 211, .26) !important; box-shadow: inset 3px 0 0 var(--db-blue); }
.daybreakRailItemContent { display: flex; flex-direction: column; gap: 5px; width: 100%; }
.daybreakRailItemTopline { align-items: center; display: flex; justify-content: space-between; }
.daybreakRailItemTopline .euiHealth { font-size: 10px; font-weight: 700; text-transform: uppercase; }
.daybreakRailItemConfidence { color: var(--db-ink-3); font-size: 10px; font-variant-numeric: tabular-nums; }
.daybreakRailItemTitle { color: var(--db-ink-0); font-size: 12px; font-weight: 720; line-height: 1.35; }
.daybreakRailItemStatus { color: var(--db-ink-3); font-size: 10px; font-weight: 600; text-transform: capitalize; }
.daybreakStageToolbar {
  display: flex;
  justify-content: space-between;
  padding: 11px 28px;
  border-bottom: 1px solid var(--db-line);
  color: var(--db-ink-3);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .065em;
  text-transform: uppercase;
}
.daybreakStageScroll { box-sizing: border-box; max-width: 980px; width: 100%; margin: 0 auto; padding: 42px 44px 132px; }
.daybreakBriefIntro { max-width: 640px; margin-bottom: 28px; }
.daybreakBriefTitle { color: var(--db-ink-0) !important; font-size: 27px; letter-spacing: -.035em; }
.daybreakBriefLead { color: var(--db-ink-2) !important; line-height: 1.6; }
.daybreakBriefCards { gap: 12px !important; }
.daybreakBriefCard { background: var(--db-panel) !important; border: 1px solid var(--db-line) !important; border-radius: var(--db-radius-sm) !important; box-shadow: 0 1px 2px rgba(20,23,28,.04) !important; padding: 17px !important; }
.daybreakBriefCard:hover { border-color: var(--db-line-strong) !important; box-shadow: 0 6px 16px rgba(20,23,28,.07) !important; transform: translateY(-1px); }
.daybreakDetailBack { color: var(--db-ink-3) !important; margin-left: -8px; }
.daybreakDecisionHero { border-bottom: 1px solid var(--db-line); padding-bottom: 24px; }
.daybreakDetailTitle { color: var(--db-ink-0) !important; letter-spacing: -.03em; max-width: 760px; }
.daybreakDecisionMeta { color: var(--db-ink-2); }
.daybreakRecommendation, .daybreakEvidenceCard, .daybreakGateCard { background: var(--db-panel-muted) !important; border: 1px solid var(--db-line) !important; border-radius: var(--db-radius-sm) !important; box-shadow: 0 1px 2px rgba(20,23,28,.04); }
.daybreakRecommendation { border-left: 4px solid var(--db-blue) !important; }
.daybreakRecommendationHeader { color: var(--db-blue-dark); display: flex; font-size: 10px; font-weight: 800; justify-content: space-between; letter-spacing: .07em; text-transform: uppercase; }
.daybreakRecommendationHeader span:last-child { color: var(--db-ink-3); }
.daybreakRecommendationCopy { color: var(--db-ink-0); line-height: 1.55; }
.daybreakFloatingComposer { padding: 16px 32px 22px; background: linear-gradient(180deg, transparent, var(--db-panel) 38%); }
.daybreakComposerInner { max-width: 660px; margin: 0 auto; border: 1px solid rgba(23, 105, 211, .28); border-radius: 999px; background: var(--db-panel); box-shadow: 0 8px 24px rgba(43, 124, 234, .16); padding: 5px; }
.daybreakComposerInner .euiFieldText { border: 0 !important; box-shadow: none !important; background: transparent !important; }
.daybreakComposerInner .euiButton { border-radius: 999px; }
@media (max-width: 900px) {
  .daybreakVisualShell .daybreakRail { width: 238px; }
  .daybreakStageScroll { padding: 30px 24px 118px; }
  .daybreakRailSummary { display: none; }
}
`;

export const DaybreakVisualStyles = () => <style>{styles}</style>;
