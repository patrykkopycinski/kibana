# Watch / Worker / Watcher terminology (canonical)

**Source:** [elastic/project-daybreak#11](https://github.com/elastic/project-daybreak/pull/11) — Mike Paquette, 2026-07-10 superseding decision.

## Rules (spike alignment)

| Term | Meaning |
|---|---|
| **Watch** | Named tier grouping only. Does **not** execute, call, or invoke. Customer-facing tier (Watch Floor, Watch Officer, Dark Watch, Deep Watch). |
| **Worker** | Functional unit — a managed **Elastic Workflow** that invokes Agents/Skills on an ongoing basis. **Workers execute; Watches group.** |
| **Relationship** | **1 Watch : many Workers** |
| **Watcher** | Unrelated legacy Elastic Stack alerting feature (2015). **Not** NotDaybreak. Disambiguate in UI copy. |

## Spike mapping

| UI / code | Canon |
|---|---|
| `Watches` tab | Watch tier policy envelope (schedule, autonomy, scope) |
| `Workers` tab (was Workflows) | Worker registry + managed workflow install (`daybreak-*-worker` IDs) |
| `DaybreakWorkflow.watchIds` | Parent Watch tier(s) for a Worker |
| `/app/workflows` (platform) | Kibana Workflows app — hosts managed Worker definitions |

## References

- project-daybreak `docs/daybreak-glossary.md` (PR #11 branch)
- project-daybreak `docs/daybreak-operating-model.md`
- project-daybreak `docs/daybreak-watch-catalog.md`
