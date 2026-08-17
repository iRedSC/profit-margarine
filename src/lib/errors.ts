export function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        const { message } = error;
        if (typeof message === "string" && message) {
            return message;
        }
    }
    return "Unknown error";
}
