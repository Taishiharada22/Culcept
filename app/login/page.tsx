import LoginForm from "./LoginForm";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: { next?: string };
}) {
    const nextPath = typeof searchParams?.next === "string" ? searchParams.next : "/drops";

    return (
        <main style={{ maxWidth: 520, margin: "60px auto", padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>Login</h1>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <LoginForm nextPath={nextPath} />
            </div>
        </main>
    );
}
