---
"@gmc-cli/api": patch
"@gmc-cli/auth": patch
"@gmc-cli/cli": patch
---

feat(notifications): subscribe to change events via `gmc notifications`

New `notifications/v1` sub-API: `NotificationsService` (list/get/create/update/delete) and a
`gmc notifications` command group for **webhook** notification subscriptions — when a registered
event fires (currently product-status changes), the Merchant API POSTs to your `callBackUri`.

- `gmc notifications create --callback-uri <https-url> (--all-managed-accounts | --target-account <id>) [--event …]` — the id is auto-generated; the callback must be HTTPS; exactly one target is required.
- `list` / `get` / `update <id>` (patch, derived `updateMask`) / `delete <id>`.

Adds `notifications` as a new rate-limit bucket and OAuth-scope entry (8th sub-API).
