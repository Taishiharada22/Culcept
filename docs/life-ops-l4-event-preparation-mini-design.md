# Life Ops L-4 — 予定前準備エンジン mini-design【pure 実装可・横接続/外部/実データは停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: `docs/life-ops-boundary-and-handoff.md` §2 L-4・§4 / Appendix A.3・A.7・A.10・A.12 / L-1・L-2・L-3 mini-design。
> **CEO 指示（2026-06-09）**: L-4=予定前準備の **pure 設計**。nearing 通常非候補化を維持しつつ**イベント前だけ nearing 前倒し**。横 R2/R4・Morning Briefing・Moment Trigger・UI・通知・外部 API・予約/購入/連絡・実データ源・calendar 推定・lastCompletedAt 記録 UI には**触らない**。横エンジン import 禁止。pure 実装が安全なら実装・test・tsc・commit まで可。横接続/UI/通知/外部/実データ前は停止して設計レビュー。

---

## 0. 一行
L-4 は**注入された近接イベント**（人と会う/旅行/面接/出張/冠婚葬祭/撮影）から、**外見重要イベント前だけ**、周期が `nearing` の美容行動を**前倒し候補**（`LifeOpsCandidate`・event_prep 根拠）にする pure エンジン。場所/配置/通知/予約/実データは持たない。

## 1. ゴールから逆算（最終体験と L-4 の持ち分）
体験例（A.7・A.12）「来週人と会う予定。前回カットから35日（標準42日=nearing）。今週中に整えると印象維持ラインに合う」「旅行3日前。カラーは馴染みで2–3日前が自然」。
分解:
| 要素 | 担当 |
|---|---|
| 「来週人と会う/旅行が近い」（イベント近接） | **L-4（注入イベントの近接判定）** |
| 「前回35日=nearing なので今こそ」（周期×イベント合流） | **L-4（nearing をイベントで前倒し）** |
| 「カラーは2–3日前が自然」（自然なリード日） | **L-4（recommendedLeadDays）** |
| 「今週金曜・新宿通過で」（配置・場所・window 確定） | **横 R2 + 場所軸**（L-4 は持たない） |
| 通知/カード表示 | **R4 / L-8**（L-4 は持たない） |

## 2. 前提を疑った設計判断
- **準備は 2 種**: (a) **周期カテゴリの前倒し**（美容: cadence あり） / (b) **イベント固有 one-shot 準備**（持ち物/服/資料/チケット確認: 周期なし）。→ **MVP は (a) 美容前倒しのみ**（L-1/L-2/L-3 資産が効く）。(b) は §7 に枠だけ（pre_event_prep 群・後続）。
- **L-3 と非重複**: L-3=beyond_typical 以上を周期で出す。**L-4=nearing をイベント近接で前倒し**。`within_typical`（十分新しい）は前倒ししない（つい最近整えた）。`beyond` 以上は L-3 が既出（L-4 の event 強化は後続）。
- **断定しない**: event_prep dueReason は事実（イベント種/残日数/phase/推奨リード日）。「行け」でなく「この時期が自然」の素。横/presenter が文言化。
- **外見重要イベントのみ**: meeting_someone/interview/ceremony/shoot/trip/important_event。business_trip は美容より荷造り（(b)・除外）。

## 3. 型骨格（実装）
**型集約リファクタ（外科的）**: 循環 import 回避のため、L-3 の `candidate-engine.ts` から共通型を `lib/lifeops/candidate-types.ts` に**移動**し、`candidate-engine.ts` は re-export（既存 import 後方互換）。L-4 はそこに event 型を足す。
```ts
// lib/lifeops/candidate-types.ts（L-3 から移動・集約）
export interface CadenceObservation { categoryId: string; menu?: BeautyMenu | null; lastCompletedAtISO: string | null; }
export interface CycleDueReason { kind: "cycle"; elapsedDays: number; typicalIntervalDays: number; phase: CadencePhase; }
export interface EventPrepDueReason {           // ← L-4 追加
  kind: "event_prep";
  eventKind: EventKind;
  daysUntilEvent: number;
  cyclePhase: CadencePhase;       // 美容: nearing 前倒し対象
  recommendedLeadDays: number;    // イベントの何日前が自然か（馴染み等）
}
export type DueReason = CycleDueReason | EventPrepDueReason;
export interface LifeOpsCandidate { /* dueReason: DueReason に拡張・他は L-3 と同 */ }

// lib/lifeops/event-preparation.ts（L-4）
export type EventKind = "meeting_someone"|"trip"|"interview"|"business_trip"|"ceremony"|"shoot"|"important_event";
export interface UpcomingEvent { readonly kind: EventKind; readonly startISO: string; } // 注入（calendar 読まない）
export function generateEventPrepCandidates(events: readonly UpcomingEvent[], observations: readonly CadenceObservation[], nowISO: string): readonly LifeOpsCandidate[];
```

