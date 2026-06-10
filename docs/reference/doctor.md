# gmc doctor

Diagnose authentication, GCP registration, and Merchant API access. Each step is reported as a check, so you get a full diagnosis rather than a bail-out on the first failure — and so it catches the silent GCP-registration / API-not-enabled trap.

```sh
gmc doctor
gmc doctor --json
```

## What it checks

1. **Credentials resolved** — a credential is found and an identity read (offline).
2. **Access token acquired** — the credential mints a valid token (network).
3. **Account configured** — informational; warns if no account id is set.
4. **Merchant API access** — probes the API and interprets the result, including the `SERVICE_DISABLED` ("API not enabled") and empty-result ("not linked") traps.

## Exit codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| `0`  | All checks passed (warnings allowed) |
| `1`  | A non-auth problem was found         |
| `3`  | Authentication failed                |

## JSON output

`--json` emits the full report — `ok`, `exitCode`, `profile`, `accountId`, `identity`, and the `checks` array (`id`, `title`, `status`, `detail`, `suggestion`) — so CI can branch on individual checks.

```sh
gmc doctor --json | jq '.checks[] | select(.status != "pass")'
```
