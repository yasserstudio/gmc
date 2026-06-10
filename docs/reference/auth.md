# gmc auth

Authenticate against the Merchant API. See [Authentication](/guide/authentication) for the credential resolution order and the service-account / ADC options.

## `gmc auth login`

Sign in with your Google account in the browser (OAuth). The login is stored per profile.

```sh
gmc auth login
gmc auth login --no-browser   # print the authorization URL instead of opening a browser
```

| Option | Description |
|--------|-------------|
| `--no-browser` | Print the authorization URL instead of opening a browser (headless / remote) |

## `gmc auth logout`

Remove the stored OAuth login for the current profile.

```sh
gmc auth logout
```

## `gmc auth whoami`

Show the resolved credential identity — **no network call**.

```sh
gmc auth whoami
gmc auth whoami --json   # { "email": "...", "projectId": "..." }
```

## `gmc auth test`

Verify the credential by requesting an access token (network).

```sh
gmc auth test
```

A failure exits `3` (auth). For a full diagnosis including Merchant API reachability, use [`gmc doctor`](/reference/doctor).
