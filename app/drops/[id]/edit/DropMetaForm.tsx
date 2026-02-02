// app/drops/[id]/edit/DropMetaForm.tsx
"use client";

import * as React from "react";
import type { DropActionState } from "../../new/type";
import { updateDropMetaAction } from "./actions";

const SIZE_OPTIONS = [
    { value: "", label: "選択して" },
    { value: "S", label: "S（160〜165cm）" },
    { value: "M", label: "M（165〜175cm）" },
    { value: "L", label: "L（175〜180cm）" },
    { value: "LL", label: "LL（185cm〜）" },
] as const;

const COND_OPTIONS = [
    { value: "", label: "選択して" },
    { value: "almost_new", label: "almost new" },
    { value: "good", label: "good" },
    { value: "well", label: "well" },
    { value: "damaged", label: "damaged" },
] as const;

function normalizeCondForSelect(v: string) {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "almost new" || s === "almost-new") return "almost_new";
    return s;
}

function toLocalInputValue(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const off = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - off);
    return local.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

function TagEditor({ name, defaultTags }: { name: string; defaultTags: string[] }) {
    const [tags, setTags] = React.useState<string[]>(defaultTags ?? []);
    const [v, setV] = React.useState("");

    const add = (raw: string) => {
        const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
        if (!t) return;
        if (tags.includes(t)) return;
        if (tags.length >= 15) return;
        setTags((p) => [...p, t]);
    };

    const remove = (t: string) => setTags((p) => p.filter((x) => x !== t));

    return (
        <div className="grid gap-2">
            <input type="hidden" name={name} value={JSON.stringify(tags)} />

            <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => remove(t)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50"
                        title="クリックで削除"
                    >
                        #{t}
                    </button>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    value={v}
                    onChange={(e) => setV(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add(v);
                            setV("");
                        }
                    }}
                    placeholder="タグを入力して Enter（例: vintage / workwear）"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <button
                    type="button"
                    onClick={() => {
                        add(v);
                        setV("");
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-extrabold text-white hover:bg-zinc-800"
                >
                    Add
                </button>
            </div>

            <div className="text-xs font-semibold text-zinc-500">最大15個。重複は自動で弾く。</div>
        </div>
    );
}

export default function DropMetaForm({
    dropId,
    defaults,
}: {
    dropId: string;
    defaults: {
        title: string;
        brand: string;
        size: string;
        condition: string;

        // fixed の価格
        price: string | number;

        // ✅ auction の buy now 価格（DBに列が無い場合は actions 側で price にフォールバック）
        buy_now_price: string | number;

        url: string;
        purchase_url: string;
        description: string;
        tags: string[];

        sale_mode: "fixed" | "auction";
        auction_floor_price: string | number;
        auction_end_at: string | null;
        auction_allow_buy_now: boolean;
    };
}) {
    const initial: DropActionState = { ok: true, error: null } as any;
    const [state, formAction, pending] = (React as any).useActionState(updateDropMetaAction.bind(null, dropId), initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;
    const msg = (state as any)?.message as string | undefined;

    const defSize = String(defaults.size ?? "").trim().toUpperCase();
    const defCond = normalizeCondForSelect(String(defaults.condition ?? ""));

    const [saleMode, setSaleMode] = React.useState<"fixed" | "auction">(defaults.sale_mode ?? "fixed");

    // 入力欄を saleMode によって切り替える
    const priceFieldName = saleMode === "auction" ? "buy_now_price" : "price";
    const priceDefault =
        saleMode === "auction"
            ? String(defaults.buy_now_price ?? "")
            : String(defaults.price ?? "");

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
            ) : null}

            {msg && state?.ok ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                    {msg}
                </div>
            ) : null}

            {/* Selling mode */}
            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Selling</label>
                <select
                    name="sale_mode"
                    value={saleMode}
                    onChange={(e) => setSaleMode(e.currentTarget.value === "auction" ? "auction" : "fixed")}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                >
                    <option value="fixed">Fixed（通常販売）</option>
                    <option value="auction">Auction（入札/オファー）</option>
                </select>
                <div className="text-xs font-semibold text-zinc-500">
                    Fixed = 今の価格で即購入 / Auction = 最低価格＋締切を設定して、買い手が上乗せオファーできる
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Title *</label>
                <input
                    name="title"
                    defaultValue={defaults.title}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="e.g. Patagonia Retro-X"
                />
                {fieldErr("title") ? <div className="text-xs font-semibold text-red-700">{fieldErr("title")}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Brand</label>
                    <input
                        name="brand"
                        defaultValue={defaults.brand}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Nike"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Size</label>
                    <select
                        name="size"
                        defaultValue={SIZE_OPTIONS.some((o) => o.value === defSize) ? defSize : ""}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                        {SIZE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    {fieldErr("size") ? <div className="text-xs font-semibold text-red-700">{fieldErr("size")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Condition</label>
                    <select
                        name="condition"
                        defaultValue={COND_OPTIONS.some((o) => o.value === defCond) ? defCond : ""}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                        {COND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    {fieldErr("condition") ? <div className="text-xs font-semibold text-red-700">{fieldErr("condition")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">{saleMode === "auction" ? "Buy now price (JPY)" : "Price (JPY)"}</label>
                    <input
                        name={priceFieldName}
                        defaultValue={priceDefault}
                        inputMode="numeric"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. 9800"
                    />
                    {fieldErr(priceFieldName) ? <div className="text-xs font-semibold text-red-700">{fieldErr(priceFieldName)}</div> : null}
                    {saleMode === "auction" ? (
                        <div className="text-xs font-semibold text-zinc-500">
                            ※ 「Allow Buy now」をONにするなら buy now price を入れる（OFFなら空でもOK）
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Auction fields */}
            {saleMode === "auction" ? (
                <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
                    <div className="grid gap-2">
                        <label className="text-sm font-extrabold">Auction floor (JPY) *</label>
                        <input
                            name="auction_floor_price"
                            defaultValue={String(defaults.auction_floor_price ?? "")}
                            inputMode="numeric"
                            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                            placeholder="e.g. 8000"
                        />
                        {fieldErr("auction_floor_price") ? (
                            <div className="text-xs font-semibold text-red-700">{fieldErr("auction_floor_price")}</div>
                        ) : null}
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-extrabold">Auction end (JST) *</label>
                        <input
                            name="auction_end_at"
                            type="datetime-local"
                            defaultValue={toLocalInputValue(defaults.auction_end_at)}
                            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        />
                        {fieldErr("auction_end_at") ? <div className="text-xs font-semibold text-red-700">{fieldErr("auction_end_at")}</div> : null}
                        <div className="text-xs font-semibold text-zinc-500">※ 入力はJST想定。締切を過ぎたら「固定に戻す」か「延長」</div>
                    </div>

                    <label className="col-span-full flex items-center gap-2 text-sm font-extrabold">
                        <input
                            name="auction_allow_buy_now"
                            type="checkbox"
                            defaultChecked={!!defaults.auction_allow_buy_now}
                            className="h-4 w-4"
                        />
                        Allow “Buy now” during auction
                    </label>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Link</label>
                    <input
                        name="url"
                        defaultValue={defaults.url}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fieldErr("url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("url")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Buy link</label>
                    <input
                        name="purchase_url"
                        defaultValue={defaults.purchase_url}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fieldErr("purchase_url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("purchase_url")}</div> : null}
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Description</label>
                <textarea
                    name="description"
                    defaultValue={defaults.description}
                    className="min-h-[120px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="素材感、スタイリング案、メモ..."
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Tags</label>
                <TagEditor name="tags" defaultTags={defaults.tags ?? []} />
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Saving..." : "Save meta"}
                </button>
            </div>
        </form>
    );
}
