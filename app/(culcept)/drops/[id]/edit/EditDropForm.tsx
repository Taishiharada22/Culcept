"use client";

import * as React from "react";
import type { DropActionState } from "../../new/type";
import TagInput from "@/app/components/TagInput";
import {
    updateDropMetaAction,
    addDropImagesAction,
    reorderDropImagesAction,
    deleteDropImageAction,
} from "./actions";

type Img = { id: string; public_url: string };

type Defaults = {
    id: string;
    title: string;
    brand: string | null;
    size: string | null;
    condition: string | null;
    price: number | null;
    url: string | null;
    purchase_url: string | null;
    tags: string[];
    description: string | null;
    images: Img[];
};

function arrayMove<T>(arr: T[], from: number, to: number) {
    const a = arr.slice();
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
}

export default function EditDropForm({ defaults }: { defaults: Defaults }) {
    const metaInitial: DropActionState = { ok: true, error: null, fieldErrors: {}, message: null };
    const [metaState, metaAction, metaPending] = React.useActionState(
        updateDropMetaAction.bind(null, defaults.id),
        metaInitial
    );

    const addInitial: DropActionState = { ok: true, error: null, fieldErrors: {}, message: null };
    const [addState, addAction, addPending] = React.useActionState(
        addDropImagesAction.bind(null, defaults.id),
        addInitial
    );

    const ordInitial: DropActionState = { ok: true, error: null, fieldErrors: {}, message: null };
    const [ordState, ordAction, ordPending] = React.useActionState(
        reorderDropImagesAction.bind(null, defaults.id),
        ordInitial
    );

    const [items, setItems] = React.useState<Img[]>(defaults.images);
    const [dragId, setDragId] = React.useState<string | null>(null);

    const orderJson = React.useMemo(() => JSON.stringify(items.map((x) => x.id)), [items]);

    return (
        <div style={{ display: "grid", gap: 14 }}>
            {/* META */}
            <form action={metaAction}>
                <fieldset disabled={metaPending} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                    <h2 style={{ margin: 0, fontWeight: 950, fontSize: 16 }}>Meta</h2>

                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div>
                            <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Title *</label>
                            <input
                                name="title"
                                required
                                defaultValue={defaults.title}
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
                            />
                            {metaState.fieldErrors?.title && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{metaState.fieldErrors.title}</p>}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Brand</label>
                                <input name="brand" defaultValue={defaults.brand ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Size</label>
                                <input name="size" defaultValue={defaults.size ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Condition</label>
                                <input name="condition" defaultValue={defaults.condition ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Price</label>
                                <input name="price" type="number" min={0} step="1" defaultValue={defaults.price ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {metaState.fieldErrors?.price && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{metaState.fieldErrors.price}</p>}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Tags</label>
                            <TagInput name="tags" defaultTags={defaults.tags} />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Link</label>
                                <input name="url" type="url" defaultValue={defaults.url ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {metaState.fieldErrors?.url && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{metaState.fieldErrors.url}</p>}
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Buy link</label>
                                <input name="purchase_url" type="url" defaultValue={defaults.purchase_url ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {metaState.fieldErrors?.purchase_url && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{metaState.fieldErrors.purchase_url}</p>}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Description</label>
                            <textarea name="description" rows={5} defaultValue={defaults.description ?? ""} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", resize: "vertical" }} />
                        </div>

                        {metaState.error && (
                            <div role="alert" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(220,38,38,0.4)" }}>
                                <p style={{ color: "crimson", margin: 0 }}>{metaState.error}</p>
                            </div>
                        )}
                        {metaState.message && !metaState.error && <p style={{ margin: 0, opacity: 0.75 }}>{metaState.message}</p>}

                        <button type="submit" disabled={metaPending} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 950 }}>
                            {metaPending ? "Saving..." : "Save meta"}
                        </button>
                    </div>
                </fieldset>
            </form>

            {/* IMAGES */}
            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <h2 style={{ margin: 0, fontWeight: 950, fontSize: 16 }}>Images</h2>
                <p style={{ margin: "8px 0 0", opacity: 0.7, fontSize: 13 }}>
                    Drag to reorder. First image becomes the cover.
                </p>

                {items.length > 0 ? (
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                        {items.map((im, idx) => (
                            <div
                                key={im.id}
                                draggable
                                onDragStart={() => setDragId(im.id)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (!dragId || dragId === im.id) return;
                                    const from = items.findIndex((x) => x.id === dragId);
                                    const to = idx;
                                    if (from < 0 || to < 0) return;
                                    setItems((prev) => arrayMove(prev, from, to));
                                }}
                                onDragEnd={() => setDragId(null)}
                                style={{
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 12,
                                    overflow: "hidden",
                                    background: "white",
                                    cursor: "grab",
                                }}
                                title="Drag"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={im.public_url} alt="img" style={{ width: "100%", height: 110, objectFit: "cover" }} />
                                <div style={{ padding: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: 12, opacity: 0.7 }}>{idx === 0 ? "Cover" : `#${idx + 1}`}</span>
                                    <form action={deleteDropImageAction.bind(null, defaults.id, im.id)}>
                                        <button type="submit" style={{ fontSize: 12, padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(220,38,38,0.45)", background: "transparent", cursor: "pointer", fontWeight: 900 }}>
                                            Remove
                                        </button>
                                    </form>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ marginTop: 12, opacity: 0.65 }}>No images yet.</p>
                )}

                <form action={ordAction} style={{ marginTop: 12 }}>
                    <input type="hidden" name="order" value={orderJson} />
                    {ordState.error && <p role="alert" style={{ color: "crimson", margin: "0 0 10px" }}>{ordState.error}</p>}
                    <button type="submit" disabled={ordPending || items.length === 0} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 950 }}>
                        {ordPending ? "Saving..." : "Save order"}
                    </button>
                </form>

                <form action={addAction} style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>Add images (max total 10)</label>
                    <input name="images" type="file" multiple accept="image/jpeg,image/png,image/webp" />
                    {addState.error && <p role="alert" style={{ color: "crimson", marginTop: 8 }}>{addState.error}</p>}
                    <button type="submit" disabled={addPending} style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white", fontWeight: 950 }}>
                        {addPending ? "Uploading..." : "Upload"}
                    </button>
                </form>
            </fieldset>
        </div>
    );
}
