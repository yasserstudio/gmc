---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(accounts): business-identity, autofeed, shipping & return-policies sub-resources

Fills the remaining `accounts/v1` sub-resources. `AccountsService` gains get/update for
`businessIdentity` and `autofeedSettings`, get/insert for `shippingSettings`, and
list/get/create/delete for `onlineReturnPolicies`. New `gmc accounts` sub-groups:

- `accounts business-identity get|update` — diversity/identity attributes (`--promotions-consent`, `--black-owned`/`--women-owned`/`--veteran-owned`/`--latino-owned`/`--small-business <yes|no>`).
- `accounts autofeed get|update` — `--enable-products <bool>`.
- `accounts shipping get|set` — read or replace the shipping-settings singleton (the `--file` body must carry the `etag` from `get`).
- `accounts return-policies list|get|create|delete` — manage online return policies (the id is auto-generated on create; bodies via `--file`/stdin).
