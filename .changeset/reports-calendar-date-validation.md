---
"@gmc-cli/cli": patch
---

`reports` now rejects shape-valid but impossible `--since`/`--until` dates (e.g.
`2026-13-45`, `2026-02-30`) with a clear usage error, instead of letting them silently
roll over into a wrong window.
