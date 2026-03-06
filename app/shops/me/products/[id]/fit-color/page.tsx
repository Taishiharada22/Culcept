import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FitColorClient from "./FitColorClient";

type PageParams = { id: string };

export default async function Page({ params }: { params: PageParams }) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
        redirect(`/login?next=/shops/me/products/${params.id}/fit-color`);
    }

    const { data: product } = await supabase
        .from("drops")
        .select("id,title,cover_image_url,price,status")
        .eq("id", params.id)
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (!product) {
        redirect("/shops/me/products");
    }

    const [{ data: fitProfile }, { data: colorProfile }] = await Promise.all([
        supabase.from("garment_fit_profiles").select("*").eq("product_id", params.id).maybeSingle(),
        supabase.from("garment_color_profiles").select("*").eq("product_id", params.id).maybeSingle(),
    ]);

    return (
        <FitColorClient
            product={product}
            initialFit={fitProfile ?? null}
            initialColor={colorProfile ?? null}
        />
    );
}
