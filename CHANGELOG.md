# Changelog

The public progress log for **gmc** — the Google Merchant Center CLI.

`0.x` is the pre-release series through the spike and build-out; `1.0.0` lands at
public launch. Versions track [`@gmc-cli/cli`](packages/cli) (the `gmc` command);
supporting packages version independently. From v0.8 on, each release is driven by
[Changesets](.changeset) and tagged.

## v1.0.0 — first stable release 🎉

**`gmc` is stable and published to npm** — `npm install -g @gmc-cli/cli`.

All nine build phases are complete and the tool has been through a full pre-launch audit
(quality · Google Merchant API `v1` alignment · docs coverage · security · packaging) and an
end-to-end smoke test against the published package.

- **Command surface** — `doctor`, `auth`, `config`, `accounts`, `products`, `datasources`,
  `feeds` (feeds-as-code: pull / push / diff), `preflight` (offline feed-compliance scanner),
  `migrate` (Content API → Merchant API), `inventory`, `promotions`, and `reports`, all on
  Merchant API `v1`.
- **Distribution** — self-contained `@gmc-cli/cli` (the workspace packages are bundled in;
  only `commander` and `google-auth-library` are runtime deps), plus a Homebrew tap
  (`brew install yasserstudio/tap/gmc`) and standalone macOS/Linux binaries attached to the
  GitHub release.
- **Contract** — uniform `--json` (bare payload on success, `{ ok: false, error }` on failure)
  and classed exit codes (`0`/`1`/`2`/`3`/`4`/`5`/`6`) across every command.

The `0.x` series (v0.0 → v0.9.19) is the public build log below.

_`@gmc-cli/cli` → 1.0.0._

## v0.9.19 — pre-v1 audit hardening

Phase 9, part 3 — the full pre-launch audit (5 parallel agents: quality · Google-API
alignment · docs coverage · security · packaging) + an offline smoke test, with the
findings actioned.

- **API alignment — `channel` removed (Merchant API v1).** v1 dropped the `channel` field
  from products, product inputs, and data sources, replacing it with a boolean
  `legacyLocal`. Product identity is now the 3-segment `{contentLanguage}~{feedLabel}~{offerId}`
  (a `local~` prefix marks legacy-local products). `productKey` / `productFileName` and the
  `migrate feed-labels` grouping drop the old channel segment — so `feeds diff` no longer
  mis-pairs products and `datasources create` no longer sends a removed field. **Flag change:**
  `gmc datasources create --channel <online|local>` → `--legacy-local` (boolean). `migrate
  products` maps a Content API `channel: "local"` to `legacyLocal: true`, flags unknown channels
  as dropped, and drops `online` (the v1 default).
- **Packaging — self-contained npm package.** The `@gmc-cli/cli` build now bundles the
  `@gmc-cli/*` workspace packages (a global / `npx` install resolves no internal packages at
  runtime) and ships no source maps; only `commander` and `google-auth-library` remain runtime
  dependencies. The `release` script builds before publishing.
- **Robustness.** `--days` and `--page-size` reject non-plain-integer / out-of-range values;
  `gmc config path` emits the `{ ok: false, error }` envelope on failure; `feeds push` reports
  its partial `pushed` count in the JSON failure envelope.
- **Security.** The release-binaries workflow passes the release tag via an environment
  variable instead of interpolating it into the shell.
- **Docs.** Removed the pre-release / run-from-source notices and "coming in Phase 4/5" hedges;
  refreshed the roadmap and README to reality; documented exit code `6`, `reports --page-size`,
  and the legacy-local model.

_`@gmc-cli/cli` → 0.9.19 (patch); `@gmc-cli/api` → 0.9.7, `@gmc-cli/core` → 0.7.10,
`@gmc-cli/preflight` → 0.1.8, `@gmc-cli/migrate` → 0.1.8 (all patch)._

## v0.9.18 — install paths: Homebrew tap + standalone binaries

Phase 9, part 2 — distribution.

