---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(quota): inspect API call quota with `gmc quota list`

New read-only `QuotaService` (`quota/v1` `accounts.quotas`) and a `gmc quota list` command — show the
daily Merchant API call quota and usage per method group (with the per-minute limit), so you can see
your rate-limit headroom in CI/ops. `--json` emits the raw `QuotaGroup`s (including `methodDetails`).
The `quota` sub-API bucket and scope were already wired, so this is the service + command only.
