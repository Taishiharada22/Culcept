# Life Ops L-4(b) — イベント固有 one-shot 準備 mini-design【pure 実装可・横/UI/外部は停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: `docs/life-ops-l4-event-preparation-mini-design.md`（L-4(a)）/ boundary §2 L-1・L-4・§4 / Appendix A.3。
> **CEO 指示**: 次は L-4(b)。pure 実装が安全なら実装まで。横接続/UI/通知/外部/実データ前は停止。

---

## 0. 一行
L-4(b) は**周期のない one-shot 準備**（服/資料/荷造り/チケット宿確認/持ち物確認）を、**注入イベント種→準備マップ**で候補化する pure エンジン。cadence 無関係。

## 1. (a) との違い（前提を疑った結果）
| | L-4(a) 実装済 | **L-4(b) 本 slice** |
|---|---|---|
| 対象 | 周期行動（美容） | one-shot 準備（服/資料/荷造り/確認） |
| trigger | cadence nearing × イベント近接 | **イベント近接のみ**（周期なし） |
| dueReason | event_prep + cyclePhase=nearing | event_prep（**cyclePhase なし**） |
| カテゴリ群 | body_appearance | **pre_event_prep（L-1 拡張）** |
| 外見重要フィルタ | あり（美容） | **なし**（business_trip も荷造り対象） |

## 2. L-1 拡張（`category-model.ts`・pre_event_prep 群 5 カテゴリ）
```ts
export type PreEventPrepCategoryId =
  | "outfit_prep" | "document_prep" | "packing" | "ticket_hotel_check" | "belongings_check";
export type LifeOpsCategoryId = BodyAppearanceCategoryId | PreEventPrepCategoryId;
```
| id | label | group | cyclic | maxLevelHint | risk | placeQuery | mvp |
|---|---|---|---|---|---|---|---|
| outfit_prep | 服の準備 | pre_event_prep | false | L1 | [] | null | false |
| document_prep | 資料の準備 | pre_event_prep | false | L1 | [] | null | false |
| packing | 荷造り | pre_event_prep | false | L1 | [] | null | false |
| ticket_hotel_check | チケット・宿の確認 | pre_event_prep | false | L1 | [] | null | false |
| belongings_check | 持ち物の確認 | pre_event_prep | false | L1 | [] | null | false |
- 全て **L1（リマインド中心）**・cyclic=false・購入/店舗検索なし（placeQuery=null）。helper（listCategories/getCategorySpec/listByGroup）は ALL=body_appearance+pre_event_prep に拡張。`listMvpCategories` は美容のまま（pre_event_prep は mvp=false）。

## 3. イベント→準備マップ（MVP・`event-preparation.ts`）
```
interview        → outfit_prep, document_prep
trip             → packing, ticket_hotel_check
business_trip    → packing, ticket_hotel_check, document_prep
ceremony         → outfit_prep, belongings_check
shoot            → outfit_prep
important_event  → outfit_prep
meeting_someone  → []（手土産は文脈依存・MVP 除外）
```

## 4. 型の外科的拡張（`candidate-types.ts`）
- `EventPrepDueReason.cyclePhase?: CadencePhase`（optional 化。(a)=nearing セット / (b)=省略）。
- `dueReasonPhase(d): CadencePhase | undefined`（(b) は undefined）。
- 波及: `candidate-engine.ts`(L-3) の sort を `PHASE_RANK[dueReasonPhase(x) ?? ""] ?? 0` にガード（L-3 は cycle のみゆえ実行時不変）。

## 5. ロジック（`generateOneshotPrepCandidates(events, nowISO)`・pure）
```
各 event（近接 0..HORIZON14・過去/不正除外）:
  preps = EVENT_PREP_MAP[event.kind]（空ならスキップ）
  各 prep category → LifeOpsCandidate:
    dueReason = { kind:"event_prep", eventKind, daysUntilEvent, recommendedLeadDays }（cyclePhase なし）
    placeQuery=null / permissionLevelHint=L1 / riskFlags=[]（L-1 から）/ menu=null / suggestedWindow=null
dedupe: 同 category は daysUntil 最小の event を採用（1 件）
出力: daysUntil 昇順（安定）
```
※ (a) と (b) は別関数で返す（横 R2 がマージ）。統合は横接続時。

## 6. recommendedLeadDays（MVP・固定）
packing=2 / ticket_hotel_check=5 / outfit_prep=2 / document_prep=2 / belongings_check=1（イベント直前ほど短い）。

## 7. 厳守 / 非スコープ
- pure・deterministic（now 注入）・events 注入（calendar 非読込）・横エンジン非 import・barrel 非 export。
- **非スコープ**: gift/プレゼント（birthday イベント種要・購入導線=**L-6 ゲート**）・服や物の「購入」（L-6）・横 R2/R4・UI・通知・外部・実データ源。
- L1 リマインドは「準備せよ」の候補の素であり、断定や自動実行ではない。

## 8. テスト / 停止
- L-4(b): interview→服/資料・trip→荷造り/宿確認・ceremony→服/持ち物・meeting→空・business_trip→荷造り等（外見フィルタなし）・HORIZON/過去除外・dedupe・昇順。
- 回帰: L-1（群/件数/cyclic を pre_event_prep 反映に更新）・L-4(a)・L-3（dueReasonPhase ガード後 PASS）。
- 停止: 実装着地後、横 R2 接続/UI/通知/外部/実データ前は設計レビュー（CEO 指示）。
