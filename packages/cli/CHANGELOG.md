# @gmc-cli/cli

## 1.0.17

### Patch Changes

- e155184: Add `gmc accounts programs` — `list` / `get` / `enable` / `disable` an account's participation in Merchant Center programs (Free listings, Shopping ads, …) on `accounts/v1`. `get` surfaces the participation state, active regions, and any unmet requirements; `disable` requires `--yes`.

## 1.0.16

### Patch Changes

- 39cb4ef: Add `gmc ordertracking` (Order Tracking sub-API, `ordertracking/v1`) — submit order tracking signals so Google can show accurate delivery estimates. The sub-API is write-only: `gmc ordertracking create --file <signal.json>` (or stdin) posts an `OrderTrackingSignal`; there is no get/list/update/delete (signals are immutable once created). Reads required fields (orderId, shippingInfo, lineItems) and validates them offline before the call, strips the output-only `orderTrackingSignalId`, and supports `--merchant-id` to attribute a signal on behalf of another business. This is the last remaining GA (v1) Merchant API sub-API, completing the v1 surface.

## 1.0.15

### Patch Changes

- b157891: feat(action): preflight gate with inline PR annotations, job summary, and structured outputs

  The GitHub Action (`uses: yasserstudio/gmc@v1`) now runs preflight with:

  - Inline error/warning annotations on PR diffs, pinned to the source feed file
  - A job-summary table of all findings in the Actions run summary tab
  - Structured outputs (`ok`, `scanned`, `errors`, `warnings`, `report`) for downstream steps

  Non-preflight commands continue to pass through directly.

- 3e41613: Add `gmc mcp` — a Model Context Protocol server over stdio that exposes 12 tools (doctor, accounts, products, datasources, issues, quota, reports, preflight) to AI assistants like Claude Desktop, Cursor, and VS Code Copilot.
- 9b737de: Add 7 SEO preflight rules (`seo.*`) — title length, brand in title, differentiating attributes, description length, title≠description, brand in description, placeholder image detection. All default to `info` severity (non-gating); tune in `.gmcpreflightrc`.

## 1.0.14

### Patch Changes

