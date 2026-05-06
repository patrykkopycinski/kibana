# ARGUS — Demo Storyboard v1

Three scripted scenarios for a 20-minute live demo. Each scenario maps to one Mythos-era
pressure and one ARGUS milestone, so the demo is *evidence* for the threat-model doc, not
a PowerPoint.

## Demo arc

> "An adversary with frontier capabilities has three advantages over a human analyst:
> **speed, variety, and reasoning**. ARGUS neutralises all three — and puts the governance
> in place to prove it."

| # | Scenario | Pressure | ARGUS milestone | Wall-clock | What the audience sees |
|---|---|---|---|---|---|
| 1 | **Same-day CVE → live detection** | P1 speed | M2.2 + M2.3 | 3 min | CVE published → exploit-probability enriched → DetEng synthesises a rule → backtested → applied → alert fires. All autonomous. |
| 2 | **Polymorphic variant swarm** | P2 variety | M2.1 + M2.2 | 4 min | 30 behavioural variants generated. Eval vertical grades each rule candidate and picks the precision-recall Pareto winner. |
| 3 | **Frontier-class intrusion, observed end-to-end** | P3 reasoning | M2.4 + M2.5 | 6 min | L5 preset. Agent-vs-agent engagement. OTLP traces rendered in Elastic APM. Trust gate blocks a premature mutation. Watchdog rolls back. |

Total: ~15 min scenarios + 3 min intro + 2 min wrap = ~20 min.

---

## Scenario 1 — Same-day CVE

**Setup.** A seeded `kibana#258041` vulnerability-checker alert fires on a staged asset
(Confluence CVE-YYYY-NNNN). Exploit probability is `0.92`, CVSS 9.8, asset criticality HIGH.

**Script.**

| Beat | Narration | On-screen |
|---|---|---|
| 0:00 | "CVE drops at 09:00. Historical MTTD on a CVE of this severity is **72 hours**." | Timeline bar, 72h marker |
| 0:20 | "ARGUS Sensing layer enriches within seconds. Exploit-probability is `0.92`." | Vuln-checker alert (Security Solution) |
| 0:40 | "Hypothesis layer — the DetEng skill picks up the alert. The exploit-to-detection tool drafts a rule from the advisory PoC." | DetEng skill trace (APM) |
| 1:20 | "Validation layer — backtester confirms 0 historical FPs, proposed rule lands on the Pareto curve." | Eval scorecard |
| 1:50 | "Action layer — autonomous-applier lands the rule. Trust gate `tier=frontier` allows because backtest passed." | Rule diff + apply log |
| 2:15 | "A minute later, emulated attacker runs the exploit. Rule fires. **MTTD: 2 min 30 s**." | Alert timeline |
| 2:45 | "ARGUS closes the loop — outcome is logged, the eval harness snapshots this case for regression." | `.soc-outcomes` doc |

**Evidence captured.** `soc-apply-log` entry, eval snapshot, alert doc, reasoning trace. All
reproducible from a seeded dataset.

**Pressure answered.** P1 (time compression): ARGUS ships rule + alert inside 3 minutes.

---

## Scenario 2 — Polymorphic variant swarm

**Setup.** A single malicious behaviour (e.g., credential-dumping via LSASS read) is
expanded into 30 polymorphic variants via Caldera abilities. All are replayed against the
staged environment.

**Script.**

| Beat | Narration | On-screen |
|---|---|---|
| 0:00 | "Human DetEng writes a rule against the original technique. Easy. But the attacker is stochastic." | Base rule |
| 0:30 | "M2.4 preset launches 30 variants. Each variant is a slight mutation — process arg order, encoding, parent chain, timing." | Caldera operation |
| 1:10 | "M2.1 Detection Eval Vertical grades our base rule on all 30 — coverage: **11 / 30**." | Eval scorecard |
| 1:40 | "DetEng synthesises N candidate rules. Each candidate is graded on **detection**, **FP on 30d baseline**, **maintainability**." | Pareto plot |
| 2:20 | "Pareto winner lands. Coverage jumps to **28 / 30** with FP unchanged. Two variants remain uncovered — eval flags them as regression-watch." | Scorecard delta |
| 3:00 | "The two uncovered variants *aren't* autonomously covered. ARGUS hands them to a DetEng for review with full context." | Review bundle |

**Evidence captured.** Baseline coverage, Pareto curve, final rule diff, uncovered variants.

**Pressure answered.** P2 (variant explosion): the eval vertical quantifies coverage and
the synthesis step improves it by 17 variants, measurable.

