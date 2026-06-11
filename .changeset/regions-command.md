---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(regions): add `gmc regions` — define geographic regions for regional inventory and shipping

New `RegionsService` (Merchant API `accounts/v1` `accounts.regions`) and a `gmc regions`
command group with full CRUD: `list` / `get` / `create` / `update` / `delete`. A region is
defined by a postal-code area (`--postal-codes` + `--region-code`), a geotarget area
(`--geotarget-ids`), or a radius area (via `--file`); `update` patches only the fields you pass
(deriving the `updateMask`, or set it with `--update-mask`). This fills the gap behind
`gmc inventory regional`, which requires a region defined for the account.
