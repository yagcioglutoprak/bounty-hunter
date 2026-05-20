import { GitHubClient } from "./github.ts";
import { parseClaimStatus } from "./claims.ts";
import { scoreIssue } from "./scoring.ts";
import { renderBounty } from "./render.ts";
import type { ScoredBounty } from "./types.ts";

const STATE_PATH =
  process.env.BOUNTY_HUNTER_STATE ?? `${process.env.HOME}/.bounty-hunter-state.json`;

interface WatchState {
  seenIssueIds: number[];
  lastPolledAt: string;
}

interface WatchOptions {
  query: string;
  minAmount: number;
  intervalSeconds: number;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  brightGreen: "\x1b[92m",
  brightRed: "\x1b[91m",
} as const;

export async function runWatch(options: WatchOptions): Promise<void> {
  const state = await loadState();
  const seen = new Set<number>(state.seenIssueIds);
  const client = new GitHubClient();

  printWatchBanner(options, seen.size);

  // Initial sync — silent, just record what's already there so we only alert on truly new issues.
  if (seen.size === 0) {
    process.stdout.write(`${ANSI.dim}performing initial sync (no alerts)...${ANSI.reset}\n`);
    const initialIssues = await client.search(options.query, 100);
    for (const issue of initialIssues) {
      if (!issue.pull_request) seen.add(issue.id);
    }
    await persistState({ seenIssueIds: [...seen], lastPolledAt: new Date().toISOString() });
    process.stdout.write(
      `${ANSI.green}initial sync complete — tracking ${seen.size} known issues${ANSI.reset}\n\n`,
    );
  }

  while (true) {
    const tickStart = Date.now();
    try {
      const newBounties = await pollOnce(client, options, seen);
      if (newBounties.length > 0) {
        notifyTerminalBell();
        for (const bounty of newBounties) {
          process.stdout.write(renderFreshBountyAlert(bounty));
          process.stdout.write(renderBounty(bounty, 0));
        }
      } else {
        process.stdout.write(
          `${ANSI.dim}[${new Date().toLocaleTimeString()}] no fresh bounties${ANSI.reset}\n`,
        );
      }
      await persistState({
        seenIssueIds: [...seen],
        lastPolledAt: new Date().toISOString(),
      });
    } catch (error) {
      process.stderr.write(
        `${ANSI.brightRed}[${new Date().toLocaleTimeString()}] poll failed: ${(error as Error).message}${ANSI.reset}\n`,
      );
    }

    const elapsed = Date.now() - tickStart;
    const sleepMs = Math.max(1_000, options.intervalSeconds * 1_000 - elapsed);
    await Bun.sleep(sleepMs);
  }
}

async function pollOnce(
  client: GitHubClient,
  options: WatchOptions,
  seen: Set<number>,
): Promise<ScoredBounty[]> {
  const issues = await client.search(options.query, 100);
  const fresh = issues.filter((issue) => !issue.pull_request && !seen.has(issue.id));
  if (fresh.length === 0) return [];

  for (const issue of fresh) seen.add(issue.id);

  const repoUrls = [...new Set(fresh.map((issue) => issue.repository_url))];
  const repoEntries = await Promise.all(
    repoUrls.map(async (url) => [url, await client.fetchRepo(url)] as const),
  );
  const repoIndex = new Map(repoEntries);

  const scored = await Promise.all(
    fresh.map(async (issue) => {
      const repo = repoIndex.get(issue.repository_url);
      if (!repo) return null;
      const [algoraComment, graveyard] = await Promise.all([
        client.fetchAlgoraBotComment(repo.full_name, issue.number),
        client.fetchClaimingPullRequests(repo.full_name, issue.number),
      ]);
      const claim = parseClaimStatus(issue, algoraComment);
      claim.graveyard = graveyard;
      return scoreIssue(issue, repo, claim);
    }),
  );

  return scored
    .filter((bounty): bounty is ScoredBounty => bounty !== null)
    .filter((bounty) => bounty.verdict !== "honeypot" && bounty.verdict !== "suspicious")
    .filter((bounty) => bounty.amountUsd === null || bounty.amountUsd >= options.minAmount)
    .sort((a, b) => b.goScore - a.goScore);
}

async function loadState(): Promise<WatchState> {
  try {
    const file = Bun.file(STATE_PATH);
    if (!(await file.exists())) {
      return { seenIssueIds: [], lastPolledAt: new Date().toISOString() };
    }
    const data = await file.json();
    return {
      seenIssueIds: Array.isArray(data.seenIssueIds) ? data.seenIssueIds : [],
      lastPolledAt: typeof data.lastPolledAt === "string" ? data.lastPolledAt : new Date().toISOString(),
    };
  } catch {
    return { seenIssueIds: [], lastPolledAt: new Date().toISOString() };
  }
}

async function persistState(state: WatchState): Promise<void> {
  await Bun.write(STATE_PATH, JSON.stringify(state, null, 2));
}

function printWatchBanner(options: WatchOptions, seenCount: number): void {
  process.stdout.write(
    [
      "",
      `${ANSI.bold}${ANSI.cyan}╭─ bounty hunter · watch mode ───────────────────────────────────╮${ANSI.reset}`,
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}query${ANSI.reset}     ${options.query}`,
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}interval${ANSI.reset}  every ${options.intervalSeconds}s`,
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}min$${ANSI.reset}      $${options.minAmount}`,
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}known${ANSI.reset}     ${seenCount} issues already tracked`,
      `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}state${ANSI.reset}     ${STATE_PATH}`,
      `${ANSI.bold}${ANSI.cyan}╰────────────────────────────────────────────────────────────────╯${ANSI.reset}`,
      `${ANSI.dim}ctrl-c to stop · honeypots filtered · alerts ring the terminal bell${ANSI.reset}`,
      "",
    ].join("\n"),
  );
}

function renderFreshBountyAlert(bounty: ScoredBounty): string {
  const stamp = new Date().toLocaleTimeString();
  return `\n${ANSI.brightGreen}${ANSI.bold}🔔 FRESH BOUNTY${ANSI.reset}  ${ANSI.dim}${stamp}${ANSI.reset}\n`;
}

function notifyTerminalBell(): void {
  process.stdout.write("\x07");
}