- 754d7c9: feat(lfp): add `gmc lfp` (Merchant API lfp/v1) — completes 11/11 sub-APIs

  Adds the `lfp/v1` Local Feeds Partnership sub-API — the **11th and final** Merchant
  API sub-API gmc covers. This is a provider-side API: the scoped account is the LFP
  **provider**, and each resource names a **`targetAccount`** (the merchant it's for).

  `gmc lfp stores list | get | insert | delete`, `gmc lfp inventory insert`,
  `gmc lfp sales insert`, and `gmc lfp state get <merchant>`. Inserts take convenience
  flags (`--target-account`, `--store-code`, `--offer-id`, `--price`/`--currency`,
  `--quantity`, …) or a full `--file` body.

  New `LfpService` in `@gmc-cli/api` plus the `lfp` rate-limit bucket and OAuth-scope
  wiring. Resource shapes and the `:insert` colon-verb paths were verified against the
  `lfp_v1` discovery document.

## 1.0.13

### Patch Changes

- d8ff71c: feat(conversions): add `gmc conversions` (Merchant API conversions/v1)

  Adds the `conversions/v1` `accounts.conversionSources` sub-API — the 10th of 11
  Merchant API sub-APIs gmc covers. A conversion source links an account to a
  conversion-measurement origin: a **Merchant Center destination** or a **Google
  Analytics property link**.

  `gmc conversions list | get | create | update | delete | undelete`. `delete`
  soft-archives a source; `undelete` restores it. `create` takes `--ga-property`
  for a Google Analytics link or `--merchant-center --currency` for a Merchant
  Center destination (or `--file` for the full body, e.g. nested
  `attributionSettings`). `update` patches Merchant Center fields via a nested
  `updateMask` so the rest of the destination is untouched.

  New `ConversionsService` in `@gmc-cli/api` plus the `conversions` rate-limit
  bucket and OAuth-scope wiring. Field names and RPC paths verified against the
  `conversions_v1` discovery document.

## 1.0.12

### Patch Changes

- 8f0b94f: feat(accounts): add `developer-registration` commands and a doctor registration hint

  Adds `gmc accounts developer-registration` (`register` / `get` / `unregister`) for
  the Merchant API `accounts/v1` `developerRegistration` resource — the one-time step
  that registers the calling Cloud project with a Merchant Center account. Until it is
  done the API returns a `GCP project … is not registered with the merchant account`
  **401** even though the token is valid; previously gmc had no command for it, so the
  fix required a raw API call.

  `gmc doctor` now recognizes that "not registered" 401 and points at
  `gmc accounts developer-registration register` instead of suggesting
  re-authentication (the token is fine — the project just isn't registered).

  `register` accepts an optional `--developer-email`; `unregister` requires `--yes`.

## 1.0.11

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

## 1.0.10

### Patch Changes

- e6b111c: feat(issues): render account & product issues with `gmc issues`

  Adds the `issueresolution/v1` sub-API as `gmc issues` — a read-only window into the
  same problems Merchant Center surfaces, so you can see why an account is limited or a
  product disapproved without leaving the terminal:

  - `gmc issues account` renders account-level issues (`renderaccountissues`).
  - `gmc issues product <id>` renders item-level issues for one product
    (`renderproductissues`); accepts a bare product id or a full resource name.
  - `--language` / `--time-zone` localize the rendered content; `--json` emits the raw
    `RenderedIssue`s including the prerendered HTML and available actions.

  Each issue prints its severity (`DISAPPROVED` / `DEMOTED` / `NOT_IMPACTED`), impact
  message, and region/destination breakdown. This completes the diagnostics trio
  alongside `doctor` (access) and `preflight` (pre-upload). The allowlist-gated
  `triggeraction` write flow is intentionally not exposed.

  Adds `issueresolution` as the 9th Merchant API rate-limit bucket.

## 1.0.9

### Patch Changes

- 86e2438: feat(quota): inspect API call quota with `gmc quota list`

  New read-only `QuotaService` (`quota/v1` `accounts.quotas`) and a `gmc quota list` command — show the
  daily Merchant API call quota and usage per method group (with the per-minute limit), so you can see
  your rate-limit headroom in CI/ops. `--json` emits the raw `QuotaGroup`s (including `methodDetails`).
  The `quota` sub-API bucket and scope were already wired, so this is the service + command only.

## 1.0.8

### Patch Changes

- abe94bd: feat(notifications): subscribe to change events via `gmc notifications`

  New `notifications/v1` sub-API: `NotificationsService` (list/get/create/update/delete) and a
  `gmc notifications` command group for **webhook** notification subscriptions — when a registered
  event fires (currently product-status changes), the Merchant API POSTs to your `callBackUri`.

  - `gmc notifications create --callback-uri <https-url> (--all-managed-accounts | --target-account <id>) [--event …]` — the id is auto-generated; the callback must be HTTPS; exactly one target is required.
  - `list` / `get` / `update <id>` (patch, derived `updateMask`) / `delete <id>`.

  Adds `notifications` as a new rate-limit bucket and OAuth-scope entry (8th sub-API).

## 1.0.7

### Patch Changes

- 5f1f9bd: feat(datasources): complete the group with `update` and `fetch`

  `DataSourcesService` gains `updateDataSource` (PATCH + derived `updateMask`) and `fetchDataSource`
  (`dataSources:fetch`), and `gmc datasources` gets the matching commands:

  - `gmc datasources update <id> --name <n> | --file <path> [--update-mask <fields>]` — patch a data source; output-only fields in a `--file` body are stripped so a saved `get` body re-applies cleanly.
  - `gmc datasources fetch <id>` — trigger an immediate fetch of a scheduled file feed (file-input sources only).

  Fills the two commands the docs previously marked "not yet implemented".

## 1.0.6

### Patch Changes

- c7ea8a4: feat(accounts): business-identity, autofeed, shipping & return-policies sub-resources

  Fills the remaining `accounts/v1` sub-resources. `AccountsService` gains get/update for
  `businessIdentity` and `autofeedSettings`, get/insert for `shippingSettings`, and
  list/get/create/delete for `onlineReturnPolicies`. New `gmc accounts` sub-groups:

  - `accounts business-identity get|update` — diversity/identity attributes (`--promotions-consent`, `--black-owned`/`--women-owned`/`--veteran-owned`/`--latino-owned`/`--small-business <yes|no>`).
  - `accounts autofeed get|update` — `--enable-products <bool>`.
  - `accounts shipping get|set` — read or replace the shipping-settings singleton (the `--file` body must carry the `etag` from `get`).
  - `accounts return-policies list|get|create|delete` — manage online return policies (the id is auto-generated on create; bodies via `--file`/stdin).

## 1.0.5

### Patch Changes

- 6e77f83: feat(accounts): account lifecycle — `gmc accounts create` and `delete`

  `AccountsService` gains `createAccount` (`accounts:createAndConfigure`) and `deleteAccount`, and the
  `gmc accounts` group gets `create` and `delete`. `create` builds the request from `--name` /
  `--time-zone` / `--language` / `--adult-content` plus `--aggregator <id>` (the standard sub-account
  service), or a full body via `--file` (kept whole, so `user[]` / `setAlias[]` round-trip).
  `delete <accountId>` is **irreversible**: the id is required (no profile fallback) and `--yes` must
  be passed to confirm; `--force` maps to the API's force (delete an account with sub-accounts or
  processed offers). Completes the account-management surface.

## 1.0.4

### Patch Changes

- a227644: feat(accounts): manage account access with `gmc accounts users`

  `AccountsService` gains user CRUD (`listUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`)
  and a new `gmc accounts users` sub-group — `list` / `get` / `add` / `update` / `remove` — to manage
  who can access the account and their access rights (`STANDARD`, `READ_ONLY`, `ADMIN`,
  `PERFORMANCE_REPORTING`, `API_DEVELOPER`). The user's email is the id (`me` resolves to the calling
  user); `add` supplies it as the `userId` query param like `regions create`. Completes the account
  profile/access surface alongside v1.0.3's profile writes.

