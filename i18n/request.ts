// i18n/request.ts
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const SUPPORTED = new Set(["en", "ja"] as const);
type Locale = "en" | "ja";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("app_locale")?.value ?? "en";
  const locale: Locale = SUPPORTED.has(raw as Locale) ? (raw as Locale) : "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
