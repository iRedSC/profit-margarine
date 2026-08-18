const VERCEL_PROJECT = "profit-margarine";

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function textToBase64Url(value: string): string {
    return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string): string {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
        padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return atob(padded + pad);
}

export function originOrNull(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return undefined;
        }
        if (url.username || url.password) {
            return undefined;
        }
        if (
            url.protocol === "http:" &&
            url.hostname !== "localhost" &&
            url.hostname !== "127.0.0.1"
        ) {
            return undefined;
        }
        return url.origin;
    } catch {
        return undefined;
    }
}

export function isProjectVercelHost(hostname: string): boolean {
    return (
        hostname === `${VERCEL_PROJECT}.vercel.app` ||
        (hostname.startsWith(`${VERCEL_PROJECT}-`) &&
            hostname.endsWith(".vercel.app"))
    );
}

export function isAllowedOAuthReturnTo(
    returnTo: string,
    allowedUrls: Array<string | undefined>
): boolean {
    const origin = originOrNull(returnTo);
    if (!origin) {
        return false;
    }

    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") {
        return true;
    }
    if (isProjectVercelHost(host)) {
        return true;
    }

    return allowedUrls.some((url) => originOrNull(url ?? "") === origin);
}

export function createOAuthReturnState(returnTo: string): string {
    const origin = originOrNull(returnTo);
    if (!origin) {
        throw new Error("Invalid OAuth return URL");
    }
    return textToBase64Url(
        JSON.stringify({ returnTo: origin, n: crypto.randomUUID() })
    );
}

export function parseOAuthReturnTo(state: string): string | undefined {
    try {
        const parsed: unknown = JSON.parse(base64UrlToText(state));
        if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("returnTo" in parsed) ||
            typeof parsed.returnTo !== "string"
        ) {
            return undefined;
        }
        return originOrNull(parsed.returnTo);
    } catch {
        return undefined;
    }
}
