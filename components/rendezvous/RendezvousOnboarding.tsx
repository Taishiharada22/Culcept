"use client";

/**
 * RendezvousOnboarding
 * 5ステップのオンボーディングフロー:
 * 1. Rendezvousの説明（アバター先行・拒絶ゼロ）
 * 2. カテゴリ選択
 * 3. 表示名 + プロフィール設定
 * 4. 写真アップロード促進
 * 5. 「分身が探索を開始しました」確認
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PhotoUploader from "./PhotoUploader";

type Props = { userId: string };

const CATEGORIES = [
  { key: "romantic", label: "恋愛", emoji: "💫", color: "#FF6B9D", desc: "深い繋がりを探す" },
  { key: "friendship", label: "友情", emoji: "✨", color: "#4AEAFF", desc: "気の合う仲間" },
  { key: "cocreation", label: "共創", emoji: "🔥", color: "#D4A017", desc: "一緒に何かを作る" },
  { key: "community", label: "コミュニティ", emoji: "🌊", color: "#8B5CF6", desc: "緩やかな繋がり" },
] as const;

const TOTAL_STEPS = 5;

export default function RendezvousOnboarding({ userId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["friendship"]);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCategory = useCallback((key: string) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const handleComplete = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      // Save profile
      const res = await fetch("/api/rendezvous/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled: true,
          enabledCategories: selectedCategories,
          displayName: displayName || null,
          contextStates: Object.fromEntries(
            ["friend", "romance", "orbiter", "cocreation"].map((c) => [
              c,
              selectedCategories.some((sc) =>
                c === "friend" ? sc === "friendship" :
                c === "romance" ? sc === "romantic" :
                c === "orbiter" ? sc === "community" :
                sc === "cocreation"
              ) ? "active" : "inactive",
            ]),
          ),
        }),
      });

      if (!res.ok) throw new Error("保存に失敗しました");

      // Mark onboarding complete
      await fetch("/api/rendezvous/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompletedAt: new Date().toISOString() }),
      });

      router.push("/rendezvous");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [selectedCategories, displayName, router]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i <= step ? "rgba(99,102,241,0.7)" : "rgba(99,102,241,0.12)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: 10, color: "rgba(30,30,60,0.35)", marginTop: 6, textAlign: "right" }}>
          {step + 1} / {TOTAL_STEPS}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          style={{ width: "100%", maxWidth: 400 }}
        >
          {/* Step 0: Explanation */}
          {step === 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🌌</div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E3C", marginBottom: 12 }}>
                Rendezvous
              </h1>
              <p style={{ fontSize: 14, color: "rgba(30,30,60,0.65)", lineHeight: 1.8, marginBottom: 20 }}>
                あなたの<strong>分身（アバター）</strong>が先に相手の分身と出会います。
              </p>
              <div style={{
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(20px)",
                borderRadius: 16,
                padding: 20,
                marginBottom: 20,
                border: "1px solid rgba(99,102,241,0.08)",
              }}>
                <Feature emoji="👤" text="分身同士が先に接触 — あなたは消耗しない" />
                <Feature emoji="🔒" text="片想いは完全非表示 — 拒絶のストレスゼロ" />
                <Feature emoji="🧠" text="10軸の深層マッチング — 表面じゃなく本質で" />
                <Feature emoji="💬" text="相互成立した相手だけが現れる" />
              </div>
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.4)", marginBottom: 8 }}>
                Tinder/Tapple/WITHとは根本的に違う体験です。
              </p>
            </div>
          )}

          {/* Step 1: Category selection */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E1E3C", marginBottom: 8 }}>
                どんな繋がりを求めますか？
              </h2>
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.5)", marginBottom: 20 }}>
                複数選択OK。後から変更できます。
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {CATEGORIES.map((cat) => {
                  const selected = selectedCategories.includes(cat.key);
                  return (
                    <button
                      key={cat.key}
                      onClick={() => toggleCategory(cat.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 16px",
                        borderRadius: 14,
                        border: selected
                          ? `2px solid ${cat.color}`
                          : "2px solid rgba(99,102,241,0.08)",
                        background: selected
                          ? `${cat.color}10`
                          : "rgba(255,255,255,0.6)",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{cat.emoji}</span>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#1E1E3C" }}>
                          {cat.label}
                        </span>
                        <span style={{ fontSize: 11, color: "rgba(30,30,60,0.45)", marginLeft: 8 }}>
                          {cat.desc}
                        </span>
                      </div>
                      {selected && (
                        <span style={{ marginLeft: "auto", fontSize: 16, color: cat.color }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Display name */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E1E3C", marginBottom: 8 }}>
                分身の表示名
              </h2>
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.5)", marginBottom: 20 }}>
                相手に表示される名前です。本名でなくてOK。
              </p>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: Aoi"
                maxLength={20}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(99,102,241,0.15)",
                  background: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(12px)",
                  fontSize: 16,
                  color: "#1E1E3C",
                  outline: "none",
                }}
              />
              <p style={{ fontSize: 10, color: "rgba(30,30,60,0.3)", marginTop: 6 }}>
                {displayName.length}/20文字
              </p>
            </div>
          )}

          {/* Step 3: Photo upload */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E1E3C", marginBottom: 8 }}>
                写真を追加
              </h2>
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.5)", marginBottom: 20 }}>
                写真があるとマッチ率が大幅に上がります。後から追加もOK。
              </p>
              <PhotoUploader />
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div style={{ textAlign: "center" }}>
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{ duration: 3, repeat: Infinity }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))",
                  margin: "0 auto 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                }}
              >
                🌀
              </motion.div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1E1E3C", marginBottom: 12 }}>
                準備完了
              </h2>
              <p style={{ fontSize: 14, color: "rgba(30,30,60,0.65)", lineHeight: 1.8 }}>
                あなたの分身が、これから軌道上で
                <br />
                相手の分身と出会いを始めます。
              </p>
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.4)", marginTop: 12 }}>
                交差が見つかり次第、お知らせします。
              </p>
              {error && (
                <p style={{ fontSize: 12, color: "#EF4444", marginTop: 12 }}>{error}</p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation buttons */}
      <div style={{ width: "100%", maxWidth: 400, marginTop: 32, display: "flex", gap: 10 }}>
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 12,
              border: "1px solid rgba(99,102,241,0.15)",
              background: "rgba(255,255,255,0.6)",
              color: "rgba(30,30,60,0.5)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            戻る
          </button>
        )}
        <button
          onClick={step < TOTAL_STEPS - 1 ? () => setStep((s) => s + 1) : handleComplete}
          disabled={
            saving ||
            (step === 1 && selectedCategories.length === 0)
          }
          style={{
            flex: step === 0 ? 1 : 2,
            padding: "12px 0",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #6366F1, #A855F7)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? "wait" : "pointer",
            opacity: saving || (step === 1 && selectedCategories.length === 0) ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {step < TOTAL_STEPS - 1
            ? step === 3
              ? "スキップして進む"
              : "次へ"
            : saving
              ? "設定中..."
              : "分身を起動する"}
        </button>
      </div>
    </div>
  );
}

function Feature({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid rgba(99,102,241,0.04)",
      }}
    >
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontSize: 13, color: "rgba(30,30,60,0.7)" }}>{text}</span>
    </div>
  );
}
