"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DiagnosisPayload = {
  diagnosis: any;
  body_profile: any;
  color_profile: any;
  feedback?: {
    count: number;
    avg_rating: number | null;
    latest?: {
      rating?: number;
      accurate?: boolean;
      notes?: string;
      created_at?: string;
    } | null;
  };
};

const RULE_ROWS = [
  { key: "materials", label: "素材" },
  { key: "silhouettes", label: "形" },
  { key: "lengths", label: "丈" },
  { key: "necklines", label: "襟" },
  { key: "thickness", label: "厚み" },
  { key: "textures", label: "質感" },
  { key: "patterns", label: "柄" },
  { key: "colors", label: "色" },
] as const;

export default function MyStyleDiagnosisPage() {
  const [data, setData] = useState<DiagnosisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState(5);
  const [accurate, setAccurate] = useState(true);
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-style/diagnosis", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "読み込みに失敗しました");
        return;
      }
      setData(json);
      const latest = json?.feedback?.latest;
      if (latest?.rating) setRating(Math.max(1, Math.min(5, Number(latest.rating))));
      if (typeof latest?.accurate === "boolean") setAccurate(Boolean(latest.accurate));
      if (typeof latest?.notes === "string") setNotes(latest.notes);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const styleRules = data?.diagnosis?.style_rules ?? {};
  const summary = data?.diagnosis?.summary ?? {};
  const topFactors = Array.isArray(summary?.top_factors) ? summary.top_factors : [];
  const faceAwareRules = data?.diagnosis?.face_aware_rules ?? null;
  const hairAwareRules = data?.diagnosis?.hair_aware_rules ?? null;

  const totalConfidence = useMemo(() => {
    const conf = Number(data?.diagnosis?.label_confidence ?? 0);
    return Number.isFinite(conf) ? Math.round(conf * 100) : 0;
  }, [data?.diagnosis?.label_confidence]);

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/my-style/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "再計算に失敗しました");
        return;
      }
      setMessage("総合診断を再計算しました。");
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setRegenerating(false);
    }
  };

  const submitFeedback = async () => {
    if (!data?.diagnosis?.id) return;
    setSavingFeedback(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/my-style/diagnosis/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnostic_profile_id: data.diagnosis.id,
          rating,
          accurate,
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "フィードバック保存に失敗しました");
        return;
      }
      setMessage("フィードバックを保存しました。学習に反映されます。");
      await load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">総合診断（骨格×パーソナルカラー）</h1>
          <p className="mt-1 text-sm text-slate-600">総合評価と「あなたに合う服」ガイドを表示します。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/my-style/body"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            体型入力
          </Link>
          <Link
            href="/my-style/color"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            カラー入力
          </Link>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {regenerating ? "再計算中..." : "再計算"}
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">読み込み中...</div> : null}

      {!loading && !data?.diagnosis ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
          まだ診断データがありません。先に「体型」と「カラー」を保存してください。
        </div>
      ) : null}

      {!loading && data?.diagnosis ? (
        <div className="space-y-4">
          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">総合評価</div>
            <div className="mt-2 text-xl font-bold text-slate-900">{summary?.headline ?? "-"}</div>
            <div className="mt-1 text-sm text-slate-600">
              骨格: {data.diagnosis.jp_3type_label ?? data.diagnosis.jp_3type} / {data.diagnosis.jp_7type_label ?? data.diagnosis.jp_7type}
              {" ・ "}
              カラー: {data.diagnosis.pc_season_label ?? data.diagnosis.pc_season ?? "-"} ({data.diagnosis.pc_base ?? "-"})
            </div>
            <div className="mt-1 text-sm text-slate-600">確信度: {totalConfidence}%</div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              {summary?.description ?? "-"}
            </div>

            {topFactors.length > 0 ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-500">根拠（効いた軸 Top3）</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {topFactors.slice(0, 3).map((factor: any) => (
                    <span
                      key={String(factor.key)}
                      className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700"
                    >
                      {String(factor.label ?? factor.key)}: {Number(factor.contribution ?? 0).toFixed(3)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="text-sm font-bold text-emerald-800">あなたに合う服</h2>
              <div className="mt-3 space-y-2 text-sm text-emerald-900">
                {RULE_ROWS.map((row) => (
                  <p key={`recommended-${row.key}`}>
                    <span className="font-semibold">{row.label}:</span>{" "}
                    {(styleRules?.recommended?.[row.key] ?? []).join(" / ") || "-"}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
              <h2 className="text-sm font-bold text-rose-800">NG（事故りやすい要素）</h2>
              <div className="mt-3 space-y-2 text-sm text-rose-900">
                {RULE_ROWS.map((row) => (
                  <p key={`avoid-${row.key}`}>
                    <span className="font-semibold">{row.label}:</span>{" "}
                    {(styleRules?.avoid?.[row.key] ?? []).join(" / ") || "-"}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {faceAwareRules ? (
            <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
              <h2 className="text-sm font-bold text-violet-800">顔型に合うネックライン</h2>
              {faceAwareRules.face_shape ? (
                <p className="mt-1 text-xs text-violet-600">顔型: {faceAwareRules.face_shape}</p>
              ) : null}
              <div className="mt-3 space-y-2">
                {Array.isArray(faceAwareRules.recommended_necklines) && faceAwareRules.recommended_necklines.length > 0 ? (
                  <div>
                    <span className="text-xs font-semibold text-violet-700">おすすめ:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {faceAwareRules.recommended_necklines.map((n: string) => (
                        <span key={n} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{n}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {Array.isArray(faceAwareRules.avoid_necklines) && faceAwareRules.avoid_necklines.length > 0 ? (
                  <div>
                    <span className="text-xs font-semibold text-violet-700">避けたい:</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {faceAwareRules.avoid_necklines.map((n: string) => (
                        <span key={n} className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600">{n}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {hairAwareRules ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-bold text-amber-800">髪型に合うトップス</h2>
              {hairAwareRules.hair_length ? (
                <p className="mt-1 text-xs text-amber-600">髪の長さ: {hairAwareRules.hair_length}</p>
              ) : null}
              {Array.isArray(hairAwareRules.recommended_top_styles) && hairAwareRules.recommended_top_styles.length > 0 ? (
                <div className="mt-3">
                  <span className="text-xs font-semibold text-amber-700">おすすめスタイル:</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {hairAwareRules.recommended_top_styles.map((s: string) => (
                      <span key={s} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{s}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {hairAwareRules.notes ? (
                <p className="mt-2 text-xs text-amber-700">{hairAwareRules.notes}</p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">フィードバック</h2>
                <p className="mt-1 text-xs text-slate-500">当たってる？評価を送ると次回精度が上がります。</p>
              </div>
              <div className="text-xs text-slate-500">
                履歴 {data?.feedback?.count ?? 0} 件 / 平均 {data?.feedback?.avg_rating ?? "-"}
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">
                評価（1〜5）
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={rating}
                  onChange={(e) => setRating(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                当たり判定
                <select
                  value={accurate ? "yes" : "no"}
                  onChange={(e) => setAccurate(e.target.value === "yes")}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  <option value="yes">当たっている</option>
                  <option value="no">ズレている</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                メモ
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="例: 丈は当たるが素材は少し硬い"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                />
              </label>
            </div>

            {data?.feedback?.latest?.created_at ? (
              <div className="mt-3 text-xs text-slate-400">
                前回送信: {new Date(data.feedback.latest.created_at).toLocaleString()}
              </div>
            ) : null}

            <div className="mt-4">
              <button
                type="button"
                onClick={submitFeedback}
                disabled={savingFeedback}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingFeedback ? "保存中..." : "フィードバックを送信"}
              </button>
            </div>
          </section>

          {message ? <div className="text-sm font-semibold text-emerald-600">{message}</div> : null}
          {error ? <div className="text-sm font-semibold text-rose-600">{error}</div> : null}
        </div>
      ) : null}
    </main>
  );
}
