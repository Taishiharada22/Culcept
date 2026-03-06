// app/my/orders/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import MyOrdersClient from "./MyOrdersClient";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined) {
    return Array.isArray(v) ? v[0] : v;
}

export default async function MyOrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tab = first(sp.tab) === "sales" ? "sales" : "purchases";

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
        return <MyOrdersClient isLoggedIn={false} tab={tab} orders={[]} />;
    }

    const userId = auth.user.id;

    const baseSelect = "id,status,paid_at,created_at,drop_id,amount_total,currency,stripe_session_id";

    const q = supabase
        .from("orders")
        .select(baseSelect)
        .order("created_at", { ascending: false })
        .limit(50);

    const { data: rows, error } =
        tab === "sales"
            ? await q.eq("seller_user_id", userId)
            : await q.eq("buyer_user_id", userId);

    const orders = (rows ?? []).map((o: any) => {
        const rawAmount = typeof o?.amount_total === "number" ? o.amount_total : Number(o?.amount_total ?? "");
        const amount_total = Number.isFinite(rawAmount) ? rawAmount : null;

        return {
            id: String(o?.id ?? ""),
            status: o?.status ?? null,
            paid_at: o?.paid_at ?? null,
            created_at: o?.created_at ?? null,
            drop_id: o?.drop_id ?? null,
            amount_total,
            currency: o?.currency ?? null,
            stripe_session_id: o?.stripe_session_id ?? null,
        };
    });

    return (
        <MyOrdersClient
            isLoggedIn
            tab={tab}
            orders={orders}
            errorMessage={error?.message ?? null}
        />
    );
}
