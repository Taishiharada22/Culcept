// 相性詳細ページ — 最終構成
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";

const C = {
  bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

type CompatibilityState = "locked" | "unlocked_no_data" | "ready";

/** 相性分析結果 */
interface CompatibilityResult {
  catchphrase: string;
  strongScenes: string[];
  deepResonance: string;
  frictionPoints: string[];
  composition: {
    label: string;
    source: string;
    filled: boolean;
  }[];
}

interface Props { targetUserId: string }

export default function CompatibilityClient({ targetUserId }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CompatibilityState>("locked");
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [tokens, setTokens] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [result, setResult] = useState<CompatibilityResult | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cardRes = await fetch(`/api/genome-card/${targetUserId}`);
        if (cardRes.ok) {
          const data = await cardRes.json();
          if (data.ok && data.card) {
            setPartnerName(data.card.displayName ?? null);
          }
        }

        const tokenRes = await fetch("/api/rendezvous/invite");
        if (tokenRes.ok) {
          const tData = await tokenRes.json();
          setTokens(tData.balance?.friendshipTokens ?? 0);
        }

        // TODO: 相性解放済みかどうかの判定（compatibility_unlocks テーブル）
        // TODO: 解放済みなら分析結果を取得
        // 現段階はデモデータで ready 状態を表示
        setState("locked");
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [targetUserId]);

  const handleUnlock = async () => {
    if (tokens < 1) return;
    setUnlocking(true);
    // TODO: 実際の API を叩いてトークン消費 + LLM 分析
    // デモ: 1秒後にデモ結果を表示
    setTimeout(() => {
      setResult({
        catchphrase: "考えを言葉にするほど強くなるペア",
        strongScenes: [
          "予定を決めるとき — 片方が選択肢を出し、もう片方が絞る補完が自然に起きる",
          "新しい挑戦に踏み出すとき — 慎重さと大胆さのバランスが最適解に近づく",
          "誰かに合わせすぎて疲れたとき — 似た価値観があるから、言語化しなくても理解が届く",
        ],
        deepResonance: "表では違って見えても、根っこでは同じ迷い方をしている。どちらも「本当にこれでいいのか」を手放せないタイプで、その慎重さが互いへの信頼の土台になっている。",
        frictionPoints: [
          "急いで決めたい場面では、片方のペースが圧に感じやすい — 「待って」と言える空気があるかが鍵",
          "返事の温度差があるとき、片方は距離を感じやすい — 実際は考えている最中で、拒絶ではない",
        ],
        composition: [
          { label: "共鳴マップ", source: "価値観 4 軸", filled: true },
          { label: "判断スタイル", source: "ActionShape", filled: true },
          { label: "補完ポイント", source: "行動 3 軸", filled: true },
          { label: "二面性の共鳴", source: "矛盾検出", filled: true },
          { label: "コミュ温度計", source: "外向性・率直さ", filled: true },
          { label: "成長エッジ", source: "ForceBalance", filled: false },
        ],
      });
      setState("ready");
      setTokens((t) => t - 1);
      setUnlocking(false);
    }, 1200);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${C.neural} transparent ${C.neural} ${C.neural}` }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <div className="max-w-lg mx-auto px-4 pt-8 pb-32">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.t2} strokeWidth={2} strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.15em", textTransform: "uppercase" as const }}>
              Compatibility
            </p>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: C.t1 }}>
              {partnerName ?? "ユーザー"} との相性
            </h1>
          </div>
        </div>

        {/* ═══ ロック状態 ═══ */}
        {state === "locked" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl text-center"
            style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "32px 24px" }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: `linear-gradient(135deg, ${C.neural}12, ${C.pulse}08)` }}>
              <span style={{ fontSize: 28 }}>🔒</span>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 8 }}>
              相性診断を解放する
            </h2>
            <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.8, marginBottom: 20 }}>
              Friendship Token を 1 枚使って<br />
              {partnerName ?? "この友だち"}との相性を確認できます。<br />
              一度解放すると永続的に閲覧可能です。
            </p>
            <div className="flex items-center justify-center gap-2 mb-4"
              style={{ fontSize: 11, color: C.t2 }}>
              保有トークン:
              <span style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 14,
                color: tokens > 0 ? C.neural : "#ef4444" }}>
                {tokens}
              </span>枚
            </div>
            {tokens > 0 ? (
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}
              >
                {unlocking ? "分析中..." : "トークンを使って解放する"}
              </button>
            ) : (
              <div className="space-y-3">
                <p style={{ fontSize: 11, color: "#ef4444", fontWeight: 500 }}>トークンが不足しています</p>
                <p style={{ fontSize: 10, color: C.t4, lineHeight: 1.6 }}>
                  友だちを招待して Stargazer を進めてもらうと<br />
                  ポイントが貯まり、トークンに交換できます。
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ データ不足 ═══ */}
        {state === "unlocked_no_data" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl text-center"
            style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "32px 24px" }}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: `linear-gradient(135deg, ${C.neural}12, ${C.pulse}08)` }}>
              <span style={{ fontSize: 28 }}>🔓</span>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: C.t1, marginBottom: 8 }}>解放済み</h2>
            <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.8 }}>
              {partnerName ?? "相手"}の Stargazer データがまだ十分ではありません。<br />
              相手が観測を進めると、相性分析の精度が上がります。
            </p>
          </motion.div>
        )}

        {/* ═══ 相性詳細 ═══ */}
        {state === "ready" && result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* ❶ 一言でいうとこの関係 — ページの顔 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl text-center"
              style={{
                background: `linear-gradient(135deg, ${C.neural}08, ${C.pulse}05)`,
                border: `1px solid ${C.neural}15`,
                padding: "28px 24px",
              }}
            >
              <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.15em", textTransform: "uppercase" as const,
                marginBottom: 12 }}>
                この関係を一言で
              </p>
              <p style={{ fontSize: 18, fontWeight: 600, color: C.t1, lineHeight: 1.6 }}>
                「{result.catchphrase}」
              </p>
            </motion.div>

            {/* ❷ 一緒だと強い場面 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl"
              style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "20px" }}
            >
              <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                marginBottom: 14 }}>
                一緒だと強い場面
              </p>
              <div className="space-y-3">
                {result.strongScenes.map((scene, i) => {
                  const [title, ...rest] = scene.split(" — ");
                  const desc = rest.join(" — ");
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                        style={{ background: `${C.neural}10` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.neural }}>{i + 1}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, lineHeight: 1.5 }}>{title}</p>
                        {desc && (
                          <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, marginTop: 2 }}>{desc}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* ❸ 深層の共鳴 — 差別化ポイント、目立つ位置 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl"
              style={{
                background: `linear-gradient(135deg, ${C.neural}06, ${C.pulse}04)`,
                border: `1px solid ${C.neural}12`,
                padding: "20px",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ background: `${C.neural}15` }}>
                  <span style={{ fontSize: 12 }}>✦</span>
                </div>
                <p style={{ fontSize: 9, color: C.neural, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                  fontWeight: 600 }}>
                  深層の共鳴
                </p>
              </div>
              <p style={{ fontSize: 13, color: C.t1, lineHeight: 1.9, fontWeight: 400 }}>
                {result.deepResonance}
              </p>
            </motion.div>

            {/* ❹ すれ違いやすいポイント */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl"
              style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "20px" }}
            >
              <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                marginBottom: 14 }}>
                すれ違いやすいポイント
              </p>
              <div className="space-y-3">
                {result.frictionPoints.map((point, i) => {
                  const [main, ...rest] = point.split(" — ");
                  const hint = rest.join(" — ");
                  return (
                    <div key={i} className="rounded-xl" style={{
                      padding: "12px 14px",
                      background: i === 0 ? `${C.pulse}04` : `${C.t4}08`,
                      borderLeft: `2px solid ${i === 0 ? C.pulse : C.t4}30`,
                    }}>
                      <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.6 }}>{main}</p>
                      {hint && (
                        <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.5, marginTop: 4, fontStyle: "italic" }}>{hint}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* ❺ 相性の構成要素 */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl"
              style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "20px" }}
            >
              <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", textTransform: "uppercase" as const,
                marginBottom: 12 }}>
                相性の構成要素
              </p>
              <div className="space-y-2">
                {result.composition.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                      background: item.filled ? "rgba(52,211,153,0.12)" : C.s2,
                    }}>
                      <span style={{ fontSize: 9, color: item.filled ? "rgb(16,185,129)" : C.t4 }}>
                        {item.filled ? "✓" : "−"}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: item.filled ? C.t1 : C.t3, flex: 1 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 9, color: C.t4 }}>{item.source}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* 下部リンク */}
        <div className="flex gap-2 mt-6">
          <Link href={`/genome-card/${targetUserId}`}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-center transition-all active:scale-[0.97]"
            style={{ background: C.s1, border: `1px solid ${C.s2}`, color: C.t2 }}>
            プロフィールを見る
          </Link>
          <Link href="/talk"
            className="flex-1 py-3 rounded-xl text-sm font-medium text-center transition-all active:scale-[0.97]"
            style={{ background: C.s1, border: `1px solid ${C.s2}`, color: C.t2 }}>
            戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
