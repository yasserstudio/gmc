# @gmc-cli/preflight

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
