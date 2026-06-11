/**
 * Session B — Alter Tab UI mock fixtures（mock ViewModel のみ・実データ接続なし）
 *
 * 正本: docs/handoff-session-b-ui.md（fixture 原文）/ docs/alter-tab-visual-contract.md §4
 * 規律:
 *  - `AlterBatteryViewModel` は lib/plan/dayState/dayStateTypes.ts から **import type のみ**（再定義・コピー禁止）
 *  - ここは mock データ置き場。lib/plan/dayState/ 配下には置かない（Session A の領域と混ぜない）
 *  - nightCheck は型契約（常時返却 + state="hidden"）に合わせて補完。設問・チップ文言は設計書 §5.2 正本
 *  - band と visualFill の矛盾禁止（band=low なのに fill 0.8 等は contract violation）
 */

import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";

// 設計書 §5.2 正本の設問・チップ（Session A 実装 buildAlterBatteryViewModel.ts と同文言）
const NIGHT_CHECK_QUESTION = "今日は、最後まで余力がありましたか？";
const NIGHT_CHECK_QUESTION_CARRIED = "きのうは、最後まで余力がありましたか？";
const NIGHT_CHECK_CHIPS = ["かなり余った", "少し余った", "ちょうど", "足りなかった", "まったく足りなかった"];
const NIGHT_CHECK_FOLLOWUP_QUESTION = "予定は、見立て通りに運びましたか？";
const NIGHT_CHECK_FOLLOWUP_CHIPS = ["だいたい通り", "一部ずれた", "大きくずれた"];

/** handoff-session-b-ui.md の fixture 原文 + nightCheck 補完（朝シナリオ: Morning Reveal あり / Night Check hidden） */
export const MOCK_ALTER_BATTERY_VM: AlterBatteryViewModel = {
  battery: {
    brain: { label: "集中の余力", band: "low", visualFill: 0.34, confidence: "low",
             source: "見立て", evidence: ["予定が密", "判断が多め"], correctable: true },
    heart: { label: "心の余力", band: "medium", visualFill: 0.55, confidence: "medium",
             source: "見立て", evidence: ["夜の余白あり", "人と会う予定少なめ"], correctable: true },
    body: { label: "からだの余力", band: "low", visualFill: 0.42, confidence: "medium",
            source: "見立て", evidence: ["夜勤明け", "移動が多め"], correctable: true },
  },
  contextCards: {
    outingTolerance: { label: "外出耐性", band: "low", text: "軽めなら動けそう",
                       evidence: ["移動が多め", "雨なし"], correctable: true },
    eveningSlack: { label: "夜の余白", text: "2.5h 確保できそう", evidence: ["20:30以降が空き"] },
    // source≠user_reported なら band は必ず unknown（偽データ型禁止）
    sleep: { label: "睡眠", band: "unknown", text: "まだ読めていません", source: "unknown", correctable: true },
    yesterdayLoad: { label: "昨日の負荷", band: "high" },
    recoveryQuality: { label: "回復の質", band: "unknown", source: "unknown" },
    carryOver: { label: "明日への持ち越し", band: "low" },
    feasibility: { label: "今日の成立見込み", band: "high", text: "大きく崩れにくい見立てです" }, // likely_steady→high 写像（visual-contract §4）
  },
  flowTimeline: { segments: [
    { kind: "event", startHHMM: "10:00", endHHMM: "11:30", label: "カフェ" },
    { kind: "travel", startHHMM: "13:30", endHHMM: "14:00" },
    { kind: "event", startHHMM: "14:00", endHHMM: "16:00", label: "予定" },
    { kind: "gap", startHHMM: "20:30", endHHMM: "23:00", isEveningSlack: true },
  ] },
  morningReveal: {
    forDate: "2026-06-10",
    // dayFelt=4（少し余った）× 凍結 low = under。表示 actualBand は dayFelt→Band 写像（4→high）
    items: [{ label: "からだの余力", estimatedBand: "low", actualBand: "high", verdict: "under" }],
    adjustmentNote: "この差は記録しました。反映はもう少し学んでから", // B1 解錠前の正規形（visual-contract §3.5'）
  },
  alterMessage: "今日は夜を軽くすると全体が安定して見えます。",
  quickReplies: ["元気", "少し疲れた", "眠い", "集中したい", "外出は軽め"],
  nightCheck: { state: "hidden", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS },
};