## 1.0.3

### Patch Changes

- b546891: feat(accounts): manage the account profile — `update`, `business-info update`, and `homepage set` / `claim` / `unclaim`

  `AccountsService` gains write methods (`updateAccount`, `updateBusinessInfo`, `updateHomepage`,
  `claimHomepage`, `unclaimHomepage`) and the `gmc accounts` group — until now read-only — can edit
  the same profile `accounts info` reads. `update` patches account fields (`--name`,
  `--adult-content`, `--time-zone`, `--language`), `business-info update` patches the business address
  / customer service from `--file` (the output-only `phone` is ignored), and `homepage set` / `claim`
  / `unclaim` manage the store URI and its claim status. Writes patch only the fields you pass
  (deriving the `updateMask`, or set it with `--update-mask`), mirroring `gmc regions`.

## 1.0.2

### Patch Changes

- 480c4f5: feat(regions): add `gmc regions` — define geographic regions for regional inventory and shipping

  New `RegionsService` (Merchant API `accounts/v1` `accounts.regions`) and a `gmc regions`
  command group with full CRUD: `list` / `get` / `create` / `update` / `delete`. A region is
  defined by a postal-code area (`--postal-codes` + `--region-code`), a geotarget area
  (`--geotarget-ids`), or a radius area (via `--file`); `update` patches only the fields you pass
  (deriving the `updateMask`, or set it with `--update-mask`). This fills the gap behind
  `gmc inventory regional`, which requires a region defined for the account.

## 1.0.1

### Patch Changes

- df30bcb: `reports` now rejects shape-valid but impossible `--since`/`--until` dates (e.g.
  `2026-13-45`, `2026-02-30`) with a clear usage error, instead of letting them silently
  roll over into a wrong window.

## 1.0.0

### Major Changes

- **v1.0.0 — first stable release.** All nine build phases are complete and the tool has
  been through a full pre-launch audit (quality · Google Merchant API v1 alignment · docs ·
  security · packaging) and an end-to-end smoke test. `gmc` is published to npm as the
  self-contained `@gmc-cli/cli` (install `npm i -g @gmc-cli/cli`); the command surface spans
  `doctor`, `auth`, `config`, `accounts`, `products`, `datasources`, `feeds`, `preflight`,
  `migrate`, `inventory`, `promotions`, and `reports`, all on Merchant API `v1`.

## 0.9.19

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

## 0.9.18

### Patch Changes

