import "server-only";

function norm(s: string) {
    return s.trim().toLowerCase();
}

export function isAdminEmail(email: string | null | undefined) {
    if (!email) return false;
    const allow = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map(norm)
        .filter(Boolean);

    if (allow.length === 0) return false;
    return allow.includes(norm(email));
}
