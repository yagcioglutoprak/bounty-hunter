import type { BountyClaimStatus, GitHubIssue } from "./types.ts";

const RESERVED_LABEL_PATTERN = /reserved\s+for\s+(se\s+)?interview/i;

export function parseClaimStatus(
  issue: GitHubIssue,
  algoraComment: string | null,
): BountyClaimStatus {
  const status: BountyClaimStatus = {
    attempts: 0,
    wipAttempts: 0,
    submittedSolutions: 0,
    reservedForInterview: false,
    assignedTo: [],
  };

  for (const label of issue.labels) {
    if (RESERVED_LABEL_PATTERN.test(label.name)) {
      status.reservedForInterview = true;
      break;
    }
  }

  if (issue.assignees && issue.assignees.length > 0) {
    status.assignedTo = issue.assignees.map((assignee) => assignee.login);
  }

  if (algoraComment) {
    const tableRows = extractAttemptRows(algoraComment);
    status.attempts = tableRows.length;
    for (const row of tableRows) {
      if (/\bWIP\b/.test(row)) status.wipAttempts++;
      else if (/#\d+/.test(row)) status.submittedSolutions++;
    }
  }

  return status;
}

function extractAttemptRows(commentBody: string): string[] {
  const lines = commentBody.split("\n");
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return false;
    if (trimmed.startsWith("| ---")) return false;
    if (/\|\s*Attempt\s*\|/i.test(trimmed)) return false;
    return /🟢|🟡|🔴|@[\w-]+/.test(trimmed);
  });
}
