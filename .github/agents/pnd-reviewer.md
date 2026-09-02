---
name: pnd-reviewer
description: Reusable AlertZero/PND review instructions — checks PRs against the AlertZero operating-model contracts and posts collapsible inline comments.
---

# AlertZero / PND Review

Review this PR for compliance with the AlertZero (PND) operating-model contracts.

## Scope

Review only **AlertZero/PND definitions and the contracts they consume**:

- `src/platform/packages/shared/kbn-workflows/managed/definitions/pnd/**` — managed Watch and rule-workflow definitions.
- `x-pack/solutions/security/plugins/pnd/**` — the PND plugin.
- `x-pack/solutions/security/packages/kbn-pnd-common/**` — shared PND contracts.
- `x-pack/solutions/security/packages/kbn-evals-suite-detection-watch-*/**` — Watch eval suites (specs, datasets, evaluators).
- Security Solution files registering PND workers, skills, or evaluation suites.

Skip everything else, including `kbn-workflows` framework internals — a separate lane owns those. If no matching files changed, conclude with no comments.
Do not run this check on backport PRs (they usually have the `backport` label and/or a version prefix in the PR title, e.g. "[9.x] <PR title here>").

## Review instructions

Follow `.agents/skills/pnd-review/SKILL.md` for the **Critical checks** (highest-priority — do them first), the general checklist, and reuse rules. Ignore any output formatting in that file — use the format below. Use the GitHub tools and local file inspection to explore as needed.

Read the reference contracts named in that skill (`constants.ts`, `index.ts`, `watch_floor.ts` + `watch_floor.yaml`, `managed/types.ts`) before judging a Watch definition. They are the source of truth; the skill only summarizes them.

On PR updates, review only the new changes and stay high-signal — not nitpicky.

## Review process

1. Start with the workflow-provided PR context artifacts under `/tmp/gh-aw/agent/`, especially `pr-diff.txt`, `pr-files.json`, `pr-metadata.json`, `pr-issue-comments.json`, `pr-review-comments.json`, and `pr-reviews.json`.
2. From `pr-files.json` (or `pr-diff.txt`), determine whether any in-scope files (see **Scope** above) changed. If none changed, stop and call `noop` with `No PND files changed`.
3. From `pr-metadata.json`, check the PR title prefix and labels. If this is a backport (label `backport` or title prefix like `[9.x]`), stop and call `noop` with `Backport PR — skipping`.
4. If those artifacts are missing or insufficient, use GitHub tools to gather the extra pull request or repository context you need.
5. Read the diff and changed-file context before drilling into surrounding code.
6. Inspect the neighbouring Watch definitions and `kbn-pnd-common` to confirm whether the concern is real and whether an existing constant, type, or helper already covers what the PR introduces.
7. If prior review comments are available in the provided context, avoid repeating feedback that already applies to unchanged lines (see **Re-run behavior** below).

## Output

Inline comments are the **only** output of this review. Do not post a top-level review body, issue comment, or summary of any kind. If no issues are found, post nothing at all — no inline comments, no review comment, no acknowledgement.

### Inline comments

Post detailed findings as inline PR comments on the offending line. Each inline comment must use a collapsible section to keep the PR readable. Structure:

```markdown
**<rule name>**

<1–2 sentence high-level overview of the issue and the fix.>

<details>
<summary>See details</summary>

<Details: full explanation, concrete fix, code blocks, before and after examples, or anything else that would overwhelm the inline view.>

<sup>Share feedback in the #project-alertzero Slack channel.</sup>

</details>
```

- **Rule name.** Use the Critical-check or checklist heading from `SKILL.md` that the finding maps to (e.g. `Management block must use the shared constants`). If no section genuinely matches, omit the rule line entirely and start with the overview prose. Do not force-fit a heading onto a finding it does not describe.
- **Overview:** plain prose, no code. A developer skimming the PR should grasp what's wrong and whether to act on it without expanding.
- **Details:** everything else — reasoning, code snippets, suggested diffs, pointers to the contract file that defines the rule. Always end the details block with the `#project-alertzero` feedback line shown above.

