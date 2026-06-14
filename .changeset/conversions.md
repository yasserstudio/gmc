---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(conversions): add `gmc conversions` (Merchant API conversions/v1)

Adds the `conversions/v1` `accounts.conversionSources` sub-API — the 10th of 11
Merchant API sub-APIs gmc covers. A conversion source links an account to a
conversion-measurement origin: a **Merchant Center destination** or a **Google
Analytics property link**.

`gmc conversions list | get | create | update | delete | undelete`. `delete`
soft-archives a source; `undelete` restores it. `create` takes `--ga-property`
for a Google Analytics link or `--merchant-center --currency` for a Merchant
Center destination (or `--file` for the full body, e.g. nested
`attributionSettings`). `update` patches Merchant Center fields via a nested
`updateMask` so the rest of the destination is untouched.

New `ConversionsService` in `@gmc-cli/api` plus the `conversions` rate-limit
bucket and OAuth-scope wiring. Field names and RPC paths verified against the
`conversions_v1` discovery document.
