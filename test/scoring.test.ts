import { describe, expect, test } from "bun:test";
import { extractAmount, scoreIssue } from "../src/scoring.ts";
import { parseClaimStatus } from "../src/claims.ts";
import type { BountyClaimStatus, GitHubIssue, RepoMetadata } from "../src/types.ts";

const EMPTY_CLAIM: BountyClaimStatus = {
  attempts: 0,
  wipAttempts: 0,
  submittedSolutions: 0,
  reservedForInterview: false,
  assignedTo: [],
};

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 1,
    title: "fix something small",
    html_url: "https://github.com/example/repo/issues/1",
    state: "open",
    comments: 2,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    updated_at: new Date().toISOString(),
    body: "Small bug fix needed.",
    labels: [{ name: "💎 Bounty", color: "abc" }],
    user: { login: "maintainer", type: "User" },
    repository_url: "https://api.github.com/repos/example/repo",
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RepoMetadata> = {}): RepoMetadata {
  return {
    full_name: "example/repo",
    owner: { login: "example", type: "Organization" },
    created_at: new Date(Date.now() - 365 * 3 * 86_400_000).toISOString(),
    pushed_at: new Date().toISOString(),
    stargazers_count: 800,
    forks_count: 80,
    subscribers_count: 30,
    open_issues_count: 50,
    description: "A real project",
    homepage: null,
    archived: false,
    disabled: false,
    fork: false,
    visibility: "public",
    default_branch: "main",
    language: "TypeScript",
    ...overrides,
  };
}

describe("extractAmount", () => {
  test("reads $20 from a label", () => {
    const issue = makeIssue({ labels: [{ name: "$20", color: "abc" }] });
    expect(extractAmount(issue)).toBe(20);
  });

  test("reads $7k from a label", () => {
    const issue = makeIssue({ labels: [{ name: "$7k", color: "abc" }] });
    expect(extractAmount(issue)).toBe(7_000);
  });

  test("reads $1.5k from a label", () => {
    const issue = makeIssue({ labels: [{ name: "$1.5k", color: "abc" }] });
    expect(extractAmount(issue)).toBe(1_500);
  });

  test("reads $400 from a title", () => {
    const issue = makeIssue({
      labels: [],
      title: "[bounty $400] add email parser",
    });
    expect(extractAmount(issue)).toBe(400);
  });

  test("title takes precedence over body when both mention amounts", () => {
    const issue = makeIssue({
      labels: [],
      title: "[bounty $20] add a config flag",
      body: "context: similar to the $200 fix from last week",
    });
    expect(extractAmount(issue)).toBe(20);
  });

  test("falls back to body when title has no amount", () => {
    const issue = makeIssue({
      labels: [],
      title: "fix typo in onboarding copy",
      body: "Fixing this typo. Bounty: $35.",
    });
    expect(extractAmount(issue)).toBe(35);
  });

  test("returns null when nothing looks like money", () => {
    const issue = makeIssue({
      labels: [],
      title: "fix typo",
      body: "section 4.2 has a typo",
    });
    expect(extractAmount(issue)).toBeNull();
  });
});

