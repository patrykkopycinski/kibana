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
  --db-red: #bd271e;
  --db-green: #00bfb3;
  --db-violet: #7c4dff;
  --db-radius: 14px;
  --db-radius-sm: 10px;
  --db-shadow: 0 1px 2px rgba(20, 25, 35, .06), 0 12px 28px rgba(20, 25, 35, .06);
  height: 100%;
  background: var(--db-shell);
  color: var(--db-ink-1);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* Kibana dark mode or NightShift toggle — shared dark visual tokens */
.daybreakVisualShell.daybreakNightshift {
  --db-ink-0: #f0f2f5;
  --db-ink-1: #e4e8ef;
  --db-ink-2: #9aa5b5;
  --db-ink-3: #7e8796;
  --db-panel: #181b21;
  --db-panel-muted: #111418;
  --db-line: #2c333e;
  --db-line-strong: #3d4654;
  --db-blue-dark: #6eb3ff;
  --db-blue-bg: rgba(23, 105, 211, .18);
  --db-shell: #0d1015;
  --db-shadow: 0 1px 2px rgba(0, 0, 0, .16), 0 12px 28px rgba(0, 0, 0, .22);
}
.daybreakVisualShell.daybreakNightshift .euiPanel {
  background-color: var(--db-panel) !important;
  border-color: var(--db-line) !important;
  color: var(--db-ink-1);
}
.daybreakVisualShell.daybreakNightshift .euiText--subdued,
.daybreakVisualShell.daybreakNightshift .euiTextColor--subdued {
  color: var(--db-ink-2) !important;
}
.daybreakVisualShell.daybreakNightshift .daybreakBriefPriority {
  background: linear-gradient(135deg, rgba(23, 105, 211, .15) 0%, var(--db-panel) 56%) !important;
  border-color: rgba(23, 105, 211, .35) !important;
}
.daybreakVisualShell.daybreakNightshift .daybreakBriefCard:hover,
.daybreakVisualShell.daybreakNightshift .daybreakRadarCard:hover {
  box-shadow: 0 6px 16px rgba(0, 0, 0, .28) !important;
}
.daybreakVisualShell.daybreakNightshift .daybreakComposerBox,
.daybreakVisualShell.daybreakNightshift .daybreakComposerInner {
  box-shadow: 0 8px 24px rgba(0, 0, 0, .32);
}
.daybreakVisualShell.daybreakNightshift .daybreakDecisionPill {
  background: rgba(0, 0, 0, .25);
}
.daybreakVisualShell.daybreakNightshift .daybreakFloatingComposer {
  background: linear-gradient(180deg, transparent, var(--db-shell) 38%);
}

/* Icon rail chrome */
.daybreakRailBrand { align-items: center; display: flex; justify-content: center; height: 44px; color: var(--db-amber); }

/* Nav panel chrome */
.daybreakNavPanelHeader { padding: 16px 16px 12px; border-bottom: 1px solid var(--db-line); }
.daybreakNavTop { align-items: center; display: flex; gap: 4px; }
.daybreakNavBrand { align-items: center; display: flex; flex: 1; gap: 7px; font-weight: 650; font-size: 14px; color: var(--db-ink-0); letter-spacing: -.01em; }
.daybreakNavBrand .euiIcon { color: var(--db-blue); }
.daybreakNavNew, .daybreakNavCollapse { margin-left: 0 !important; }
.daybreakNavSearch .euiFormControlLayout--group .euiFormControlLayout__prepend,
.daybreakNavSearch .euiFieldSearch { background: var(--db-panel-muted); }

/* Composer chrome */
.daybreakComposerBox { display: flex; align-items: center; gap: 6px; max-width: 660px; margin: 0 auto; border: 1px solid rgba(23, 105, 211, .28); border-radius: 999px; background: var(--db-panel); box-shadow: 0 8px 24px rgba(43, 124, 234, .16); padding: 5px; }
.daybreakComposerBox .daybreakComposerInput { border: 0 !important; box-shadow: none !important; background: transparent !important; }
.daybreakComposerBox .daybreakComposerInput:disabled { color: var(--db-ink-3); }
.daybreakComposerSend { border-radius: 999px !important; }
.daybreakComposerFoot { text-align: center; margin-top: 6px; }

