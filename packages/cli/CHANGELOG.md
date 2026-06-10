# @gmc-cli/cli

## 0.9.6

### Patch Changes

- f87e76e: feat(migrate): `gmc migrate scopes` — Content API → Merchant API auth migration (Phase 5, v0.9.6)

  Introduces the new `@gmc-cli/migrate` engine and the `gmc migrate` command group, opening Phase 5 — the Content API for Shopping → Merchant API assistant (the Content API retires Aug 18, 2026).

  `gmc migrate scopes` does two things:
  - **Audits auth readiness.** The Merchant API uses the same OAuth scope as the Content API (`auth/content`), so existing tokens keep working with no re-consent — the report makes that explicit and maps the per-sub-API scope model for when Google ships granular scopes. The real blockers (GCP project registration + Merchant API enablement) are checked with a best-effort live probe, the same one behind `gmc doctor`; it degrades to a warning mid-migration rather than failing.
  - **Migrates a legacy config.** `--from merchant-info.json` (or `-a <id>`) seeds a `gmc` profile. Dry-run by default; `--write` applies it, `--set-default` makes it the default. It's an assistant, not a CI gate — advisory findings still exit `0`.

  `@gmc-cli/config` gains `saveConfig` and `upsertProfile` — the first config-writing API, with atomic, owner-only writes that preserve existing profiles. `@gmc-cli/auth` adds the `datasources` sub-API to `SubApi` (aligning with `@gmc-cli/api`) and exports a canonical `SUB_APIS` list.

- Updated dependencies [f87e76e]
  - @gmc-cli/config@0.7.1
  - @gmc-cli/auth@0.7.1
  - @gmc-cli/core@0.7.5
  - @gmc-cli/api@0.9.2
  - @gmc-cli/migrate@0.1.1
  - @gmc-cli/preflight@0.1.3

## 0.9.5

### Patch Changes

- Updated dependencies [4a80360]
  - @gmc-cli/preflight@0.1.2

## 0.9.4

### Patch Changes

- 108ac25: preflight: required-attribute + format rule library

  Fill the preflight registry with the required-attribute and format-validation rules `gmc preflight` was built for — no engine change:
  - **Required** (`error`): `description`, `link`, `image-link`, `availability` join the seed `offer-id`/`title`/`price`. `condition` and `identifier-exists` (`gtin` ∨ `mpn` ∨ `brand`) ship as `warning` — recommended, not always rejected.
  - **Format**: `link` / `image_link` URL validity, `price.amountMicros` (integer micros) and `price.currencyCode` (3-letter code), `availability` / `condition` enums (all `error`); GTIN check-digit and title/description length limits (`warning`). A `format.*` rule fires only when its attribute is present, so an absent value is reported once by its `required.*` rule.
  - Attribute values are read defensively (a non-string from a hand-edited feed is coerced, not thrown on) and echoed safely (control characters stripped, length capped).

  Also: `productKey` now lives in `@gmc-cli/api` alongside `ProductInput` (re-exported from `@gmc-cli/preflight` for compatibility), `condition` was added to `ProductAttributes`, and the shared feed-directory reader (`feeds push` / `feeds diff` / `preflight`) now reads files with bounded concurrency while preserving name order.

- Updated dependencies [108ac25]
  - @gmc-cli/preflight@0.1.1
  - @gmc-cli/api@0.9.1
  - @gmc-cli/core@0.7.4

## 0.9.3

### Patch Changes

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

- Updated dependencies [b187945]
  - @gmc-cli/preflight@0.1.0
  - @gmc-cli/core@0.7.3

## 0.9.2

### Patch Changes

- f26d755: feat(cli): `gmc feeds diff` — preview what `push` would change vs the live catalog. Classifies each product (matched by composite id, filename-independent) as added / updated / unchanged / orphaned (catalog-only, which push never removes). Read-only; differences exit 0, an invalid local file exits 1. Closes out Phase 3 (feeds as code). The shared directory-load loop is factored out of `push` into `loadProductFiles`.

## 0.9.1

### Patch Changes

- fdb7f7e: feat(cli): `gmc feeds push` — apply a directory of pulled product files to a target data source (`--data-source <id>`). Malformed local files are skipped and tallied (exit 1); an API rejection aborts the run (exit 5, idempotent re-run is safe).

## 0.9.0

### Minor Changes

- bb24c04: feat: `gmc feeds pull` — export your catalog to a directory of version-controllable, push-ready product files (one JSON per product). Adds `toProductInput` to map a processed product to a writable input.

### Patch Changes

- Updated dependencies [bb24c04]
  - @gmc-cli/api@0.9.0
  - @gmc-cli/core@0.7.2

## 0.8.0

### Minor Changes

- 82afb6c: feat: `gmc datasources` — create, list, get, and delete Merchant Center data sources. Create a primary product feed from flags (API push or scheduled fetch) or a full DataSource JSON, then `products insert --data-source <id>` against it.

### Patch Changes

- Updated dependencies [82afb6c]
  - @gmc-cli/api@0.8.0
  - @gmc-cli/core@0.7.1
