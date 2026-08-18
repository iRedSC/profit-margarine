"use node";

import { createHmac } from "node:crypto";

export function signTiktokRequest(args: {
    path: string;
    query: Record<string, string>;
    secret: string;
    body?: string;
}): string {
    const params = { ...args.query };
    delete params.sign;
    delete params.access_token;

    const sortedKeys = Object.keys(params).sort();
    let input = args.secret + args.path;
    for (const key of sortedKeys) {
        input += key + params[key];
    }
    if (args.body) {
        input += args.body;
    }
    input += args.secret;

    return createHmac("sha256", args.secret).update(input).digest("hex");
}