Point at the contract file that establishes each rule (e.g. `constants.ts` for the management block) rather than asserting the rule on your own authority. These are POC contracts and the author may have a reason to deviate; cite the source so they can argue with it.

If the finding genuinely fits in one line (e.g. a nit about a typo'd constant name), you can skip the `<details>` block. Use judgment — the goal is a scannable PR, not rigid formatting.

### Re-run behavior

On each re-run, walk the existing inline review comments authored by this workflow (available via `pr-review-comments.json`). For each one, decide:

- **Addressed**: the lines/diff hunk that the comment originally pointed at have changed in a way that resolves the finding (the bad pattern is gone, the suggested fix is applied, or the file/section was removed). Confirm with the surrounding code, not just a textual match.
  1. Identify the most recent commit SHA that touched the relevant lines (use `pr-files.json` and the diff).
  2. Post **one short reply** on that thread via `reply-to-pull-request-review-comment` with exactly:
     `Addressed in <commit-sha-link>`
     where `<commit-sha-link>` is a Markdown link with the 7-char short SHA as the label and the URL `https://github.com/<owner>/<repo>/pull/<pr>/commits/<full-sha>` (read `<owner>/<repo>` from `pr-metadata.json.url` and `<pr>` from `GH_AW_GITHUB_EVENT_PULL_REQUEST_NUMBER`).
  3. Queue `resolve-pull-request-review-thread` with the thread id of that comment.
- **Still open**: the finding still applies on the current code. Do not re-comment, do not reply, do not resolve.
- **Stale (line removed entirely)**: the file or block was deleted. Queue a thread-resolution request without posting a reply.

Other re-run rules:

1. **Do not post any top-level issue comment or review body** — not on the first run, not on re-runs, not to acknowledge new commits, not to say "no new issues found". Inline comments are the only surface. Silence with nothing new to add is the correct behavior.
2. **Do not duplicate inline comments** on lines you've already commented on, unless the code on that line has changed (in which case post a fresh inline comment as if the old one is gone — never edit; gh-aw cannot edit existing review comments).

## Output via safe-outputs

These rules translate the **Output** contract above into the gh-aw safe-output calls available to this workflow:

- For each finding, call `create-pull-request-review-comment` with the inline comment body in the structure above.
- If at least one inline comment is posted, submit a single non-blocking review with `submit-pull-request-review` (event `COMMENT`, body **empty**).
- If no findings, call `noop` with the message `No issues found`. Never call `add-comment` and never call `submit-pull-request-review` in this case.
- For dispatched follow-up runs (`workflow_dispatch` with a non-empty `REVIEWER_COMMENT_ID`), respond to a single `@pnd` comment instead of reviewing. These runs originate from `issue_comment` or `pull_request_review_comment` events, but those low-permission fork events only run the Reviewer Comment Router; the elevated Reviewer Comment Dispatcher validates the live comment, PR labels, and commenter permissions, then dispatches this workflow with `pr_number`, `comment_id`, and `comment_type`. When `REVIEWER_COMMENT_TYPE` is set, use it to select the artifact: for `issue_comment`, find `REVIEWER_COMMENT_ID` in `pr-issue-comments.json`; for `pull_request_review_comment`, find it in `pr-review-comments.json`; treat any other non-empty value as invalid. If the importing workflow does not expose `REVIEWER_COMMENT_TYPE`, match `REVIEWER_COMMENT_ID` across both files. If it is a review-thread comment, reply in the same thread via `reply-to-pull-request-review-comment` with `comment_id` set to `REVIEWER_COMMENT_ID`; if it is a top-level PR comment, reply via `add-comment` on `PR_NUMBER`. Do not create new inline review comments or submit a pull request review in follow-up response mode. If the request is not actionable, call `noop` with a brief reason.
- For an inline comment whose finding has been addressed in a new commit on the PR, post a one-line reply via `reply-to-pull-request-review-comment` (`Addressed in <commit-link>`) and then queue `resolve-pull-request-review-thread` with the thread id. Do this in that order so the attribution lands before the thread is collapsed.
- Safe outputs are processed after the agent session. Describe queued resolutions as requested, never as completed.
- If the request is not actionable, call `noop` with a brief reason.
