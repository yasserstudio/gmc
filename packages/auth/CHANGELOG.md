# @gmc-cli/auth

## 0.7.3

### Patch Changes

- 39cb4ef: Add `gmc ordertracking` (Order Tracking sub-API, `ordertracking/v1`) — submit order tracking signals so Google can show accurate delivery estimates. The sub-API is write-only: `gmc ordertracking create --file <signal.json>` (or stdin) posts an `OrderTrackingSignal`; there is no get/list/update/delete (signals are immutable once created). Reads required fields (orderId, shippingInfo, lineItems) and validates them offline before the call, strips the output-only `orderTrackingSignalId`, and supports `--merchant-id` to attribute a signal on behalf of another business. This is the last remaining GA (v1) Merchant API sub-API, completing the v1 surface.

## 0.7.2

### Patch Changes

- abe94bd: feat(notifications): subscribe to change events via `gmc notifications`

  New `notifications/v1` sub-API: `NotificationsService` (list/get/create/update/delete) and a
  `gmc notifications` command group for **webhook** notification subscriptions — when a registered
  event fires (currently product-status changes), the Merchant API POSTs to your `callBackUri`.

  - `gmc notifications create --callback-uri <https-url> (--all-managed-accounts | --target-account <id>) [--event …]` — the id is auto-generated; the callback must be HTTPS; exactly one target is required.
  - `list` / `get` / `update <id>` (patch, derived `updateMask`) / `delete <id>`.

  Adds `notifications` as a new rate-limit bucket and OAuth-scope entry (8th sub-API).

## 0.7.1

### Patch Changes

- f87e76e: feat(migrate): `gmc migrate scopes` — Content API → Merchant API auth migration (Phase 5, v0.9.6)

  Introduces the new `@gmc-cli/migrate` engine and the `gmc migrate` command group, opening Phase 5 — the Content API for Shopping → Merchant API assistant (the Content API retires Aug 18, 2026).

  `gmc migrate scopes` does two things:
  - **Audits auth readiness.** The Merchant API uses the same OAuth scope as the Content API (`auth/content`), so existing tokens keep working with no re-consent — the report makes that explicit and maps the per-sub-API scope model for when Google ships granular scopes. The real blockers (GCP project registration + Merchant API enablement) are checked with a best-effort live probe, the same one behind `gmc doctor`; it degrades to a warning mid-migration rather than failing.
  - **Migrates a legacy config.** `--from merchant-info.json` (or `-a <id>`) seeds a `gmc` profile. Dry-run by default; `--write` applies it, `--set-default` makes it the default. It's an assistant, not a CI gate — advisory findings still exit `0`.

  `@gmc-cli/config` gains `saveConfig` and `upsertProfile` — the first config-writing API, with atomic, owner-only writes that preserve existing profiles. `@gmc-cli/auth` adds the `datasources` sub-API to `SubApi` (aligning with `@gmc-cli/api`) and exports a canonical `SUB_APIS` list.
