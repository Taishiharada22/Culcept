"use client";

/**
 * CoAlter UI プレビューページ（開発専用）
 *
 * モックデータを使って CoAlterButton / CoAlterConsent / CoAlterCard の
 * 見た目と体験を確認する。
 */

import { useState } from "react";
import CoAlterButton from "@/components/coalter/CoAlterButton";
import CoAlterConsent from "@/components/coalter/CoAlterConsent";
import CoAlterCard from "@/components/coalter/CoAlterCard";
import type { CoAlterPairState, CoAlterSessionState, ProposalCard } from "@/lib/coalter/types";

const C = {
  bg: "#f8f6f3",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
  neural: "#8B5CF6",
  pulse: "#EC4899",
  coalter: "#6366F1",
};

const MOCK_PROPOSAL: ProposalCard = {
  summary: "映画を決めたいけど、ジャンルの好みで少し迷ってるみたいだね。二人ともアクション系は好きで、長すぎるのは避けたい点は一致してる。",
  priorities: {
    userA: "たいし: 新しい作品を試したい、話題性があるものがいい",
    userB: "あいさん: ハズレを避けたい、安心して楽しめるものがいい",
    common: "二人ともアクション好き、2時間以内がベスト",
  },
  candidates: [
    {
      rank: 1,
      title: "ミッション: インポッシブル 8",
      oneLiner: "安定のアクション。二人とも外さない鉄板",
      practicalInfo: "上映中 / 2h12m / 評価4.2",
    },
    {
      rank: 2,
      title: "ブレードランナー 2099",
      oneLiner: "SF好きなら冒険する価値あり。映像美が話題",
      practicalInfo: "上映中 / 1h58m / 評価3.9",
    },
    {
      rank: 3,
      title: "怪物の木こり",
      oneLiner: "邦画サスペンス。意外な路線だけど二人の好奇心に合いそう",
      practicalInfo: "上映中 / 1h45m / 評価4.0",
    },
  ],
  reasoning: "二人とも外したくない傾向があるから、評価安定型を中心に選んだよ。ただ、たいしの新しいもの好きも大事にしたいから、1つは冒険枠を入れてみた。",
  closing: "気になるのがあったら二人で話してみてね！",
};

export default function CoAlterPreviewPage() {
  const [pairState, setPairState] = useState<CoAlterPairState>("inactive");
  const [sessionState, setSessionState] = useState<CoAlterSessionState | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [loading, setLoading] = useState(false);

  // 状態遷移シミュレーション
  const simulateActivate = () => {
    setPairState("pending_consent");
    setShowConsent(true);
  };

  const simulateAccept = () => {
    setLoading(true);
    setTimeout(() => {
      setPairState("enabled");
      setShowConsent(false);
      setLoading(false);
    }, 800);
  };

  const simulateInvoke = () => {
    setSessionState("active");
    setLoading(true);
    setTimeout(() => {
      setSessionState("completed");
      setShowCard(true);
      setLoading(false);
    }, 2000);
  };

  const simulateDismiss = () => {
    setShowCard(false);
    setSessionState(null);
  };

  const reset = () => {
    setPairState("inactive");
    setSessionState(null);
    setShowConsent(false);
    setShowCard(false);
    setLoading(false);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* ── ヘッダー ── */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.s2}` }}>
        <p style={{ fontSize: 10, color: C.t4, textTransform: "uppercase", letterSpacing: 1 }}>
          CoAlter UI Preview（開発専用）
        </p>
        <p style={{ fontSize: 16, color: C.t1, fontWeight: 600, marginTop: 4 }}>
          あいさんとのトーク
        </p>
      </div>

      {/* ── モック会話 ── */}
      <div style={{ padding: "16px 20px", maxWidth: 420, margin: "0 auto" }}>
        {/* 相手のメッセージ */}
        <div style={{ display: "flex", marginBottom: 12 }}>
          <div style={{
            background: C.s1, borderRadius: "16px 16px 16px 4px",
            padding: "10px 14px", maxWidth: "75%",
            border: `1px solid ${C.s2}`,
          }}>
            <p style={{ fontSize: 13, color: C.t1, lineHeight: 1.5 }}>
              今週末映画見に行かない？
            </p>
          </div>
        </div>

        {/* 自分のメッセージ */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
            borderRadius: "16px 16px 4px 16px",
            padding: "10px 14px", maxWidth: "75%",
          }}>
            <p style={{ fontSize: 13, color: "white", lineHeight: 1.5 }}>
              いいね！何見る？
            </p>
          </div>
        </div>

        <div style={{ display: "flex", marginBottom: 12 }}>
          <div style={{
            background: C.s1, borderRadius: "16px 16px 16px 4px",
            padding: "10px 14px", maxWidth: "75%",
            border: `1px solid ${C.s2}`,
          }}>
            <p style={{ fontSize: 13, color: C.t1, lineHeight: 1.5 }}>
              うーん、アクションがいいんだけど...でもSFも気になるんだよね
            </p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
            borderRadius: "16px 16px 4px 16px",
            padding: "10px 14px", maxWidth: "75%",
          }}>
            <p style={{ fontSize: 13, color: "white", lineHeight: 1.5 }}>
              どっちもいいよね...決まらないなぁ
            </p>
          </div>
        </div>

        {/* ── CoAlter 同意カード ── */}
        {showConsent && (
          <div style={{ marginBottom: 16 }}>
            <CoAlterConsent
              requesterName="たいし"
              onAccept={simulateAccept}
              onDecline={() => { setShowConsent(false); setPairState("inactive"); }}
              loading={loading}
            />
          </div>
        )}

        {/* ── CoAlter 提案カード ── */}
        {showCard && (
          <div style={{ marginBottom: 16 }}>
            <CoAlterCard
              proposal={MOCK_PROPOSAL}
              onDismiss={simulateDismiss}
            />
          </div>
        )}
      </div>

      {/* ── 入力バー（モック） ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(248,246,243,0.92)", backdropFilter: "blur(16px)",
        borderTop: `1px solid ${C.s2}`,
        padding: "8px 16px 28px",
      }}>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          {/* CoAlter ボタン */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <CoAlterButton
              pairState={pairState}
              sessionState={sessionState}
              loading={loading}
              onActivate={simulateActivate}
              onInvoke={simulateInvoke}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{
              flex: 1, background: "rgba(255,255,255,0.92)",
              border: `1px solid ${C.s2}`, borderRadius: 16,
              padding: "10px 16px", fontSize: 13, color: C.t4,
            }}>
              メッセージを入力...
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: C.s2, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, color: C.t4,
            }}>
              🔮
            </div>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: C.s2, display: "flex", alignItems: "center",
              justifyContent: "center",
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={C.t4} width={20} height={20}>
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 状態リセットボタン（デバッグ用） */}
        <div style={{ maxWidth: 420, margin: "12px auto 0", display: "flex", gap: 8 }}>
          <button
            onClick={reset}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8,
              background: C.s2, fontSize: 10, color: C.t3,
              border: "none", cursor: "pointer",
            }}
          >
            🔄 リセット
          </button>
          <div style={{ fontSize: 9, color: C.t4, display: "flex", alignItems: "center" }}>
            状態: {pairState} / {sessionState ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
