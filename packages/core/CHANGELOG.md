# @gmc-cli/core

## 0.7.22

### Patch Changes

- Updated dependencies [d8ff71c]
  - @gmc-cli/api@0.9.19

## 0.7.21

### Patch Changes

- Updated dependencies [8f0b94f]
  - @gmc-cli/api@0.9.18

## 0.7.20

### Patch Changes

- Updated dependencies [06f53d7]
  - @gmc-cli/api@0.9.17

## 0.7.19

### Patch Changes

- Updated dependencies [e6b111c]
  - @gmc-cli/api@0.9.16

## 0.7.18

### Patch Changes

- Updated dependencies [86e2438]
  - @gmc-cli/api@0.9.15

## 0.7.17

### Patch Changes

- Updated dependencies [abe94bd]
  - @gmc-cli/api@0.9.14
  - @gmc-cli/auth@0.7.2

## 0.7.16

### Patch Changes

- Updated dependencies [5f1f9bd]
  - @gmc-cli/api@0.9.13

## 0.7.15

### Patch Changes

- Updated dependencies [c7ea8a4]
  - @gmc-cli/api@0.9.12

## 0.7.14

### Patch Changes

- Updated dependencies [6e77f83]
  - @gmc-cli/api@0.9.11

## 0.7.13

### Patch Changes

- Updated dependencies [a227644]
  - @gmc-cli/api@0.9.10

## 0.7.12

### Patch Changes

- Updated dependencies [b546891]
  - @gmc-cli/api@0.9.9

## 0.7.11

### Patch Changes

- Updated dependencies [480c4f5]
  - @gmc-cli/api@0.9.8

## 0.7.10

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

## 0.7.9

### Patch Changes

- Updated dependencies [ba9415f]
  - @gmc-cli/api@0.9.6

## 0.7.8

### Patch Changes

- Updated dependencies [205a9e4]
  - @gmc-cli/api@0.9.5

## 0.7.7

### Patch Changes

- Updated dependencies [cd3426f]
  - @gmc-cli/api@0.9.4

## 0.7.6

### Patch Changes

- Updated dependencies [e7d90a0]
  - @gmc-cli/api@0.9.3

## 0.7.5

### Patch Changes

- Updated dependencies [f87e76e]
  - @gmc-cli/config@0.7.1
  - @gmc-cli/auth@0.7.1
  - @gmc-cli/api@0.9.2

## 0.7.4

### Patch Changes

- Updated dependencies [108ac25]
  - @gmc-cli/api@0.9.1

## 0.7.3

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

## 0.7.2

### Patch Changes

- Updated dependencies [bb24c04]
  - @gmc-cli/api@0.9.0

## 0.7.1

### Patch Changes

- Updated dependencies [82afb6c]
  - @gmc-cli/api@0.8.0
