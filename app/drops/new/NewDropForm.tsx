"use client";

import * as React from "react";
import TagInput from "@/app/components/TagInput";
import type { DropActionState } from "./actions";

export default function NewDropForm({
    action,
}: {
    action: (prev: DropActionState, formData: FormData) => Promise<DropActionState>;
}) {
    const initialState: DropActionState = { ok: true, error: null, fieldErrors: {} };
    const [state, formAction, isPending] = React.useActionState(action as any, initialState);

    const [previews, setPreviews] = React.useState<string[]>([]);

    React.useEffect(() => {
        return () => previews.forEach((u) => URL.revokeObjectURL(u));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 16 }}>New Drop</h1>

            <form action={formAction} aria-busy={isPending}>
                <fieldset disabled={isPending} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                    <div style={{ display: "grid", gap: 12 }}>
                        <div>
                            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Title *</label>
                            <input name="title" required style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            {state.fieldErrors?.title && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{state.fieldErrors.title}</p>}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Brand</label>
                                <input name="brand" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Size</label>
                                <input name="size" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Condition</label>
                                <input name="condition" placeholder="e.g., new / like new / used" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Price</label>
                                <input name="price" type="number" min={0} step="1" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {state.fieldErrors?.price && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{state.fieldErrors.price}</p>}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Tags</label>
                            <TagInput name="tags" />
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Link</label>
                                <input name="url" type="url" placeholder="https://..." style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {state.fieldErrors?.url && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{state.fieldErrors.url}</p>}
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Buy link</label>
                                <input name="purchase_url" type="url" placeholder="https://..." style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }} />
                                {state.fieldErrors?.purchase_url && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{state.fieldErrors.purchase_url}</p>}
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
                                Images (max 12, jpg/png/webp, ≤6MB each)
                            </label>
                            <input
                                name="images"
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => {
                                    const files = Array.from(e.currentTarget.files ?? []);
                                    previews.forEach((u) => URL.revokeObjectURL(u));
                                    setPreviews(files.map((f) => URL.createObjectURL(f)));
                                }}
                            />
                            {state.fieldErrors?.images && <p role="alert" style={{ marginTop: 6, color: "crimson" }}>{state.fieldErrors.images}</p>}

                            {previews.length > 0 && (
                                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                    {previews.map((src) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={src} src={src} alt="preview" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>Description</label>
                            <textarea name="description" rows={5} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", resize: "vertical" }} />
                        </div>

                        {state.error && (
                            <div role="alert" style={{ padding: 12, borderRadius: 10, border: "1px solid rgba(220, 38, 38, 0.4)" }}>
                                <p style={{ color: "crimson", margin: 0 }}>{state.error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isPending}
                            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "white", cursor: isPending ? "not-allowed" : "pointer", fontWeight: 900 }}
                        >
                            {isPending ? "Submitting..." : "Create"}
                        </button>
                    </div>
                </fieldset>
            </form>
        </main>
    );
}