/* Icon rail */
.daybreakRail {
  width: 64px;
  min-width: 64px;
  background: var(--db-panel);
  border-right: 1px solid var(--db-line);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  margin: 0;
}
.daybreakRailItem {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--db-radius-sm);
  color: var(--db-ink-3);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
  margin: 2px 8px;
  min-height: 52px;
  padding: 6px 4px;
  transition: background .14s, border-color .14s, color .14s;
}
.daybreakRailItem:hover { background: var(--db-panel-muted); border-color: var(--db-line); color: var(--db-ink-1); }
.daybreakRailItem--active { background: var(--db-blue-bg); border-color: rgba(23, 105, 211, .26); color: var(--db-blue-dark); box-shadow: inset 2px 0 0 var(--db-blue); }
.daybreakRailItem--solution { color: var(--db-amber); }
.daybreakRailItem--solution.daybreakRailItem--active { color: var(--db-amber); background: rgba(165, 101, 5, .08); border-color: rgba(165, 101, 5, .26); box-shadow: inset 2px 0 0 var(--db-amber); }
.daybreakRailItemLabel { font-size: 9px; font-weight: 650; }
.daybreakRailSeparator { background: var(--db-line); height: 1px; margin: 6px 12px; }
.daybreakRailFooterButton { margin: 0 8px !important; }

/* Stage */
.daybreakVisualShell .daybreakStage {
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  margin: 0;
  overflow: hidden;
}
.daybreakNavPanelWrapper {
  width: 272px;
  min-width: 272px;
  background: var(--db-panel);
  border-right: 1px solid var(--db-line);
}
.daybreakNavPanel { height: 100%; display: flex; flex-direction: column; }
.daybreakNavPanelHeader { padding: 20px 16px 12px; border-bottom: 1px solid var(--db-line); }
.daybreakNavPanelList { flex: 1; overflow: auto; padding: 8px; }
.daybreakNavPanelItem {
  align-items: stretch;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--db-radius-sm);
  cursor: pointer;
  display: flex;
  margin-bottom: 5px;
  min-height: 76px;
  padding: 10px 11px;
  text-align: left;
  transition: background .14s, border-color .14s, box-shadow .14s;
  width: 100%;
}
.daybreakNavPanelItem:hover { background: var(--db-panel-muted); border-color: var(--db-line); }
.daybreakNavPanelItem--active { background: var(--db-blue-bg); border-color: rgba(23, 105, 211, .26); box-shadow: inset 3px 0 0 var(--db-blue); }
.daybreakHomeStage { background: var(--db-panel); border-radius: var(--db-radius); box-shadow: var(--db-shadow); margin: 8px; overflow: hidden; }

/* Existing proposal rail item styling reused in nav panel */
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
.daybreakEyebrow {
  color: var(--db-ink-3) !important;
  font-size: 10px !important;
  font-weight: 750 !important;
  letter-spacing: .065em !important;
  text-transform: uppercase !important;
}
.daybreakStageScroll { box-sizing: border-box; max-width: 980px; width: 100%; margin: 0 auto; padding: 42px 44px 132px; }
.daybreakAppPage { display: flex; align-items: center; justify-content: center; height: 100%; }

