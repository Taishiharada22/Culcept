# Handoff: Session B — Alter Tab UI / Layout（mock 試作）

> **歴史的文書（2026-06-12 注記）**: Session B は正式 close 済み（branch `claude/session-b-ui-from-7a817ab1`・HEAD `9cdbfd5d`）。
> 本書の数値禁止条項（HARD 3 等）は 2026-06-11 の CEO visual policy 緩和により **visual-contract 改訂版（§0.1）を正とする**。
> 将来の消費者は `docs/alter-tab-visual-contract.md`（v0.1）と `docs/day-state-stage1-preflight.md` を参照すること。

- 日付: 2026-06-11 / 発行: 契約凍結セッション（claude/xenodochial-chatelet-0023b2）
- 前提: CEO が Session B 起動を承認していること（設計書 §10.4-3）
- 読むべき契約（読み取り専用・変更禁止）: ①`docs/alter-tab-visual-contract.md`（視覚正本 — 全節）②`docs/day-state-alter-tab-v0-design.md` §7（タブ構成）・§9（人体バッテリー）③`docs/day-state-stage0-closeout.md`（Stage 0 の実装範囲と境界）④参照画像（CEO 提供 iPhone モック — 意図的に再現しない要素は visual-contract §2）
- **型の正本は実装済みコード**: `AlterBatteryViewModel` は `lib/plan/dayState/dayStateTypes.ts` から **import type する**（再定義・コピー禁止。lib/plan/dayState の**変更は禁止** — 読み取り専用）

## ミッション

`AlterTabBody` 配下のコンテンツ領域を **mock ViewModel のみで**試作する。ロジックの再定義禁止・保存禁止・実データ接続禁止。

作るコンポーネント（visual-contract §5 の新規リスト）: AlterTabBody / AlterHeader / HumanBatteryCard / HumanBatteryFigure（SVG プレースホルダー可・3 系統の液体表現）/ BatteryCallout / RealityContextCards / TodayFlowStrip / NightCheckCard / AlterChatPreview / AlterQuickReplies / AlterCtaRow / AlterInputBar

## HARD 制約

1. **触ってはいけない**: PlanClient.tsx（タブ配線は Stage 1 で契約管理側が実施）/ グローバルナビ / FlowTab・CalendarTab・MapTab / 既存の全 API route / supabase / localStorage / featureFlags。**例外として下記 preview ページ 1 枚のみ新設可**。
2. **データは mock のみ**: 下の fixture を **`app/(culcept)/plan/components/alter/__mocks__/`** に置いて props で受け取る（**`lib/plan/dayState/` 配下には置かない** — Session A の領域と混ぜない。型のみ import type で参照）。fetch・hook 接続禁止。PlanClient・API・localStorage・featureFlags にも触らない（許される新規 route は下記 dev preview ページ 1 枚のみ・三重ガード必須・どこからもリンクしない）。
3. **禁止表示**（visual-contract §7 のチェックリストを regression として使う）: N-3 禁止 9 語 / 見立てへの % ・数値 / 「今日の開始残量」/ 断定形 / 赤色警告 / 偽データ（睡眠時間等）/ streak・比較。
4. **再利用優先**: GlassCard(gradient) / GlassButton(gradient) / FadeInView / TimelineSpine 3 カラム / FollowUpChip パターン / sticky header・breathe-md・max-w-3xl 規約（visual-contract §5 の file:line 参照）。新 UI ライブラリ導入禁止。
5. UI ラベルは日本語（CLAUDE.md）。ダークモード対象外。
6. ミニ Composer は**見た目のみ**（送信はモックコールバック。実接続は Stage 1）。

## mock fixture（コピーして使用可）

