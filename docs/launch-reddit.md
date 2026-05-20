# r/opensource — bounty-hunter: a CLI that filters AI-honeypot bounty repos

If you've searched GitHub for the `💎 Bounty` label lately, you've probably seen the flood: brand-new repos with names like `ClankerNation/OpenAgents` or `SecureBananaLabs/bug-bounty`, posting $4k–$9k bounties on trivial issues, with "Autonomous Agents Only" labels and dozens of bot pile-on comments.

I got tired of filtering them by hand, so I built **bounty-hunter** — https://github.com/yagcioglutoprak/bounty-hunter

It's a Bun/TypeScript CLI that scores every open bounty issue against eleven weighted signals:

- known reputable owner allow-list
- honeypot name patterns (`Clanker*`, `*-bounty`, etc.)
- repo age (real projects rarely post bounties on day one)
- star count
- honeypot label tells (`crypto-eligible`, `Autonomous Agents Only`, `high-value`)
- `[ Bounty $XXk ]` title shape
- amount plausibility vs. repo size ($7k on a 74-star repo isn't real money)
- comment flood / bot pile-on
- claim status from the algora-pbc bot table + GitHub `assignees`
- "bounty graveyard" — many open claim PRs, zero merged
- stale claims older than 6 months

Output is a ranked terminal table with a verdict, the signal breakdown, and a "go score" so you can sort by what's actually claimable. Watch mode polls on a schedule, persists seen issue IDs, and alerts only on newly-arrived bounties — so you can claim a real one before the agents pile in.

Bundled GitHub Actions workflow runs the watcher every 30 min and opens a digest issue when promising fresh bounties appear, so you can keep it running without your laptop on.

23 passing tests. MIT. Uses your existing `gh` CLI auth — no token plumbing.

PRs welcome, especially new honeypot patterns you've spotted.
