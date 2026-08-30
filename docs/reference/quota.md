# gmc quota

**Inspect Merchant API call quota and account resource limits** (`quota/v1` `accounts.quotas` and
`accounts.limits`). Read-only. Targets the account resolved from `--account` / `GMC_ACCOUNT_ID` /
your profile.

```sh
gmc quota list
gmc quota list --json | jq '.quotas[] | { name, quotaUsage, quotaLimit }'
gmc quota limits list
gmc quota limits get products~ADS_EEA
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

## `gmc quota limits`

`limits list` follows every page using Google's required default filter `type = "products"`.
Override it with `--filter <expression>`. `limits get <limit>` accepts a bare id such as
`products~ADS_EEA` or a full resource name. Human output shows the maximum product count and whether
it applies to the EEA or non-EEA ads scope; JSON returns the raw `AccountLimit` resource.

## Exit codes

`2` if no account is given or it is not numeric · `3` auth · `5` Merchant API.
