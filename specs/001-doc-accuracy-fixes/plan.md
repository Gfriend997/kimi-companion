# Plan: Spec 001

Record note: `spec.md` and the first `decisions.md` were written before any edits. This plan and `tasks.md` were written during implementation, after the second review round. They record the work as it was done, not a plan that came before it.

## Approach

1. Install Spec Kit from pinned fork commit `3238fa9` (see `.specify/fork-source.json`). The pinned `specify.exe` is blocked by Windows Application Control, so it was copied from the sibling workspace's reviewed render.
2. Get independent verification of the candidate findings from four models: Grok (`grok-4.3`), Gemini (gemini-companion 0.2.0 default model), Kimi (`kimi-k3` through this plugin's own `ask --file`) and Codex (read-only task). Verify each new finding against the code before accepting it.
3. Send every material choice to Jev as a typed Choice. Follow Jev when confidence is above 0.70, and ask the owner otherwise.
4. Make the documentation fixes. Make code fixes only where a Jev decision above 0.70 or an owner decision chose them, and give each code fix a regression test that fails on the old code.
5. Verify with the full test suite, the JSON manifest checks and a model review of the final diff.

## Design notes

- `launchBackground(spec, label)` comes out of `cmdAsk` so that `review --background` reuses the same job path. The job's `prompt` field holds a short label, so `status` stays readable. The full diff is kept in `job.spec.prompt`.
- `effortIgnored(model, effort)` builds on `reasoningParams`, so the warning cannot drift from what is actually sent.
- `truncateUtf8` lives in `attach.mjs` next to the other size caps. It backs off to a character boundary, so the cut never produces U+FFFD or goes over the cap (Gemini's final review).
- The gate uses `git diff HEAD --quiet` and treats any exit code other than 1 as "skip", so a repo with no HEAD or no git never blocks a stop.

## Verification

- `node --test "tests/*.test.mjs"`: the 47 original tests pass, plus 12 new ones (59 in total).
- The new gate, redirect and `--base` tests fail on the old code (checked by stashing the fix).
- Tests that spawn the CLI remove `MOONSHOT_API_KEY` from the environment, so the suite makes no API calls.

## Spend

Paid calls in this task: one Kimi review (16,366 prompt + 5,948 completion tokens), one Grok review (reported $0.0245), one Gemini review, one Codex task and three Jev calls (pricing unknown). One test made an accidental live `kimi-k2.7-code` call with the prompt "hi" before it was switched to an offline environment. Final-diff reviews are listed in `tasks.md`.