/* Brief dashboard */
.daybreakBriefIntro { max-width: 640px; margin-bottom: 28px; }
.daybreakBriefTitle { color: var(--db-ink-0) !important; font-size: 27px; letter-spacing: -.035em; }
.daybreakBriefLead { color: var(--db-ink-2) !important; line-height: 1.6; }
.daybreakBriefCards { gap: 12px !important; }
.daybreakBriefCard { background: var(--db-panel) !important; border: 1px solid var(--db-line) !important; border-radius: var(--db-radius-sm) !important; box-shadow: 0 1px 2px rgba(20,23,28,.04) !important; padding: 17px !important; }
.daybreakBriefCard:hover { border-color: var(--db-line-strong) !important; box-shadow: 0 6px 16px rgba(20,23,28,.07) !important; transform: translateY(-1px); }
.daybreakBriefPriority { background: linear-gradient(135deg, #f4f8ff 0%, var(--db-panel) 56%) !important; border: 1px solid rgba(23, 105, 211, .26) !important; border-left: 4px solid var(--db-blue) !important; border-radius: var(--db-radius) !important; box-shadow: 0 10px 24px rgba(23, 105, 211, .10) !important; }
.daybreakBriefPriority h2 { color: var(--db-ink-0); letter-spacing: -.025em; }
.daybreakBriefPriorityCopy { color: var(--db-ink-1) !important; line-height: 1.55; max-width: 680px; }
.daybreakBriefPriorityFacts, .daybreakBriefSignals { color: var(--db-ink-3); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .035em; }
.daybreakBriefPriorityFacts { display: flex; flex-wrap: wrap; gap: 16px; }
.daybreakBriefPriorityFacts span + span::before { color: var(--db-line-strong); content: "•"; margin-right: 16px; }
.daybreakBriefSignals { border-bottom: 1px solid var(--db-line); border-top: 1px solid var(--db-line); padding: 10px 0; }
.daybreakBriefSignals .euiFlexItem { flex-grow: 0 !important; }
.daybreakBriefSignals strong { color: var(--db-ink-0); font-size: 14px; margin-right: 4px; }

/* Detail view */
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

/* Radar queue */
.daybreakBriefRadar { padding-bottom: 120px; }
.daybreakBriefOverview { border: 1px solid var(--db-line) !important; border-radius: var(--db-radius) !important; }
.daybreakOverviewMetric { background: var(--db-panel-muted); border: 1px solid var(--db-line); border-radius: var(--db-radius-sm); padding: 14px; min-width: 140px; }
.daybreakOverviewMetric h2 { font-size: 28px; letter-spacing: -.03em; margin: 0; }
.daybreakDecisionSection { margin-bottom: 24px; }
.daybreakDecisionSectionHeader { padding: 10px 0; border-bottom: 1px solid var(--db-line); }
.daybreakDecisionSectionDot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.daybreakDecisionPill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.6); }
.daybreakDecisionPillDot { width: 7px; height: 7px; border-radius: 50%; }
.daybreakRadarCard { background: var(--db-panel); border: 1px solid var(--db-line); border-radius: var(--db-radius-sm); border-left: 4px solid; padding: 14px; box-shadow: 0 1px 2px rgba(20,23,28,.04); transition: border-color .14s, box-shadow .14s; }
.daybreakRadarCard:hover { border-color: var(--db-line-strong); box-shadow: 0 6px 16px rgba(20,23,28,.07); }
.daybreakRadarCard--featured { border-left-width: 5px; }
.daybreakRadarCardHeader { display: flex; align-items: center; gap: 10px; }
.daybreakRadarCardReady { font-weight: 700; }
.daybreakGauge { display: inline-flex; position: relative; align-items: center; justify-content: center; }
.daybreakGauge b { position: absolute; font-size: 11px; font-weight: 750; font-variant-numeric: tabular-nums; }
.daybreakGauge--featured b { font-size: 13px; }