```ts
export const MOCK_ALTER_BATTERY_VM: AlterBatteryViewModel = {
  battery: {
    brain: { label: "集中の余力", band: "low",    visualFill: 0.34, confidence: "low",
             source: "見立て", evidence: ["予定が密", "判断が多め"], correctable: true },
    heart: { label: "心の余力",   band: "medium", visualFill: 0.55, confidence: "medium",
             source: "見立て", evidence: ["夜の余白あり", "人と会う予定少なめ"], correctable: true },
    body:  { label: "からだの余力", band: "low",  visualFill: 0.42, confidence: "medium",
             source: "見立て", evidence: ["夜勤明け", "移動が多め"], correctable: true },
  },
  contextCards: {
    outingTolerance: { label: "外出耐性", band: "low", text: "軽めなら動けそう",
                       evidence: ["移動が多め", "雨なし"], correctable: true },
    eveningSlack:    { label: "夜の余白", text: "2.5h 確保できそう", evidence: ["20:30以降が空き"] },
    sleep:           { label: "睡眠", band: "unknown", text: "まだ読めていません", source: "unknown" }, // source≠user_reported なら band は必ず unknown（偽データ型禁止）
    yesterdayLoad:   { label: "昨日の負荷", band: "high" },
    recoveryQuality: { label: "回復の質", band: "unknown", source: "unknown" },
    carryOver:       { label: "明日への持ち越し", band: "low" },
    feasibility:     { label: "今日の成立見込み", band: "high", text: "大きく崩れにくい見立てです" }, // likely_steady→high 写像（visual-contract §4）
  },
  flowTimeline: { segments: [
    { kind: "event",  startHHMM: "10:00", endHHMM: "11:30", label: "カフェ" },
    { kind: "travel", startHHMM: "13:30", endHHMM: "14:00" },
    { kind: "event",  startHHMM: "14:00", endHHMM: "16:00", label: "予定" },
    { kind: "gap",    startHHMM: "20:30", endHHMM: "23:00", isEveningSlack: true },
  ] },
  morningReveal: {
    forDate: "2026-06-10",
    // dayFelt=4（少し余った）× 凍結 low = under。表示 actualBand は dayFelt→Band 写像（4→high）
    items: [{ label: "からだの余力", estimatedBand: "low", actualBand: "high", verdict: "under" }],
    adjustmentNote: "この差は記録しました。反映はもう少し学んでから", // B1 解錠前の正規形（visual-contract §3.5'）
  },
  alterMessage: "今日は夜を軽くすると全体が安定して見えます。",
  quickReplies: ["元気", "少し疲れた", "眠い", "集中したい", "外出は軽め"],
};
// unknown 状態の検証用に brain.band="unknown" / visualFill 0 の variant も必ず作って描画確認すること
// morningReveal=null（前日未回答）の variant、全 estimates unknown のコールドスタート variant（チップ列昇格）も必須
// futureSlots（adjustmentDiffSlot / placeCandidateSlot / requestFrameSlot）は visual-contract §4 の docs 予約のみ — UI を想像で作らないこと
```

## Preview 方法（確定）

- **`app/(culcept)/plan/dev-alter-tab/page.tsx` を 1 枚だけ新設**し、mock fixture で `AlterTabBody` を直接 render する。
- リポジトリ既存の dev preview 前例（`dev-shift-fixture` / `dev-reality-pipeline` / `dev-second-self` 等 7 枚）と同じ**ガード規約**に従う: dev host フラグ等が欠ければ `notFound()`（NODE_ENV だけに頼らない三重ガードは `app/(culcept)/plan/dev-reality-pipeline/page.tsx` 冒頭コメント参照）。
- どこからもリンクしない。PlanClient・ナビは不変。closeout 時に削除 or 残置を判断事項として記録。
- **preview のために PlanClient を変更することは禁止**（タブ配線したくなったら契約差し戻し）。

## Definition of Done

- 全コンポーネントが mock のみで描画され、dev-alter-tab preview ページで確認できる（モバイル幅 ~390px 基準・max-w-3xl）
- unknown 状態・補正シート開閉・Night Check 5 チップ・チップ列・CTA 2 つが表示上機能（コールバックはモック）
- visual-contract §7 チェックリスト全項目 PASS（スクリーンショット付き closeout）
- 参照画像と並べた差分メモ（意図的に再現していない要素: 上下タブ / % / 開始残量、を明記）
- closeout doc（`docs/alter-tab-ui-mock-closeout.md`）

## 契約変更が必要になったら

ViewModel の形・語彙・構成を変えたくなったら、**実装せず** closeout に「契約差し戻し事項」として記録して停止（正本は契約凍結セッションが管理）。
