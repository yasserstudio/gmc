# @gmc-cli/migrate

## 0.1.15

### Patch Changes

- Updated dependencies [abe94bd]
  - @gmc-cli/api@0.9.14
  - @gmc-cli/auth@0.7.2

## 0.1.14

### Patch Changes

- Updated dependencies [5f1f9bd]
  - @gmc-cli/api@0.9.13

## 0.1.13

### Patch Changes

- Updated dependencies [c7ea8a4]
  - @gmc-cli/api@0.9.12

## 0.1.12

### Patch Changes

- Updated dependencies [6e77f83]
  - @gmc-cli/api@0.9.11

## 0.1.11

### Patch Changes

- Updated dependencies [a227644]
  - @gmc-cli/api@0.9.10

## 0.1.10

### Patch Changes

- Updated dependencies [b546891]
  - @gmc-cli/api@0.9.9

## 0.1.9

### Patch Changes

- Updated dependencies [480c4f5]
  - @gmc-cli/api@0.9.8

## 0.1.8

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

- Updated dependencies [695c10c]
  - @gmc-cli/api@0.9.7

## 0.1.7

### Patch Changes

- Updated dependencies [ba9415f]
  - @gmc-cli/api@0.9.6

## 0.1.6

### Patch Changes

- Updated dependencies [205a9e4]
  - @gmc-cli/api@0.9.5

## 0.1.5

### Patch Changes

- Updated dependencies [cd3426f]
  - @gmc-cli/api@0.9.4

## 0.1.4

### Patch Changes

- Updated dependencies [e7d90a0]
  - @gmc-cli/api@0.9.3

## 0.1.3

### Patch Changes

- e94a82c: feat(migrate): `gmc migrate feed-labels` — feed-label transfer check (Phase 5, v0.9.8)

  Closes Phase 5. Google Ads Shopping campaigns serve products by their feed identity `(channel, feedLabel, contentLanguage)` — the same tuple a primary data source is keyed by. After a Content API → Merchant API migration, a product whose feed identity matches no data source lands in a feed no campaign targets and silently stops serving. `gmc migrate feed-labels` catches that before push.
  - **Offline analysis** — groups the feed by feed identity, flags products with no `feedLabel`, and warns on case variants (`US` vs `us`, which Merchant Center treats as different feeds).
  - **Live cross-check** — when an account is resolved, lists the account's primary data sources and flags any group that matches none (the campaign-killer); also reports orphaned data sources. `--remote` checks the live catalog directly.
  - **CI gate** like `preflight` — exits non-zero on error findings; warnings gate only with `--strict`. Prints a feed-label distribution table (per group: product count + whether it matches a data source) or `--json`.

  The check lands in `@gmc-cli/migrate` (`checkFeedLabels`, pure). Together with `migrate scopes` (v0.9.6) and `migrate products` (v0.9.7), Phase 5 covers the full migration: auth, product data, and the feed-label safety net.

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
