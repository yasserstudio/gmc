# @gmc-cli/api

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
