# Configuration & profiles

## Config file

gmc reads an optional JSON config from:

```
${GMC_CONFIG_DIR:-~/.config/gmc}/config.json
```

A **profile** selects a Merchant Center account (and, via stored OAuth, a credential). The file is a map of profiles plus an optional default:

```json
{
  "defaultProfile": "prod",
  "profiles": {
    "prod": { "accountId": "123456789" },
    "staging": { "accountId": "987654321" }
  }
}
```

Inspect it with the [`gmc config`](/reference/config) commands:

```sh
gmc config path      # where the config dir and file live
gmc config list      # configured profiles
gmc config current   # the profile resolved for this invocation
```

## Resolution order

The effective **profile** is resolved from, in order: `--profile`, `GMC_PROFILE`, the file's `defaultProfile`, then `"default"`.

The effective **account id** is resolved from: `--account`, `GMC_ACCOUNT_ID`, then the selected profile's `accountId`.

## Global options

Every command accepts these:

| Flag | Description |
|------|-------------|
| `-j, --json` | Emit machine-readable JSON instead of human output |
| `-p, --profile <name>` | Profile to use |
| `-a, --account <id>` | Merchant Center account id (overrides the profile) |
| `--no-color` | Disable colored output |
| `-V, --version` | Print the version |
| `-h, --help` | Show help |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `GMC_CONFIG_DIR` | Override the config/credential directory (default `~/.config/gmc`) |
| `GMC_PROFILE` | Select the profile |
| `GMC_ACCOUNT_ID` | Set the account id |
| `GMC_SERVICE_ACCOUNT` | Service-account key (file path or raw JSON) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service-account key file (Google standard) |

## Exit codes

Commands set a classed exit code so CI can branch on the failure type:

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic error |
| `2` | Usage (bad arguments/flags) |
| `3` | Authentication failure |
| `4` | Configuration failure |
| `5` | Merchant API failure |
| `6` | Preflight found gating compliance violations |

In `--json` mode, failures print a `{ "ok": false, "error": { … } }` envelope to stdout; success payloads print bare.
