module.exports = [
"[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "supabaseAdmin",
    ()=>supabaseAdmin
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$server$2d$only$2f$empty$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/server-only/empty.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/index.mjs [app-rsc] (ecmascript) <locals>");
;
;
function mustGetEnv(name, value) {
    const v = (value ?? "").trim();
    if (!v) {
        throw new Error(`[supabaseAdmin] Missing env: ${name}. ` + `Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local`);
    }
    return v;
}
// URL は NEXT_PUBLIC_* を優先しつつ、なければ SUPABASE_URL も見る
const url = ("TURBOPACK compile-time value", "https://aljavfujeqcwnqryjmhl.supabase.co") ?? process.env.SUPABASE_URL;
// Service Role は絶対にクライアントへ渡さない（server-only で守る）
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const supabaseAdmin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$index$2e$mjs__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(mustGetEnv("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL", url), mustGetEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey), {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});
}),
"[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/* __next_internal_action_entry_do_not_use__ [{"60657f279b9abaabac4f96307a0d5844e5350d951c":"createDropAction"},"",""] */ __turbopack_context__.s([
    "createDropAction",
    ()=>createDropAction
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/cache.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase/server.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabaseAdmin.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-validate.js [app-rsc] (ecmascript)");
;
;
;
;
;
const BUCKET = "drops";
function s(v) {
    return typeof v === "string" ? v.trim() : "";
}
function normalizeUrl(raw) {
    const x = raw.trim();
    if (!x) return "";
    try {
        new URL(x);
        return x;
    } catch  {
        try {
            new URL("https://" + x);
            return "https://" + x;
        } catch  {
            return "";
        }
    }
}
function parseTags(json) {
    if (!json) return [];
    try {
        const v = JSON.parse(json);
        if (!Array.isArray(v)) return [];
        return v.map((x)=>String(x ?? "").trim().toLowerCase()).filter(Boolean).slice(0, 20);
    } catch  {
        return [];
    }
}
function isColumnMissingError(err) {
    const code = String(err?.code ?? "");
    const msg = String(err?.message ?? "");
    return code === "42703" || msg.includes("column") && msg.includes("does not exist");
}
async function uploadImages(dropId, userId, files) {
    const uploaded = [];
    for(let i = 0; i < files.length; i++){
        const f = files[i];
        if (!f || f.size === 0) continue;
        if (!String(f.type || "").startsWith("image/")) continue;
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const safeExt = ext.length <= 6 ? ext : "jpg";
        const path = `${dropId}/${crypto.randomUUID()}.${safeExt}`;
        const buf = Buffer.from(await f.arrayBuffer());
        const { error: upErr } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].storage.from(BUCKET).upload(path, buf, {
            contentType: f.type || "image/jpeg",
            upsert: false
        });
        if (upErr) throw upErr;
        const pub = __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].storage.from(BUCKET).getPublicUrl(path);
        const public_url = pub.data.publicUrl;
        uploaded.push({
            sort: i,
            public_url,
            path
        });
    }
    if (uploaded.length > 0) {
        // drop_images insert（path/user_id 列が無いDBでも落ちない）
        const rowsFull = uploaded.map((x)=>({
                drop_id: dropId,
                user_id: userId,
                sort: x.sort,
                public_url: x.public_url,
                path: x.path
            }));
        const { error: insErr1 } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].from("drop_images").insert(rowsFull);
        if (insErr1) {
            if (isColumnMissingError(insErr1)) {
                // まず path 抜き
                const rowsNoPath = uploaded.map((x)=>({
                        drop_id: dropId,
                        user_id: userId,
                        sort: x.sort,
                        public_url: x.public_url
                    }));
                const { error: insErr2 } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].from("drop_images").insert(rowsNoPath);
                if (insErr2 && isColumnMissingError(insErr2)) {
                    // user_id も無い場合
                    const rowsMin = uploaded.map((x)=>({
                            drop_id: dropId,
                            sort: x.sort,
                            public_url: x.public_url
                        }));
                    const { error: insErr3 } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].from("drop_images").insert(rowsMin);
                    if (insErr3) throw insErr3;
                } else if (insErr2) {
                    throw insErr2;
                }
            } else {
                throw insErr1;
            }
        }
        // cover
        const cover = uploaded[0]?.public_url ?? null;
        if (cover) {
            const { error: updErr } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].from("drops").update({
                cover_image_url: cover
            }).eq("id", dropId);
            if (updErr && !isColumnMissingError(updErr)) throw updErr;
        }
    }
    return uploaded;
}
async function createDropAction(_prev, formData) {
    const supabase = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2f$server$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseServer"])();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return {
        ok: false,
        error: "ログインしてください。"
    };
    const title = s(formData.get("title"));
    const brand = s(formData.get("brand"));
    const size = s(formData.get("size"));
    const condition = s(formData.get("condition"));
    const priceRaw = s(formData.get("price"));
    const urlRaw = s(formData.get("url"));
    const purchaseRaw = s(formData.get("purchase_url"));
    const description = s(formData.get("description"));
    const tagsJson = s(formData.get("tags"));
    const fieldErrors = {};
    if (!title || title.length < 2) fieldErrors.title = "Title は2文字以上を推奨。";
    let price = null;
    if (priceRaw) {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) fieldErrors.price = "Price は0以上の数字にして。";
        else price = Math.floor(n);
    }
    const url = urlRaw ? normalizeUrl(urlRaw) : "";
    if (urlRaw && !url) fieldErrors.url = "URL形式が不正。https:// を含めて。";
    const purchase_url = purchaseRaw ? normalizeUrl(purchaseRaw) : "";
    if (purchaseRaw && !purchase_url) fieldErrors.purchase_url = "URL形式が不正。https:// を含めて。";
    const tags = parseTags(tagsJson);
    if (Object.keys(fieldErrors).length > 0) return {
        ok: false,
        error: "入力を確認して。",
        fieldErrors
    };
    // insert drop
    const { data: inserted, error: insErr } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabaseAdmin$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["supabaseAdmin"].from("drops").insert({
        user_id: user.id,
        title,
        brand: brand || null,
        size: size || null,
        condition: condition || null,
        price,
        url: url || null,
        purchase_url: purchase_url || null,
        description: description || null,
        tags: tags.length ? tags : null
    }).select("id").single();
    if (insErr || !inserted?.id) return {
        ok: false,
        error: insErr?.message ?? "作成に失敗した。"
    };
    const dropId = inserted.id;
    // images (optional)
    const files = formData.getAll("images").filter((x)=>x instanceof File);
    const limited = files.slice(0, 12);
    try {
        if (limited.length > 0) {
            await uploadImages(dropId, user.id, limited);
        }
    } catch (e) {
        return {
            ok: false,
            error: `画像アップロードに失敗: ${e?.message ?? "unknown"}`
        };
    }
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])("/drops");
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["revalidatePath"])(`/drops/${dropId}`);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])(`/drops/${dropId}`);
}
;
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$action$2d$validate$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["ensureServerEntryExports"])([
    createDropAction
]);
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])(createDropAction, "60657f279b9abaabac4f96307a0d5844e5350d951c", null);
}),
"[project]/.next-internal/server/app/drops/new/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/login/actions.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/login/actions.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$drops$2f$new$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)");
;
;
;
}),
"[project]/.next-internal/server/app/drops/new/page/actions.js { ACTIONS_MODULE0 => \"[project]/app/login/actions.ts [app-rsc] (ecmascript)\", ACTIONS_MODULE1 => \"[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "003af1db1e1d56e96cd9bb4adb8bb8da6a5bf2b974",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["logoutAction"],
    "60657f279b9abaabac4f96307a0d5844e5350d951c",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$drops$2f$new$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createDropAction"],
    "60faef4636f589674be7bd964e90055fe8ec65938f",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["authAction"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f2e$next$2d$internal$2f$server$2f$app$2f$drops$2f$new$2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$app$2f$login$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29222c$__ACTIONS_MODULE1__$3d3e$__$225b$project$5d2f$app$2f$drops$2f$new$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/.next-internal/server/app/drops/new/page/actions.js { ACTIONS_MODULE0 => "[project]/app/login/actions.ts [app-rsc] (ecmascript)", ACTIONS_MODULE1 => "[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$login$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/login/actions.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$drops$2f$new$2f$actions$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/drops/new/actions.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=_5ed383a2._.js.map