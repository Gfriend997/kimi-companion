# Spec 002: Diff review routing matches risky-diff policy

Revision: 1 (2026-11-22). Status: APPROVED rev 1 (Gary, chat, 2026-11-22: "Approve full flow").
Request (Gary, Claude Code chat, 2026-11-22): "fix the Kimi routing line too".

## Problem

`prompts/routing-policy.md` says "Routine second opinion on a diff belongs to Gemini." Gemini Companion v0.3.0 (spec 002, merged in Gfriend997/gemini-companion PR #1) no longer reviews routine diffs. It auto-reviews only large or risky diffs. Gary's session rules make a Claude Sonnet 5.5 subagent the primary reviewer (`Projects/CLAUDE.md`, section 3). The Kimi line now contradicts both.

## Requirements

- **R1.** Replace the line. New text: the host's own reviewer handles routine diffs. A Gemini second opinion is for large or risky diffs only. Run `/kimi-companion:review` only when the user asks for Kimi by name, or when a third read is wanted on a risky diff after Gemini. Do not run both companions on one diff unless the user asks.
- **R2.** Keep the confirm-first rule for Kimi adversarial review unchanged.
- **R3.** Bump the version from 0.1.4 to 0.1.5 and add a CHANGELOG entry, so `claude plugin update` picks up the change.
- **R0 (gate setup).** Add the missing `.specify/` folder. Copy it from the same pinned fork commit already used in Gemini Companion (`Gfriend997/spec-kit@3238fa9`), and set `fork-source.json` to this project's identity. `AGENTS.md` already refers to `.specify/`.

## Exclusions

No runtime, command or test change. Other routing lines are unchanged.

## Acceptance criteria

- The routing policy has no "Routine second opinion on a diff belongs to Gemini" line, and it states R1.
- `hooks/hooks.json` parses, and `node --test` passes.
- After you approve, it is committed and pushed. That needs `gwaiog007` to have write access; today it has `push=false`. Then `claude plugin update kimi-companion@kimi-companion` installs 0.1.5.

## Tasks

- T0. Add `.specify/` (R0). `constitution.md` is written from the `AGENTS.md` invariants and marked PROPOSED; the Gemini copy was not reused.
- T1. Edit the routing line (R1, R2).
- T2. Bump the version and update CHANGELOG (R3).
- T3. Run the checks.
- T4. Commit, PR and merge to `main`, then update the plugin. Pushing requires a collaborator invite for `gwaiog007`.

REA: not applicable. The change is to instruction text only.