/* Blast radius itemization in ApprovalGate */
.daybreakBlastRadius { border-top: 1px solid var(--db-line); padding-top: 12px; }
.daybreakBlastRadiusTitle { font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
.daybreakBlastRow { padding: 8px 0; border-bottom: 1px solid var(--db-line); }
.daybreakBlastRow:last-child { border-bottom: none; }
.daybreakBlastRow .euiIcon { margin-top: 2px; }

/* Receipt / audit trail in ProposalInspector */
.daybreakReceiptDecision { border-left: 4px solid currentColor; }
.daybreakReceiptTrail { background: var(--db-panel-muted); }

/* Consistent rounded panels — match NotDaybreak 12-14px radius */
.daybreakVisualShell .euiPanel,
.daybreakVisualShell .euiPanel.daybreakEvidenceCard,
.daybreakVisualShell .euiPanel.daybreakGateCard,
.daybreakVisualShell .euiPanel.daybreakRecommendation,
.daybreakVisualShell .euiPanel.daybreakRadarCard,
.daybreakVisualShell .euiPanel.daybreakOverviewMetric,
.daybreakVisualShell .euiPanel.daybreakReceiptTrail,
.daybreakVisualShell .euiPanel.daybreakReceiptDecision { border-radius: var(--db-radius-sm) !important; }
.daybreakVisualShell .euiPanel.daybreakHomeStage,
.daybreakVisualShell .euiPanel.daybreakBriefPriority,
.daybreakVisualShell .euiPanel.daybreakBriefOverview { border-radius: var(--db-radius) !important; }

/* Thread view */
.daybreakThreadView { display: flex; flex-direction: column; height: 100%; width: 100%; }
.daybreakSpineHeader { border-bottom: 1px solid var(--db-line); border-radius: 0 !important; }
.daybreakSpineHeaderTop { min-width: 0; }
.daybreakSpineTitle { width: 100%; display: block; }
.daybreakSpineTitle h2 { margin: 0; white-space: normal; word-break: break-word; width: 100%; display: block; }
.daybreakStream { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.daybreakMessage { max-width: 80%; }
.daybreakMessage--user { align-self: flex-end; }
.daybreakMessage--agent { align-self: flex-start; }
.daybreakMessageBubble { border-radius: 14px !important; }
.daybreakThreadComposer { border-top: 1px solid var(--db-line); padding: 16px 24px 24px; }
.daybreakThreadStarters { margin-bottom: 8px; }
.daybreakThreadComposerInput { min-height: 38px; }

/* Inspector panel */
.daybreakInspectorWrapper { width: 360px; min-width: 360px; background: var(--db-panel); border-left: 1px solid var(--db-line); }
.daybreakInspectorColumn { height: 100%; display: flex; flex-direction: column; }
.daybreakInspectorColumn .daybreakInspectorPanel { flex: 1; min-height: 0; }
.daybreakInspectorGate { flex-shrink: 0; padding: 0 16px 16px; }
.daybreakInspectorPanel { height: 100%; display: flex; flex-direction: column; }
.daybreakInspectorAppBar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--db-line); padding: 8px 12px; }
.daybreakInspectorTabs { flex: 1; }
.daybreakInspectorBody { flex: 1; overflow: auto; padding: 16px; }
.daybreakInspectorAssessment { border-left: 3px solid var(--db-blue); }
.daybreakInspectorEvidence { display: flex; flex-direction: column; gap: 8px; }
.daybreakInspectorTimeline { display: flex; flex-direction: column; gap: 12px; }
.daybreakTimelineRow { display: flex; align-items: center; gap: 10px; }
.daybreakTimelineDot { width: 8px; height: 8px; border-radius: 50%; background: var(--db-ink-3); }
.daybreakTimelineDot--now { background: var(--db-blue); }
.daybreakTimelineDot--flag { background: var(--db-amber); }
.daybreakInspectorActions, .daybreakInspectorPeople { display: flex; flex-direction: column; gap: 8px; }
.daybreakRecordTabs .euiTab { font-size: 11px; }

/* Gated action flyout */
.daybreakActionFlyout { min-width: 480px; }
.daybreakActionContext { border-left: 3px solid var(--db-amber); margin-bottom: 8px; }
.daybreakBlastRow { padding: 8px 0; border-bottom: 1px solid var(--db-line); }
.daybreakBlastRow:last-child { border-bottom: none; }

@media (max-width: 1100px) {
  .daybreakInspectorWrapper { width: 300px; min-width: 300px; }
}

@media (max-width: 900px) {
  .daybreakStageScroll { padding: 30px 24px 118px; }
  .daybreakNavPanelWrapper { width: 220px; min-width: 220px; }
  .daybreakRailSummary { display: none; }
}
`;

export const DaybreakVisualStyles = () => <style>{styles}</style>;
