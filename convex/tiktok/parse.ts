import { isRecord } from "./token";

export function tiktokString(value: unknown): string {
    if (typeof value === "string" && value.trim() !== "") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return "";
}

export function tiktokStringField(
    record: Record<string, unknown>,
    ...keys: string[]
): string {
    for (const key of keys) {
        const value = tiktokString(record[key]);
        if (value) {
            return value;
        }
    }
    return "";
}

export type ParsedTiktokShop = {
    id: string;
    cipher: string;
    name?: string;
    region?: string;
};

export function parseAuthorizedShops(data: unknown): ParsedTiktokShop[] {
    const shopsRaw = isRecord(data) ? data.shops : undefined;
    if (!Array.isArray(shopsRaw)) {
        return [];
    }

    const shops: ParsedTiktokShop[] = [];
    for (const shop of shopsRaw) {
        if (!isRecord(shop)) continue;
        const id = tiktokStringField(shop, "id", "shop_id");
        const cipher = tiktokStringField(shop, "cipher", "shop_cipher");
        if (!id || !cipher) continue;
        shops.push({
            id,
            cipher,
            name: tiktokStringField(shop, "name", "shop_name") || undefined,
            region: tiktokStringField(shop, "region", "shop_region") || undefined,
        });
    }
    return shops;
}

export function parseOrderSearchPage(data: unknown): {
    orderIds: string[];
    nextPageToken?: string;
    totalCount?: number;
} {
    const list = isRecord(data)
        ? (data.orders ?? data.order_list)
        : undefined;
    const orderIds: string[] = [];
    if (Array.isArray(list)) {
        for (const order of list) {
            if (!isRecord(order)) continue;
            const id = tiktokStringField(order, "id", "order_id");
            if (id) {
                orderIds.push(id);
            }
        }
    }

    const nextPageToken = isRecord(data)
        ? tiktokStringField(data, "next_page_token") || undefined
        : undefined;
    const totalCount = isRecord(data)
        ? Number(data.total_count)
        : Number.NaN;

    return {
        orderIds,
        nextPageToken,
        totalCount: Number.isFinite(totalCount) ? totalCount : undefined,
    };
}
