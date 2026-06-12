---
"@gmc-cli/api": patch
"@gmc-cli/cli": patch
---

feat(accounts): manage account access with `gmc accounts users`

`AccountsService` gains user CRUD (`listUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`)
and a new `gmc accounts users` sub-group — `list` / `get` / `add` / `update` / `remove` — to manage
who can access the account and their access rights (`STANDARD`, `READ_ONLY`, `ADMIN`,
`PERFORMANCE_REPORTING`, `API_DEVELOPER`). The user's email is the id (`me` resolves to the calling
user); `add` supplies it as the `userId` query param like `regions create`. Completes the account
profile/access surface alongside v1.0.3's profile writes.
