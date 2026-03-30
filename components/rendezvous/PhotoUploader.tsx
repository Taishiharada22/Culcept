"use client";

/**
 * PhotoUploader
 * 3-5枚スロット、ドラッグ並び替え、画像圧縮
 * Supabase Storage `rendezvous-photos` バケットへアップロード
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { compressImage } from "@/lib/rendezvous/imageCompression";

type PhotoSlot = {
  id: string;
  storagePath: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
};

const MAX_PHOTOS = 5;

export default function PhotoUploader() {
  const supabase = supabaseBrowser();
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Load existing photos
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("rendezvous_photos")
        .select("id, storage_path, display_order, is_primary")
        .eq("user_id", user.id)
        .order("display_order");

      if (data) {
        const slots: PhotoSlot[] = data.map((row: { id: string; storage_path: string; display_order: number; is_primary: boolean }) => {
          const { data: urlData } = supabase.storage
            .from("rendezvous-photos")
            .getPublicUrl(row.storage_path);
          return {
            id: row.id,
            storagePath: row.storage_path,
            url: urlData?.publicUrl ?? "",
            displayOrder: row.display_order,
            isPrimary: row.is_primary,
          };
        });
        setPhotos(slots);
      }
    })();
  }, [supabase]);

  // Upload handler
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      if (photos.length >= MAX_PHOTOS) {
        setError(`最大${MAX_PHOTOS}枚まで`);
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const file = files[0];
        const compressed = await compressImage(file);
        const ext = "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("rendezvous-photos")
          .upload(path, compressed, { contentType: "image/jpeg", upsert: false });

        if (uploadErr) throw uploadErr;

        const newOrder = photos.length;
        const { data: row, error: dbErr } = await supabase
          .from("rendezvous_photos")
          .insert({
            user_id: user.id,
            storage_path: path,
            display_order: newOrder,
            is_primary: newOrder === 0,
          })
          .select()
          .single();

        if (dbErr) throw dbErr;

        const { data: urlData } = supabase.storage
          .from("rendezvous-photos")
          .getPublicUrl(path);

        setPhotos((prev) => [
          ...prev,
          {
            id: row.id,
            storagePath: path,
            url: urlData?.publicUrl ?? "",
            displayOrder: newOrder,
            isPrimary: newOrder === 0,
          },
        ]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [photos, supabase],
  );

  // Delete handler
  const handleDelete = useCallback(
    async (photoId: string) => {
      const target = photos.find((p) => p.id === photoId);
      if (!target) return;

      try {
        await supabase.storage.from("rendezvous-photos").remove([target.storagePath]);
        await supabase.from("rendezvous_photos").delete().eq("id", photoId);
        setPhotos((prev) => {
          const filtered = prev.filter((p) => p.id !== photoId);
          // Reorder
          return filtered.map((p, i) => ({ ...p, displayOrder: i, isPrimary: i === 0 }));
        });
      } catch {
        setError("削除に失敗しました");
      }
    },
    [photos, supabase],
  );

  // Reorder via drag
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragIdx(idx);
  }, []);

  const handleDrop = useCallback(
    async (targetIdx: number) => {
      if (dragIdx === null || dragIdx === targetIdx) {
        setDragIdx(null);
        return;
      }

      const reordered = [...photos];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(targetIdx, 0, moved);

      const updated = reordered.map((p, i) => ({
        ...p,
        displayOrder: i,
        isPrimary: i === 0,
      }));
      setPhotos(updated);
      setDragIdx(null);

      // Persist order
      for (const p of updated) {
        await supabase
          .from("rendezvous_photos")
          .update({ display_order: p.displayOrder, is_primary: p.isPrimary })
          .eq("id", p.id);
      }
    },
    [dragIdx, photos, supabase],
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C" }}>写真</span>
        <span style={{ fontSize: 11, color: "rgba(30,30,60,0.35)" }}>
          {photos.length}/{MAX_PHOTOS}枚
        </span>
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: "#EF4444",
            background: "rgba(239,68,68,0.06)",
            padding: "6px 10px",
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      {/* Photo grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {photos.map((photo, idx) => (
          <div
            key={photo.id}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={() => setDragIdx(null)}
            style={{
              position: "relative",
              aspectRatio: "3/4",
              borderRadius: 12,
              overflow: "hidden",
              background: `url(${photo.url}) center/cover`,
              border: dragIdx === idx
                ? "2px solid rgba(99,102,241,0.5)"
                : "1px solid rgba(99,102,241,0.08)",
              cursor: "grab",
              transition: "border-color 0.2s",
            }}
          >
            {/* Primary badge */}
            {photo.isPrimary && (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#fff",
                  background: "rgba(99,102,241,0.7)",
                }}
              >
                メイン
              </span>
            )}
            {/* Delete button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.4)",
                border: "none",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &#10005;
            </button>
          </div>
        ))}

        {/* Add slot */}
        {photos.length < MAX_PHOTOS && (
          <label
            style={{
              aspectRatio: "3/4",
              borderRadius: 12,
              border: "2px dashed rgba(99,102,241,0.15)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: uploading ? "wait" : "pointer",
              background: "rgba(99,102,241,0.02)",
              transition: "background 0.2s",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: "none" }}
            />
            <span style={{ fontSize: 24, color: "rgba(99,102,241,0.3)" }}>+</span>
            <span style={{ fontSize: 10, color: "rgba(30,30,60,0.3)", marginTop: 4 }}>
              {uploading ? "アップロード中..." : "追加"}
            </span>
          </label>
        )}
      </div>

      <p style={{ fontSize: 10, color: "rgba(30,30,60,0.25)", marginTop: 8 }}>
        ドラッグで並び替え。最大1200pxに自動リサイズされます。
      </p>
    </div>
  );
}
