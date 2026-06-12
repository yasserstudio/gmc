---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(datasources): complete the group with `update` and `fetch`

`DataSourcesService` gains `updateDataSource` (PATCH + derived `updateMask`) and `fetchDataSource`
(`dataSources:fetch`), and `gmc datasources` gets the matching commands:

- `gmc datasources update <id> --name <n> | --file <path> [--update-mask <fields>]` — patch a data source; output-only fields in a `--file` body are stripped so a saved `get` body re-applies cleanly.
- `gmc datasources fetch <id>` — trigger an immediate fetch of a scheduled file feed (file-input sources only).

Fills the two commands the docs previously marked "not yet implemented".
