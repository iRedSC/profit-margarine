import { describe, expect, it } from "vitest";
import {
  createOAuthReturnState,
  isAllowedOAuthReturnTo,
  parseOAuthReturnTo,
} from "../convex/lib/oauthReturnState";

describe("OAuth return state", () => {
  it("round-trips a frontend origin", () => {
    const state = createOAuthReturnState(
      "https://preview.example.com/ignored",
    );
    expect(parseOAuthReturnTo(state)).toBe("https://preview.example.com");
  });

  it("allows this project's Vercel hosts even when production uses a unique deployment URL", () => {
    expect(
      isAllowedOAuthReturnTo(
        "https://profit-margarine-git-feat-tiktok-sync-east-coasts-projects.vercel.app",
        ["https://profit-margarine-nhfpep9xv-east-coasts-projects.vercel.app"],
      ),
    ).toBe(true);
    expect(
      isAllowedOAuthReturnTo(
        "https://profit-margarine-git-feat-tiktok-sync-east-coasts-projects.vercel.app",
        ["https://profit-margarine.vercel.app"],
      ),
    ).toBe(true);
    expect(
      isAllowedOAuthReturnTo("https://evil-git-main-other.vercel.app", [
        "https://profit-margarine.vercel.app",
      ]),
    ).toBe(false);
  });
});
