import { $ } from "bun";
import type { GitHubIssue, IssueComment, RepoMetadata } from "./types.ts";

function formatReset(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString();
}

export class GitHubClient {
  private cache = new Map<string, unknown>();

  async search(query: string, perPage = 50): Promise<GitHubIssue[]> {
    const cacheKey = `search:${query}:${perPage}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as GitHubIssue[];
    }

    const result = await $`gh api -X GET search/issues -f q=${query} -f per_page=${perPage} -f sort=created -f order=desc`
      .quiet()
      .json();

    const items = (result.items ?? []) as GitHubIssue[];
    this.cache.set(cacheKey, items);
    return items;
  }

  async fetchRepo(repositoryUrl: string): Promise<RepoMetadata> {
    const cacheKey = `repo:${repositoryUrl}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as RepoMetadata;
    }

    const path = repositoryUrl.replace("https://api.github.com/", "");
    const repo = (await $`gh api ${path}`.quiet().json()) as RepoMetadata;
    this.cache.set(cacheKey, repo);
    return repo;
  }

  async fetchAlgoraBotComment(repoFullName: string, issueNumber: number): Promise<string | null> {
    const cacheKey = `algora:${repoFullName}:${issueNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as string | null;
    }

    try {
      const comments = (await $`gh api repos/${repoFullName}/issues/${issueNumber}/comments --paginate`
        .quiet()
        .json()) as IssueComment[];

      const algora = comments.find((comment) => comment.user.login === "algora-pbc[bot]");
      const body = algora?.body ?? null;
      this.cache.set(cacheKey, body);
      return body;
    } catch {
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  async fetchClaimingPullRequests(
    repoFullName: string,
    issueNumber: number,
  ): Promise<{ openPullRequests: number; mergedPullRequests: number; oldestOpenPrAgeDays: number }> {
    const cacheKey = `claims:${repoFullName}:${issueNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as {
        openPullRequests: number;
        mergedPullRequests: number;
        oldestOpenPrAgeDays: number;
      };
    }

    const empty = { openPullRequests: 0, mergedPullRequests: 0, oldestOpenPrAgeDays: 0 };
    try {
      const events = (await $`gh api repos/${repoFullName}/issues/${issueNumber}/timeline --paginate`
        .quiet()
        .json()) as Array<{
        event: string;
        source?: { issue?: { number: number; pull_request?: { merged_at: string | null } } };
      }>;

      const referencedPrNumbers = new Set<number>();
      for (const event of events) {
        if (event.event === "cross-referenced" && event.source?.issue?.pull_request) {
          referencedPrNumbers.add(event.source.issue.number);
        }
      }
      if (referencedPrNumbers.size === 0) {
        this.cache.set(cacheKey, empty);
        return empty;
      }

      let openPullRequests = 0;
      let mergedPullRequests = 0;
      let oldestOpenAt = Number.POSITIVE_INFINITY;

      await Promise.all(
        Array.from(referencedPrNumbers).map(async (prNumber) => {
          try {
            const pr = (await $`gh api repos/${repoFullName}/pulls/${prNumber}`.quiet().json()) as {
              state: "open" | "closed";
              merged_at: string | null;
              created_at: string;
            };
            if (pr.merged_at) {
              mergedPullRequests++;
            } else if (pr.state === "open") {
              openPullRequests++;
              const createdAt = new Date(pr.created_at).getTime();
              if (createdAt < oldestOpenAt) oldestOpenAt = createdAt;
            }
          } catch {
            // ignore individual PR failures
          }
        }),
      );

      const oldestOpenPrAgeDays =
        openPullRequests > 0 && Number.isFinite(oldestOpenAt)
          ? (Date.now() - oldestOpenAt) / 86_400_000
          : 0;

      const result = { openPullRequests, mergedPullRequests, oldestOpenPrAgeDays };
      this.cache.set(cacheKey, result);
      return result;
    } catch {
      this.cache.set(cacheKey, empty);
      return empty;
    }
  }

  async fetchRateLimit(): Promise<{
    search: { remaining: number; reset: number };
    core: { remaining: number; reset: number };
  }> {
    const result = await $`gh api rate_limit`.quiet().json();
    return {
      search: {
        remaining: result.resources.search.remaining,
        reset: result.resources.search.reset,
      },
      core: {
        remaining: result.resources.core.remaining,
        reset: result.resources.core.reset,
      },
    };
  }

  async ensureBudget(reposNeeded: number): Promise<void> {
    const { search, core } = await this.fetchRateLimit();
    if (search.remaining < 1) {
      throw new Error(
        `GitHub search rate limit exhausted. Resets at ${formatReset(search.reset)}.`,
      );
    }
    const coreNeeded = reposNeeded + 2;
    if (core.remaining < coreNeeded) {
      throw new Error(
        `GitHub core rate limit too low (${core.remaining} remaining, need ${coreNeeded}). ` +
          `Resets at ${formatReset(core.reset)}.`,
      );
    }
  }
}
