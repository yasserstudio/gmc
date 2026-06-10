# CLI reference

```
gmc [global options] <command> [subcommand] [args]
```

## Commands

| Command | Description |
|---------|-------------|
| [`gmc doctor`](/reference/doctor) | Diagnose auth, GCP registration, and Merchant API access |
| [`gmc auth`](/reference/auth) | Authenticate (`login` / `logout` / `whoami` / `test`) |
| [`gmc config`](/reference/config) | Inspect configuration and profiles (`path` / `list` / `current`) |
| [`gmc accounts`](/reference/accounts) | Inspect accounts (`list` / `get` / `info`) |
| [`gmc products`](/reference/products) | Manage products (`list` / `get` / `insert` / `delete`) |
| [`gmc datasources`](/reference/datasources) | Manage data sources / feeds (`list` / `get` / `create` / `delete`) |
| [`gmc inventory`](/reference/inventory) | Local + regional inventory overrides (`local` / `regional` · `list` / `insert` / `delete`) |
| [`gmc promotions`](/reference/promotions) | Manage promotions (`list` / `get` / `insert`) |
| [`gmc reports`](/reference/reports) | Query reports — MCQL `query` + `performance` |
| [`gmc feeds`](/reference/feeds) | Feeds as code (`pull` / `push` / `diff`) |
| [`gmc preflight`](/reference/preflight) | Offline feed-compliance scanner — catch disapprovals before upload |
| [`gmc migrate`](/reference/migrate) | Content API → Merchant API assistant (`scopes` / `products` / `feed-labels`) |

## Global options

| Flag | Description |
|------|-------------|
| `-j, --json` | Emit machine-readable JSON |
| `-p, --profile <name>` | Profile to use |
| `-a, --account <id>` | Account id (overrides the profile) |
| `--no-color` | Disable colored output |
| `-V, --version` | Print the version |
| `-h, --help` | Show help for a command |

See [Configuration & profiles](/guide/configuration) for how `--profile` / `--account` resolve, the environment variables, and the full exit-code table.

## JSON & exit codes

With `--json`, success prints the result payload bare; failures print `{ "ok": false, "error": { "code", "message", "suggestion" } }`. Exit codes are classed: `0` success, `2` usage, `3` auth, `4` config, `5` Merchant API, `6` preflight (gating compliance findings).
