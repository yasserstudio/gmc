---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(lfp): add `gmc lfp` (Merchant API lfp/v1) — completes 11/11 sub-APIs

Adds the `lfp/v1` Local Feeds Partnership sub-API — the **11th and final** Merchant
API sub-API gmc covers. This is a provider-side API: the scoped account is the LFP
**provider**, and each resource names a **`targetAccount`** (the merchant it's for).

`gmc lfp stores list | get | insert | delete`, `gmc lfp inventory insert`,
`gmc lfp sales insert`, and `gmc lfp state get <merchant>`. Inserts take convenience
flags (`--target-account`, `--store-code`, `--offer-id`, `--price`/`--currency`,
`--quantity`, …) or a full `--file` body.

New `LfpService` in `@gmc-cli/api` plus the `lfp` rate-limit bucket and OAuth-scope
wiring. Resource shapes and the `:insert` colon-verb paths were verified against the
`lfp_v1` discovery document.