- 8354855: Add install paths beyond npm: a Homebrew tap (`brew install yasserstudio/gmc/gmc`,
  formula in `HomebrewFormula/`) and self-contained standalone binaries (no Node
  required) for macOS/Linux, built by a `release: published` workflow and attached to
  each GitHub release. New **Installation** guide documents all four paths
  (npm · npx · Homebrew · binary). These distribution channels go live with the
  npm publish at v1.0 — the formula's tarball `sha256` and the binary build both
  activate at first publish.

## 0.9.17

### Patch Changes

- b521c4a: docs: SEO + 1.0 reference polish (Phase 9, v0.9.17)

  Pre-launch docs polish. Adds Open Graph / Twitter-card meta and a generated `sitemap.xml` to the VitePress site; refreshes the landing page's feature cards to cover the now-complete surface (preflight, migrate, feeds-as-code, inventory/promotions/reports, and the CI Action/recipe); and corrects the reference index's `reports` row to list all subcommands. No code change.

## 0.9.16

### Patch Changes

- 3122aaa: docs: GitLab CI recipe + env-var auth (Phase 8, v0.9.16)

  Closes Phase 8. Adds a GitLab CI guide: an offline `preflight` gate job (no credentials) and an authenticated job that uses the existing **`GMC_SERVICE_ACCOUNT`** env-var auth — a GitLab **File-type CI/CD variable** holding the service-account key, which `gmc` reads by path (keeping the key off the command line and out of logs). No code change — env-var auth (file path _or_ raw JSON via `GMC_SERVICE_ACCOUNT`) already ships; this documents the CI recipe for it.

  With the GitHub Action (v0.9.15), Phase 8 (CI/CD) is complete. Next: Phase 9 — docs polish, Homebrew + standalone binary, brand/marketing — then the full pre-launch audit + smoke test → v1.0.0.

## 0.9.15

### Patch Changes

- b51ba75: feat: gmc-action — a GitHub Action with a preflight gate (Phase 8, v0.9.15)

  Adds a composite GitHub Action (`action.yml`) so `gmc` runs in CI: `uses: yasserstudio/gmc@v1` runs any gmc command (default `preflight`) and propagates its exit code, so a feed-compliance gate fails the build before a bad feed ships. `preflight` runs offline (no auth); authenticated commands take a service-account key via the `credentials` secret (written to a temp file, `0600`, wired to ADC).

  Inputs flow through environment variables rather than `${{ }}` interpolation in the run step, so a crafted `args` can't inject shell. Documented in the guide (with a sample workflow). The Action invokes the published `@gmc-cli/cli`, so it goes fully live with the npm publish at v1.0.

## 0.9.14

### Patch Changes

- 50cf6f2: fix(cli): uniform `--json` success envelope across all commands (Phase 8, v0.9.14)

  Hardens the `--json` contract ahead of v1. `gmc auth` (`whoami`/`login`/`test`/`logout`) and `gmc config` (`path`/`list`/`current`) wrapped their success output in `{ "ok": true, … }`; every other command prints the result payload **bare**. They now print bare too, matching the documented contract and the other 10 command groups — so `--json` is uniform: bare payload on success, `{ "ok": false, "error": {…} }` on failure.

  (Domain `ok` fields on `doctor`/`preflight`/`migrate scopes`/`reports check` payloads are unchanged — those are verdicts, not the envelope.) The exit-code table in the reference now also documents `1` (a gating check failed). No behavior change beyond the JSON shape of those seven subcommands.

## 0.9.13

### Patch Changes

- bdf938c: feat(reports): `gmc reports check` — CI threshold gate (Phase 7, v0.9.13)

  Closes Phase 7. `gmc reports check --metric <clicks|impressions|conversions|ctr> [--min <n>] [--max <n>] [--days/--since/--until]` aggregates `product_performance_view` over a window and **exits non-zero when the metric breaches the threshold** — so a Shopping performance regression fails CI (mirrors the GPC vitals gate). `--json` emits a `{ metric, value, min, max, ok, since, until }` verdict.

  CLI-only (reuses `ReportsService` + the verified performance query; aggregation is client-side — sums for counts, `clicks/impressions` for CTR). With v0.9.11–12, Phase 7 (reports) is complete. Next: Phase 8 — CI/CD (JSON/exit-code hardening, `gmc-action`, GitLab recipe).

