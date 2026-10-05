/**
 * Turn an error (or a Convex-propagated error string) into one readable line
 * block: drops the "Uncaught Error:" prefix and stack frames that Convex adds
 * when an error crosses an action boundary.
 */
export function cleanErrorMessage(error: unknown): string {
    const raw =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        error.message
            ? error.message
            : String(error);

    return raw
        .split("\n")
        .filter((line) => !/^\s+at\s/.test(line))
        .join("\n")
        .replace(/^(Uncaught\s+)?(Error|TypeError|ConvexError):\s*/, "")
        .trim();
}