/** 夜シナリオ: Night Check 主問表示・Morning Reveal なし（朝以外は null — 契約） */
export const MOCK_VM_NIGHT_MAIN: AlterBatteryViewModel = {
  ...MOCK_ALTER_BATTERY_VM,
  morningReveal: null,
  nightCheck: { state: "main", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS },
};

/** 夜シナリオ: followup（予定ずれ確認）状態 */
export const MOCK_VM_NIGHT_FOLLOWUP: AlterBatteryViewModel = {
  ...MOCK_ALTER_BATTERY_VM,
  morningReveal: null,
  nightCheck: { state: "followup", question: NIGHT_CHECK_FOLLOWUP_QUESTION, chips: NIGHT_CHECK_FOLLOWUP_CHIPS },
};

/** 夜シナリオ: 回答済み */
export const MOCK_VM_ANSWERED: AlterBatteryViewModel = {
  ...MOCK_ALTER_BATTERY_VM,
  morningReveal: null,
  nightCheck: { state: "answered", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS },
};

/** 朝シナリオ: 前日未回答の繰り越し（前日未回答のため Morning Reveal は null — 契約整合） */
export const MOCK_VM_CARRIED_OVER: AlterBatteryViewModel = {
  ...MOCK_ALTER_BATTERY_VM,
  morningReveal: null,
  nightCheck: { state: "carried_over", question: NIGHT_CHECK_QUESTION_CARRIED, chips: NIGHT_CHECK_CHIPS },
};

/** unknown 検証: 脳バッテリーが unknown（薄い輪郭 + まだ読めていません） */
export const MOCK_VM_UNKNOWN_BRAIN: AlterBatteryViewModel = {
  ...MOCK_ALTER_BATTERY_VM,
  battery: {
    ...MOCK_ALTER_BATTERY_VM.battery,
    brain: { label: "集中の余力", band: "unknown", visualFill: 0, confidence: "low",
             source: "見立て", evidence: [], correctable: true },
  },
};

/** コールドスタート: 全 estimates unknown（チップ列を人体直下へ昇格 — visual-contract §3.6） */
export const MOCK_VM_COLD_START: AlterBatteryViewModel = {
  battery: {
    brain: { label: "集中の余力", band: "unknown", visualFill: 0, confidence: "low",
             source: "見立て", evidence: [], correctable: true },
    heart: { label: "心の余力", band: "unknown", visualFill: 0, confidence: "low",
             source: "見立て", evidence: [], correctable: true },
    body: { label: "からだの余力", band: "unknown", visualFill: 0, confidence: "low",
            source: "見立て", evidence: [], correctable: true },
  },
  contextCards: {
    outingTolerance: { label: "外出耐性", band: "unknown", text: "まだ読めていません", evidence: [], correctable: true },
    eveningSlack: { label: "夜の余白", text: "夜の余白は少なめです", evidence: [] },
    sleep: { label: "睡眠", band: "unknown", text: "まだ読めていません", source: "unknown", correctable: true },
    yesterdayLoad: { label: "昨日の負荷", band: "unknown" },
    recoveryQuality: { label: "回復の質", band: "unknown", source: "unknown" },
    carryOver: { label: "明日への持ち越し", band: "unknown" },
    feasibility: { label: "今日の成立見込み", band: "unknown", text: "まだ読めていません" },
  },
  flowTimeline: { segments: [] },
  morningReveal: null,
  alterMessage: "今日を見ています。",
  quickReplies: ["元気", "少し疲れた", "眠い", "集中したい", "外出は軽め"],
  nightCheck: { state: "hidden", question: NIGHT_CHECK_QUESTION, chips: NIGHT_CHECK_CHIPS },
};

/** 会話エリアの直近 1-2 往復 mock（VM の外。実チャット接続は Stage 1 — useAlterChat 経由） */
export type MockChatTurn = { role: "user" | "alter"; text: string; time?: string };
export const MOCK_ALTER_MESSAGE_TIME = "09:30";
export const MOCK_CHAT_EXCHANGE: MockChatTurn[] = [
  { role: "user", text: "少し疲れてる。外出は軽めにしたい。", time: "09:31" },
  { role: "alter", text: "受け取りました。外出は軽めに見ておきます。", time: "09:31" },
];