## 0.9.12

### Patch Changes

- ba9415f: feat(reports): competitive visibility + price competitiveness (Phase 7, v0.9.12)

  Two more `gmc reports` presets on the reports sub-API:
  - **`gmc reports competitive-visibility --country <c> --category <id>`** — how your domain's visibility compares to competitors (`competitive_visibility_competitor_view`): rank, relative visibility, page-overlap and higher-position rates. Country + category are required (the view mandates them); `--traffic-source` (ADS/ORGANIC/ALL, default ADS) and a date window (`--days`/`--since`/`--until`).
  - **`gmc reports price-competitiveness [--country <c>]`** — your prices vs the category benchmark per product (`price_competitiveness_product_view`; `price`/`benchmark_price` are amounts).

  `@gmc-cli/api`'s `ReportRow` gains typed `competitiveVisibilityCompetitorView` and `priceCompetitivenessProductView` views. All column names and required filters verified against the Merchant API reports guides. Next: v0.9.13 — CI threshold alerting.

- Updated dependencies [ba9415f]
  - @gmc-cli/api@0.9.6
  - @gmc-cli/core@0.7.9
  - @gmc-cli/migrate@0.1.7
  - @gmc-cli/preflight@0.1.7

## 0.9.11

### Patch Changes

- 205a9e4: feat(reports): `gmc reports` — MCQL query + product performance (Phase 7, v0.9.11)

  Opens Phase 7 (reports) with the Merchant API reports sub-API (`reports/v1`).
  - **`@gmc-cli/api`** gains `ReportsService.search(query, { pageSize })` — runs a Merchant Center Query Language (MCQL) query via `POST reports/v1/.../reports:search`, paginating with the `pageToken` in the request body (not a query param) and collecting `results`.
  - **`gmc reports performance`** — product clicks/impressions/CTR/conversions from `product_performance_view` over a window (`--days` default 30, or `--since`/`--until`), rendered as a date-sorted table or `--json`.
  - **`gmc reports query <mcql>`** — run any MCQL query; prints rows (NDJSON) or `--json`. The escape hatch for views the presets don't cover.

  Next in Phase 7: competitive visibility + price insights (v0.9.12), then CI threshold alerting (v0.9.13).

- Updated dependencies [205a9e4]
  - @gmc-cli/api@0.9.5
  - @gmc-cli/core@0.7.8
  - @gmc-cli/migrate@0.1.6
  - @gmc-cli/preflight@0.1.6

## 0.9.10

### Patch Changes

- cd3426f: fix(api): target Merchant API **v1**; feat: `gmc promotions` (Phase 6, v0.9.10)

  **Critical alignment fix:** the Merchant API `v1beta` was shut down on Feb 28, 2026. Every sub-API now targets the stable **v1** endpoint — `products/v1`, `accounts/v1`, `datasources/v1`, `inventories/v1`, `promotions/v1` — and the `doctor` probe hits `accounts/v1`. Paths are otherwise unchanged; this is purely the version segment moving `v1beta` → `v1` so live calls reach a supported endpoint.

  **`gmc promotions`** (closes Phase 6) — manage Merchant Center promotions via the promotions sub-API:
  - `@gmc-cli/api` gains `PromotionsService` (`getPromotion` / `listPromotions` / `insertPromotion`); the API exposes insert/get/list (no delete — promotions expire). `insert` sends the `InsertPromotionRequest` body `{ promotion, dataSource }` (verified against the v1 reference — unlike `productInputs.insert`, dataSource is a body field, not a query param).
  - `gmc promotions list|get|insert` — `insert` reads the `Promotion` JSON from `--file`/stdin and requires `--data-source`.

  With `gmc inventory` (v0.9.9), Phase 6 (inventories + promotions) is complete. Next: Phase 7 — reports.

- Updated dependencies [cd3426f]
  - @gmc-cli/api@0.9.4
  - @gmc-cli/core@0.7.7
  - @gmc-cli/migrate@0.1.5
  - @gmc-cli/preflight@0.1.5

## 0.9.9

### Patch Changes

