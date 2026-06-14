# @gmc-cli/preflight

## 0.1.21

### Patch Changes

- Updated dependencies [754d7c9]
  - @gmc-cli/api@0.9.20

## 0.1.20

### Patch Changes

- Updated dependencies [d8ff71c]
  - @gmc-cli/api@0.9.19

## 0.1.19

### Patch Changes

- Updated dependencies [8f0b94f]
  - @gmc-cli/api@0.9.18

## 0.1.18

### Patch Changes

- 06f53d7: fix(products): use `productAttributes` for Merchant API v1 (was `attributes`)

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

- Updated dependencies [06f53d7]
  - @gmc-cli/api@0.9.17

## 0.1.17

### Patch Changes

- Updated dependencies [e6b111c]
  - @gmc-cli/api@0.9.16

## 0.1.16

### Patch Changes

- Updated dependencies [86e2438]
  - @gmc-cli/api@0.9.15

## 0.1.15

### Patch Changes

- Updated dependencies [abe94bd]
  - @gmc-cli/api@0.9.14

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

- @gmc-cli/api@0.9.2

## 0.1.2

### Patch Changes

- 4a80360: preflight: policy / disapproval-trigger checks (Phase 4 exit)

  Add a `policy.*` rule family for the editorial triggers Merchant Center disapproves products for — heuristic, offline, no engine change:
  - `policy.promotional-title` (**error**) — promotional text in the title (e.g. "free shipping", "20% off", "best price", "buy now"). A curated, high-precision phrase set, since this rule gates.
  - `policy.title-caps` (warning) — SHOUTING titles (most letters uppercase).
  - `policy.title-symbols` (warning) — gimmicky symbols, repeated punctuation, or emoji in the title.
  - `policy.phone-in-title` (warning) — a formatted phone number in the title.
  - `policy.link-https` (warning) — the landing-page `link` uses `http`, not `https`.

  All are present-only and tunable in `.gmcpreflightrc`. This closes Phase 4: `gmc preflight` now catches a real disapproval offline before upload.

## 0.1.1

### Patch Changes

- 108ac25: preflight: required-attribute + format rule library

  Fill the preflight registry with the required-attribute and format-validation rules `gmc preflight` was built for — no engine change:
  - **Required** (`error`): `description`, `link`, `image-link`, `availability` join the seed `offer-id`/`title`/`price`. `condition` and `identifier-exists` (`gtin` ∨ `mpn` ∨ `brand`) ship as `warning` — recommended, not always rejected.
  - **Format**: `link` / `image_link` URL validity, `price.amountMicros` (integer micros) and `price.currencyCode` (3-letter code), `availability` / `condition` enums (all `error`); GTIN check-digit and title/description length limits (`warning`). A `format.*` rule fires only when its attribute is present, so an absent value is reported once by its `required.*` rule.
  - Attribute values are read defensively (a non-string from a hand-edited feed is coerced, not thrown on) and echoed safely (control characters stripped, length capped).

  Also: `productKey` now lives in `@gmc-cli/api` alongside `ProductInput` (re-exported from `@gmc-cli/preflight` for compatibility), `condition` was added to `ProductAttributes`, and the shared feed-directory reader (`feeds push` / `feeds diff` / `preflight`) now reads files with bounded concurrency while preserving name order.

- Updated dependencies [108ac25]
  - @gmc-cli/api@0.9.1

## 0.1.0

### Minor Changes

- b187945: feat(preflight): offline feed-compliance engine + `gmc preflight` (v0.9.3)

  Adds `@gmc-cli/preflight`, a pure rule engine that scans product inputs for
  Merchant Center compliance issues **offline** — no API call, no auth — and the
  `gmc preflight` command that runs it.
  - `gmc preflight [--dir <path>]` scans a directory of `feeds pull` files; `--file`
    scans one file; `--remote` pulls the live catalog and scans it.
  - `.gmcpreflightrc` (discovered by walking up from the scanned directory, or via
    `--config`) sets per-rule severities, an `ignore` list, `targetCountry`, and
    `strict`. `--strict` treats warnings as failures.
  - Findings carry a severity (`error`/`warning`/`info`), the offending attribute,
    a fix suggestion, and a docs link — and group by product in human output or
    serialize to a full report under `--json`.
  - New exit code `6` (`ExitCode.Preflight`) when gating findings are present, so CI
    can fail a build before a bad feed is uploaded.

  Ships the engine, the `.gmcpreflightrc` loader, and a seed rule set
  (`required.offer-id`, `required.title`, `required.price`). The full required /
  format rule library lands in v0.9.4 and policy / disapproval-trigger checks in
  v0.9.5.
