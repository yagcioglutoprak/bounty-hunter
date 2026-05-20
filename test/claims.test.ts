import { describe, expect, test } from "bun:test";
import { parseClaimStatus } from "../src/claims.ts";
import type { GitHubIssue } from "../src/types.ts";

describe("parseClaimStatus edge cases", () => {
  test("handles algora bot comment with mixed status icons", () => {
    const algoraComment = `
Bot prelude...

| Attempt | Started | Solution | Actions |
| --- | --- | --- | --- |
| 🟢 @user1 | May 1 | WIP |  |
| 🟡 @user2 | May 2 | #100 | [Reward](x) |
| 🔴 @user3 | May 3 | WIP |  |
| 🟢 @user4 | May 4 | #101 | [Reward](x) |

Footer...
`;
    const issue = {
      labels: [],
      assignees: [],
    } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, algoraComment);
    expect(status.attempts).toBe(4);
    expect(status.wipAttempts).toBe(2);
    expect(status.submittedSolutions).toBe(2);
  });

  test("ignores table header and separator rows", () => {
    const algoraComment = `
| Attempt | Started | Solution | Actions |
| --- | --- | --- | --- |
| 🟢 @only | May 1 | WIP |  |
`;
    const issue = { labels: [], assignees: [] } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, algoraComment);
    expect(status.attempts).toBe(1);
  });

  test("returns zeros when no algora comment is provided", () => {
    const issue = { labels: [], assignees: [] } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, null);
    expect(status.attempts).toBe(0);
    expect(status.wipAttempts).toBe(0);
    expect(status.submittedSolutions).toBe(0);
    expect(status.assignedTo).toEqual([]);
    expect(status.reservedForInterview).toBe(false);
  });

  test("handles 'Reserved for interview' label without 'SE' prefix", () => {
    const issue = {
      labels: [
        { name: "💎 Bounty", color: "abc" },
        { name: "Reserved for interview", color: "abc" },
      ],
      assignees: [],
    } as unknown as GitHubIssue;
    const status = parseClaimStatus(issue, null);
    expect(status.reservedForInterview).toBe(true);
  });
});
