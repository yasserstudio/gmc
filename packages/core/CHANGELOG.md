# @gmc-cli/core

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