- **Homebrew** — a tap formula (`HomebrewFormula/gmc.rb`); `brew install yasserstudio/gmc/gmc` installs
  the published `@gmc-cli/cli` npm package and links the `gmc` binary (Homebrew provides Node).
- **Standalone binaries** — a `release: published` workflow builds self-contained binaries (no Node
  required) for macOS/Linux (arm64 + x64) via Bun `--compile` and attaches them to each GitHub release.
  Deliberately not on tag push, so routine 0.9.x tags don't fire it.
- **Installation guide** — a new page documenting all four paths (npm · npx · Homebrew · binary), added
  to the guide sidebar.
- The Homebrew tarball `sha256` and the binary build both go live with the **first npm publish at v1.0**;
  the formula carries a placeholder sha until then.

_`@gmc-cli/cli` → 0.9.18 (patch); other packages unchanged._

## v0.9.17 — docs polish (SEO + 1.0 reference)

Phase 9, part 1 — launch prep.

- **SEO** — Open Graph / Twitter-card meta and a generated `sitemap.xml` for the docs site.
- **Landing** — feature cards refreshed to the full surface (offline preflight, Content API → Merchant
  API migrate, feeds-as-code, inventory/promotions/reports, and the CI Action + GitLab recipe).
- **Reference** — the `reports` row now lists all subcommands. The CLI reference covers all 12 command
  groups.

_`@gmc-cli/cli` → 0.9.17 (patch); other packages unchanged._

## v0.9.16 — GitLab CI recipe

Phase 8, part 3 — **Phase 8 complete**.

- **GitLab CI guide** — an offline `preflight` gate job (no credentials) and an authenticated job that
  uses `GMC_SERVICE_ACCOUNT` for env-var auth, via a GitLab **File-type CI/CD variable** holding the
  service-account key (read by path, so the key stays off the command line and out of logs).
- No code change — `GMC_SERVICE_ACCOUNT` (a key **file path** *or* **raw JSON**) already ships; this
  documents the CI recipe for it.

_`@gmc-cli/cli` → 0.9.16 (patch); other packages unchanged._

## v0.9.15 — gmc-action (GitHub Action)

Phase 8, part 2 — CI gating.

- **`gmc-action`** — a composite GitHub Action (`action.yml`). `uses: yasserstudio/gmc@v1` runs any
  gmc command (default `preflight`) and propagates its exit code, so a feed-compliance gate fails the
  build before a bad feed ships. `preflight` runs offline; authenticated commands take a
  service-account key via the `credentials` secret (written to a `0600` temp file, wired to ADC).
- Inputs flow through environment variables (not `${{ }}` interpolation), so a crafted `args` can't
  inject shell. Documented with a sample workflow in the guide. Goes live with the npm publish at v1.0.

_`@gmc-cli/cli` → 0.9.15 (patch); other packages unchanged._

## v0.9.14 — uniform `--json` contract

Phase 8, part 1 — JSON/exit-code hardening across all commands.

- **Uniform `--json`** — `gmc auth` (`whoami`/`login`/`test`/`logout`) and `gmc config`
  (`path`/`list`/`current`) used to wrap success in `{ "ok": true, … }`; every other command prints
  the payload bare. They now print bare too, so the contract is uniform across all 13 command groups:
  **bare payload on success, `{ "ok": false, "error": {…} }` on failure.** (Domain `ok` fields on
  `doctor`/`preflight`/`migrate scopes`/`reports check` are verdicts, not the envelope — unchanged.)
- **exit codes** — the reference now documents `1` (a gating check failed) alongside `2` usage / `3`
  auth / `4` config / `5` Merchant API / `6` preflight.

_`@gmc-cli/cli` → 0.9.14 (patch); other packages unchanged._

## v0.9.13 — reports: CI threshold gate

Phase 7, part 3 — **Phase 7 complete**.

