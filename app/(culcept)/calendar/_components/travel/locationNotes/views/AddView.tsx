// app/(culcept)/calendar/_components/travel/locationNotes/views/AddView.tsx
// Concept 18 — Add（＋）。新しい案内（旅行/スポット）を追加する高密度2カラムフォーム。
// 体験の提供者 / 追加タイプ / カバー写真 / 都道府県 / ジャンル / 区分(王道穴場) / おすすめの時間帯 /
// テーマ / タグ(chip) / タイトル / エリア / ルート概要(旅行のみ) / 説明。session 内 in-memory 追加。
"use client";

import * as React from "react";
import { T, FOCUS_RING } from "../../concierge/primitives";
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

function Segmented<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: { key: V; label: string }[] }) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} className={`flex-1 rounded-xl border py-2 text-[12.5px] font-medium transition active:scale-[0.98] ${FOCUS_RING}`} style={on ? { borderColor: T.goldDeep, background: T.goldBg, color: T.goldDeep } : { borderColor: T.border, background: T.card, color: T.ink2 }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const inputStyle: React.CSSProperties = { borderColor: T.border, background: T.card, color: T.ink };
const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${FOCUS_RING}`;
const GENRE_SUGGEST = ["寺社・文化", "自然・散策", "カフェ", "グルメ", "庭園", "景観・写真"];
const DESC_MAX = 500;
const DRAFT_KEY = "aneurasync.travel.locationNotes.draft.v2";

type FormClass = "classic" | "hidden";

export function AddView({ prefecture, themes, onAddItem, onToast }: { prefecture: string; themes: TravelTheme[]; onAddItem: (item: LocationItem) => void; onToast: (msg: string) => void }) {
  const [source, setSource] = React.useState<LocationSource>("local");
  const [kind, setKind] = React.useState<LocationItemKind>("trip");
  const [classification, setClassification] = React.useState<FormClass>("classic");
  const [title, setTitle] = React.useState("");
  const [genre, setGenre] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [area, setArea] = React.useState("");
  const [route, setRoute] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [themeKeys, setThemeKeys] = React.useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const transferredRef = React.useRef(false); // アイテムへ移譲済みなら cleanup の revoke を抑止

  // 下書き復元（写真 objectURL は揮発のため除く）
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Record<string, unknown>>;
      if (d.source === "local" || d.source === "traveler") setSource(d.source);
      if (d.kind === "trip" || d.kind === "spot") setKind(d.kind);
      if (d.classification === "classic" || d.classification === "hidden") setClassification(d.classification);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.genre === "string") setGenre(d.genre);
      if (typeof d.hours === "string") setHours(d.hours);
      if (typeof d.area === "string") setArea(d.area);
      if (typeof d.route === "string") setRoute(d.route);
      if (typeof d.desc === "string") setDesc(d.desc);
      if (Array.isArray(d.tags)) setTags(d.tags.filter((x): x is string => typeof x === "string"));
      if (Array.isArray(d.themeKeys)) setThemeKeys(d.themeKeys.filter((x): x is string => typeof x === "string"));
    } catch {
      /* 破損時は無視 */
    }
  }, []);

  React.useEffect(() => () => { if (photoUrl && !transferredRef.current) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoUrl && !transferredRef.current) URL.revokeObjectURL(photoUrl);
    transferredRef.current = false;
    setPhotoUrl(URL.createObjectURL(file));
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));
  const toggleTheme = (k: string) => setThemeKeys((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const saveDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ source, kind, classification, title, genre, hours, area, route, tags, desc, themeKeys }));
      onToast("下書きを保存しました");
    } catch {
      onToast("下書きの保存に失敗しました");
    }
  };

  const canSubmit = title.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const stops = route.split(/[→\n]/).map((s) => s.trim()).filter(Boolean);
    const item: LocationItem = {
      id: `user-${Date.now()}`,
      kind,
      prefecture,
      title: title.trim(),
      areaLabel: area.trim() || prefecture,
      classification: classification as LocationClassification,
      source,
      author: { name: "あなた", source, roleLabel: "あなたのノート" },
      genre: genre.trim() || "その他",
      themeKeys,
      tags,
      rating: 0,
      ratingCount: 0,
      description: desc.trim() || "（説明は未入力です）",
      photo: photoUrl
        ? { source: "user", url: photoUrl, caption: title.trim() }
        : { source: "placeholder", label: title.trim() || "ノート", tone: "neutral" },
      ...(kind === "trip"
        ? { durationLabel: "未設定", spotCount: stops.length, ...(stops.length ? { stops } : {}) }
        : { ...(hours.trim() ? { hours: hours.trim() } : {}) }),
    };
    if (photoUrl) transferredRef.current = true;
    onAddItem(item);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-[16px]" style={{ color: T.ink, fontWeight: 700 }}>新しい案内を追加</h2>
        <p className="mt-0.5 text-[11px]" style={{ color: T.ink3 }}>あなたの体験やおすすめを、だれかの旅のヒントに。</p>
      </div>

      {/* 上段2カラム：左=提供者/タイプ、右=カバー写真 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          <Field label="体験の提供者">
            <Segmented value={source} onChange={setSource} options={[{ key: "local", label: "地元民" }, { key: "traveler", label: "旅行者" }]} />
          </Field>
          <Field label="追加タイプ">
            <Segmented value={kind} onChange={setKind} options={[{ key: "trip", label: "旅行" }, { key: "spot", label: "スポット" }]} />
          </Field>
        </div>
        <Field label="カバー写真" hint="推奨 3:4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
          <PhotoSlot
            photo={photoUrl ? { source: "user", url: photoUrl, caption: title } : null}
            rounded="rounded-xl"
            className="h-[120px] w-full"
            editable={!!photoUrl}
            onAdd={() => fileRef.current?.click()}
            onChange={() => fileRef.current?.click()}
          />
        </Field>
      </div>

      <Field label="都道府県">
        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5 text-[13px]" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
          {prefecture}
          <span className="text-[10px]" style={{ color: T.ink3 }}>上部で選択中</span>
        </div>
      </Field>

      <Field label="ジャンル">
        <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="例：寺社・文化" className={inputCls} style={inputStyle} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {GENRE_SUGGEST.map((g) => (
            <button key={g} type="button" onClick={() => setGenre(g)} className="rounded-full px-2.5 py-1 text-[11px]" style={genre === g ? { background: T.goldBg, color: T.goldDeep } : { background: T.cardAlt, color: T.ink3, border: `1px solid ${T.border}` }}>{g}</button>
          ))}
        </div>
      </Field>

      {/* 区分 / おすすめの時間帯 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="区分">
          <Segmented value={classification} onChange={setClassification} options={[{ key: "classic", label: "王道" }, { key: "hidden", label: "穴場" }]} />
        </Field>
        <Field label="おすすめの時間帯" hint="任意">
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="例：早朝〜午前中" className={inputCls} style={inputStyle} />
        </Field>
      </div>

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

      <Field label="タグ" hint="任意・自由に追加">
        {tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: T.goldBg, color: T.goldDeep }}>
                {t}
                <button type="button" onClick={() => removeTag(t)} aria-label={`${t} を削除`} className="leading-none">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="例：早朝、静か、写真映え"
            className={inputCls}
            style={inputStyle}
          />
          <button type="button" onClick={addTag} className={`shrink-0 rounded-xl border px-4 text-[12px] font-medium ${FOCUS_RING}`} style={{ borderColor: T.border, background: T.cardAlt, color: T.goldDeep }}>＋ 追加</button>
        </div>
      </Field>

      <Field label="タイトル" hint="必須">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "trip" ? "例：嵐山の自然と隠れ家ランチ" : "例：石塀小路の朝さんぽ"} className={inputCls} style={inputStyle} />
      </Field>

      <Field label="エリア" hint="任意">
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例：京都市・東山エリア" className={inputCls} style={inputStyle} />
      </Field>

      {kind === "trip" && (
        <Field label="ルート概要" hint="旅行の場合のみ">
          <textarea value={route} onChange={(e) => setRoute(e.target.value)} rows={2} placeholder="訪問ルートを簡単に（例：京都駅 → 清水寺 → 祇園）" className={`resize-none ${inputCls}`} style={inputStyle} />
        </Field>
      )}

      <Field label="説明">
        <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, DESC_MAX))} rows={3} placeholder="おすすめの理由や見どころを、自由にご記入ください。" className={`resize-none ${inputCls}`} style={inputStyle} />
        <div className="mt-1 text-right text-[10px]" style={{ color: T.ink3 }}>{desc.length} / {DESC_MAX}</div>
      </Field>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={!canSubmit} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition active:scale-[0.98] ${FOCUS_RING}`} style={canSubmit ? { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" } : { background: T.cardSunk, color: T.ink3 }}>
          <Plus size={15} /> 追加する
        </button>
        <button onClick={saveDraft} className={`rounded-xl border px-5 py-3 text-[13px] font-medium transition active:scale-[0.98] ${FOCUS_RING}`} style={{ borderColor: T.border, background: T.card, color: T.ink2 }}>
          下書き保存
        </button>
      </div>
    </div>
  );
}
