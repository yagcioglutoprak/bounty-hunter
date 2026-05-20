# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] — 2026-05-20

### Added
- Watch mode (`--watch`, `--interval`) that polls on a schedule, persists seen issue IDs to `~/.bounty-hunter-state.json`, and alerts (with terminal bell) only on newly-arrived bounties.
- `BOUNTY_HUNTER_STATE` env override for the persistence path.
- Bundled GitHub Actions workflow (`.github/workflows/bounty-watch.yml`) that runs the watcher every 30 minutes on GitHub's runners and opens a digest issue when fresh promising bounties (goScore ≥ 60) appear.
- `bin` entry (`bounty-hunter`), MIT license, FUNDING.yml, repo topics for discoverability.
- Launch posts (`docs/launch-hn.md`, `docs/launch-reddit.md`) for HN and r/opensource.
- Bounty-graveyard signal: walks the issue's cross-referenced PRs through the timeline API, counts open vs merged, penalises issues with many open claim PRs and zero merges (e.g. ollama-gui#26: 9 open PRs, 0 merged over 2 years).
- 4 new tests covering algora bot table edge cases (mixed status icons, header rejection, nullish input, label variants). Total: 23 passing.

### Changed
- Score render: claims row now surfaces graveyard PR counts even when no algora-pbc bot table is present.
- README rewritten with the full eleven-signal scoring table and mode documentation.

## [0.1.0] — 2026-05-20

### Added
- Initial release.
- Eight-signal trust scorer covering owner reputation, repo age, star count, label patterns, title shape, comment velocity, amount plausibility, and amount/repo-size mismatch.
- Algora-pbc bot table parser for claim/attempt counts.
- `Reserved for SE interview` label gate and `assignees` field check.
- Composite go score (`0.45·trust + 0.35·availability + 0.20·effort`).
- ANSI terminal output with verdict, signal breakdown, best-fit recommendation.
- `--json` mode for piping into `jq`.
- 19 passing tests across the scorer and amount parser.
