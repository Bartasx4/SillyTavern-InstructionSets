export function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

export function deepClone(value) {
    return typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function randomToken(length = 8) {
    if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(Math.ceil(length / 2));
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
    }

    return Math.random().toString(36).slice(2, 2 + length);
}

export function generateId(prefix = 'id') {
    return `${prefix}_${randomToken(10)}`;
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function normalizeNumber(value, fallback = 0, { min = null, max = null } = {}) {
    let normalized = Number(value);

    if (!Number.isFinite(normalized)) {
        normalized = fallback;
    }

    if (min !== null) {
        normalized = Math.max(min, normalized);
    }

    if (max !== null) {
        normalized = Math.min(max, normalized);
    }

    return normalized;
}

export function sortByOrderThenIndex(items) {
    return [...items].sort((left, right) => {
        const orderDiff = Number(left.order ?? 0) - Number(right.order ?? 0);
        if (orderDiff !== 0) {
            return orderDiff;
        }

        return Number(left.index ?? 0) - Number(right.index ?? 0);
    });
}

export function getSortableDelaySafe() {
    if (typeof window.getSortableDelay === 'function') {
        return window.getSortableDelay();
    }

    return 50;
}
