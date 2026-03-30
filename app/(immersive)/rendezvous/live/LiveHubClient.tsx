"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvCard,
  RvGlowCard,
  RvButton,
  RvBadge,
  RV_COLORS,
  RV_CATEGORY_LABELS,
  RV_CATEGORY_COLORS,
  type RvCategory,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// LiveHubClient — ライブ体験のハブ画面
// =============================================================================

const CATEGORIES: RvCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];

export default function LiveHubClient() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<RvCategory>("friendship");
  const [joining, setJoining] = useState(false);

  const handleJoinSession = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const res = await fetch("/api/rendezvous/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, mode: "text" }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.status === "matched") {
          router.push(`/rendezvous/session/${data.sessionId}`);
        } else {
          // キュー中 — セッションページへ（待機表示）
          // キュー中はまだsessionIdがないのでLiveHub上で待機表示
          // TODO: ポーリングでマッチを検出
        }
      }
    } catch {
      // ignore
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-6 pb-28" style={{ background: RV_COLORS.base }}>
      {/* ヘッダー */}
      <div className="mb-2">
        <h1 className="text-xl font-bold" style={{ color: RV_COLORS.text }}>
          ライブ
        </h1>
        <p className="text-xs mt-1" style={{ color: RV_COLORS.textSub }}>
          リアルタイムで誰かとつながる体験
        </p>
      </div>

      {/* A: 5分匿名セッション */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <RvGlowCard>
          <div className="flex items-start gap-3">
            <span className="text-3xl">🎭</span>
            <div className="flex-1">
              <h2 className="text-sm font-bold mb-1" style={{ color: RV_COLORS.text }}>
                5分間の匿名セッション
              </h2>
              <p className="text-xs leading-relaxed mb-3" style={{ color: RV_COLORS.textSub }}>
                誰かと5分間だけ匿名で話せます。顔も名前も分からない。
                終了後、お互い「もう一度話したい」と思えたら接続成立。
              </p>

              {/* カテゴリ選択 */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className="rounded-full px-3 py-1 text-xs font-bold transition-all"
                    style={{
                      backgroundColor:
                        selectedCategory === cat
                          ? `${RV_CATEGORY_COLORS[cat]}18`
                          : RV_COLORS.surfaceMuted,
                      color:
                        selectedCategory === cat
                          ? RV_CATEGORY_COLORS[cat]
                          : RV_COLORS.textMuted,
                      border: `1px solid ${
                        selectedCategory === cat
                          ? `${RV_CATEGORY_COLORS[cat]}40`
                          : "transparent"
                      }`,
                    }}
                  >
                    {RV_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <RvButton
                variant="glow"
                onClick={handleJoinSession}
                disabled={joining}
                className="text-xs !px-5 !py-2.5"
              >
                {joining ? "探しています..." : "セッションに参加する"}
              </RvButton>
            </div>
          </div>
        </RvGlowCard>
      </motion.div>

      {/* D: ライブ心理ゲーム */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <RvCard elevated>
          <div className="flex items-start gap-3">
            <span className="text-3xl">🧠</span>
            <div className="flex-1">
              <h2 className="text-sm font-bold mb-1" style={{ color: RV_COLORS.text }}>
                心理ゲーム
              </h2>
              <p className="text-xs leading-relaxed mb-3" style={{ color: RV_COLORS.textSub }}>
                不定期開催。匿名の参加者と心理的なジレンマやゲームに挑戦。
                ゲーム中に自然と「この人いいな」が生まれる。
              </p>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ backgroundColor: RV_COLORS.surfaceMuted, color: RV_COLORS.textMuted }}
              >
                次回開催を待つ
              </div>
            </div>
          </div>
        </RvCard>
      </motion.div>

      {/* G: 星座形成 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <RvCard elevated>
          <div className="flex items-start gap-3">
            <span className="text-3xl">🌌</span>
            <div className="flex-1">
              <h2 className="text-sm font-bold mb-1" style={{ color: RV_COLORS.text }}>
                星座形成
              </h2>
              <p className="text-xs leading-relaxed mb-3" style={{ color: RV_COLORS.textSub }}>
                AIが3-5人の化学反応が起きそうなグループを作る。
                24時間限定の匿名グループチャット。1対1じゃない、新しい出会い方。
              </p>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{ backgroundColor: RV_COLORS.surfaceMuted, color: RV_COLORS.textMuted }}
              >
                準備中
              </div>
            </div>
          </div>
        </RvCard>
      </motion.div>
    </div>
  );
}
