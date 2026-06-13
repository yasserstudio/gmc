---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
"@gmc-cli/preflight": patch
"@gmc-cli/migrate": patch
---

fix(products): use `productAttributes` for Merchant API v1 (was `attributes`)

Merchant API v1 renamed the product attributes field from `attributes` to
`productAttributes` (for both processed products and product inputs). gmc still
sent/read `attributes`, so against the live API `products list`/`get` showed blank
titles and prices, and `products insert` failed with
`400 INVALID_ARGUMENT: Unknown name "attributes"`. This also affected `feeds`,
`migrate products`, and `preflight --remote`.

Renames the field across `Product`/`ProductInput` and every read/write site (CLI
renderers, `toProductInput`, feeds, preflight rules, migrate transform). Fixes
`ItemLevelIssue` to the real v1 shape — `severity` / `reportingContext` /
`applicableCountries` (dropping the v1beta `servability` / `destination` /
`attribute`) — so `products get` shows issue details and disapproval counts
correctly. Adds a recorded-shape v1 contract test so a future field rename fails
CI instead of shipping silently.

Also corrects the `gmc issues` severity docs: the live `renderaccountissues`
value is `ERROR`, not the previously-documented `DISAPPROVED` / `DEMOTED` /
`NOT_IMPACTED`.
