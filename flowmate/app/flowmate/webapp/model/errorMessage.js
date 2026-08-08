sap.ui.define([], () => {
    "use strict";

    const GENERIC_MESSAGES = new Set([
        "http request failed",
        "request failed",
        "failed to fetch",
        "networkerror when attempting to fetch resource."
    ]);

    const STATUS_MESSAGES = {
        400: "Some of the information provided is invalid. Please review it and try again.",
        401: "Your session has expired or you are not signed in. Please sign in again.",
        403: "You do not have permission to perform this action.",
        404: "The requested record could not be found. It may have been removed.",
        409: "This change conflicts with a more recent update. Refresh the page and try again.",
        412: "This record has changed since it was opened. Refresh the page and try again.",
        429: "Too many requests were sent. Please wait a moment and try again.",
        500: "The server could not complete the request. Please try again or contact support.",
        502: "The service is temporarily unavailable. Please try again shortly.",
        503: "The service is temporarily unavailable. Please try again shortly.",
        504: "The request timed out. Please try again."
    };

    function parseJson(value) {
        if (!value || typeof value !== "string") {
            return value;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function asText(value) {
        if (typeof value === "string") {
            return value.trim();
        }
        if (value && typeof value.value === "string") {
            return value.value.trim();
        }
        return "";
    }

    function collect(payload, messages, visited) {
        const parsed = parseJson(payload);
        if (!parsed || typeof parsed !== "object" || visited.has(parsed)) {
            return;
        }
        visited.add(parsed);

        const details = parsed.error?.details || parsed.error?.innererror?.errordetails ||
            parsed.innererror?.errordetails || parsed.details;
        if (Array.isArray(details)) {
            details.forEach((detail) => {
                const text = asText(detail?.message || detail);
                if (text) {
                    messages.push(text);
                }
            });
        }

        [parsed.error?.message, parsed.message].forEach((message) => {
            const text = asText(message);
            if (text) {
                messages.push(text);
            }
        });

        [parsed.responseText, parsed.body, parsed.response?.body,
            parsed.response?.responseText, parsed.cause].forEach((nested) => collect(nested, messages, visited));
    }

    function clean(message) {
        return String(message || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .replace(/^\d{3}\s*[-:]\s*/, "")
            .trim();
    }

    function isTechnical(message) {
        return /(?:sql(?:state| error| syntax)?|stack trace|at [\w.$]+\s*\(|internal server error|\bquery:\s|\bselect\s.+\bfrom\s)/i.test(message);
    }

    function statusOf(error, explicitStatus) {
        return Number(explicitStatus || error?.status || error?.statusCode ||
            error?.response?.status || error?.response?.statusCode || 0);
    }

    function getMessage(error, fallback, explicitStatus) {
        const messages = [];
        collect(error, messages, new Set());
        const useful = [...new Set(messages.map(clean))].find((message) =>
            message && !GENERIC_MESSAGES.has(message.toLowerCase()) && !isTechnical(message));

        return useful || STATUS_MESSAGES[statusOf(error, explicitStatus)] || fallback ||
            "The request could not be completed. Please try again.";
    }

    function normalize(error, fallback, explicitStatus) {
        const normalized = new Error(getMessage(error, fallback, explicitStatus));
        normalized.status = statusOf(error, explicitStatus);
        normalized.originalError = error;
        return normalized;
    }

    return { getMessage, normalize };
});
