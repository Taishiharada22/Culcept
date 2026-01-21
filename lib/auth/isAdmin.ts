import "server-only";

export function getAdminEmails(): string[] {
    return String(process.env.CULCEPT_ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
    const admins = getAdminEmails();
    if (admins.length === 0) return true; // 未設定なら一旦許可（必要なら env 入れるだけで締まる）
    const e = String(email ?? "").toLowerCase();
    return !!e && admins.includes(e);
}