- **`gmc reports check --metric <clicks|impressions|conversions|ctr> [--min] [--max]`** — aggregates
  `product_performance_view` over a window and **exits non-zero when the metric breaches the
  threshold**, so a Shopping performance regression fails CI (mirrors the GPC vitals gate). `ctr` is a
  0–1 fraction; aggregation is client-side (sums for counts, clicks ÷ impressions for CTR).
  `--json` emits a `{ metric, value, min, max, ok, since, until }` verdict.

_`@gmc-cli/cli` → 0.9.13 (patch); other packages unchanged._

## v0.9.12 — reports: competitive visibility + price competitiveness

Phase 7, part 2 — two more report presets.

- **`gmc reports competitive-visibility --country <c> --category <id>`** — your domain's visibility
  vs competitors (rank, relative visibility, page overlap, higher-position rate) from
  `competitive_visibility_competitor_view`. Country + category are required; `--traffic-source`
  (`ADS`/`ORGANIC`/`ALL`, default `ADS`) and a date window (`--days`/`--since`/`--until`).
- **`gmc reports price-competitiveness [--country]`** — your prices vs the category benchmark per
  product, from `price_competitiveness_product_view`.

_`@gmc-cli/cli` → 0.9.12, `@gmc-cli/api` → 0.9.6 (patch); `@gmc-cli/core`/`migrate`/`preflight` cascade._

## v0.9.11 — reports: query + performance

Phase 7, part 1 — the reports sub-API (`reports/v1`, Merchant Center Query Language).

- **`gmc reports performance`** — product clicks, impressions, CTR, and conversions from
  `product_performance_view` over a date window (`--days`, default 30, or `--since`/`--until`),
  rendered as a date-sorted table or `--json`.
- **`gmc reports query <mcql>`** — run any MCQL query and print the rows (NDJSON) or `--json` — the
  escape hatch for views the presets don't cover.
