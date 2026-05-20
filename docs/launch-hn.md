# Show HN: bounty-hunter — find legit GitHub bounties, dodge the AI honeypots

The `💎 Bounty` label search on GitHub is now ~95% honeypot repos: brand-new single-author projects posting $7k bounties for trivial work, dragging in dozens of agents per issue, never paying anyone.

I built **bounty-hunter** — a small Bun/TypeScript CLI that scores every open bounty issue against eleven weighted signals (owner reputation, repo age, star count, label patterns, title shape, comment velocity, amount plausibility, claim/assignment status, PR merge ratio) and ranks by composite "go score." It catches the obvious ClankerNation/SecureBananaLabs-style traps and the subtler "bounty graveyard" pattern where owners collect free PRs but never merge.

There's also a watch mode that polls on a schedule, persists seen issue IDs, and only alerts on **newly created** bounties — so you can be first to a real one before the bot pile-on starts. A bundled GitHub Actions workflow runs the watcher every 30 minutes and opens a digest issue when fresh promising bounties (goScore ≥ 60) appear.

Why? Because the supply of legit OSS bounties hasn't actually dried up — they're just buried under template-generated noise. A scorer with named, repairable signals stays useful as the honeypot crop rotates.

Stack: Bun + TypeScript + the `gh` CLI under the hood (no token plumbing). 23 tests covering the scorer, the algora-pbc bot table parser, and claim status edge cases.

https://github.com/yagcioglutoprak/bounty-hunter

Built in a few hours mostly to scratch my own itch — happy to take feedback on the signal weights or new honeypot patterns I'm missing.
