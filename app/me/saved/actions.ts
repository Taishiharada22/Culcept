// app/me/saved/actions.ts
"use server";

import { redirect } from "next/navigation";
import { removeSavedDropAction, removeSavedShopAction } from "@/app/_actions/saved";

function clean(v: unknown) {
    return String(v ?? "").trim();
}

function enc(v: string) {
    return encodeURIComponent(v);
}

export async function removeSavedDropFromForm(formData: FormData) {
    const dropId = clean(formData.get("drop_id"));
    if (!dropId) redirect("/me/saved?m=invalid");

    const res = await removeSavedDropAction(dropId);
    if (!res.ok) {
        if (res.error === "not signed in") redirect("/me/saved?m=not_signed_in");
        redirect(`/me/saved?e=${enc(res.error ?? "unknown error")}`);
    }
    redirect("/me/saved?m=drop_removed");
}

export async function removeSavedShopFromForm(formData: FormData) {
    const slug = clean(formData.get("shop_slug"));
    if (!slug) redirect("/me/saved?m=invalid");

    const res = await removeSavedShopAction(slug);
    if (!res.ok) {
        if (res.error === "not signed in") redirect("/me/saved?m=not_signed_in");
        redirect(`/me/saved?e=${enc(res.error ?? "unknown error")}`);
    }
    redirect("/me/saved?m=shop_removed");
}
