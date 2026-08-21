function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function connectionNodes(value: unknown): unknown[] {
    if (!isRecord(value)) return [];
    if (Array.isArray(value.nodes)) return value.nodes;
    if (!Array.isArray(value.edges)) return [];
    return value.edges.map((edge) => (isRecord(edge) ? edge.node : undefined));
}

function methodTypeFromDelivery(value: unknown): string | undefined {
    if (!isRecord(value)) return undefined;
    return typeof value.methodType === "string" ? value.methodType : undefined;
}

function fulfillmentMethodTypes(order: unknown): string[] {
    if (!isRecord(order)) return [];
    const types: string[] = [];
    for (const node of connectionNodes(order.fulfillmentOrders)) {
        if (!isRecord(node)) continue;
        const methodType = methodTypeFromDelivery(node.deliveryMethod);
        if (methodType) types.push(methodType);
    }
    return types;
}

function normalizeDeliveryMethodType(value: string): string {
    return value.trim().toUpperCase().replace(/-/g, "_");
}

function isPickupMethodType(value: string): boolean {
    const normalized = normalizeDeliveryMethodType(value);
    return normalized === "PICK_UP" || normalized === "PICKUP";
}

function shippingLineLooksLikePickup(line: unknown): boolean {
    if (!isRecord(line)) return false;
    const fields = [
        line.deliveryCategory,
        line.code,
        line.title,
        line.shippingRateHandle,
    ];
    return fields.some(
        (field) => typeof field === "string" && /\bpick[\s_-]?up\b/i.test(field)
    );
}

function shippingLinesLookLikePickup(order: unknown): boolean {
    if (!isRecord(order)) return false;
    const lines = connectionNodes(order.shippingLines);
    return lines.length > 0 && lines.every(shippingLineLooksLikePickup);
}

export function isShopifyPickupOrder(order: unknown): boolean {
    const methodTypes = fulfillmentMethodTypes(order);
    if (methodTypes.length > 0) {
        return methodTypes.every(isPickupMethodType);
    }
    return shippingLinesLookLikePickup(order);
}
