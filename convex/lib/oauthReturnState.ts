function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(value: string): string {
    return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string): string {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return atob(padded + pad);
}

function equalSecret(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let mismatch = 0;
    for (let i = 0; i < left.length; i++) {
        mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return mismatch === 0;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(message)
    );
    return bytesToBase64Url(new Uint8Array(signature));
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

function vercelProjectName(hostname: string): string | undefined {
    if (!hostname.endsWith(".vercel.app")) {
        return undefined;
    }
    const name = hostname.slice(0, -".vercel.app".length);
    const gitIndex = name.indexOf("-git-");
    return gitIndex === -1 ? name : name.slice(0, gitIndex);
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

    return allowedUrls.some((url) => {
        const allowedOrigin = originOrNull(url ?? "");
        if (!allowedOrigin) {
            return false;
        }
        if (allowedOrigin === origin) {
            return true;
        }
        const returnProject = vercelProjectName(host);
        const allowedProject = vercelProjectName(
            new URL(allowedOrigin).hostname
        );
        return Boolean(
            returnProject && allowedProject && returnProject === allowedProject
        );
    });
}

export async function createOAuthReturnState(
    returnTo: string,
    secret: string
): Promise<string> {
    const origin = originOrNull(returnTo);
    if (!origin) {
        throw new Error("Invalid OAuth return URL");
    }
    const body = textToBase64Url(
        JSON.stringify({ returnTo: origin, n: crypto.randomUUID() })
    );
    return `${body}.${await hmacSha256(secret, body)}`;
}

export async function readOAuthReturnTo(
    state: string,
    secret: string
): Promise<string | undefined> {
    const separator = state.lastIndexOf(".");
    if (separator <= 0) {
        return undefined;
    }

    const body = state.slice(0, separator);
    const signature = state.slice(separator + 1);
    const expected = await hmacSha256(secret, body);
    if (!equalSecret(signature, expected)) {
        return undefined;
    }

    try {
        const parsed: unknown = JSON.parse(base64UrlToText(body));
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
