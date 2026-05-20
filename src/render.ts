import type { ScoredBounty, Verdict } from "./types.ts";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
} as const;

const VERDICT_STYLE: Record<Verdict, { label: string; color: string; icon: string }> = {
  honeypot: { label: "HONEYPOT", color: ANSI.brightRed + ANSI.bold, icon: "✗" },
  suspicious: { label: "SUSPICIOUS", color: ANSI.red, icon: "⚠" },
  uncertain: { label: "UNCERTAIN", color: ANSI.yellow, icon: "?" },
  promising: { label: "PROMISING", color: ANSI.cyan, icon: "→" },
  legit: { label: "LEGIT", color: ANSI.brightGreen + ANSI.bold, icon: "✓" },
};

export function renderHeader(query: string, totalChecked: number, totalShown: number): string {
  const lines = [
    "",
    `${ANSI.bold}${ANSI.cyan}╭─ bounty hunter ─────────────────────────────────────────────────╮${ANSI.reset}`,
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}query${ANSI.reset}    ${query}`,
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}checked${ANSI.reset}  ${totalChecked} bounty issues`,
    `${ANSI.bold}${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}showing${ANSI.reset}  ${totalShown} after honeypot filtering`,
    `${ANSI.bold}${ANSI.cyan}╰─────────────────────────────────────────────────────────────────╯${ANSI.reset}`,
    "",
  ];
  return lines.join("\n");
}

export function renderRecommendation(bounties: ScoredBounty[]): string {
  const claimable = bounties.filter(
    (bounty) => bounty.goScore > 0 && bounty.verdict !== "honeypot" && bounty.verdict !== "suspicious",
  );
  if (claimable.length === 0) return "";

  const best = claimable[0]!;
  const amount = best.amountUsd !== null ? `$${best.amountUsd.toLocaleString()}` : "amount tbd";
  const lines = [
    `${ANSI.bgGreen}${ANSI.bold} BEST FIT ${ANSI.reset}  ${ANSI.bold}${best.issue.title}${ANSI.reset}`,
    `   ${ANSI.dim}repo${ANSI.reset}     ${best.repo.full_name}`,
    `   ${ANSI.dim}go score${ANSI.reset} ${best.goScore}/100 — ${amount}, ${best.claim.attempts} prior attempts`,
    `   ${ANSI.dim}link${ANSI.reset}     ${ANSI.blue}${best.issue.html_url}${ANSI.reset}`,
    "",
  ];
  return lines.join("\n");
}

export function renderBounty(bounty: ScoredBounty, rank: number): string {
  const { issue, repo, amountUsd, trustScore, effortScore, competitionScore, goScore, verdict, claim, reasons } =
    bounty;
  const style = VERDICT_STYLE[verdict];

  const amountText = amountUsd !== null ? `$${amountUsd.toLocaleString()}` : "no amount";
  const ageDays = Math.round(
    (Date.now() - new Date(issue.created_at).getTime()) / 86_400_000,
  );
  const ageText = ageDays === 0 ? "today" : ageDays === 1 ? "1d ago" : `${ageDays}d ago`;

  const trustBar = renderBar(trustScore);
  const effortBar = renderBar(effortScore);
  const competitionBar = renderBar(competitionScore);
  const goBar = renderBar(goScore);

  const headline = `${ANSI.dim}#${String(rank).padStart(2)}${ANSI.reset}  ${style.color}${style.icon} ${style.label}${ANSI.reset}  ${ANSI.bold}${truncate(issue.title, 80)}${ANSI.reset}`;

  const hasClaimSignal =
    claim.attempts > 0 ||
    claim.assignedTo.length > 0 ||
    claim.reservedForInterview ||
    (claim.graveyard && claim.graveyard.openPullRequests + claim.graveyard.mergedPullRequests > 0);

  const claimLine = hasClaimSignal
    ? `   ${ANSI.dim}claims${ANSI.reset}   ${formatClaimSummary(claim)}`
    : `   ${ANSI.dim}claims${ANSI.reset}   ${ANSI.green}none yet${ANSI.reset}`;

  const meta = [
    `   ${ANSI.dim}repo${ANSI.reset}     ${repo.full_name}  ${ANSI.dim}(${repo.stargazers_count.toLocaleString()}★)${ANSI.reset}`,
    `   ${ANSI.dim}amount${ANSI.reset}   ${ANSI.bold}${amountText}${ANSI.reset}    ${ANSI.dim}${ageText} · ${issue.comments} comments${ANSI.reset}`,
    claimLine,
    `   ${ANSI.dim}trust${ANSI.reset}    ${trustBar} ${trustScore.toString().padStart(3)}/100`,
    `   ${ANSI.dim}effort${ANSI.reset}   ${effortBar} ${effortScore.toString().padStart(3)}/100  ${ANSI.dim}(higher = easier)${ANSI.reset}`,
    `   ${ANSI.dim}avail${ANSI.reset}    ${competitionBar} ${competitionScore.toString().padStart(3)}/100  ${ANSI.dim}(higher = less competition)${ANSI.reset}`,
    `   ${ANSI.dim}go${ANSI.reset}       ${goBar} ${goScore.toString().padStart(3)}/100  ${ANSI.dim}(composite recommendation)${ANSI.reset}`,
    `   ${ANSI.dim}link${ANSI.reset}     ${ANSI.blue}${issue.html_url}${ANSI.reset}`,
  ];

  const reasonLines = reasons.length
    ? [
        "",
        `   ${ANSI.dim}signals${ANSI.reset}`,
        ...reasons.map((reason) => {
          const sign = reason.delta >= 0 ? "+" : "";
          const color = reason.delta > 0 ? ANSI.green : reason.delta < 0 ? ANSI.red : ANSI.gray;
          const display = reason.delta === 0 ? "  " : `${sign}${reason.delta}`;
          return `   ${color}${display}${ANSI.reset}  ${ANSI.dim}${reason.signal}${ANSI.reset}  ${reason.detail}`;
        }),
      ]
    : [];

  const action = renderAction(bounty);

  return [headline, ...meta, ...reasonLines, action, ""].join("\n");
}

