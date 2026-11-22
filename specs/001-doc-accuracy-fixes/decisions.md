# Decisions: Spec 001

Jev request: one call, 6 typed Choice questions over shared state. Resolved model `jev-1.14.0`, status `ok`, 2026-11-22. Route: `model_routes.py jev --send`, pricing unknown.
Rule applied: validated Choice `confidence > 0.70` lets the agent follow Jev within the owner's request. `<= 0.70` pauses the decision for the owner.

| ID | Decision | Jev choice | Confidence | Outcome |
|---|---|---|---|---|
| D1 | Windows key-setup instruction (F1) | `read_host_securestring` (p 0.89) | 0.85 | Followed |
| D2 | Review flag mismatch (F2) | `docs_per_command_flags` (p 0.66) | 0.55 | Paused for owner |
| D3 | Root bug report (F10) | `move_to_docs` (p 0.92) | 0.89 | Followed |
| D4 | Versioning and changelog (F10) | `changelog_no_bump` (p 0.30) | 0.07 | Paused for owner |
| D5 | Ignored `--effort` values (F7) | `docs_only_table` (p 0.53) | 0.37 | Paused for owner |
| D6 | Untracked files in review (F8) | `docs_only_note` (p 0.82) | 0.76 | Followed |
| D7 | Stop-gate reviews last commit when only untracked files are dirty (F13) | `gate_checks_tracked_diff` (p 0.96), separate Jev call | 0.95 | Followed |

The owner's answers for D2, D4 and D5 are recorded below once given, with any reason the owner states.

## Second Jev round (findings from the Codex and Kimi reviews)

One call, 4 Choice questions, `jev-1.14.0`, status `ok`.

| ID | Decision | Jev choice | Confidence | Outcome |
|---|---|---|---|---|
| D8 | Config write skips the scrubber | `scrub_config_write` (p 0.89) | 0.85 | Followed |
| D9 | fetch follows redirects off the allowlisted host | `fetch_redirect_error` (p 0.99) | 0.99 | Followed |
| D10 | `review --base` with an empty diff silently reviews the last commit | `no_fallback_with_base` (p 0.98) | 0.97 | Followed |
| D11 | The 200 KB diff cap cuts by JS characters, not bytes | `truncate_by_bytes` (p 0.98) | 0.97 | Followed |

## Owner decisions

The owner (Gary) answered in the Claude Code session on 2026-11-22, using a structured question with four options plus custom text. No reasons were given.

| ID | Owner choice | Differs from Jev's top option? |
|---|---|---|
| D2 | Add flags to review: `review` accepts `--background`, `--timeout-mins` and `--show-reasoning`, and the docs list per-command flags | Yes (Jev: docs only) |
| D4 | Bump to 0.1.4 and add CHANGELOG.md covering 0.1.3 and 0.1.4 | Yes (Jev: changelog, no bump) |
| D5 | Effort column in the README models table, plus a stderr warning when `--effort` will be ignored | Yes (Jev: docs only) |

Scope note: D2 and D5 add behavior beyond a docs-only fix. They are in scope because the owner chose them.
