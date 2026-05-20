#!/usr/bin/env bun
import { GitHubClient } from "./github.ts";
import { parseClaimStatus } from "./claims.ts";
import { scoreIssue } from "./scoring.ts";
import {
  renderBounty,
  renderEmpty,
  renderError,
  renderHeader,
  renderRecommendation,
} from "./render.ts";
import type { HuntOptions, ScoredBounty } from "./types.ts";

const DEFAULT_QUERY = 'label:"💎 Bounty" state:open is:issue';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options === null) {
    printUsage();
    process.exit(0);
  }

  const client = new GitHubClient();

  try {
    await client.ensureBudget(Math.min(options.limit * 3, 100));
  } catch (error) {
    process.stderr.write(renderError((error as Error).message));
    process.exit(1);
  }

  const query = options.query ?? DEFAULT_QUERY;
  const issues = await client.search(query, Math.min(options.limit * 3, 100));

  const realIssues = issues.filter((issue) => !issue.pull_request);
  const repoUrls = uniq(realIssues.map((issue) => issue.repository_url));

  const repoEntries = await Promise.all(
    repoUrls.map(async (url) => [url, await client.fetchRepo(url)] as const),
  );
  const repoIndex = new Map(repoEntries);

  const candidates = realIssues
    .map((issue) => ({ issue, repo: repoIndex.get(issue.repository_url) }))
    .filter(
      (entry): entry is { issue: typeof entry.issue; repo: NonNullable<typeof entry.repo> } =>
        entry.repo !== undefined,
    );

  const scored = await Promise.all(
    candidates.map(async ({ issue, repo }) => {
      const [algoraComment, graveyard] = await Promise.all([
        client.fetchAlgoraBotComment(repo.full_name, issue.number),
        client.fetchClaimingPullRequests(repo.full_name, issue.number),
      ]);
      const claim = parseClaimStatus(issue, algoraComment);
      claim.graveyard = graveyard;
      return scoreIssue(issue, repo, claim);
    }),
  );

  const filtered = scored.filter((bounty) => {
    if (!options.showAll && bounty.verdict === "honeypot") return false;
    const amount = bounty.amountUsd;
    if (amount !== null) {
      if (amount < options.minAmount) return false;
      if (amount > options.maxAmount) return false;
    } else if (options.minAmount > 0) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (b.goScore !== a.goScore) return b.goScore - a.goScore;
    if (b.trustScore !== a.trustScore) return b.trustScore - a.trustScore;
    return b.competitionScore - a.competitionScore;
  });

  const top = filtered.slice(0, options.limit);

  if (options.json) {
    process.stdout.write(JSON.stringify(top, null, 2) + "\n");
    return;
  }

  process.stdout.write(renderHeader(query, scored.length, top.length));
  if (top.length === 0) {
    process.stdout.write(renderEmpty());
    return;
  }
  process.stdout.write(renderRecommendation(top));
  top.forEach((bounty, index) => {
    process.stdout.write(renderBounty(bounty, index + 1));
  });
}

function parseArgs(argv: string[]): HuntOptions | null {
  if (argv.includes("--help") || argv.includes("-h")) return null;

  const options: HuntOptions = {
    limit: 10,
    minAmount: 0,
    maxAmount: Number.POSITIVE_INFINITY,
    showAll: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--limit":
      case "-n":
        options.limit = Number.parseInt(argv[++i] ?? "10", 10);
        break;
      case "--min":
        options.minAmount = Number.parseFloat(argv[++i] ?? "0");
        break;
      case "--max":
        options.maxAmount = Number.parseFloat(argv[++i] ?? "Infinity");
        break;
      case "--query":
      case "-q":
        options.query = argv[++i];
        break;
      case "--show-all":
        options.showAll = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        process.stderr.write(`unknown flag: ${arg}\n`);
        process.exit(2);
    }
  }

  return options;
}

function printUsage(): void {
  process.stdout.write(
    [
      "",
      "  bounty-hunter — find legitimate open-source bounties, dodge honeypots",
      "",
      "  usage:  bun run hunt [flags]",
      "",
      "  flags:",
      "    -n, --limit N        max bounties to show (default 10)",
      "        --min N          minimum USD amount (default 0)",
      "        --max N          maximum USD amount (default ∞)",
      "    -q, --query STRING   override GitHub search query",
      "        --show-all       include honeypot-flagged results",
      "        --json           emit raw JSON",
      "    -h, --help           show this help",
      "",
      "  examples:",
      "    bun run hunt --min 20 --max 500",
      "    bun run hunt -n 5 --query 'label:bounty state:open language:typescript'",
      "    bun run hunt --json | jq '.[0].issue.html_url'",
      "",
    ].join("\n"),
  );
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

main().catch((error) => {
  process.stderr.write(renderError((error as Error).message));
  process.exit(1);
});
