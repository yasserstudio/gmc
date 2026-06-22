---
description: "GitHub Action for GMC — run gmc preflight as a CI gate with inline PR annotations, job summaries, and structured outputs."
---

# GitHub Action

Run `gmc` in GitHub Actions. The primary use case is a **preflight gate** that catches product feed disapprovals on every PR — with inline annotations, a job summary table, and structured outputs for downstream steps.

```yaml
- uses: yasserstudio/gmc@v1
```

## Quick start

Add this to `.github/workflows/preflight.yml`:

```yaml
name: Preflight
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

That's it. PRs that touch feed files get inline error annotations and a summary table. The step fails if any gating issue is found.

## Inputs

| Input               | Default     | Description                                                              |
| ------------------- | ----------- | ------------------------------------------------------------------------ |
| `command`           | `preflight` | The gmc command to run (e.g. `preflight`, `reports check`, `feeds diff`) |
| `args`              | `""`        | Extra arguments (e.g. `--dir feeds --strict`)                            |
| `account`           | `""`        | Merchant Center account id (sets `GMC_ACCOUNT_ID`)                       |
| `credentials`       | `""`        | Google service-account key JSON (pass a **secret**, never inline)        |
| `version`           | `latest`    | `@gmc-cli/cli` version to install (npm dist-tag or semver)               |
| `working-directory` | `.`         | Directory to run gmc in (where your feeds / `.gmcpreflightrc` live)      |

## Outputs (preflight only)

When `command` is `preflight`, the action sets structured outputs:

| Output     | Type   | Description                    |
| ---------- | ------ | ------------------------------ |
| `ok`       | string | `"true"` if preflight passed   |
| `scanned`  | string | Number of products scanned     |
| `errors`   | string | Number of errors found         |
| `warnings` | string | Number of warnings found       |
| `report`   | string | Full `PreflightReport` as JSON |

Use outputs in downstream steps:

```yaml
- uses: yasserstudio/gmc@v1
  id: preflight
  with:
    args: "--dir feeds"

- if: steps.preflight.outputs.ok == 'false'
  run: echo "${{ steps.preflight.outputs.errors }} errors found"
```

## Annotations and job summary

For `preflight`, the action:

1. **Inline annotations** — errors and warnings appear as annotations on the PR diff, pinned to the source feed file when the filename matches the product's offer id (`feeds/{offerId}.json`).
2. **Job summary** — a Markdown table of all findings appears in the Actions run summary tab.

## Authenticated commands

For commands that need Merchant API access (e.g. `products list`, `reports check`, `preflight --remote`), pass a service-account key as a secret:

```yaml
- uses: yasserstudio/gmc@v1
  with:
    command: reports check
    account: "123456789"
    credentials: ${{ secrets.GMC_SERVICE_ACCOUNT_KEY }}
    args: "--metric clicks --threshold 100 --window 7"
```

The action writes the key to a temp file and sets `GOOGLE_APPLICATION_CREDENTIALS`. The key is never logged.

## Configuration

Preflight respects [`.gmcpreflightrc`](/reference/preflight#configuration) — place it alongside your feed files (or in a parent directory) to override rule severities, ignore specific products, or set the target country.

## Examples

### Gate on warnings too

```yaml
- uses: yasserstudio/gmc@v1
  with:
    args: "--strict"
```

### Scan a specific directory

```yaml
- uses: yasserstudio/gmc@v1
  with:
    args: "--dir catalog/products"
```

### Run specific rules only

```yaml
- uses: yasserstudio/gmc@v1
  with:
    args: "--rule required.title --rule required.price"
```

### Non-preflight: run any gmc command

```yaml
- uses: yasserstudio/gmc@v1
  with:
    command: "feeds diff"
    account: "123456789"
    credentials: ${{ secrets.GMC_SERVICE_ACCOUNT_KEY }}
    args: "--dir feeds"
```
