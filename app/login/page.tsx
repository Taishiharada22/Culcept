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

    return <LoginForm nextPath={nextPath} />;
}
