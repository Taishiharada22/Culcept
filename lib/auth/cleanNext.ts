// lib/auth/cleanNext.ts
// リダイレクト先のサニタイズ — same-origin 相対パスのみ許可
// 外部URLに化ける入力は全て "/" へフォールバック

export function cleanNext(next: string | null | undefined): string {
    const n = (next ?? "").trim();
    if (!n || !n.startsWith("/")) return "/";
    // protocol-relative URL (//evil.com) をブロック
    if (n.startsWith("//")) return "/";
    // backslash trick (/\evil.com) をブロック — ブラウザが / に正規化する
    if (n.includes("\\")) return "/";
    // 最終防御: URL パースで hostname が変わるケースを検出
    try {
        const parsed = new URL(n, "http://x");
        if (parsed.hostname !== "x") return "/";
    } catch {
        return "/";
    }
    return n;
}
