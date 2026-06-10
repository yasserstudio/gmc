---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(inventory): `gmc inventory` — local + regional inventory overrides (Phase 6, v0.9.9)

Opens Phase 6 (breadth) with the Merchant API inventories sub-API: per-store (**local**) and per-region (**regional**) overrides of a product's price/availability, so Shopping shows the right stock and price per location.

- **`@gmc-cli/api`** gains `InventoriesService` (`listLocal`/`insertLocal`/`deleteLocal` + the regional trio), mirroring `ProductsService` — both inventories are product sub-resources with list / insert (upsert, keyed by `storeCode` / `region`) / delete.
- **`gmc inventory local|regional list|insert|delete <product>`**. Insert takes convenience flags (`--store-code`/`--region`, `--availability`, `--quantity`, `--price`+`--currency`) layered over an optional `--file` JSON base — so "mark store S1 out of stock" is one line. `--price` converts a decimal to micros; `list` prints a table or `--json`.

Region *definition* (the accounts-sub-API `regions` resource) is a separate follow-up; `regional insert --region` references an existing region. Next in Phase 6: `gmc promotions` (v0.9.10).
