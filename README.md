# bounty-hunter

> Find legitimate open-source bounties on GitHub. Filter out the AI-baited honeypot repos.

[![tests](https://img.shields.io/badge/tests-23%20passing-brightgreen)](./test) [![bun](https://img.shields.io/badge/runtime-bun-black)](https://bun.sh) [![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

The `💎 Bounty` label search on GitHub is now mostly noise — disposable single-author repos posting $7k bounties for trivial work, dragging in dozens of agents per issue. This tool ranks every open bounty issue against eleven weighted signals and tells you which ones are worth your time.

```text
╭─ bounty hunter ─────────────────────────────────────────────────╮
│  query    label:"💎 Bounty" state:open is:issue
│  checked  15 bounty issues
│  showing  1 after honeypot filtering
╰─────────────────────────────────────────────────────────────────╯

 BEST FIT   Improve usage limits visibility UX and DX
   repo     archestra-ai/archestra
   go score 0/100 — $150, 3 prior attempts
   link     https://github.com/archestra-ai/archestra/issues/4758

#1  ? UNCERTAIN  Improve usage limits visibility UX and DX
   repo     archestra-ai/archestra  (3,713★)
   amount   $150    3d ago · 10 comments
   claims   assigned to @piercypixel  3 attempts (3 WIP, 0 PRs)
   trust    █████████████████░░░  87/100
   effort   ██████████░░░░░░░░░░  50/100  (higher = easier)
   avail    ░░░░░░░░░░░░░░░░░░░░   0/100  (higher = less competition)
   go       ░░░░░░░░░░░░░░░░░░░░   0/100  (composite recommendation)
   action   gated — find a different bounty
```

## Quick start

```bash
# from a clone
bun install
bun src/cli.ts                                  # top 10
bun src/cli.ts --watch --interval 180 --min 50  # poll every 3 min, alert on fresh ≥$50
bun src/cli.ts --json | jq '.[0]'

# or via bun's bin entry once cloned
bun link
bounty-hunter --help
```

The tool reads from `gh api` — your existing GitHub auth handles rate limits and private repos automatically. No tokens to manage, no .env files.

## How it scores

Every bounty issue runs through these signals. Trust starts at 50 and moves up or down:

| Signal | Direction | Why |
| --- | --- | --- |
| known reputable owner | +25 | curated allow-list of orgs that actually merge contributor PRs |
| honeypot name pattern | -40 | `*-bounty`, `Clanker*`, `SecureBanana*`, etc. |
| young repo (< 30 days) | -25 | real projects rarely post bounties on day one |
| stars under 5 | -12 | no real audience, no reviewers |
| 1k+ stars | +12 | active community, signed PRs get merged |
| `crypto-eligible` / `high-value` / `Autonomous Agents Only` label | -18 each | known honeypot tells |
| `[ Bounty $XXk ]` title shape | -10 | template that flooded GitHub in early 2026 |
| big bounty + tiny repo | -20 | $7k for a 74-star repo isn't real money |
| comment flood (50+ comments, sub-100 stars) | -22 | bot pile-on |
| **bounty graveyard** | -25 | many open claim PRs, zero merged — owner doesn't pay |
| stale claims | -10 | open PRs older than 6 months unmerged |

After trust, **claim status** is parsed from the algora-pbc bot comment table + the issue's `assignees` field. If anyone is officially assigned or the issue is `Reserved for SE interview`, the **go score** is forced to 0 — you can't claim what's already claimed.

The composite **go score** is `0.45·trust + 0.35·availability + 0.20·effort`. That's the number to sort on if you actually want to ship something.

## Modes

### One-shot scan
The default. Searches GitHub once, scores everything, prints a ranked table.

```bash
bun src/cli.ts -n 5 --min 20 --max 500
```

### Watch mode
Poll continuously, persist seen issue IDs, alert (with terminal bell) only on **newly created** bounties — so you can be first to a real one before competition piles in.

```bash
bun src/cli.ts --watch --interval 180 --min 50
```

State lives at `~/.bounty-hunter-state.json` (override via `BOUNTY_HUNTER_STATE`). First run does a silent sync of existing issues so you don't get spammed with everything that's already there.

### Fast mode
Skip per-issue enrichment (algora bot table + cross-referenced PR timeline). Used by the bundled GitHub Actions workflow. Trust score still works; claim/graveyard signals are skipped.

```bash
bun src/cli.ts --fast --json -n 25
```

### Hosted via GitHub Actions
The included `.github/workflows/bounty-watch.yml` runs the watcher every 30 minutes on GitHub's runners and opens a digest issue when fresh promising bounties (`goScore ≥ 60`) appear. Fork the repo, enable Actions, and it just works.

## Tests

```bash
bun test
# 23 pass · scoring rules · algora bot table parser · claim status edge cases
```

## Design notes

The honeypot crop rotates weekly — new templates, new naming patterns, same shape. A static lead list goes stale in days. A scorer with named signals is repairable: when a new pattern shows up in the wild, you add one regex and the signal stacks with everything else.

Stack: TypeScript on Bun, no external HTTP client (uses the `gh` CLI under the hood for authenticated rate limits). Everything is in `src/` — `cli.ts` for arg parsing, `github.ts` for API access, `scoring.ts` for the signal engine, `claims.ts` for the algora-pbc bot table parser, `watch.ts` for polling, `render.ts` for ANSI output.

Why Bun? Native TypeScript, zero build step, 30ms cold start. The whole tool is one `bun src/cli.ts` away.

## Companion tools

[**repo-grader**](https://github.com/yagcioglutoprak/repo-grader) — score any GitHub repo on PR welcomeness (A–F letter grade). Bounty-hunter tells you which bounties to chase; repo-grader tells you which repos are worth chasing them in.

## License

MIT — see [LICENSE](./LICENSE).
