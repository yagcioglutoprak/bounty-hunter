# bounty-hunter

Find legitimate open-source bounties on GitHub. Filter out the AI-baited honeypot repos.

The `💎 Bounty` label search on GitHub is now mostly noise — disposable single-author repos posting $7k bounties for trivial work, dragging in dozens of agents per issue. This tool ranks every open bounty issue against eight weighted signals and tells you which ones are worth your time.

```
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

After trust, the **claim status** is parsed from the algora-pbc bot comment + the issue's `assignees` field. If anyone is officially assigned or the issue is `Reserved for SE interview`, the **go score** is forced to 0 — you can't claim what's already claimed.

The composite **go score** is `0.45·trust + 0.35·availability + 0.20·effort`. That's the number to sort on if you actually want to ship something.

## Usage

```bash
bun install
bun src/cli.ts                      # top 10, JSON-safe
bun src/cli.ts -n 5 --min 20        # 5 bounties, $20 minimum
bun src/cli.ts --query 'label:bounty state:open language:typescript'
bun src/cli.ts --show-all           # include the honeypots, with reasons
bun src/cli.ts --json | jq '.[0]'
```

The tool reads from `gh api` — your existing GitHub auth handles rate limits and private repos automatically. No tokens to manage, no .env files.

## Tests

```bash
bun test
```

19 tests cover the scorer, the amount parser, and the algora bot table parser. Honeypot detection has snapshot tests against the real-world repos that triggered each rule.

## Why a tool, not a one-off search

The honeypot crop rotates weekly — new templates, new naming patterns, same shape. A static lead list goes stale in days. A scorer with named signals is repairable: when a new pattern shows up in the wild, you add one regex and the signal stacks with everything else.