- **`@gmc-cli/api`** gains `ReportsService.search`, which POSTs the MCQL query and paginates with the
  `pageToken` in the request body (the reports API doesn't use query params for paging).

_`@gmc-cli/cli` → 0.9.11, `@gmc-cli/api` → 0.9.5 (patch); `@gmc-cli/core`/`migrate`/`preflight` take the
internal-dependency patch cascade._

## v0.9.10 — Merchant API v1 + promotions

Phase 6, part 2 — closes Phase 6. Two alignment-critical changes.

- **Target Merchant API v1.** The Merchant API `v1beta` was **shut down on 2026-02-28**; every
  sub-API now targets the stable **v1** endpoint (`products/v1`, `accounts/v1`, `datasources/v1`,
  `inventories/v1`, `promotions/v1`) and `gmc doctor`'s probe hits `accounts/v1`. Paths are otherwise
  unchanged — just the version segment, so live calls reach a supported endpoint.
- **`gmc promotions`** — manage Merchant Center promotions (discounts/offers). `gmc promotions
  list|get|insert`; `insert` reads the `Promotion` JSON from `--file`/stdin and requires
  `--data-source`. The promotions API takes `{ promotion, dataSource }` as the request body (verified
  against the v1 reference). No delete — promotions expire.

_`@gmc-cli/cli` → 0.9.10, `@gmc-cli/api` → 0.9.4 (patch); `@gmc-cli/core`/`migrate`/`preflight` take the
internal-dependency patch cascade; other packages unchanged._

## v0.9.9 — inventory: local + regional

Phase 6, part 1 — the breadth build-out begins with the **inventories sub-API**: per-store
(**local**) and per-region (**regional**) overrides of a product's price/availability.

- **`gmc inventory local|regional list|insert|delete <product>`** — set a product's stock/price
  for a specific store (`storeCode`) or region. `insert` takes convenience flags
  (`--store-code`/`--region`, `--availability`, `--quantity`, `--price` + `--currency`) layered over
  an optional `--file` JSON base, so "mark store S1 out of stock" is one line. It's an upsert that
  **replaces** the whole entry (unsent fields are cleared) — the output says so.
- **`@gmc-cli/api`** gains `InventoriesService` (mirrors `ProductsService`); `toMicros` (decimal →
  micros) moves here next to the `Price` type it produces, re-exported from `@gmc-cli/migrate` for
  compatibility. The shared `formatPrice` render helper moves to `_shared.ts`.

_`@gmc-cli/cli` → 0.9.9, `@gmc-cli/api` → 0.9.3 (patch); `@gmc-cli/core`/`migrate`/`preflight` take the
internal-dependency patch cascade; other packages unchanged._

## v0.9.8 — migrate: feed-labels

Phase 5, part 3 — **Phase 5 complete**. The feed-label transfer check: the silent
campaign-killer caught before it strikes.

- **`gmc migrate feed-labels`** — Google Ads Shopping campaigns serve products by their
  feed identity `(channel, feedLabel, contentLanguage)` — the tuple a primary data source is
  keyed by. After migration, a product whose feed identity matches no data source lands in a
  feed no campaign targets and silently stops serving. This check catches it before push.
- **offline** — groups the feed by identity, flags products with no `feedLabel`, and warns on
  case variants (`US` vs `us`, which Merchant Center treats as different feeds).
- **live cross-check** — with an account configured, lists the account's primary data sources
  and flags any group that matches none; `--remote` checks the live catalog. Degrades to
  offline analysis when no account is available.
- **CI gate** — like [`preflight`](/reference/preflight), exits non-zero on error findings;
  `--strict` folds warnings in. Prints a feed-label distribution table or `--json`.
- **Phase 5 complete** — `scopes` + `products` + `feed-labels` cover the full Content API →
  Merchant API move: auth, product data, and the feed-label safety net.

_`@gmc-cli/cli` → 0.9.8, `@gmc-cli/migrate` → 0.1.3 (both patch); other packages unchanged._

## v0.9.7 — migrate: products

Phase 5, part 2 — the heart of the migration: converting product **data**.

- **`gmc migrate products`** — transforms Content API for Shopping v2.1 product JSON into
  push-ready Merchant API `ProductInput` files, so the output drops straight into
  [`feeds push`](/reference/feeds) and [`preflight`](/reference/preflight) — completing the
  migrate → validate → upload pipeline.
- **`--from <dir>`** of per-product files or **`--file`** for a single product, a JSON array,
  or a `products.list` response; **`--out <dir>`** (default `feeds`) of files named like
  `feeds pull`, plus a migration report (or `--json`).
- **the remaps** — price `{value, currency}` → `{amountMicros, currencyCode}` (BigInt, no float
  error; also `salePrice` and nested `shipping[].price`); `availability` enum spaces → underscores
  (`in stock` → `in_stock`); `targetCountry` → `feedLabel`; the Content API REST `id` parsed to
  backfill identity, then dropped along with the other output-only fields.
- **CI gate** — exits non-zero if any product can't be converted (the good ones are still written).
- **internal** — the transform engine lands in `@gmc-cli/migrate` (now depending on `@gmc-cli/api`
  for the product types); the per-product filename helper is shared with `feeds pull`.

_`@gmc-cli/cli` → 0.9.7, `@gmc-cli/migrate` → 0.1.2 (both patch); other packages unchanged._

## v0.9.6 — migrate: scope swap

Phase 5, part 1 — opens the **Content API for Shopping → Merchant API** migration
assistant (the Content API retires **Aug 18, 2026**).

- **`gmc migrate scopes`** — audits Content API → Merchant API auth readiness, then
  optionally migrates a legacy config into a `gmc` profile. Dry-run by default; `--write`
  applies it, `--set-default` makes the profile default.
- **the scope, in one line** — the Merchant API uses the *same* OAuth scope as the
  Content API, so existing tokens keep working with no re-consent. The real blockers
  (GCP project registration + Merchant API enablement) are checked with the same live
  probe behind `gmc doctor`; the audit degrades gracefully when run mid-migration.
- **config migration** — `--from merchant-info.json` (or `--account`) seeds a profile,
  backed by the first config-write API in `@gmc-cli/config` (`saveConfig` / `upsertProfile`,
  atomic and owner-only).
- **new package** — `@gmc-cli/migrate`, a pure engine (no network / fs / auth) mirroring
  `@gmc-cli/preflight`. `@gmc-cli/auth` adds the `datasources` sub-API (aligning with
  `@gmc-cli/api`) and exports a canonical `SUB_APIS`.

_`@gmc-cli/cli` → 0.9.6; `@gmc-cli/migrate` → 0.1.1 (new); `@gmc-cli/auth`, `@gmc-cli/config`
→ 0.7.1, `@gmc-cli/api` → 0.9.2, `@gmc-cli/core` → 0.7.5, `@gmc-cli/preflight` → 0.1.3 (all patch)._

## v0.9.5 — policy / disapproval-trigger checks

Phase 4, part 3 — **Phase 4 complete**. `gmc preflight` now predicts editorial
*disapprovals*, not just schema errors, so it catches a real rejection offline before upload.

- **policy** — a new `policy.*` rule family of heuristics: `promotional-title` (an
  **error** — promotional text like "free shipping" / "20% off" / "best price" in the
  title), plus warnings for `title-caps` (SHOUTING, Unicode-aware), `title-symbols`
  (emoji / repeated punctuation / decorative glyphs), `phone-in-title` (formatted phone
  numbers), and `link-https` (an `http` landing page).
- **tunable** — heuristics are conservative and fully overridable in `.gmcpreflightrc`;
  warnings don't gate a run unless you pass `--strict`.
- **no engine change** — the rules slot into the same registry; the CLI, `--json`, and
  config are rule-agnostic.

_`@gmc-cli/cli` → 0.9.5, `@gmc-cli/preflight` → 0.1.2 (patch); other packages unchanged._

## v0.9.4 — preflight rule library

Phase 4, part 2 — the offline scanner grows from 3 seed rules to 18.

- **required** — `description`, `link`, `image_link`, `availability` join the seed
  `offer-id`/`title`/`price` as gating errors. `condition` and `identifier-exists`
  (none of `gtin`/`mpn`/`brand`) are warnings — recommended, not always rejected.
- **format** — present-but-malformed checks: `link`/`image_link` URLs, `price` amount
  and currency, `availability`/`condition` enums (errors); GTIN check-digit and
  title/description length limits (warnings). A `format.*` rule fires only when its
  attribute is present, so a missing value is reported once by its `required.*` rule.
- **robustness** — attribute values are read defensively (a non-string from a
  hand-edited feed is coerced, not thrown on) and echoed safely (control characters
  stripped, length capped).
- **internal** — `productKey` moves to `@gmc-cli/api` next to `ProductInput`;
  `loadProductFiles` reads the feed directory with bounded concurrency, preserving order.

_`@gmc-cli/cli` → 0.9.4, `@gmc-cli/api` → 0.9.1, `@gmc-cli/preflight` → 0.1.1 (all patch)._

## v0.9.3 — preflight engine

Phase 4, part 1 — a new offline compliance scanner.

- **preflight** — `gmc preflight` scans product files for Merchant Center compliance
  issues with no API call and no auth. `--dir` scans a directory of `feeds pull` files,
  `--file` one file, `--remote` the live catalog.
- **config** — `.gmcpreflightrc` (discovered by walking up, or via `--config`) sets
  per-rule severities, an `ignore` list, `targetCountry`, and `strict`; `--strict`
  treats warnings as failures.
- **findings** — each carries a severity, the offending attribute, a fix suggestion,
  and a docs link; grouped by product in human output, or a full report under `--json`.
- **exit code** — new `6` (`ExitCode.Preflight`) when gating findings exist, so CI
  fails before a bad feed uploads.

_`@gmc-cli/cli` → 0.9.3, new `@gmc-cli/preflight` → 0.1.0 (patch)._

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
