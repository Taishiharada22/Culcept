// app/login/page.tsx
import LoginForm from "./LoginForm";

type SP = Record<string, string | string[] | undefined>;

function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams?: Promise<SP>;
}) {
    const sp = (await searchParams) ?? ({} as SP);
    const nextRaw = spStr(sp.next);
    const nextPath = nextRaw || "/drops";

    return (
        <main style={{ maxWidth: 520, margin: "60px auto", padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>Login</h1>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <LoginForm nextPath={nextPath} />
            </div>
        </main>
    );
}
