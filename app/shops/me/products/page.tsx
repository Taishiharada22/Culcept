// app/shops/me/products/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import ProductSelectionGrid from "@/components/seller/ProductSelectionGrid";
import { redirect } from "next/navigation";

export default async function MyProductsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/shops/me/products");
    }

    // 自分の商品を取得
    const { data: products } = await supabase
        .from("drops")
        .select("id,title,price,cover_image_url,status,created_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });

    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <h1 className="text-4xl font-black mb-8">Product Management</h1>

            <ProductSelectionGrid products={products || []} />
        </div>
    );
}