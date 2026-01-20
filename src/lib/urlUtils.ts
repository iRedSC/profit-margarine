/**
 * Utility functions for URL construction
 */

/**
 * Get the Convex site URL for HTTP routes
 * Extracts deployment name from VITE_CONVEX_URL and constructs .convex.site URL
 */
export function getConvexSiteUrl(): string {
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    const deploymentName = convexUrl?.split(".")[0].replace("https://", "");
    return deploymentName
        ? `https://${deploymentName}.convex.site`
        : window.location.origin;
}

/**
 * Build install URL for marketplace OAuth flows
 */
export function buildInstallUrl(path: string, params?: Record<string, string>): string {
    const siteUrl = getConvexSiteUrl();
    const url = new URL(path.startsWith("http") ? path : `${siteUrl}${path}`);
    
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
    }
    
    return url.toString();
}