- e7d90a0: feat(inventory): `gmc inventory` — local + regional inventory overrides (Phase 6, v0.9.9)

  Opens Phase 6 (breadth) with the Merchant API inventories sub-API: per-store (**local**) and per-region (**regional**) overrides of a product's price/availability, so Shopping shows the right stock and price per location.
  - **`@gmc-cli/api`** gains `InventoriesService` (`listLocal`/`insertLocal`/`deleteLocal` + the regional trio), mirroring `ProductsService` — both inventories are product sub-resources with list / insert (upsert, keyed by `storeCode` / `region`) / delete.
  - **`gmc inventory local|regional list|insert|delete <product>`**. Insert takes convenience flags (`--store-code`/`--region`, `--availability`, `--quantity`, `--price`+`--currency`) layered over an optional `--file` JSON base — so "mark store S1 out of stock" is one line. `--price` converts a decimal to micros; `list` prints a table or `--json`.

  Region _definition_ (the accounts-sub-API `regions` resource) is a separate follow-up; `regional insert --region` references an existing region. Next in Phase 6: `gmc promotions` (v0.9.10).

- Updated dependencies [e7d90a0]
  - @gmc-cli/api@0.9.3
  - @gmc-cli/core@0.7.6
  - @gmc-cli/migrate@0.1.4
  - @gmc-cli/preflight@0.1.4

## 0.9.8

### Patch Changes

- e94a82c: feat(migrate): `gmc migrate feed-labels` — feed-label transfer check (Phase 5, v0.9.8)

  Closes Phase 5. Google Ads Shopping campaigns serve products by their feed identity `(channel, feedLabel, contentLanguage)` — the same tuple a primary data source is keyed by. After a Content API → Merchant API migration, a product whose feed identity matches no data source lands in a feed no campaign targets and silently stops serving. `gmc migrate feed-labels` catches that before push.
  - **Offline analysis** — groups the feed by feed identity, flags products with no `feedLabel`, and warns on case variants (`US` vs `us`, which Merchant Center treats as different feeds).
  - **Live cross-check** — when an account is resolved, lists the account's primary data sources and flags any group that matches none (the campaign-killer); also reports orphaned data sources. `--remote` checks the live catalog directly.
  - **CI gate** like `preflight` — exits non-zero on error findings; warnings gate only with `--strict`. Prints a feed-label distribution table (per group: product count + whether it matches a data source) or `--json`.

  The check lands in `@gmc-cli/migrate` (`checkFeedLabels`, pure). Together with `migrate scopes` (v0.9.6) and `migrate products` (v0.9.7), Phase 5 covers the full migration: auth, product data, and the feed-label safety net.

- Updated dependencies [e94a82c]
  - @gmc-cli/migrate@0.1.3

## 0.9.7

### Patch Changes

- dbd7901: feat(migrate): `gmc migrate products` — Content API v2.1 → Merchant API ProductInput (Phase 5, v0.9.7)

  Phase 5 part 2: convert real Content API for Shopping product data into push-ready Merchant API `ProductInput` files, so the output drops straight into `gmc feeds push` and `gmc preflight` — completing the migrate → validate → upload pipeline.

  `gmc migrate products`:
  - **Input** — `--from <dir>` of per-product Content API JSON, or `--file <path>` for a single product, a JSON array, or a `products.list` response (`{resources}`/`{products}`).
  - **Transform** — moves descriptive fields into `attributes`, keeps identity fields (`offerId`/`channel`/`contentLanguage`/`feedLabel`) at the top level, and remaps: price `{value,currency}` → `{amountMicros,currencyCode}` (BigInt, half-up at 6 dp; also `salePrice` and nested `shipping[].price`), `availability` enum spaces → underscores (`in stock` → `in_stock`), `targetCountry` → `feedLabel`, and the Content API REST `id` parsed to backfill identity then dropped. Output-only fields (`id`/`kind`/`source`) are dropped and reported.
  - **Output** — `--out <dir>` (default `feeds`) of `ProductInput` files named like `feeds pull`, plus a migration report (converted / remapped / dropped / warnings) or `--json`. Exits non-zero if any product can't be converted, so CI gates an incomplete migration.

  The transform engine lands in `@gmc-cli/migrate` (which gains a direct `@gmc-cli/api` dependency for the product types). The per-product filename helper is shared with `feeds pull` via `_shared.ts`.

- Updated dependencies [dbd7901]
  - @gmc-cli/migrate@0.1.2

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
