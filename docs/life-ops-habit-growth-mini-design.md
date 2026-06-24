# Life Ops 縦拡張 — 成長/仕事/学習 habit model mini-design【pure 実装可・UI/DB/通知/本番は停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 / Appendix A.6 群6 / cadence-model（対比）/ candidate-types / permission(L-7) / card-presenter(L-8a)。
> **CEO 指示**: 成長/学習を pure habit model で設計。cadence overdue では弱い→ habit/streak/weekly target を設計。低圧文言（責めない）。安全なら pure 実装まで。UI/DB/通知/本番前は停止。

---

## 1. growth/habit カテゴリ（A.6 群6・新 group "growth"）
workout(筋トレ) / study(勉強) / reading(読書) / weekly_review(週次レビュー) / skill_practice(スキル練習)。L1（通知/低圧）・cyclic=false（cadence 管理でない＝habit 管理）・placeQuery null。
**neuron 枝（将来）**: study→「何を/どこまで/目的」、各カテゴリに sub-topic・目的・難易度を持たせ、**ユーザー状態/性格/能力を認知した Aneurasync が根拠付きで「この人にはこのやり方/このタイミング」を出す**のが北極星。MVP は category 粒度（topic/personalization は注入 label の将来拡張として枠だけ）。

## 2. cadence と habit の違い（核心）
| | cadence（維持系・既存） | **habit（成長系・新）** |
|---|---|---|
| 問い | 前回から何日？→ そろそろ/overdue | **今週の目標に対し、ペース・連続性は？** |
| 入力 | lastCompletedAt | weeklyTarget / doneThisWeek / daysSinceLast / weekElapsedRatio |
| 出力 | beyond_typical で「整えどき」 | slipping/restart で**低圧に「軽く戻す」** |
| トーン | 中立事実 | **励まし・責めない・再開しやすく** |
→ **別 model**（混同しない）。habit candidate の dueReason.kind="habit"（≠"cycle"）。

## 3. habit 入力（注入）/ 状態
```ts
export interface HabitObservation {
  readonly categoryId: string;
  readonly weeklyTarget: number;        // 今週やりたい回数（目標）
  readonly doneThisWeek: number;        // 今週の実績
  readonly daysSinceLast: number | null;// 前回からの日数（null=記録なし）
  readonly weekElapsedRatio: number;    // 0..1（週の経過: 月曜0→日曜1）
}
export type HabitPhase = "met" | "on_track" | "ease_in" | "restart" | "gentle_restart";
export interface HabitStatus { readonly phase: HabitPhase; readonly remaining: number; }
```
- **weekly target 表現(3)**: weeklyTarget + doneThisWeek。remaining=max(0, target-done)。expectedByNow=target×weekElapsedRatio。
- **streak 扱い(4)**: 明示 count は持たず、**daysSinceLast（切れそう=gap増）+ doneThisWeek（週内継続）で間接表現**。良い流れ（met/on_track）は**邪魔しない**（候補化しない）。将来 streak 明示入力。
- **missed/slipping/restart(5)**: gap と pace で判定（下記）。**責めず再開導線**。

## 4. phase 判定（pure）
```
remaining = max(0, weeklyTarget - doneThisWeek)
if remaining === 0 → "met"                                  // 達成 → 出さない
expectedByNow = weeklyTarget × clamp(weekElapsedRatio,0,1)
behind = doneThisWeek < expectedByNow
if daysSinceLast ≥ 14 → "gentle_restart"                    // 大きく空いた → 最低圧
else if daysSinceLast ≥ 7 → "restart"                       // 1週空いた → 短く再開
else if behind ∧ weekElapsedRatio ≥ 0.5 → "ease_in"         // 週後半でペース遅れ → 軽く1回
else → "on_track"                                            // 出さない
```

## 5. candidate 化(7) / しない(8)
- **化す**: phase ∈ {ease_in, restart, gentle_restart}。
- **化さない**: met（達成）/ on_track（ペース内・週前半で余白）/ weeklyTarget≤0（無効）。
- urgency=**normal**（低圧・期限/recurring より下）。dueReason に phase を載せ presenter が文言選択。

## 6. 低圧文言(6)（presenter・絶対に責めない）
- ease_in: 「軽めに1回入れると、今週の流れを戻しやすいです」
- restart: 「少し空きましたね。短めに再開すると自然です」
- gentle_restart: 「今日は5分だけでも、戻るきっかけになります」
- **NG（出さない）**: やるべき / 遅れています / 未達 / サボ / 必ず / べき。

## 7. energy/schedule density 将来接続(9)
将来、横の energy/予定密度を読み「疲労・過密な日は『今日は軽く/見送ってOK』」を出す。MVP は habit state のみ（注入）・横非接続。

## 8. collector/presenter 接続(10)
- `candidate-types`: `HabitDueReason{kind:"habit"; phase; weeklyTarget; doneThisWeek; remaining}` を DueReason union 追加。`dueReasonPhase`→undefined。
- `collector`: `habitObservations` 入力 + `generateHabitCandidates`（recurring/event の後・cycle と同列か下＝低圧ゆえ末尾寄り）。
- `card-presenter`: habit reasonText（phase別 低圧文）・urgency normal・actionLabel は permission(L1→お知らせします)。

## 9. 実装ファイル
`lib/lifeops/habit-model.ts`（assessHabit/generateHabitCandidates）+ category-model(growth 5) + candidate-types(HabitDueReason) + candidate-collector + card-presenter + tests + 本 doc。**lib/lifeops 内 pure のみ**。

## 10. テスト（CEO 指定 10 項目）
1. habit target から候補（T3/D1/W0.6→ease_in） 2. 十分なら出ない（D≥T=met / on_track） 3. missed/slipping でも責めない（NG語なし） 4. cadence と habit 混同なし（kind 区別） 5. 5カテゴリ辞書valid 6. low-pressure wording 7. collector 合流 8. presenter 自然文 9. DB/UI/notification/production import なし 10. tsc baseline 維持。

## 11. 停止
pure 実装着地後、UI/DB/通知/本番/実データ源（実際の実績収集）/横 energy 接続 前は停止（ゲート/本流）。
