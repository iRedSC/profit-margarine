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
 * Finds the longest consecutive substring match between search and target
 * Optimized version using dynamic programming approach
 * Returns the length of the longest consecutive match
 */
function findLongestConsecutiveMatch(search: string, target: string): number {
    // Fast path: exact substring match
    if (target.includes(search)) {
        return search.length;
    }
    
    let maxLength = 0;
    const searchLen = search.length;
    const targetLen = target.length;
    
    // Use a more efficient approach: find longest common substring
    // Try each starting position in search
    for (let i = 0; i < searchLen; i++) {
        // Try to match as many consecutive characters as possible starting from i
        let searchIdx = i;
        let bestMatch = 0;
        
        // For each starting position in target
        for (let j = 0; j < targetLen; j++) {
            let matchLen = 0;
            let searchPos = searchIdx;
            let targetPos = j;
            
            // Count consecutive matching characters
            while (searchPos < searchLen && targetPos < targetLen && 
                   search[searchPos] === target[targetPos]) {
                matchLen++;
                searchPos++;
                targetPos++;
            }
            
            bestMatch = Math.max(bestMatch, matchLen);
        }
        
        maxLength = Math.max(maxLength, bestMatch);
        
        // Early exit optimization: if we found a match of the full search length, we're done
        if (maxLength === searchLen) {
            break;
        }
    }
    
    return maxLength;
}

/**
 * Calculates a match score based on consecutive character matches
 * Higher score = better match
 * Returns 0 if no match
 * Optimized for performance with early exits
 */
export function calculateMatchScore(searchTerm: string, target: string): number {
    if (!searchTerm) return 1000; // Empty search matches everything with high score
    if (!target) return 0;

    const normalizedSearch = normalizeString(searchTerm);
    const normalizedTarget = normalizeString(target);

    // Early exit: search term longer than target
    if (normalizedSearch.length > normalizedTarget.length) {
        return 0;
    }

    // Fast path: exact substring match gets highest score
    const exactMatchIndex = normalizedTarget.indexOf(normalizedSearch);
    if (exactMatchIndex !== -1) {
        // Score decreases slightly based on position (earlier matches are better)
        const positionBonus = (normalizedTarget.length - exactMatchIndex) / normalizedTarget.length;
        return 1000 + positionBonus * 100;
    }

    // Find longest consecutive match
    const longestConsecutive = findLongestConsecutiveMatch(normalizedSearch, normalizedTarget);
    
    // Require at least (search length - 2) consecutive characters to match
    // This filters out products with no similar characters
    // Minimum of 1 to ensure we always require at least 1 character match
    const minRequiredMatch = Math.max(1, normalizedSearch.length - 2);
    
    if (longestConsecutive < minRequiredMatch) {
        // No sufficient consecutive match - filter out
        return 0;
    }

    // Calculate score based on consecutive matches
    // Longer consecutive matches get exponentially higher scores
    const consecutiveScore = longestConsecutive * longestConsecutive * 20;
    
    // Bonus for match ratio (simplified calculation)
    const matchRatio = longestConsecutive / normalizedSearch.length;
    const matchBonus = matchRatio * 10;
    
    return consecutiveScore + matchBonus;
}

/**
 * Checks if a product matches the search term (for filtering)
 */
export function searchProduct(
    searchTerm: string,
    sku: string,
    name: string | undefined
): boolean {
    if (!searchTerm) return true;
    return getSearchScore(searchTerm, sku, name) > 0;
}

/**
 * Gets the search score for a product
 * Higher score = better match
 * SKU matches are weighted higher than name matches
 */
export function getSearchScore(
    searchTerm: string,
    sku: string,
    name: string | undefined
): number {
    if (!searchTerm) return 1000;

    const skuScore = calculateMatchScore(searchTerm, sku);
    const nameScore = name ? calculateMatchScore(searchTerm, name) : 0;

    // SKU matches are weighted 2x higher than name matches
    return Math.max(skuScore * 2, nameScore);
}
