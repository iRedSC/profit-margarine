import { describe, expect, it } from "vitest";
import {
  createOAuthReturnState,
  isAllowedOAuthReturnTo,
  readOAuthReturnTo,
} from "../convex/lib/oauthReturnState";

describe("OAuth return state", () => {
  it("round-trips a signed frontend origin", async () => {
    const state = await createOAuthReturnState(
      "https://preview.example.com/ignored",
      "secret",
    );

    await expect(readOAuthReturnTo(state, "secret")).resolves.toBe(
      "https://preview.example.com",
    );
  });

  it("rejects a tampered return origin", async () => {
    const state = await createOAuthReturnState(
      "https://preview.example.com",
      "secret",
    );
    const separator = state.lastIndexOf(".");
    const tampered = `A${state.slice(0, separator)}.${state.slice(separator + 1)}`;

    await expect(readOAuthReturnTo(tampered, "secret")).resolves.toBeUndefined();
    await expect(readOAuthReturnTo(state, "other-secret")).resolves.toBeUndefined();
  });

  it("allows this project's Vercel preview when the configured URL is production", () => {
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
