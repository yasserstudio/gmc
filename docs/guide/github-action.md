# GitHub Action

`gmc` ships a composite GitHub Action so you can run any `gmc` command in CI — most usefully an
**offline feed-compliance preflight gate** that fails the build when a feed would be disapproved,
before it ever reaches Merchant Center.

```yaml
# .github/workflows/feed-check.yml
name: Feed check
on: [push, pull_request]

jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: yasserstudio/gmc@v1
        with:
          command: preflight
          args: --dir feeds --strict
```

`gmc`'s exit code becomes the step's exit code, so a gating finding fails the job. `preflight` works
**offline** on your committed feed files — no account or credentials needed.

## Inputs

| Input               | Default     | Description                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------- |
| `command`           | `preflight` | The gmc command (e.g. `preflight`, `"reports check"`, `"feeds diff"`)      |
| `args`              | `""`        | Extra arguments, e.g. `--dir feeds --strict`                               |
| `account`           | `""`        | Merchant Center account id (`GMC_ACCOUNT_ID`) — for authenticated commands |
| `credentials`       | `""`        | A Google service-account key JSON — **pass a secret**, never inline        |
| `version`           | `latest`    | The `@gmc-cli/cli` version to run                                          |
| `working-directory` | `.`         | Where your feeds / `.gmcpreflightrc` live                                  |

## Authenticated commands

Commands that hit the API (`reports check`, `feeds diff`, `products list`, …) need credentials. Store
a service-account key as a repository secret and pass it via `credentials` — the Action writes it to a
temporary file and points Application Default Credentials at it:

```yaml
- uses: yasserstudio/gmc@v1
  with:
    command: reports check
    args: --metric clicks --min 1000
    account: "123456789"
    credentials: ${{ secrets.GMC_SERVICE_ACCOUNT_KEY }}
```

Inputs are passed to the shell through environment variables (not interpolated into the command line),
so a crafted `args` can't inject shell. The key file is written `0600` and lives only in the runner's
temp dir.

::: tip Pin a version
`@v1` tracks the latest v1.x. Pin a release tag (e.g. `@v1.0.0`) for fully reproducible CI.
:::
