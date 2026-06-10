# gmc config

Inspect gmc configuration and profiles (read-only). See [Configuration & profiles](/guide/configuration) for the file format and resolution rules.

## `gmc config path`

Print the config directory and file paths.

```sh
gmc config path
gmc config path --json   # { "configDir": "...", "configFile": "..." }
```

## `gmc config list`

List configured profiles, marking the default and any account id.

```sh
gmc config list
gmc config list --json
```

```
prod (default)  account 123456789
staging         account 987654321
```

## `gmc config current`

Show the profile (and account id) resolved for this invocation — after applying `--profile` / `--account` and the environment.

```sh
gmc config current
gmc --profile staging config current
gmc config current --json   # { "profile": "...", "accountId": "..." }
```
