/**
 * Simple fuzzy search utility for typo-tolerant searching
 */

/**
 * Normalizes a string for searching (lowercase, trim, remove extra spaces)
 */
function normalizeString(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Checks if search term matches target using fuzzy matching
 * - First tries exact substring match (fast path)
 * - Then uses subsequence matching (characters appear in order)
 * - Allows for some character mismatches/typos
 */
export function fuzzyMatch(searchTerm: string, target: string): boolean {
    if (!searchTerm) return true;
    if (!target) return false;

    const normalizedSearch = normalizeString(searchTerm);
    const normalizedTarget = normalizeString(target);

    // Fast path: exact substring match
    if (normalizedTarget.includes(normalizedSearch)) {
        return true;
    }

    // Fuzzy matching: check if all characters in search term appear in order
    // This allows for typos and missing characters
    let searchIndex = 0;
    let targetIndex = 0;
    const searchLength = normalizedSearch.length;
    const targetLength = normalizedTarget.length;

    // If search term is longer than target, no match possible
    if (searchLength > targetLength) {
        return false;
    }

    // Simple subsequence matching: characters must appear in order
    // but we allow skipping characters in the target (handles typos)
    while (searchIndex < searchLength && targetIndex < targetLength) {
        if (normalizedSearch[searchIndex] === normalizedTarget[targetIndex]) {
            // Character matches, move both forward
            searchIndex++;
            targetIndex++;
        } else {
            // Character doesn't match, skip ahead in target
            // This handles extra characters/typos in the target
            targetIndex++;
        }
    }

    // Match if we've processed all characters in search term
    return searchIndex === searchLength;
}

/**
 * Searches a product by SKU and name using fuzzy matching
 */
export function searchProduct(
    searchTerm: string,
    sku: string,
    name: string | undefined
): boolean {
    if (!searchTerm) return true;

    // Search in SKU
    if (fuzzyMatch(searchTerm, sku)) {
        return true;
    }

    // Search in name if available
    if (name && fuzzyMatch(searchTerm, name)) {
        return true;
    }

    return false;
}
