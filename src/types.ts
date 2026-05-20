export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  comments: number;
  created_at: string;
  updated_at: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  user: { login: string; type: "User" | "Bot" | "Organization" };
  pull_request?: unknown;
  repository_url: string;
  reactions?: { total_count: number; "+1": number; eyes: number };
  assignees?: Array<{ login: string }>;
}

export interface IssueComment {
  user: { login: string };
  body: string;
  created_at: string;
}

export interface BountyClaimStatus {
  attempts: number;
  wipAttempts: number;
  submittedSolutions: number;
  reservedForInterview: boolean;
  assignedTo: string[];
  graveyard?: GraveyardSignal;
}

export interface GraveyardSignal {
  openPullRequests: number;
  mergedPullRequests: number;
  oldestOpenPrAgeDays: number;
}

export interface RepoMetadata {
  full_name: string;
  owner: { login: string; type: string };
  created_at: string;
  pushed_at: string;
  stargazers_count: number;
  forks_count: number;
  subscribers_count: number;
  open_issues_count: number;
  description: string | null;
  homepage: string | null;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  visibility: string;
  default_branch: string;
  language: string | null;
}

export interface ScoredBounty {
  issue: GitHubIssue;
  repo: RepoMetadata;
  amountUsd: number | null;
  trustScore: number;
  effortScore: number;
  competitionScore: number;
  goScore: number;
  verdict: Verdict;
  claim: BountyClaimStatus;
  reasons: ScoreReason[];
}

export type Verdict = "honeypot" | "suspicious" | "uncertain" | "promising" | "legit";

export interface ScoreReason {
  signal: string;
  delta: number;
  detail: string;
}

export interface HuntOptions {
  limit: number;
  minAmount: number;
  maxAmount: number;
  query?: string;
  showAll: boolean;
  json: boolean;
  watch: boolean;
  intervalSeconds: number;
}
