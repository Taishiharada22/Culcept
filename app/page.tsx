import Link from "next/link";

export default function Home() {
    return (
        <main style={{ maxWidth: 860, margin: "40px auto", padding: 16 }}>
            <h1 style={{ fontSize: 34, fontWeight: 900 }}>Culcept</h1>
            <p style={{ opacity: 0.8, marginTop: 8 }}>
                Find the best Japanese vintage & street shops, and mini drops.
            </p>

            <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                <Link href="/match" style={{ padding: 12, border: "1px solid #ddd" }}>Go to Match</Link>
                <Link href="/shops" style={{ padding: 12, border: "1px solid #ddd" }}>Browse Shops</Link>
                <Link href="/drops" style={{ padding: 12, border: "1px solid #ddd" }}>Mini Drops</Link>
            </div>
        </main>
    );
}
