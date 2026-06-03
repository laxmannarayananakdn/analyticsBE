/**
 * Parse RunBy / RunDTTM columns from finance upload files.
 */
export function parseRunBy(value) {
    if (value == null)
        return null;
    const s = String(value).trim();
    return s === '' ? null : s;
}
/**
 * Parse RunDTTM (e.g. "2026/04/23 15:40:26") to Date for DATETIMEOFFSET storage.
 */
export function parseRunDttm(value) {
    if (value == null)
        return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }
    const s = String(value).trim();
    if (!s)
        return null;
    const slashMatch = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (slashMatch) {
        const [, y, mo, d, h, mi, se] = slashMatch;
        const parsed = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const isoLike = new Date(s);
    return Number.isNaN(isoLike.getTime()) ? null : isoLike;
}
//# sourceMappingURL=financeRunMetadata.js.map