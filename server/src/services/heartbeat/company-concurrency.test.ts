import { describe, expect, it } from "vitest";
import { resolveCompanyMaxConcurrentRuns } from "./company-concurrency.js";

describe("resolveCompanyMaxConcurrentRuns", () => {
  it.each([undefined, "", "0", "invalid", "-1", "1.5", "9007199254740992"])(
    "treats unset, empty, zero, or invalid defaults as uncapped (%s)",
    (defaultLimit) => {
      expect(resolveCompanyMaxConcurrentRuns("company-a", {
        PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS: defaultLimit,
      })).toBeNull();
    },
  );

  it("uses a positive default unless a company override is present", () => {
    const env = {
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS: " 4 ",
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS_OVERRIDES: " company-a = 2, company-b: 0 ",
    };
    expect(resolveCompanyMaxConcurrentRuns("company-a", env)).toBe(2);
    expect(resolveCompanyMaxConcurrentRuns("company-b", env)).toBeNull();
    expect(resolveCompanyMaxConcurrentRuns("company-c", env)).toBe(4);
  });

  it("ignores malformed override entries", () => {
    expect(resolveCompanyMaxConcurrentRuns("company-a", {
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS: "3",
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS_OVERRIDES: "company-a=invalid,broken,company-b:2",
    })).toBe(3);
    expect(resolveCompanyMaxConcurrentRuns("company-b", {
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS: "3",
      PAPERCLIP_COMPANY_MAX_CONCURRENT_RUNS_OVERRIDES: "company-a=invalid,broken,company-b:2",
    })).toBe(2);
  });
});
