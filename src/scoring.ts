import type {
  BountyClaimStatus,
  GitHubIssue,
  RepoMetadata,
  ScoreReason,
  ScoredBounty,
  Verdict,
} from "./types.ts";

const KNOWN_LEGIT_OWNERS = new Set([
  "calcom",
  "twentyhq",
  "archestra-ai",
  "coollabsio",
  "supabase",
  "vercel",
  "Cap-go",
  "tldraw",
  "trigger-dev",
  "remotion-dev",
  "prisma",
  "withastro",
  "shadcn-ui",
]);

const HONEYPOT_NAME_PATTERNS = [
  /clanker/i,
  /securebanana/i,
  /unsafelabs/i,
  /orchestration-agent/i,
  /openagents-bounty/i,
  /^bounty-/i,
  /-bounties$/i,
];

const HONEYPOT_LABEL_PATTERNS = [
  /autonomus agents/i,
  /autonomous agents only/i,
  /ai agent friendly/i,
  /ai-agent-only/i,
  /crypto-eligible/i,
  /high-value/i,
];

const HONEYPOT_TITLE_PATTERNS = [
  /^\s*\[\s*Bounty\s*\$\d/i,
  /pixel art creation/i,
  /technical poem generation/i,
];

export function extractAmount(issue: GitHubIssue): number | null {
  const labelAmount = pickAmountFromLabels(issue.labels.map((l) => l.name));
  if (labelAmount !== null) return labelAmount;

  const titleAmount = pickAmountFromText(issue.title);
  if (titleAmount !== null) return titleAmount;

  if (issue.body) {
    const bodyAmount = pickAmountFromText(issue.body.slice(0, 600));
    if (bodyAmount !== null) return bodyAmount;
  }

  return null;
}

function pickAmountFromLabels(labels: string[]): number | null {
  for (const label of labels) {
    const trimmed = label.trim();
    const dollar = trimmed.match(/^\$\s?([\d,]+(?:\.\d+)?)\s?(k|m)?$/i);
    if (dollar) {
      return normaliseAmount(dollar[1]!, dollar[2]);
    }
  }
  return null;
}

function pickAmountFromText(text: string): number | null {
  const matches = text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s?(k|m)?\b/gi);
  let best: number | null = null;
  for (const match of matches) {
    const value = normaliseAmount(match[1]!, match[2]);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

function normaliseAmount(rawNumber: string, suffix: string | undefined): number | null {
  const numeric = Number.parseFloat(rawNumber.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (!suffix) return numeric;
  const lowered = suffix.toLowerCase();
  if (lowered === "k") return numeric * 1_000;
  if (lowered === "m") return numeric * 1_000_000;
  return numeric;
}

export function scoreIssue(
  issue: GitHubIssue,
  repo: RepoMetadata,
  claim: BountyClaimStatus,
): ScoredBounty {
  const reasons: ScoreReason[] = [];
  let trust = 50;

  trust += applyOwnerSignals(repo, reasons);
  trust += applyRepoAgeSignals(repo, reasons);
  trust += applyRepoActivitySignals(repo, reasons);
  trust += applyLabelSignals(issue, reasons);
  trust += applyTitleSignals(issue, reasons);
  trust += applyCommentSignals(issue, repo, reasons);
  trust += applyAmountPlausibilitySignals(issue, repo, reasons);

  trust = clamp(trust, 0, 100);

  const amount = extractAmount(issue);
  const effort = estimateEffort(issue);
  const competition = estimateCompetition(issue, claim);
  const goScore = computeGoScore(trust, effort, competition, claim);
  const verdict = decideVerdict(trust, claim);

  if (claim.reservedForInterview) {
    reasons.push({
      signal: "reserved-for-interview",
      delta: 0,
      detail: "issue is reserved for SE interview candidates — public attempts ignored",
    });
  }
  if (claim.assignedTo.length > 0) {
    reasons.push({
      signal: "already-assigned",
      delta: 0,
      detail: `assigned to @${claim.assignedTo.join(", @")}`,
    });
  }
  if (claim.wipAttempts > 0 || claim.submittedSolutions > 0) {
    reasons.push({
      signal: "active-attempts",
      delta: 0,
      detail: `${claim.attempts} attempts logged · ${claim.wipAttempts} WIP · ${claim.submittedSolutions} PRs submitted`,
    });
  }

  return {
    issue,
    repo,
    amountUsd: amount,
    trustScore: trust,
    effortScore: effort,
    competitionScore: competition,
    goScore,
    verdict,
    claim,
    reasons,
  };
}

function applyOwnerSignals(repo: RepoMetadata, reasons: ScoreReason[]): number {
  const owner = repo.owner.login;
  if (KNOWN_LEGIT_OWNERS.has(owner)) {
    reasons.push({
      signal: "known-legit-owner",
      delta: 25,
      detail: `${owner} is a known reputable open-source organisation`,
    });
    return 25;
  }

  for (const pattern of HONEYPOT_NAME_PATTERNS) {
    if (pattern.test(repo.full_name)) {
      reasons.push({
        signal: "honeypot-name-pattern",
        delta: -40,
        detail: `repo name "${repo.full_name}" matches known honeypot pattern ${pattern}`,
      });
      return -40;
    }
  }

  return 0;
}

function applyRepoAgeSignals(repo: RepoMetadata, reasons: ScoreReason[]): number {
  const ageDays = daysSince(repo.created_at);
  if (ageDays < 30) {
    reasons.push({
      signal: "young-repo",
      delta: -25,
      detail: `repo is only ${Math.round(ageDays)} days old (legit projects rarely post bounties this early)`,
    });
    return -25;
  }
  if (ageDays < 180) {
    reasons.push({
      signal: "recent-repo",
      delta: -10,
      detail: `repo is ${Math.round(ageDays)} days old`,
    });
    return -10;
  }
  if (ageDays > 365 * 2) {
    reasons.push({
      signal: "mature-repo",
      delta: 8,
      detail: `repo is ${Math.round(ageDays / 365)} years old`,
    });
    return 8;
  }
  return 0;
}

function applyRepoActivitySignals(repo: RepoMetadata, reasons: ScoreReason[]): number {
  let delta = 0;

  if (repo.stargazers_count >= 1_000) {
    delta += 12;
    reasons.push({
      signal: "stars-strong",
      delta: 12,
      detail: `${repo.stargazers_count.toLocaleString()} stars`,
    });
  } else if (repo.stargazers_count >= 100) {
    delta += 4;
    reasons.push({
      signal: "stars-modest",
      delta: 4,
      detail: `${repo.stargazers_count} stars`,
    });
  } else if (repo.stargazers_count < 5) {
    delta -= 12;
    reasons.push({
      signal: "stars-near-zero",
      delta: -12,
      detail: `only ${repo.stargazers_count} stars — repo has no real audience`,
    });
  }

  if (repo.archived || repo.disabled) {
    delta -= 30;
    reasons.push({
      signal: "repo-archived",
      delta: -30,
      detail: "repo is archived or disabled",
    });
  }

  return delta;
}

function applyLabelSignals(issue: GitHubIssue, reasons: ScoreReason[]): number {
  let delta = 0;
  for (const label of issue.labels) {
    for (const pattern of HONEYPOT_LABEL_PATTERNS) {
      if (pattern.test(label.name)) {
        delta -= 18;
        reasons.push({
          signal: "honeypot-label",
          delta: -18,
          detail: `label "${label.name}" is a known honeypot tell`,
        });
      }
    }
  }
  return delta;
}

function applyTitleSignals(issue: GitHubIssue, reasons: ScoreReason[]): number {
  for (const pattern of HONEYPOT_TITLE_PATTERNS) {
    if (pattern.test(issue.title)) {
      reasons.push({
        signal: "title-shape",
        delta: -10,
        detail: `title shape matches honeypot pattern (${pattern})`,
      });
      return -10;
    }
  }
  return 0;
}

function applyCommentSignals(
  issue: GitHubIssue,
  repo: RepoMetadata,
  reasons: ScoreReason[],
): number {
  const ageDays = Math.max(1, daysSince(issue.created_at));
  const commentsPerDay = issue.comments / ageDays;

  if (issue.comments >= 50 && repo.stargazers_count < 100) {
    reasons.push({
      signal: "comment-flood",
      delta: -22,
      detail: `${issue.comments} comments on a repo with ${repo.stargazers_count} stars (bot pile-on)`,
    });
    return -22;
  }

  if (commentsPerDay > 15 && repo.stargazers_count < 500) {
    reasons.push({
      signal: "comment-velocity",
      delta: -12,
      detail: `${commentsPerDay.toFixed(1)} comments/day — looks scripted`,
    });
    return -12;
  }

  return 0;
}

function applyAmountPlausibilitySignals(
  issue: GitHubIssue,
  repo: RepoMetadata,
  reasons: ScoreReason[],
): number {
  const amount = extractAmount(issue);
  if (amount === null) return 0;

  if (amount >= 1_000 && repo.stargazers_count < 200) {
    reasons.push({
      signal: "amount-implausible",
      delta: -20,
      detail: `$${amount.toLocaleString()} bounty on a repo with ${repo.stargazers_count} stars — too good to be true`,
    });
    return -20;
  }

  if (amount >= 5_000 && repo.stargazers_count < 5_000) {
    reasons.push({
      signal: "amount-very-high",
      delta: -10,
      detail: `$${amount.toLocaleString()} is unusually high for a repo of this size`,
    });
    return -10;
  }

  return 0;
}

function estimateEffort(issue: GitHubIssue): number {
  const titleLength = issue.title.length;
  const bodyLength = issue.body?.length ?? 0;
  const labels = issue.labels.map((l) => l.name.toLowerCase());

  let score = 50;
  if (labels.some((l) => l.includes("good first issue"))) score += 15;
  if (labels.some((l) => l.includes("documentation"))) score += 10;
  if (labels.some((l) => l.includes("typescript") || l.includes("javascript"))) score += 5;
  if (titleLength > 120) score -= 8;
  if (bodyLength > 4_000) score -= 12;
  if (bodyLength < 200) score -= 5;
  return clamp(score, 0, 100);
}

function estimateCompetition(issue: GitHubIssue, claim: BountyClaimStatus): number {
  let score = 80;
  score -= claim.attempts * 8;
  score -= claim.wipAttempts * 4;
  score -= claim.submittedSolutions * 12;
  if (claim.assignedTo.length > 0) score -= 50;
  if (claim.reservedForInterview) score = 0;
  if (claim.attempts === 0) {
    const ageHours = Math.max(1, hoursSince(issue.created_at));
    const replyRatio = issue.comments / ageHours;
    if (replyRatio > 1) score = clamp(70 - issue.comments, 0, 100);
    else score = clamp(score - issue.comments * 2, 0, 100);
  }
  return clamp(score, 0, 100);
}

function computeGoScore(
  trust: number,
  effort: number,
  competition: number,
  claim: BountyClaimStatus,
): number {
  if (claim.reservedForInterview || claim.assignedTo.length > 0) return 0;
  const weighted = trust * 0.45 + competition * 0.35 + effort * 0.2;
  return Math.round(weighted);
}

function decideVerdict(trust: number, claim: BountyClaimStatus): Verdict {
  if (claim.reservedForInterview || claim.assignedTo.length > 0) {
    return trust >= 60 ? "uncertain" : "suspicious";
  }
  if (trust < 25) return "honeypot";
  if (trust < 45) return "suspicious";
  if (trust < 60) return "uncertain";
  if (trust < 80) return "promising";
  return "legit";
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
