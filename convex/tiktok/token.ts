export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * TikTok Shop token endpoints wrap credentials in `{ code, data }`.
 * `access_token_expire_in` is a unix timestamp, not a duration.
 */
export function unwrapTokenPayload(
    raw: Record<string, unknown>
): Record<string, unknown> {
    const nested = raw.data;
    if (isRecord(nested) && typeof nested.access_token === "string") {
        return nested;
    }
    return raw;
}

export function tokenExpiresAtMs(
    payload: Record<string, unknown>,
    now = Date.now()
): number {
    const expireAt =
        payload.access_token_expire_in ?? payload.access_token_expire_at;
    if (typeof expireAt === "number" && Number.isFinite(expireAt)) {
        return expireAt > 1e12 ? expireAt : expireAt * 1000;
    }
    if (typeof expireAt === "string" && expireAt.trim() !== "") {
        const parsed = Number(expireAt);
        if (Number.isFinite(parsed)) {
            return parsed > 1e12 ? parsed : parsed * 1000;
        }
    }

    const expiresIn = Number(payload.expires_in);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
        return now + expiresIn * 1000;
    }

    return now + 24 * 60 * 60 * 1000;
}
