---
"@gmc-cli/cli": patch
---

fix(cli): uniform `--json` success envelope across all commands (Phase 8, v0.9.14)

Hardens the `--json` contract ahead of v1. `gmc auth` (`whoami`/`login`/`test`/`logout`) and `gmc config` (`path`/`list`/`current`) wrapped their success output in `{ "ok": true, … }`; every other command prints the result payload **bare**. They now print bare too, matching the documented contract and the other 10 command groups — so `--json` is uniform: bare payload on success, `{ "ok": false, "error": {…} }` on failure.

(Domain `ok` fields on `doctor`/`preflight`/`migrate scopes`/`reports check` payloads are unchanged — those are verdicts, not the envelope.) The exit-code table in the reference now also documents `1` (a gating check failed). No behavior change beyond the JSON shape of those seven subcommands.
