# Authentication

gmc authenticates against the Merchant API with the OAuth **`content`** scope (`https://www.googleapis.com/auth/content`). It resolves a credential from the first source available, in this order:

| # | Source | How |
|---|--------|-----|
| 1 | `GMC_SERVICE_ACCOUNT` | Env var — a **file path** to, or the **raw JSON** of, a service-account key |
| 2 | `GOOGLE_APPLICATION_CREDENTIALS` | Env var — a service-account key file (the Google-standard var) |
| 3 | **Stored OAuth login** | Saved by `gmc auth login`, per profile |
| 4 | **Application Default Credentials** | `gcloud auth application-default login` |

A service-account env var always wins over an ambient ADC session; a deliberate `gmc auth login` wins over ADC.

## Interactive login (OAuth)

Best for local development:

```sh
gmc auth login              # opens your browser to authorize
gmc auth login --no-browser # prints the URL instead (headless / remote)
gmc auth logout             # removes the stored login for the current profile
```

The login is stored per [profile](/guide/configuration), so you can keep separate logins for separate accounts.

## Service account

Best for CI and automation. Point gmc at a key file or inline JSON:

```sh
export GMC_SERVICE_ACCOUNT="/path/to/key.json"
# or the Google-standard variable:
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

Grant the service account access under **Merchant Center → Settings → Account access / API clients**, and make sure the Merchant API is enabled on its Cloud project (`gmc doctor` checks this).

## Application Default Credentials

If you already use `gcloud`:

```sh
gcloud auth application-default login
```

## Verify

```sh
gmc auth whoami   # resolved identity, no network call
gmc auth test     # requests an access token to confirm the credential works
gmc doctor        # full diagnosis, including Merchant API reachability
```

::: tip The silent trap
A credential can authenticate perfectly yet still fail every Merchant API call because the Cloud project was never registered as an API client, or the API was never enabled. `gmc doctor` is built to catch exactly this.
:::