**Anti-demo note.** Some variants remain uncovered. This is the right answer — ARGUS is
honest about its ceiling and routes remaining cases to a human. No magical 100 %.

---

## Scenario 3 — Frontier-class intrusion

**Setup.** M2.4 frontier preset is activated: long-dwell persistence, fileless C2 with
legitimate-binary proxying, adversarial prompt-injection against the triage agent
(`system.user.search_results` contains embedded prompt).

**Script.**

| Beat | Narration | On-screen |
|---|---|---|
| 0:00 | "Frontier intruder gets in via compromised supply-chain package. Low-and-slow." | Attack graph |
| 0:45 | "XDR correlation engine (`kibana#257949`) chains three weak signals into one candidate incident." | Correlation graph |
| 1:30 | "Triage agent picks up the incident. Here is where it gets interesting — the incident body contains a prompt-injection designed to make the agent downgrade severity." | Incident + injection |
| 2:00 | "Watch the reasoning trace. The agent *starts* to follow the injection. The Governance layer flags an instruction drift." | OTLP trace in APM |
| 2:30 | "Trust scorer revises tier down → blocked autonomous action. Human routing." | Trust event |
| 3:10 | "Human confirms — prompt injection. We feed the sample into the eval suite. **The next version of the triage agent now passes this test.**" | Eval delta |
| 3:50 | "Meanwhile: containment playbook isolates the compromised host, autonomous-applier deploys the one rule we *are* confident in (unusual LOLBin proxying)." | Response actions |
| 4:30 | "End-state. Attacker is contained. Governance layer has a full audit: every agent decision, every tool call, every trust shift — all in Elasticsearch." | Governance dashboard |
| 5:30 | "And this entire scenario — including the adversarial prompt — is now a regression test. Any future version of ARGUS that fails it cannot ship." | Regression gate |

**Evidence captured.** OTLP trace, trust-score events, audit trail, regression test, alert
and response timeline.

**Pressure answered.** P3 (agentic adversary): the adversary reasons, ARGUS reasons, and
the governance layer wins because it *watches both*.

---

## Narrative frame

Open with:

> "Threat models for the last decade assumed the attacker had to *learn* the environment.
> Mythos-class adversaries don't — they reason about it. If we build SOCs for the old
> threat model, we lose at machine speed. ARGUS is Elastic's answer."

Close with:

> "Every claim you saw today is reproducible. Every agent decision is recorded. Every
> detection that shipped was validated by an eval. Every action was reversible. This is
> not a preview — it's a contract."

---

## Director notes

- **One laptop only.** Demo runs against a staged stateful cluster + staged Caldera range.
  No props. No fake UI.
- **Never run without a fallback tape.** Record each scenario end-to-end. If a live
  component flakes, cut to tape, stay in narrative.
- **No over-claiming on Scenario 2.** Coverage ceiling is a feature, not a bug. Say so.
- **Scenario 3 is the "mic drop."** Don't skip the trust-blocked-mutation beat; that is
  the single strongest differentiator vs. any competitor.

---

## Acceptance criteria for storyboard v1

- [x] Each scenario has a seeded dataset checked into the branch — `setup.sh`
      seeds `.soc-cve-advisories`, `.soc-eval-corpus-argus-corpus-mythos-2026-04`,
      `.soc_detection_eval-runs`, `.soc-actor-trust-tiers` on a clean cluster.
- [x] Scenarios 1 and 2 have runnable workflows (`soc_demo_1_runner.yaml`,
      `soc_demo_2_runner.yaml`) driven end-to-end without manual steps —
      live-runtime validated 2026-04-19, see
      [`proof/demo-validation-2026-04-19-live.md`](./proof/demo-validation-2026-04-19-live.md).
      Scenario 3 remains a scripted teaser (no dedicated watchdog workflow
      yet; tracked as `R10` in `capability-and-gap-analysis.md`).
- [ ] Each scenario has a 30-second fallback video in `soc-simulation/docs/argus/media/`.
- [x] Every on-screen asset (dashboard, skill, trace) is a real artifact in the
      staged cluster — confirmed by the live-run cross-checks in
      `proof/demo-validation-2026-04-19-live.md` §3 (audit heartbeats, live
      emissions, exec records).
- [x] Full run wall-clock ≤ 20 minutes — the automated ARGUS chain (8
      workflows) completes in ≈1m50s of wall-clock; the remaining ~18 min
      is scripted narration and the scenario-3 teaser.
