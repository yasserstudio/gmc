# GitHub Action

`gmc` ships a composite GitHub Action so you can run any `gmc` command in CI — most usefully an
**offline feed-compliance preflight gate** that fails the build when a feed would be disapproved,
before it ever reaches Merchant Center. For `preflight`, the action adds **inline PR annotations**,
a **job summary table**, and **structured outputs** for downstream steps.

```yaml
# .github/workflows/feed-check.yml
name: Feed check
on: [pull_request]

jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: yasserstudio/gmc@v1
        with:
          args: "--dir feeds --strict"
```

`preflight` works **offline** on your committed feed files — no account or credentials needed.

## What you get

For `preflight` runs, the action provides three layers of feedback:

1. **Inline annotations** — errors and warnings appear directly on the PR diff, pinned to the source feed file when the filename matches the product's offer id (`feeds/{offerId}.json`).
2. **Job summary** — a Markdown table of all findings in the Actions run summary tab.
3. **Structured outputs** — `ok`, `scanned`, `errors`, `warnings`, and the full `report` JSON for downstream steps.

## Inputs

| Input               | Default     | Description                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------- |
| `command`           | `preflight` | The gmc command (e.g. `preflight`, `"reports check"`, `"feeds diff"`)      |
| `args`              | `""`        | Extra arguments, e.g. `--dir feeds --strict`                               |
| `account`           | `""`        | Merchant Center account id (`GMC_ACCOUNT_ID`) — for authenticated commands |
| `credentials`       | `""`        | A Google service-account key JSON — **pass a secret**, never inline        |
| `version`           | `latest`    | The `@gmc-cli/cli` version to run                                          |
| `working-directory` | `.`         | Where your feeds / `.gmcpreflightrc` live                                  |

## Outputs

When `command` is `preflight`, these outputs are set on the step:

| Output     | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `ok`       | `"true"` if preflight passed                                       |
| `scanned`  | Number of products scanned                                         |
| `errors`   | Number of errors found                                             |
| `warnings` | Number of warnings found                                           |
| `report`   | Full [`PreflightReport`](/reference/preflight#json-output) as JSON |

```yaml
- uses: yasserstudio/gmc@v1
  id: preflight

- if: steps.preflight.outputs.ok == 'false'
  run: |
    echo "Preflight found ${{ steps.preflight.outputs.errors }} error(s)"
    echo "Full report: ${{ steps.preflight.outputs.report }}"
```

## Authenticated commands

Commands that hit the API (`reports check`, `feeds diff`, `products list`, ...) need credentials. Store
a service-account key as a repository secret and pass it via `credentials` — the Action writes it to a
temporary file and points Application Default Credentials at it:

```yaml
- uses: yasserstudio/gmc@v1
  with:
    command: reports check
    args: "--metric clicks --min 1000"
    account: "123456789"
    credentials: ${{ secrets.GMC_SERVICE_ACCOUNT_KEY }}
```

Inputs are passed to the shell through environment variables (not interpolated into the command line),
so a crafted `args` can't inject shell. The key file is written `0600` and lives only in the runner's
temp dir.

::: tip Pin a version
`@v1` tracks the latest v1.x. Pin an exact release tag (e.g. `@v1.0.14`) for fully reproducible CI.
:::

See the full [action reference](/reference/action) for more examples.
