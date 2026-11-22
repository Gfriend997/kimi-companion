# Spec 001: Documentation accuracy fixes

Status: implemented on branch, awaiting owner review (all decisions resolved, see `decisions.md`)
Branch: `fix/doc-accuracy`
Base commit: `c558ba0`
Owner request (2026-11-22, Claude Code session): "work with all model, and also check in with Jev to investigate and fix all issue found."

## Purpose

The README, AGENTS.md, command files and skills disagree with the runtime in several places. A user who follows the docs can leak the API key into shell history, pass flags that crash `review`, or misread how routing works. This change makes the documentation describe what the code does.

## Scope

In scope: the findings in the table below, as confirmed against the code. Each needs a doc fix, unless an owner decision in `decisions.md` approves a code fix.

Out of scope: new features. That includes new flags, secret-manager support (the roadmap item stays open), Files API upload and the version release itself.

## Findings

| ID | Finding | Confirmed by |
|---|---|---|
| F1 | README Windows key setup uses `setx MOONSHOT_API_KEY "..."`. The key goes into the PSReadLine history file, which breaks README's own "never inline" rule. | Opus, Grok, Gemini |
| F2 | README "Common flags" implies ask-only flags work on `review`/`adversarial-review`. Those subcommands reject them with `ERR_PARSE_ARGS_UNKNOWN_OPTION`. | Opus, Grok, Gemini |
| F3 | `commands/ask.md` routes image generation to Gemini. The policy now says grok-companion, with Gemini as fallback. | Opus, Grok, Gemini |
| F4 | README routing summary leaves out Gemini-first for public-safe video/audio/PDF and Gemini-first for routine diff review. | Opus, Grok (partial), Gemini |
| F5 | README Testing note calls `adversarial-review` an `ask` preset run. It is `review --adversarial`. | Opus, Grok, Gemini |
| F6 | README models table omits `kimi-k3.1-pro` and `kimi-k3.1-pro-highspeed`, which the live API lists. | Opus, Grok, Gemini |
| F7 | README does not say which `--effort` values each model ignores. | Opus, Grok (partial), Gemini |
| F8 | README does not document review's 200 KB diff cap, its untracked-file exclusion or `--base <ref>`. | Opus, Grok, Gemini |
| F9 | AGENTS.md test map omits `cli.test.mjs`. | Opus, Grok, Gemini |
| F10 | README repeats the streaming note. A fixed bug report sits in the repo root. There is no CHANGELOG. Version 0.1.3 was bumped in a docs-only commit. | Opus, Grok, Gemini (partial) |
| F11 | `skills/kimi-api-runtime/SKILL.md` review row omits `--max-tokens`. | Gemini; verified by Opus |
| F12 | `commands/ask.md` says `max` is the model default. The client sends no effort when the flag is omitted, so the default is set server-side. | Gemini; verified by Opus |
| F13 | Stop gate: when only untracked files are dirty, `review` falls back to `HEAD~1..HEAD`. The gate then reviews the last commit and blocks stop. README says the gate "reviews only dirty working trees". | Gemini (described as an exit-1 path; the real path is the fallback); verified by Opus |

Rejected candidate findings (wrong on verification): Grok's points that AGENTS.md omits the prompts registry (it is stated there) and that rescue/transfer docs disagree with the preset call path (they match).

## Acceptance criteria

1. No README command shows the key typed inline. The Windows instruction never puts the key on a command line.
2. Every flag the README attributes to a command is accepted by that command's `parseArgs` options.
3. `commands/ask.md`, the README routing summary and `prompts/routing-policy.md` agree.
4. The README models table lists every model in the live `setup` output from 2026-11-22, with its effort behaviour as decided in D5.
5. The README documents review's 200 KB cap, untracked exclusion and `--base`.
6. The AGENTS.md test map matches `ls tests`.
7. `node --test "tests/*.test.mjs"` passes, and `hooks/hooks.json` parses.
8. A model review of the final diff finds no remaining doc-vs-code mismatch for F1–F13.

## Failure cases

- A doc fix that describes intended rather than actual behaviour reintroduces drift. Every statement must cite code.
- A moved bug report breaks inbound links. Grep for its filename before and after the move.

## REA applicability

Not applicable. This is a documentation-accuracy change with no analysis target.
