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
