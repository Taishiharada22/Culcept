"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ComparativeGenomeData } from "@/lib/aneurasync/genomeComparison";

const TITLE_STYLE = { fontFamily: "'Cormorant Garamond', serif" };

const STRAND_COLORS: Record<string, string> = {
  physical: "#6366f1",
  personality: "#8b5cf6",
  behavioral: "#ec4899",
  social: "#14b8a6",
};

interface ComparePageClientProps {
  partnerId: string;
}

type LoadState = "loading" | "loaded" | "error";

export default function ComparePageClient({ partnerId }: ComparePageClientProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<ComparativeGenomeData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch(`/api/aneurasync/genome/compare?partnerId=${partnerId}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.comparison) {
          setData(d.comparison);
          setState("loaded");
        } else {
          setErrorMsg(d.error ?? "比較データの取得に失敗しました");
          setState("error");
        }
      })
      .catch(() => {
        setErrorMsg("ネットワークエラー");
        setState("error");
      });
  }, [partnerId]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbfcff] text-slate-900">
      {/* Header */}
      <header className="!block sticky top-0 z-30 border-b border-white/80 bg-white/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/aneurasync/genome"
            className="grid h-9 w-9 place-items-center rounded-full text-slate-400 no-underline transition hover:bg-white/70 hover:text-slate-700"
          >
            ←
          </Link>
          <div>
            <div className="text-[14px] font-semibold text-[#5543d8]" style={TITLE_STYLE}>
              Comparative Genomics
            </div>
            <div className="text-[11px] text-slate-400">ゲノム比較</div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[640px] px-5 pb-28 pt-8 sm:px-6">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            <span className="text-sm text-slate-400">ゲノムを比較中...</span>
          </div>
        )}

        {state === "error" && (
          <div className="rounded-[32px] border border-white/85 bg-white/76 px-7 py-16 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl">
            <div className="text-4xl">🔒</div>
            <div className="mt-4 text-lg font-semibold text-slate-700" style={TITLE_STYLE}>
              {errorMsg}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              相互マッチが成立している相手のみ比較できます
            </p>
            <Link
              href="/aneurasync/genome"
              className="mt-5 inline-block rounded-[18px] bg-slate-900 px-5 py-3 text-sm font-semibold text-white no-underline shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800"
            >
              ゲノムに戻る
            </Link>
          </div>
        )}

        {state === "loaded" && data && (
          <div className="space-y-6">
            {/* Partner header */}
            <motion.div
              className="flex items-center justify-center gap-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xl font-bold text-white shadow-lg">
                  あ
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-600">あなた</div>
              </div>
              <div className="text-2xl text-slate-300">⇌</div>
              <div className="text-center">
                {data.partnerAvatarUrl ? (
                  <img
                    src={data.partnerAvatarUrl}
                    alt=""
                    className="mx-auto h-14 w-14 rounded-full object-cover shadow-lg"
                  />
                ) : (
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-500 text-xl font-bold text-white shadow-lg">
                    {data.partnerDisplayName.charAt(0)}
                  </div>
                )}
                <div className="mt-2 text-xs font-semibold text-slate-600">
                  {data.partnerDisplayName}
                </div>
              </div>
            </motion.div>

            {/* Harmony Score */}
            <motion.div
              className="rounded-[32px] border border-white/85 bg-white/76 px-7 py-8 text-center shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="text-sm text-slate-400">ゲノムハーモニー</div>
              <div
                className="mt-3 text-5xl font-bold"
                style={{
                  color: data.harmonyScore >= 70 ? "#14b8a6" : data.harmonyScore >= 40 ? "#f59e0b" : "#ef4444",
                }}
              >
                {data.harmonyScore}
                <span className="text-lg text-slate-400">/100</span>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {data.harmonyScore >= 70
                  ? "ゲノムレベルで高い共鳴を示しています"
                  : data.harmonyScore >= 40
                    ? "補完し合える部分と個性の違いがバランスよく存在します"
                    : "異なる強みを持っており、新しい視点を提供し合えます"}
              </p>
            </motion.div>

            {/* Resonance Areas */}
            {data.resonanceAreas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span>✨</span>
                  <span className="text-sm font-semibold text-slate-700">共鳴領域</span>
                </div>
                {data.resonanceAreas.map((area) => (
                  <div
                    key={area}
                    className="rounded-2xl border border-teal-200/40 bg-teal-50/40 px-4 py-3 text-sm text-teal-700"
                  >
                    {area}
                  </div>
                ))}
              </div>
            )}

            {/* Clash Areas */}
            {data.clashAreas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span>⚡</span>
                  <span className="text-sm font-semibold text-slate-700">差異領域</span>
                </div>
                {data.clashAreas.map((area) => (
                  <div
                    key={area}
                    className="rounded-2xl border border-amber-200/40 bg-amber-50/40 px-4 py-3 text-sm text-amber-700"
                  >
                    {area}
                  </div>
                ))}
              </div>
            )}

            {/* Alignment detail */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700 px-1">
                アラインメント詳細
              </div>
              {data.alignments
                .sort((a, b) => {
                  const order = { complement: 0, clash: 1, neutral: 2 };
                  return order[a.alignmentType] - order[b.alignmentType];
                })
                .slice(0, 12)
                .map((al) => (
                  <motion.div
                    key={al.basePairId}
                    className="rounded-[20px] border border-white/80 bg-white/60 px-4 py-3 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: STRAND_COLORS[al.strandId] }}
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {al.label}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          al.alignmentType === "complement"
                            ? "bg-teal-100 text-teal-600"
                            : al.alignmentType === "clash"
                              ? "bg-red-100 text-red-500"
                              : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {al.alignmentType === "complement"
                          ? "共鳴"
                          : al.alignmentType === "clash"
                            ? "差異"
                            : "中立"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${al.myValue * 100}%`,
                              backgroundColor: STRAND_COLORS[al.strandId],
                              opacity: 0.6,
                            }}
                          />
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-400">あなた</div>
                      </div>
                      <div className="flex-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-pink-400"
                            style={{ width: `${al.partnerValue * 100}%`, opacity: 0.6 }}
                          />
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-400">{data.partnerDisplayName}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
            </div>

            {/* Back link */}
            <div className="text-center pt-4">
              <Link
                href="/aneurasync/genome"
                className="text-sm text-violet-500 no-underline hover:underline"
              >
                ← ゲノムに戻る
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
