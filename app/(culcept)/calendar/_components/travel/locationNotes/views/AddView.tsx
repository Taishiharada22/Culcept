// app/(culcept)/calendar/_components/travel/locationNotes/views/AddView.tsx
// Concept 18 — Add（＋）。新しい案内（旅行/スポット）を追加するフォーム。
// 追加タイプ・名称・ジャンル・区分(王道/穴場)・視点(地元民/旅行者)・写真・テーマ・タグ・エリア・説明。
// session 内 in-memory で追加（main 未接続）。
"use client";

import * as React from "react";
import { T } from "../../concierge/primitives";
import { PhotoSlot } from "../../PhotoSlot";
import { Plus, Check } from "../../concierge/icons";
import type { LocationItem, LocationItemKind, LocationClassification, LocationSource, TravelTheme } from "../../../../_lib/travel/types";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold" style={{ color: T.ink2 }}>{label}{hint && <span className="ml-1 font-normal" style={{ color: T.ink3 }}>{hint}</span>}</label>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} className="flex-1 rounded-xl border py-2 text-[12.5px] font-medium transition" style={on ? { borderColor: T.goldDeep, background: T.goldBg, color: T.goldDeep } : { borderColor: T.border, background: T.card, color: T.ink2 }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const inputStyle: React.CSSProperties = { borderColor: T.border, background: T.card, color: T.ink };
const GENRE_SUGGEST = ["寺社・文化", "自然・散策", "カフェ", "グルメ", "庭園", "景観・写真"];
const DRAFT_KEY = "aneurasync.travel.locationNotes.draft.v1";

export function AddView({ prefecture, themes, onAddItem, onToast }: { prefecture: string; themes: TravelTheme[]; onAddItem: (item: LocationItem) => void; onToast: (msg: string) => void }) {
  const [kind, setKind] = React.useState<LocationItemKind>("trip");
  const [classification, setClassification] = React.useState<LocationClassification>("standard");
  const [source, setSource] = React.useState<LocationSource>("local");
  const [title, setTitle] = React.useState("");
  const [genre, setGenre] = React.useState("");
  const [area, setArea] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [themeKeys, setThemeKeys] = React.useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const transferredRef = React.useRef(false); // 追加でアイテムへ所有権移譲したら cleanup の revoke を抑止

  // 下書き復元（写真 objectURL は揮発のため除く）
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Record<string, unknown>>;
      if (typeof d.kind === "string") setKind(d.kind as LocationItemKind);
      if (typeof d.classification === "string") setClassification(d.classification as LocationClassification);
      if (typeof d.source === "string") setSource(d.source as LocationSource);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.genre === "string") setGenre(d.genre);
      if (typeof d.area === "string") setArea(d.area);
      if (typeof d.tags === "string") setTags(d.tags);
      if (typeof d.desc === "string") setDesc(d.desc);
      if (Array.isArray(d.themeKeys)) setThemeKeys(d.themeKeys.filter((x): x is string => typeof x === "string"));
    } catch {
      /* 破損時は無視 */
    }
  }, []);

  // objectURL 後始末（アイテムへ移譲済みなら revoke しない＝追加後のカード画像を壊さない）
  React.useEffect(() => () => { if (photoUrl && !transferredRef.current) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoUrl && !transferredRef.current) URL.revokeObjectURL(photoUrl);
    transferredRef.current = false; // 選び直しは未移譲に戻す
    setPhotoUrl(URL.createObjectURL(file));
  };

  const saveDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, classification, source, title, genre, area, tags, desc, themeKeys }));
      onToast("下書きを保存しました");
    } catch {
      onToast("下書きの保存に失敗しました");
    }
  };

  const toggleTheme = (k: string) => setThemeKeys((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const canSubmit = title.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const item: LocationItem = {
      id: `user-${Date.now()}`,
      kind,
      prefecture,
      title: title.trim(),
      areaLabel: area.trim() || `${prefecture}`,
      classification,
      source,
      author: { name: "あなた", source, roleLabel: "あなたのノート" },
      genre: genre.trim() || "その他",
      themeKeys,
      tags: tags.split(/[、,\s]+/).map((s) => s.trim()).filter(Boolean),
      rating: 0,
      ratingCount: 0,
      description: desc.trim() || "（説明は未入力です）",
      photo: photoUrl
        ? { source: "user", url: photoUrl, caption: title.trim() }
        : { source: "placeholder", label: title.trim() || "ノート", tone: "neutral" },
      ...(kind === "trip" ? { durationLabel: "未設定", spotCount: 0 } : { hours: "未設定" }),
    };
    if (photoUrl) transferredRef.current = true; // objectURL の所有権をアイテムへ移譲
    onAddItem(item);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-[16px]" style={{ color: T.ink, fontWeight: 700 }}>新しい案内を追加</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: T.ink3 }}>自分だけの発見を、{prefecture}のノートに加えましょう。</p>
      </div>

      <Field label="追加タイプ">
        <Segmented value={kind} onChange={setKind} options={[{ key: "trip", label: "旅行プラン" }, { key: "spot", label: "スポット" }]} />
      </Field>

      <Field label="名称" hint="必須">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "trip" ? "例：嵐山の自然と隠れ家ランチ" : "例：石塀小路の朝さんぽ"} className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
      </Field>

      <Field label="ジャンル">
        <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="例：寺社・文化" className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {GENRE_SUGGEST.map((g) => (
            <button key={g} type="button" onClick={() => setGenre(g)} className="rounded-full px-2.5 py-1 text-[11px]" style={genre === g ? { background: T.goldBg, color: T.goldDeep } : { background: T.cardAlt, color: T.ink3, border: `1px solid ${T.border}` }}>{g}</button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="区分">
          <Segmented value={classification} onChange={setClassification} options={[{ key: "classic", label: "王道" }, { key: "hidden", label: "穴場" }, { key: "standard", label: "定番" }]} />
        </Field>
        <Field label="視点">
          <Segmented value={source} onChange={setSource} options={[{ key: "local", label: "地元民" }, { key: "traveler", label: "旅行者" }]} />
        </Field>
      </div>

      <Field label="写真">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        <PhotoSlot
          photo={photoUrl ? { source: "user", url: photoUrl, caption: title } : null}
          rounded="rounded-xl"
          className="h-24 w-full"
          editable={!!photoUrl}
          onAdd={() => fileRef.current?.click()}
          onChange={() => fileRef.current?.click()}
        />
      </Field>

      <Field label="テーマ" hint="複数選択可">
        <div className="flex flex-wrap gap-1.5">
          {themes.map((t) => {
            const on = themeKeys.includes(t.key);
            return (
              <button key={t.key} type="button" onClick={() => toggleTheme(t.key)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] transition" style={on ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee" } : { background: T.cardAlt, color: T.ink2, border: `1px solid ${T.border}` }}>
                {on && <Check size={11} />}{t.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="タグ" hint="読点・空白区切り">
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例：早朝、静か、写真映え" className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
      </Field>

      <Field label="エリア">
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例：京都市・東山エリア" className="w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
      </Field>

      <Field label="説明">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="どんな場所・どんな体験かを書きましょう。" className="w-full resize-none rounded-xl border px-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
      </Field>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!canSubmit} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition active:scale-[0.98]" style={canSubmit ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" } : { background: T.cardSunk, color: T.ink3 }}>
          <Plus size={15} /> 追加する
        </button>
        <button onClick={saveDraft} className="rounded-xl border px-5 py-3 text-[13px] font-medium transition active:scale-[0.98]" style={{ borderColor: T.border, background: T.card, color: T.ink2 }}>
          下書き保存
        </button>
      </div>
    </div>
  );
}
