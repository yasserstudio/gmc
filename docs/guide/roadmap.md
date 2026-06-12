# Roadmap

GMC launched at **`v1.0.0`** and now ships small, frequent **patch** releases (`v1.0.x`) — new commands land as patches, not minors. The phases below front-loaded the differentiators (`doctor`, `preflight`, `migrate`) on the way to 1.0; post-launch work expands API coverage.

| Phase | Versions        | Theme                                                          | Status     |
| ----- | --------------- | -------------------------------------------------------------- | ---------- |
| 0     | v0.0            | Scaffold — monorepo, `gmc` shell, docs site                    | ✅ Done    |
| 1     | v0.1–v0.4       | Spike pt 1 — auth, CLI shell, `doctor`                         | ✅ Done    |
| 2     | v0.5–v0.7       | Spike pt 2 — typed client, **accounts**, **products**          | ✅ Done    |
| 3     | v0.8–v0.9.2     | Feeds as code — data sources, feeds pull, push, diff           | ✅ Done    |
| 4     | v0.9.3–v0.9.5   | **Preflight** — offline feed-compliance scanner                | ✅ Done    |
| 5     | v0.9.6–v0.9.8   | **Migrate** — Content API → Merchant API assistant             | ✅ Done    |
| 6     | v0.9.9–v0.9.10  | Inventories + promotions                                       | ✅ Done    |
| 7     | v0.9.11–v0.9.13 | Reports — performance, visibility, price insights              | ✅ Done    |
| 8     | v0.9.14–v0.9.16 | CI/CD — JSON/exit-code hardening, GitHub Action, GitLab recipe | ✅ Done    |
| 9     | v0.9.17–v1.0.0  | Polish & launch → **v1.0.0**                                   | ✅ Done    |
| 10    | v1.0.2+         | Feature surface — `regions`, `accounts`, `datasources`         | 🚀 Ongoing |

Phase 10 (post-launch) adds API coverage as patches: `regions` (v1.0.2); the full `accounts`
surface — profile writes, users/access, lifecycle, and the business-identity / autofeed / shipping /
return-policy sub-resources (v1.0.3–v1.0.6); and completing `datasources` with `update` / `fetch`
(v1.0.7).

Versions track [`@gmc-cli/cli`](https://github.com/yasserstudio/gmc/tree/main/packages/cli) (the `gmc` command); since the 1.0.0 launch every feature ships as a patch (`v1.0.2`, `v1.0.3`, …). Supporting packages version independently.

See the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for shipped work and the [devlog](/devlog/) for the story behind it.
