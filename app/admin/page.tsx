// app/admin/page.tsx
import Link from "next/link";

export default function AdminHome() {
    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-bold">Admin</h1>

            <div className="space-y-2">
                <Link className="underline" href="/admin/cards">
                    Cards
                </Link>
            </div>
        </div>
    );
}
