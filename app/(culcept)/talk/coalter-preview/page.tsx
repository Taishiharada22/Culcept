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

// ── 3シナリオのモックデータ（文字数制約版） ──

type Scenario = {
  label: string;
  messages: { isMine: boolean; text: string }[];
  proposal: ProposalCard;
};

const SCENARIOS: Scenario[] = [
  {
    label: "映画決め",
    messages: [
      { isMine: false, text: "今週末映画見に行かない？" },
      { isMine: true, text: "いいね！何見る？" },
      { isMine: false, text: "うーん、アクションがいいんだけど...でもSFも気になるんだよね" },
      { isMine: true, text: "どっちもいいよね...決まらないなぁ" },
    ],
    proposal: {
      summary: "ジャンルで迷ってるみたいだね。二人ともアクション好きで、2時間以内が良さそう。",
      priorities: {
        userA: "たいし: 新作・話題性を重視",
        userB: "あいさん: ハズレを避けたい",
        common: "アクション好き、長すぎないのがベスト",
      },
      candidates: [
        { rank: 1, title: "ミッション: インポッシブル 8", oneLiner: "安定のアクション。鉄板", practicalInfo: "上映中 / 2h12m / 評価4.2" },
        { rank: 2, title: "ブレードランナー 2099", oneLiner: "冒険枠。映像美が話題", practicalInfo: "上映中 / 1h58m / 評価3.9" },
      ],
      reasoning: "外したくない傾向があるから安定型中心に。冒険枠も1つ入れたよ。",
      closing: "二人で話してみてね！",
    },
  },
  {
    label: "食事決め",
    messages: [
      { isMine: true, text: "今夜ご飯どこ行く？" },
      { isMine: false, text: "渋谷あたりがいいな" },
      { isMine: true, text: "何食べたい？イタリアンとか？" },
      { isMine: false, text: "いいけど、和食も捨てがたい..." },
    ],
    proposal: {
      summary: "渋谷で今夜のご飯。イタリアンと和食で迷ってるね。",
      priorities: {
        userA: "たいし: イタリアン気分",
        userB: "あいさん: 和食も気になる",
        common: "渋谷エリア、今夜",
      },
      candidates: [
        { rank: 1, title: "TRATTORIA GRANDE", oneLiner: "和の素材を使ったイタリアン", practicalInfo: "渋谷 / ¥3,500 / 食べログ3.6" },
        { rank: 2, title: "割烹 みやこ", oneLiner: "カジュアル和食、個室あり", practicalInfo: "渋谷 / ¥4,000 / 食べログ3.7" },
      ],
      reasoning: "和×伊の折衷で「和素材イタリアン」を筆頭に。安心の和食も候補に。",
      closing: "気になる方を二人で選んでね！",
    },
  },
  {
    label: "予定調整",
    messages: [
      { isMine: false, text: "来週どこかで会えない？" },
      { isMine: true, text: "いいよ！いつがいい？" },
      { isMine: false, text: "水曜か金曜かな...どっちが都合いい？" },
      { isMine: true, text: "うーん、どっちもいけるけど..." },
    ],
    proposal: {
      summary: "来週会う日程。水曜か金曜で検討中。",
      priorities: {
        userA: "たいし: どちらも可能",
        userB: "あいさん: 水曜か金曜希望",
        common: "来週のどこか",
      },
      candidates: [
        { rank: 1, title: "金曜の夜", oneLiner: "翌日休みでゆっくりできる", practicalInfo: null },
        { rank: 2, title: "水曜の夕方", oneLiner: "週の真ん中でリフレッシュ", practicalInfo: null },
      ],
      reasoning: "翌日に余裕がある金曜が二人とも楽しめそう。",
      closing: "どっちがいいか二人で決めてね！",
    },
  },
];

export default function CoAlterPreviewPage() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = SCENARIOS[scenarioIdx];
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
        {scenario.messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.isMine ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{
              background: msg.isMine ? `linear-gradient(135deg, ${C.neural}, ${C.pulse})` : C.s1,
              borderRadius: msg.isMine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              padding: "10px 14px", maxWidth: "75%",
              border: msg.isMine ? undefined : `1px solid ${C.s2}`,
            }}>
              <p style={{ fontSize: 13, color: msg.isMine ? "white" : C.t1, lineHeight: 1.5 }}>
                {msg.text}
              </p>
            </div>
          </div>
        ))}

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
              proposal={scenario.proposal}
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
              error={null}
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

        {/* デバッグコントロール */}
        <div style={{ maxWidth: 420, margin: "12px auto 0" }}>
          {/* シナリオ切り替え */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {SCENARIOS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setScenarioIdx(i); reset(); }}
                style={{
                  flex: 1, padding: "6px 8px", borderRadius: 8,
                  background: i === scenarioIdx ? `${C.coalter}15` : C.s2,
                  fontSize: 10, color: i === scenarioIdx ? C.coalter : C.t3,
                  border: i === scenarioIdx ? `1px solid ${C.coalter}30` : `1px solid transparent`,
                  cursor: "pointer", fontWeight: i === scenarioIdx ? 600 : 400,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={reset}
              style={{
                flex: 1, padding: "6px 12px", borderRadius: 8,
                background: C.s2, fontSize: 10, color: C.t3,
                border: "none", cursor: "pointer",
              }}
            >
              🔄 リセット
            </button>
            <div style={{ fontSize: 9, color: C.t4, display: "flex", alignItems: "center" }}>
              {pairState} / {sessionState ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
