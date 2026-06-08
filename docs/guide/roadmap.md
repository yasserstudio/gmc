# Roadmap

gmc ships in small, frequent releases through the `0.x` pre-release series, reaching `1.0.0` at public launch. This is the public view; the order front-loads the differentiators — `doctor`, `preflight`, and `migrate`.

| Phase | Versions | Theme | Status |
|-------|----------|-------|--------|
| 0 | v0.0 | Scaffold — monorepo, `gmc` shell, docs site | ✅ Done |
| 1 | v0.1–v0.4 | Spike pt 1 — auth, CLI shell, `doctor` | ✅ Done |
| 2 | v0.5–v0.7 | Spike pt 2 — typed client, **accounts**, **products** | ✅ Done |
| 3 | v0.8–v0.11 | Feeds as code — data sources ✓, feeds pull ✓, push / diff next | 🚧 In progress |
| 4 | v0.12–v0.14 | **Preflight** — offline feed-compliance scanner | |
| 5 | v0.15–v0.17 | **Migrate** — Content API → Merchant API assistant | |
| 6 | v0.18–v0.19 | Inventories + promotions | |
| 7 | v0.20–v0.22 | Reports — performance, visibility, price insights | |
| 8 | v0.23–v0.25 | CI/CD — JSON/exit-code hardening, GitHub Action, GitLab recipe | |
| 9 | v0.26–v0.28 | Polish & launch → **v1.0.0** | |

Each phase spans several minors — roughly one minor per concrete deliverable, with patches in between. Versions track [`@gmc-cli/cli`](https://github.com/yasserstudio/gmc/tree/main/packages/cli) (the `gmc` command); supporting packages version independently.

See the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for shipped work and the [devlog](/devlog/) for the story behind it.