describe("scoreIssue", () => {
  test("flags ClankerNation-style honeypots", () => {
    const issue = makeIssue({
      title: "[ Bounty $7k ] [ API ] Fix something — urgent",
      labels: [
        { name: "💎 Bounty", color: "abc" },
        { name: "Autonomus Agents Only", color: "abc" },
        { name: "$7k", color: "abc" },
        { name: "crypto-eligible", color: "abc" },
      ],
      comments: 80,
      created_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      repository_url: "https://api.github.com/repos/ClankerNation/OpenAgents",
    });
    const repo = makeRepo({
      full_name: "ClankerNation/OpenAgents",
      owner: { login: "ClankerNation", type: "Organization" },
      stargazers_count: 3,
      created_at: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    });
    const result = scoreIssue(issue, repo, EMPTY_CLAIM);
    expect(result.verdict).toBe("honeypot");
    expect(result.trustScore).toBeLessThan(25);
    expect(result.reasons.some((r) => r.signal === "honeypot-name-pattern")).toBe(true);
  });

  test("flags SecureBananaLabs-style honeypots", () => {
    const issue = makeIssue({
      title: "Pixel Art Creation with high Creative Thinking",
      labels: [
        { name: "💎 Bounty", color: "abc" },
        { name: "AI agent friendly", color: "abc" },
        { name: "$780", color: "abc" },
      ],
      comments: 83,
      created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      repository_url: "https://api.github.com/repos/SecureBananaLabs/bug-bounty",
    });
    const repo = makeRepo({
      full_name: "SecureBananaLabs/bug-bounty",
      owner: { login: "SecureBananaLabs", type: "Organization" },
      stargazers_count: 2,
      created_at: new Date(Date.now() - 18 * 86_400_000).toISOString(),
    });
    const result = scoreIssue(issue, repo, EMPTY_CLAIM);
    expect(result.verdict).toBe("honeypot");
    expect(result.reasons.some((r) => r.signal === "honeypot-name-pattern")).toBe(true);
  });

  test("rates a small Cal.com-style bounty as legit", () => {
    const issue = makeIssue({
      title: "feat: improve typography weights",
      labels: [
        { name: "💎 Bounty", color: "abc" },
        { name: "$50", color: "abc" },
        { name: "good first issue", color: "abc" },
      ],
      comments: 4,
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      repository_url: "https://api.github.com/repos/calcom/cal.com",
    });
    const repo = makeRepo({
      full_name: "calcom/cal.com",
      owner: { login: "calcom", type: "Organization" },
      stargazers_count: 35_000,
      created_at: new Date(Date.now() - 365 * 5 * 86_400_000).toISOString(),
    });
    const result = scoreIssue(issue, repo, EMPTY_CLAIM);
    expect(result.verdict === "promising" || result.verdict === "legit").toBe(true);
    expect(result.trustScore).toBeGreaterThanOrEqual(60);
  });

  test("competition score drops with comment volume", () => {
    const quiet = scoreIssue(makeIssue({ comments: 0 }), makeRepo(), EMPTY_CLAIM);
    const noisy = scoreIssue(makeIssue({ comments: 25 }), makeRepo(), EMPTY_CLAIM);
    expect(quiet.competitionScore).toBeGreaterThan(noisy.competitionScore);
  });

  test("effort score is higher for good-first-issue-labelled tasks", () => {
    const easy = scoreIssue(
      makeIssue({
        labels: [
          { name: "💎 Bounty", color: "abc" },
          { name: "good first issue", color: "abc" },
        ],
      }),
      makeRepo(),
      EMPTY_CLAIM,
    );
    const harder = scoreIssue(makeIssue(), makeRepo(), EMPTY_CLAIM);
    expect(easy.effortScore).toBeGreaterThan(harder.effortScore);
  });

  test("trust score capped between 0 and 100", () => {
    const result = scoreIssue(
      makeIssue(),
      makeRepo({ stargazers_count: 1_000_000 }),
      EMPTY_CLAIM,
    );
    expect(result.trustScore).toBeGreaterThanOrEqual(0);
    expect(result.trustScore).toBeLessThanOrEqual(100);
  });

  test("active claims drop competition and go scores", () => {
    const uncontested = scoreIssue(makeIssue(), makeRepo(), EMPTY_CLAIM);
    const crowded = scoreIssue(makeIssue(), makeRepo(), {
      attempts: 6,
      wipAttempts: 4,
      submittedSolutions: 2,
      reservedForInterview: false,
      assignedTo: [],
    });
    expect(crowded.competitionScore).toBeLessThan(uncontested.competitionScore);
    expect(crowded.goScore).toBeLessThan(uncontested.goScore);
  });

  test("assigned issue gets goScore of 0 and gated verdict", () => {
    const result = scoreIssue(makeIssue(), makeRepo(), {
      attempts: 3,
      wipAttempts: 0,
      submittedSolutions: 0,
      reservedForInterview: false,
      assignedTo: ["someone-else"],
    });
    expect(result.goScore).toBe(0);
    expect(result.verdict === "uncertain" || result.verdict === "suspicious").toBe(true);
  });

  test("interview-reserved issue is gated regardless of trust", () => {
    const result = scoreIssue(makeIssue(), makeRepo({ stargazers_count: 50_000 }), {
      attempts: 0,
      wipAttempts: 0,
      submittedSolutions: 0,
      reservedForInterview: true,
      assignedTo: [],
    });
    expect(result.goScore).toBe(0);
    expect(result.competitionScore).toBe(0);
  });
});

describe("parseClaimStatus", () => {
  test("parses an Algora attempt table with WIP and submitted PRs", () => {
    const algoraComment = `
| Attempt | Started (UTC) | Solution | Actions |
| --- | --- | --- | --- |
| 🟢 @alice | May 18, 2026, 09:14:24 PM | WIP |  |
| 🟢 @bob | May 18, 2026, 10:46:09 PM | #1234 | [Reward](https://algora.io/x) |
| 🟢 @carol | May 19, 2026, 04:01:34 AM | WIP |  |
`;
    const issue = {
      labels: [{ name: "💎 Bounty", color: "abc" }],
      assignees: [],
    } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, algoraComment);
    expect(status.attempts).toBe(3);
    expect(status.wipAttempts).toBe(2);
    expect(status.submittedSolutions).toBe(1);
    expect(status.reservedForInterview).toBe(false);
  });

  test("detects 'Reserved for SE interview' label", () => {
    const issue = {
      labels: [
        { name: "💎 Bounty", color: "abc" },
        { name: "Reserved for SE interview", color: "abc" },
      ],
      assignees: [],
    } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, null);
    expect(status.reservedForInterview).toBe(true);
  });

  test("captures assigned users from issue.assignees", () => {
    const issue = {
      labels: [{ name: "💎 Bounty", color: "abc" }],
      assignees: [{ login: "piercypixel" }, { login: "llwp" }],
    } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, null);
    expect(status.assignedTo).toEqual(["piercypixel", "llwp"]);
  });
});