function formatClaimSummary(claim: ScoredBounty["claim"]): string {
  const parts: string[] = [];
  if (claim.reservedForInterview) parts.push(`${ANSI.red}reserved for interview${ANSI.reset}`);
  if (claim.assignedTo.length > 0) parts.push(`${ANSI.red}assigned to @${claim.assignedTo.join(", @")}${ANSI.reset}`);
  if (claim.attempts > 0) {
    const detail = `${claim.attempts} attempts (${claim.wipAttempts} WIP, ${claim.submittedSolutions} PRs)`;
    parts.push(claim.attempts > 3 ? `${ANSI.red}${detail}${ANSI.reset}` : `${ANSI.yellow}${detail}${ANSI.reset}`);
  }
  if (claim.graveyard) {
    const { openPullRequests, mergedPullRequests } = claim.graveyard;
    if (openPullRequests >= 5 && mergedPullRequests === 0) {
      parts.push(`${ANSI.red}${openPullRequests} open PRs / 0 merged — graveyard${ANSI.reset}`);
    } else if (openPullRequests > 0 || mergedPullRequests > 0) {
      parts.push(
        `${ANSI.dim}${openPullRequests} open PRs · ${mergedPullRequests} merged${ANSI.reset}`,
      );
    }
  }
  return parts.join("  ");
}

function renderAction(bounty: ScoredBounty): string {
  const { verdict, issue, claim, goScore } = bounty;
  if (verdict === "honeypot" || verdict === "suspicious") {
    return `   ${ANSI.dim}action${ANSI.reset}   ${ANSI.red}skip — do not engage${ANSI.reset}`;
  }
  if (claim.assignedTo.length > 0 || claim.reservedForInterview) {
    return `   ${ANSI.dim}action${ANSI.reset}   ${ANSI.red}gated — find a different bounty${ANSI.reset}`;
  }
  if (claim.attempts >= 3) {
    return `   ${ANSI.dim}action${ANSI.reset}   ${ANSI.yellow}crowded — only attempt if you can ship same-day${ANSI.reset}`;
  }
  if (goScore >= 70) {
    return `   ${ANSI.dim}action${ANSI.reset}   ${ANSI.brightGreen}claim & ship${ANSI.reset}\n   ${ANSI.dim}cmd${ANSI.reset}      gh issue view ${issue.html_url}`;
  }
  if (goScore >= 50) {
    return `   ${ANSI.dim}action${ANSI.reset}   ${ANSI.cyan}comment to claim, then open PR${ANSI.reset}\n   ${ANSI.dim}cmd${ANSI.reset}      gh issue view ${issue.html_url}`;
  }
  return `   ${ANSI.dim}action${ANSI.reset}   read full thread + repo history before claiming`;
}

function renderBar(score: number): string {
  const width = 20;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color =
    score >= 70 ? ANSI.brightGreen : score >= 45 ? ANSI.yellow : ANSI.red;
  return `${color}${"█".repeat(filled)}${ANSI.gray}${"░".repeat(empty)}${ANSI.reset}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function renderEmpty(): string {
  return [
    "",
    `${ANSI.yellow}No promising bounties found right now.${ANSI.reset}`,
    `${ANSI.dim}Try --show-all to see filtered results, or rerun in a few hours.${ANSI.reset}`,
    "",
  ].join("\n");
}

export function renderError(message: string): string {
  return `\n${ANSI.bgRed}${ANSI.bold} ERROR ${ANSI.reset} ${message}\n`;
}
