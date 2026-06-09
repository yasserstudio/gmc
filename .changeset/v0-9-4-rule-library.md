---
"@gmc-cli/preflight": patch
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

preflight: required-attribute + format rule library

Fill the preflight registry with the required-attribute and format-validation rules `gmc preflight` was built for — no engine change:

- **Required** (`error`): `description`, `link`, `image-link`, `availability` join the seed `offer-id`/`title`/`price`. `condition` and `identifier-exists` (`gtin` ∨ `mpn` ∨ `brand`) ship as `warning` — recommended, not always rejected.
- **Format**: `link` / `image_link` URL validity, `price.amountMicros` (integer micros) and `price.currencyCode` (3-letter code), `availability` / `condition` enums (all `error`); GTIN check-digit and title/description length limits (`warning`). A `format.*` rule fires only when its attribute is present, so an absent value is reported once by its `required.*` rule.
- Attribute values are read defensively (a non-string from a hand-edited feed is coerced, not thrown on) and echoed safely (control characters stripped, length capped).

Also: `productKey` now lives in `@gmc-cli/api` alongside `ProductInput` (re-exported from `@gmc-cli/preflight` for compatibility), `condition` was added to `ProductAttributes`, and the shared feed-directory reader (`feeds push` / `feeds diff` / `preflight`) now reads files with bounded concurrency while preserving name order.
