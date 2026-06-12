---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(accounts): manage the account profile — `update`, `business-info update`, and `homepage set` / `claim` / `unclaim`

`AccountsService` gains write methods (`updateAccount`, `updateBusinessInfo`, `updateHomepage`,
`claimHomepage`, `unclaimHomepage`) and the `gmc accounts` group — until now read-only — can edit
the same profile `accounts info` reads. `update` patches account fields (`--name`,
`--adult-content`, `--time-zone`, `--language`), `business-info update` patches the business address
/ customer service from `--file` (the output-only `phone` is ignored), and `homepage set` / `claim`
/ `unclaim` manage the store URI and its claim status. Writes patch only the fields you pass
(deriving the `updateMask`, or set it with `--update-mask`), mirroring `gmc regions`.
