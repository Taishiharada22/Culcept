// lib/auth/isAdmin.ts
import "server-only";

export function getAdminEmails(): string[] {
    const raw = String(
        process.env.CULCEPT_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? ""
    )
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    return raw;
}

export function isAdminEmail(email?: string | null): boolean {
    const admins = getAdminEmails();
    const normalized = String(email ?? "").trim().toLowerCase();

    if (process.env.NODE_ENV !== "production" && normalized.endsWith("@aneurasync.test")) {
        return true;
    }

    // ✅ 未設定なら一旦許可（env入れるだけで締まる）
    if (admins.length === 0) return true;

    return !!normalized && admins.includes(normalized);
}
