import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FitColorClient from "./FitColorClient";

type PageParams = { id: string };

type Props = {
    // Next.js (App Router) の型期待に合わせて Promise として受け取る
    params: Promise<PageParams>;
};

export default async function Page({ params }: Props) {
    const { id } = await params;

    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        const nextPath = `/shops/me/products/${id}/fit-color`;
        redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }

    const { data: product } = await supabase
        .from("drops")
        .select("id,title,cover_image_url,price,status")
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (!product) {
        redirect("/shops/me/products");
    }

    const [{ data: fitProfile }, { data: colorProfile }] = await Promise.all([
        supabase.from("garment_fit_profiles").select("*").eq("product_id", id).maybeSingle(),
        supabase.from("garment_color_profiles").select("*").eq("product_id", id).maybeSingle(),
    ]);

    return (
        <FitColorClient
            product={product}
            initialFit={fitProfile ?? null}
            initialColor={colorProfile ?? null}
        />
    );
}
