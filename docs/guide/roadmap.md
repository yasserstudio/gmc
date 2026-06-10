# Roadmap

gmc ships in small, frequent patch releases through the `0.9.x` series, reaching `1.0.0` at public launch. This is the public view; the order front-loads the differentiators — `doctor`, `preflight`, and `migrate`.

| Phase | Versions | Theme | Status |
|-------|----------|-------|--------|
| 0 | v0.0 | Scaffold — monorepo, `gmc` shell, docs site | ✅ Done |
| 1 | v0.1–v0.4 | Spike pt 1 — auth, CLI shell, `doctor` | ✅ Done |
| 2 | v0.5–v0.7 | Spike pt 2 — typed client, **accounts**, **products** | ✅ Done |
| 3 | v0.8–v0.9.2 | Feeds as code — data sources, feeds pull, push, diff | ✅ Done |
| 4 | v0.9.3–v0.9.5 | **Preflight** — offline feed-compliance scanner | ✅ Done |
| 5 | v0.9.6–v0.9.8 | **Migrate** — Content API → Merchant API assistant | ✅ Done |
| 6 | v0.9.9–v0.9.10 | Inventories + promotions | ✅ Done |
| 7 | v0.9.11–v0.9.13 | Reports — performance, visibility, price insights | ✅ Done |
| 8 | v0.9.14–v0.9.16 | CI/CD — JSON/exit-code hardening, GitHub Action, GitLab recipe | ✅ Done |
| 9 | v0.9.17+ | Polish & launch → **v1.0.0** | 🚧 In progress |

Versions track [`@gmc-cli/cli`](https://github.com/yasserstudio/gmc/tree/main/packages/cli) (the `gmc` command), held at `0.9.x` patch increments through launch; supporting packages version independently. The version number will advance to `1.0.0` at the deliberate public launch.

See the [changelog](https://github.com/yasserstudio/gmc/blob/main/CHANGELOG.md) for shipped work and the [devlog](/devlog/) for the story behind it.
