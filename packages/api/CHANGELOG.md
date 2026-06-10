# @gmc-cli/api

## 0.9.4

### Patch Changes

- cd3426f: fix(api): target Merchant API **v1**; feat: `gmc promotions` (Phase 6, v0.9.10)

  **Critical alignment fix:** the Merchant API `v1beta` was shut down on Feb 28, 2026. Every sub-API now targets the stable **v1** endpoint — `products/v1`, `accounts/v1`, `datasources/v1`, `inventories/v1`, `promotions/v1` — and the `doctor` probe hits `accounts/v1`. Paths are otherwise unchanged; this is purely the version segment moving `v1beta` → `v1` so live calls reach a supported endpoint.

  **`gmc promotions`** (closes Phase 6) — manage Merchant Center promotions via the promotions sub-API:
  - `@gmc-cli/api` gains `PromotionsService` (`getPromotion` / `listPromotions` / `insertPromotion`); the API exposes insert/get/list (no delete — promotions expire). `insert` sends the `InsertPromotionRequest` body `{ promotion, dataSource }` (verified against the v1 reference — unlike `productInputs.insert`, dataSource is a body field, not a query param).
  - `gmc promotions list|get|insert` — `insert` reads the `Promotion` JSON from `--file`/stdin and requires `--data-source`.

  With `gmc inventory` (v0.9.9), Phase 6 (inventories + promotions) is complete. Next: Phase 7 — reports.

## 0.9.3

### Patch Changes

- e7d90a0: feat(inventory): `gmc inventory` — local + regional inventory overrides (Phase 6, v0.9.9)

  Opens Phase 6 (breadth) with the Merchant API inventories sub-API: per-store (**local**) and per-region (**regional**) overrides of a product's price/availability, so Shopping shows the right stock and price per location.
  - **`@gmc-cli/api`** gains `InventoriesService` (`listLocal`/`insertLocal`/`deleteLocal` + the regional trio), mirroring `ProductsService` — both inventories are product sub-resources with list / insert (upsert, keyed by `storeCode` / `region`) / delete.
  - **`gmc inventory local|regional list|insert|delete <product>`**. Insert takes convenience flags (`--store-code`/`--region`, `--availability`, `--quantity`, `--price`+`--currency`) layered over an optional `--file` JSON base — so "mark store S1 out of stock" is one line. `--price` converts a decimal to micros; `list` prints a table or `--json`.

  Region _definition_ (the accounts-sub-API `regions` resource) is a separate follow-up; `regional insert --region` references an existing region. Next in Phase 6: `gmc promotions` (v0.9.10).

## 0.9.2

### Patch Changes

- Updated dependencies [f87e76e]
  - @gmc-cli/auth@0.7.1

## 0.9.1

### Patch Changes

- 108ac25: preflight: required-attribute + format rule library

  Fill the preflight registry with the required-attribute and format-validation rules `gmc preflight` was built for — no engine change:
  - **Required** (`error`): `description`, `link`, `image-link`, `availability` join the seed `offer-id`/`title`/`price`. `condition` and `identifier-exists` (`gtin` ∨ `mpn` ∨ `brand`) ship as `warning` — recommended, not always rejected.
  - **Format**: `link` / `image_link` URL validity, `price.amountMicros` (integer micros) and `price.currencyCode` (3-letter code), `availability` / `condition` enums (all `error`); GTIN check-digit and title/description length limits (`warning`). A `format.*` rule fires only when its attribute is present, so an absent value is reported once by its `required.*` rule.
  - Attribute values are read defensively (a non-string from a hand-edited feed is coerced, not thrown on) and echoed safely (control characters stripped, length capped).

  Also: `productKey` now lives in `@gmc-cli/api` alongside `ProductInput` (re-exported from `@gmc-cli/preflight` for compatibility), `condition` was added to `ProductAttributes`, and the shared feed-directory reader (`feeds push` / `feeds diff` / `preflight`) now reads files with bounded concurrency while preserving name order.

## 0.9.0

### Minor Changes

- bb24c04: feat: `gmc feeds pull` — export your catalog to a directory of version-controllable, push-ready product files (one JSON per product). Adds `toProductInput` to map a processed product to a writable input.

## 0.8.0

### Minor Changes

- 82afb6c: feat: `gmc datasources` — create, list, get, and delete Merchant Center data sources. Create a primary product feed from flags (API push or scheduled fetch) or a full DataSource JSON, then `products insert --data-source <id>` against it.
