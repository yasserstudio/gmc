---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(accounts): account lifecycle — `gmc accounts create` and `delete`

`AccountsService` gains `createAccount` (`accounts:createAndConfigure`) and `deleteAccount`, and the
`gmc accounts` group gets `create` and `delete`. `create` builds the request from `--name` /
`--time-zone` / `--language` / `--adult-content` plus `--aggregator <id>` (the standard sub-account
service), or a full body via `--file` (kept whole, so `user[]` / `setAlias[]` round-trip).
`delete <accountId>` is **irreversible**: the id is required (no profile fallback) and `--yes` must
be passed to confirm; `--force` maps to the API's force (delete an account with sub-accounts or
processed offers). Completes the account-management surface.
