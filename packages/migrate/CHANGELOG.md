# @gmc-cli/migrate

## 0.1.2

### Patch Changes

- dbd7901: feat(migrate): `gmc migrate products` — Content API v2.1 → Merchant API ProductInput (Phase 5, v0.9.7)

  Phase 5 part 2: convert real Content API for Shopping product data into push-ready Merchant API `ProductInput` files, so the output drops straight into `gmc feeds push` and `gmc preflight` — completing the migrate → validate → upload pipeline.

  `gmc migrate products`:
  - **Input** — `--from <dir>` of per-product Content API JSON, or `--file <path>` for a single product, a JSON array, or a `products.list` response (`{resources}`/`{products}`).
  - **Transform** — moves descriptive fields into `attributes`, keeps identity fields (`offerId`/`channel`/`contentLanguage`/`feedLabel`) at the top level, and remaps: price `{value,currency}` → `{amountMicros,currencyCode}` (BigInt, half-up at 6 dp; also `salePrice` and nested `shipping[].price`), `availability` enum spaces → underscores (`in stock` → `in_stock`), `targetCountry` → `feedLabel`, and the Content API REST `id` parsed to backfill identity then dropped. Output-only fields (`id`/`kind`/`source`) are dropped and reported.
  - **Output** — `--out <dir>` (default `feeds`) of `ProductInput` files named like `feeds pull`, plus a migration report (converted / remapped / dropped / warnings) or `--json`. Exits non-zero if any product can't be converted, so CI gates an incomplete migration.

  The transform engine lands in `@gmc-cli/migrate` (which gains a direct `@gmc-cli/api` dependency for the product types). The per-product filename helper is shared with `feeds pull` via `_shared.ts`.

## 0.1.1

### Patch Changes

- Updated dependencies [f87e76e]
  - @gmc-cli/auth@0.7.1
