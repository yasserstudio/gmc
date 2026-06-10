# GitLab CI

There's no GitLab equivalent of the [GitHub Action](/guide/github-action) — you just run `gmc` in a
job. The two patterns: an **offline preflight gate** (no credentials) and an **authenticated check**
using a CI/CD variable for the service-account key.

## Offline preflight gate

`preflight` runs entirely on your committed feed files, so it needs no account or credentials — a
perfect merge-request gate:

```yaml
# .gitlab-ci.yml
preflight:
  image: node:20
  script:
    - npx -y @gmc-cli/cli@latest preflight --dir feeds --strict
```

`gmc`'s exit code is the job's exit code, so a gating finding fails the pipeline.

## Authenticated jobs (env-var auth)

Commands that hit the API authenticate from the **`GMC_SERVICE_ACCOUNT`** environment variable, which
accepts either a **file path** or the **raw JSON** of a service-account key — no `gmc auth login`, no
ADC setup. The clean way in GitLab is a **File-type CI/CD variable**:

1. **Settings → CI/CD → Variables → Add variable**
   - Key: `GMC_SERVICE_ACCOUNT`
   - Value: paste the service-account key JSON
   - **Type: `File`** · **Masked** and **Protected** as appropriate
2. GitLab writes the value to a temp file and sets `GMC_SERVICE_ACCOUNT` to its **path** — exactly what
   `gmc` reads.

```yaml
reports-gate:
  image: node:20
  variables:
    GMC_ACCOUNT_ID: "123456789"
  script:
    # GMC_SERVICE_ACCOUNT is the File-type CI/CD variable (a path to the key)
    - npx -y @gmc-cli/cli@latest reports check --metric clicks --min 1000
```

(A regular `Variable`-type holding the raw key JSON also works, since `GMC_SERVICE_ACCOUNT` accepts raw
JSON — but a File-type variable keeps the key off the command line and out of logs.)

::: tip Pin a version
Use `@gmc-cli/cli@<version>` (e.g. `@1.0.0`) instead of `@latest` for reproducible pipelines.
:::

See [Authentication](/guide/authentication) for the full credential-resolution order.