## 4. イベント→美容関連 + 外見重要度（MVP・簡易）
- **外見重要 set**（前倒し対象）: meeting_someone, interview, ceremony, shoot, trip, important_event。business_trip 除外。
- **自然なリード日 recommendedLeadDays**（A.12・行動×馴染み）: cut=3 / color=3（カラーは馴染みで数日前）/ eyebrow=2。MVP は menu 依存の固定。将来 eventKind でも調整。

## 5. 前倒しロジック（pure・nowISO 注入）
```
EVENT_HORIZON = 14 日（「近接」の窓）
各 event:
  daysUntil = daysBetween(now, event.start)（L-2 helper 再利用）
  daysUntil < 0（過去）/ null（不正）/ > HORIZON → skip
  event.kind が外見重要 set でなければ skip
各 observation（美容カテゴリ）:
  status = computeCadenceStatus(spec, lastCompletedAtISO, now)
  status.phase == "nearing" のみ前倒し対象（within=新しすぎ／beyond 以上=L-3 既出）
候補化: (category,menu) ごとに、適格イベントのうち **daysUntil 最小**を採用（dedupe・1 候補）
  dueReason = { kind:"event_prep", eventKind, daysUntilEvent, cyclePhase:"nearing", recommendedLeadDays }
  placeQuery/permissionLevelHint/riskFlags は L-1 から（L-3 と同）。suggestedWindow=null（横 R2）
出力: daysUntil 昇順（差し迫った順）→ 安定
```

## 6. 厳守 / 非スコープ
- pure・deterministic（now 注入・Date.now/argless Date 不使用）・**新規データ収集なし**（events 注入）・横エンジン非 import・barrel 非 export。
- **触らない**: 横 R2/R4 受け渡し・Morning Briefing・Moment Trigger・UI・通知・外部 API・予約/購入/連絡・実データ源・calendar 推定・lastCompletedAt 記録。
- **非スコープ（後続）**: (b) イベント固有準備（持ち物/服/資料/確認＝pre_event_prep 群 L-1 拡張）・beyond×イベント強化・eventKind 別リード日・重要度スコア。

## 7. テスト計画（`tests/unit/lifeops/lifeOpsEventPreparation.test.ts`）
- 外見重要イベント近接 ∧ nearing → event_prep 候補（dueReason.kind=event_prep・cyclePhase=nearing・recommendedLeadDays）。
- within_typical → 前倒ししない（新しすぎ）。beyond → L-4 は出さない（L-3 の領分）。unknown → 出さない。
- business_trip（非外見）→ 出さない。HORIZON 超（15日先）→ 出さない。過去イベント → 出さない。
- dedupe: 同カテゴリで複数イベント → daysUntil 最小を 1 件。出力は daysUntil 昇順。
- L-3 回帰: 型集約後も `generateLifeOpsCandidates` の既存テスト全 PASS（re-export 後方互換）。
- pure: 同入力同出力。

## 8. 停止条件（実装後）
L-4 pure 着地後、**横 R2 接続 / Morning Briefing / Moment Trigger / UI / 通知 / 外部 / 実データ源** に入る前は必ず停止して設計レビュー（CEO 指示）。次の自律候補は (b) pre_event_prep 群 or L-2 cadence 拡張（pure）だが、体験直結は監査。
