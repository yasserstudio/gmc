# Changelog

The public progress log for **gmc** — the Google Merchant Center CLI.

`0.x` is the pre-release series through the spike and build-out; `1.0.0` lands at
public launch. Versions track [`@gmc-cli/cli`](packages/cli) (the `gmc` command);
supporting packages version independently. From v0.8 on, each release is driven by
[Changesets](.changeset) and tagged.

## v0.9.0 — Phase 3: feeds pull

Feeds as code, part 1.

- **feeds** — `gmc feeds pull` exports the catalog to a directory of
  version-controllable files, one push-ready product per file (named by composite
  id), ready to commit, diff, and (v0.10) push back.
- **api** — `toProductInput` maps a processed product to a writable input,
  stripping output-only fields so the files round-trip cleanly.

_`@gmc-cli/cli` and `@gmc-cli/api` → 0.9.0; `@gmc-cli/core` → 0.7.2._

## v0.8.0 — Phase 3: data sources

Feeds as code begins. The container every product feed lives in.

- **datasources** — `gmc datasources list / get / create / delete`. Create a
  primary product feed from flags (API push or scheduled file fetch) or a full
  DataSource JSON via `--file`/stdin.
- **Closes the v0.7 loop** — create an API data source, then
  `gmc products insert --data-source <id>` against it, with no Merchant Center UI.
- **api** — typed `DataSourcesService` on a per-account client, plus a dedicated
  `datasources` rate-limit bucket.

_First release cut through Changesets: `@gmc-cli/cli` and `@gmc-cli/api` → 0.8.0;
`@gmc-cli/core` → 0.7.1._

## v0.7.0 — Phase 2 spike: accounts + products

The MVP proof and Phase 2 decision gate: authenticate, diagnose, and round-trip
real catalog data against a live Merchant Center account.

- **products** — `gmc products list / get / insert / delete`. Reads the processed
  `products` resource (status + item-level issues); writes via `productInputs`
  (insert from a JSON file or stdin, under a `--data-source`).
- **accounts** — `gmc accounts list / get / info` (the `info` view composes the
  account with its business info and homepage).
- **api** — typed `MerchantClient`: per-sub-API 6-bucket rate limiter, retry with
  backoff, pagination, and Google-error mapping to a classed `MerchantApiError`.
- **doctor** — `gmc doctor` diagnoses the silent GCP-registration / API-not-enabled
  trap against a real merchant.
- **auth** — service account, interactive OAuth, and Application Default
  Credentials, with per-sub-API scopes and a disk-backed token cache.
- **shell** — config, named profiles, `--json` everywhere, and classed exit codes
  (`Usage` 2, `Auth` 3, `Config` 4, `Api` 5).

> v0.1–v0.6 shipped on the spike branch before versioning was set up; **v0.7.0 is
> the first tagged release**. Earlier deliverables are folded into the summary above.
