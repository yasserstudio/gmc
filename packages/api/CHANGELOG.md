# @gmc-cli/api

## 0.9.11

### Patch Changes

- 6e77f83: feat(accounts): account lifecycle — `gmc accounts create` and `delete`

  `AccountsService` gains `createAccount` (`accounts:createAndConfigure`) and `deleteAccount`, and the
  `gmc accounts` group gets `create` and `delete`. `create` builds the request from `--name` /
  `--time-zone` / `--language` / `--adult-content` plus `--aggregator <id>` (the standard sub-account
  service), or a full body via `--file` (kept whole, so `user[]` / `setAlias[]` round-trip).
  `delete <accountId>` is **irreversible**: the id is required (no profile fallback) and `--yes` must
  be passed to confirm; `--force` maps to the API's force (delete an account with sub-accounts or
  processed offers). Completes the account-management surface.

## 0.9.10

### Patch Changes

- a227644: feat(accounts): manage account access with `gmc accounts users`

  `AccountsService` gains user CRUD (`listUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`)
  and a new `gmc accounts users` sub-group — `list` / `get` / `add` / `update` / `remove` — to manage
  who can access the account and their access rights (`STANDARD`, `READ_ONLY`, `ADMIN`,
  `PERFORMANCE_REPORTING`, `API_DEVELOPER`). The user's email is the id (`me` resolves to the calling
  user); `add` supplies it as the `userId` query param like `regions create`. Completes the account
  profile/access surface alongside v1.0.3's profile writes.

## 0.9.9

### Patch Changes

- b546891: feat(accounts): manage the account profile — `update`, `business-info update`, and `homepage set` / `claim` / `unclaim`

  `AccountsService` gains write methods (`updateAccount`, `updateBusinessInfo`, `updateHomepage`,
  `claimHomepage`, `unclaimHomepage`) and the `gmc accounts` group — until now read-only — can edit
  the same profile `accounts info` reads. `update` patches account fields (`--name`,
  `--adult-content`, `--time-zone`, `--language`), `business-info update` patches the business address
  / customer service from `--file` (the output-only `phone` is ignored), and `homepage set` / `claim`
  / `unclaim` manage the store URI and its claim status. Writes patch only the fields you pass
  (deriving the `updateMask`, or set it with `--update-mask`), mirroring `gmc regions`.

## 0.9.8

### Patch Changes

- 480c4f5: feat(regions): add `gmc regions` — define geographic regions for regional inventory and shipping

  New `RegionsService` (Merchant API `accounts/v1` `accounts.regions`) and a `gmc regions`
  command group with full CRUD: `list` / `get` / `create` / `update` / `delete`. A region is
  defined by a postal-code area (`--postal-codes` + `--region-code`), a geotarget area
  (`--geotarget-ids`), or a radius area (via `--file`); `update` patches only the fields you pass
  (deriving the `updateMask`, or set it with `--update-mask`). This fills the gap behind
  `gmc inventory regional`, which requires a region defined for the account.

## 0.9.7

### Patch Changes

- 695c10c: Pre-v1 audit hardening (quality + Google-API alignment + packaging + security):
  - **API alignment — `channel` removed (Merchant API v1).** v1 dropped the `channel`
    field from products, product inputs, and data sources, replacing it with a boolean
    `legacyLocal`. Product identity is now the 3-segment `{contentLanguage}~{feedLabel}~{offerId}`
    (a `local~` prefix marks legacy-local products) — `productKey`, `productFileName`, and
    the feed-label grouping drop the old `channel` segment, so `feeds diff` no longer
    mis-pairs and `datasources create` no longer sends a removed field. **Breaking flag
    change:** `gmc datasources create --channel <online|local>` → `--legacy-local`
    (boolean). `migrate products` now maps a Content API `channel: "local"` to
    `legacyLocal: true` (online is the v1 default and carries no field).
  - **Packaging — self-contained npm package.** The `@gmc-cli/cli` build now bundles the
    `@gmc-cli/*` workspace packages (so a global / `npx` install resolves no internal
    packages at runtime) and ships no source maps. Only `commander` and
    `google-auth-library` remain runtime dependencies.
  - **Robustness.** `--days` and `--page-size` reject non-plain-integer and out-of-range
    values (no more date underflow or `1e21` reaching the query string); `gmc config path`
    now emits the standard `{ ok: false, error }` envelope on failure; `feeds push` reports
    its partial `pushed` count in the JSON failure envelope.
  - **Security.** The release-binaries workflow passes the release tag via an environment
    variable instead of interpolating it into the shell (command-injection hardening).

## 0.9.6

### Patch Changes

- ba9415f: feat(reports): competitive visibility + price competitiveness (Phase 7, v0.9.12)

  Two more `gmc reports` presets on the reports sub-API:
  - **`gmc reports competitive-visibility --country <c> --category <id>`** — how your domain's visibility compares to competitors (`competitive_visibility_competitor_view`): rank, relative visibility, page-overlap and higher-position rates. Country + category are required (the view mandates them); `--traffic-source` (ADS/ORGANIC/ALL, default ADS) and a date window (`--days`/`--since`/`--until`).
  - **`gmc reports price-competitiveness [--country <c>]`** — your prices vs the category benchmark per product (`price_competitiveness_product_view`; `price`/`benchmark_price` are amounts).

  `@gmc-cli/api`'s `ReportRow` gains typed `competitiveVisibilityCompetitorView` and `priceCompetitivenessProductView` views. All column names and required filters verified against the Merchant API reports guides. Next: v0.9.13 — CI threshold alerting.

## 0.9.5

### Patch Changes

- 205a9e4: feat(reports): `gmc reports` — MCQL query + product performance (Phase 7, v0.9.11)

  Opens Phase 7 (reports) with the Merchant API reports sub-API (`reports/v1`).
  - **`@gmc-cli/api`** gains `ReportsService.search(query, { pageSize })` — runs a Merchant Center Query Language (MCQL) query via `POST reports/v1/.../reports:search`, paginating with the `pageToken` in the request body (not a query param) and collecting `results`.
  - **`gmc reports performance`** — product clicks/impressions/CTR/conversions from `product_performance_view` over a window (`--days` default 30, or `--since`/`--until`), rendered as a date-sorted table or `--json`.
  - **`gmc reports query <mcql>`** — run any MCQL query; prints rows (NDJSON) or `--json`. The escape hatch for views the presets don't cover.

  Next in Phase 7: competitive visibility + price insights (v0.9.12), then CI threshold alerting (v0.9.13).

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
