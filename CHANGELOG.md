# Changelog

The public progress log for **gmc** — the Google Merchant Center CLI.

`0.x` is the pre-release series through the spike and build-out; `1.0.0` lands at
public launch. Versions track [`@gmc-cli/cli`](packages/cli) (the `gmc` command);
supporting packages version independently. From v0.8 on, each release is driven by
[Changesets](.changeset) and tagged.

## v0.9.2 — feeds diff

Feeds as code, part 3 — **Phase 3 complete**. The full round-trip is now `pull` → edit → `diff` → `push`.

- **feeds** — `gmc feeds diff` previews what `push` would change vs the live
  catalog: `+` added, `~` updated, unchanged (counted), `-` orphaned (catalog-only,
  which push never removes). Products are matched by composite id, independent of
  filename. `--data-source <id>` scopes the comparison to one source for an exact
  push preview; otherwise it compares against the whole catalog.
- **read-only** — differences exit `0`; an invalid local file exits `1` (as `push`).
- **internal** — the shared directory-load loop is factored out of `push` into
  `loadProductFiles`.

_`@gmc-cli/cli` → 0.9.2 (patch); supporting packages unchanged._

## v0.9.1 — feeds push

Feeds as code, part 2 — the round-trip closes. First release under the patch-per-deliverable scheme: we hold `0.9.x` until everything is stable, then `1.0.0` at launch.

- **feeds** — `gmc feeds push --dir <path> --data-source <id>` applies a directory
  of pulled product files back to a target data source (the inverse of `pull`).
  The target is always explicit — pulled files don't record their origin source.
- **error semantics** — an invalid local file is skipped and tallied (exit `1`, the
  rest of the directory still applies); an API rejection aborts the run (exit `5`,
  and inserts are idempotent, so re-running after a fix is safe).

_`@gmc-cli/cli` → 0.9.1 (patch); supporting packages unchanged._

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
