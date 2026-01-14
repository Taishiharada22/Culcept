"use server";

import { cookies } from "next/headers";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocaleAction(formData: FormData) {
    const locale = String(formData.get("locale") ?? "en") === "ja" ? "ja" : "en";
    const cookieStore = await cookies();
    cookieStore.set("app_locale", locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
}
