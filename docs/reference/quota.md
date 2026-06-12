# gmc quota

**Inspect your Merchant API call quota and usage** (`quota/v1` `accounts.quotas`). Read-only — see how
many daily calls each method group has used against its limit, so you can gauge your rate-limit
headroom in CI/ops. Targets the account resolved from `--account` / `GMC_ACCOUNT_ID` / your profile.

```sh
gmc quota list
gmc quota list --json | jq '.quotas[] | { name, quotaUsage, quotaLimit }'
```

```
3 quota group(s):
  products   12/1000000 daily · 1000/min
  reports    50/10000   daily · 100/min
  accounts   4/5000     daily · 100/min
```

## Output

Each row is a method group: `group  used/limit daily · perMinute/min`. The daily counters reset at
**12:00 UTC**. `--json` emits `{ "quotas": [...] }` — the raw `QuotaGroup`s, including `methodDetails`
(the individual methods each group covers, with their `path`). The quota counts are integers returned
as strings.

## Exit codes

`2` if no account is given or it is not numeric · `3` auth · `5` Merchant API.
