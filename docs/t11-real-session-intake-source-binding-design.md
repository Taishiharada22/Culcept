# Real Session/Intake Source Binding Design（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: A+B+C production input provider（`getProductionTravelInput`）の上流。
> 既存基盤: `slot-normalizer.ts`（gate）/ `SURFACE_INITIAL_STATUS`・`SURFACE_IS_EXPLICIT`（slot-types.ts）/ G1 provider。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## 0. grounding（既存 = downstream 全配線・gap = surface→slot builder のみ）

| 資産 | 出典 | 状態 |
|---|---|---|
| `ExtractedSlot`（8 key 判別 union）/ `SlotBase` / `EvidenceRef`（surface/refId/speakerParticipantId?） | slot-types.ts | pure |
| **`SURFACE_INITIAL_STATUS`**（chat→proposed・form/quick/adjustment→confirmed・session_context/profile/relation/after_action→normalized） | slot-types.ts | ★ pure・**binding の核** |
| **`SURFACE_IS_EXPLICIT`**（form/quick/adjustment=true・他=false） | slot-types.ts | ★ pure・**honesty 根拠** |
| `normalizeSlot(raw)` / `normalizeSlotSet(raw)`（**downstream gate**: raw/proposed → clean ExtractedSlot・excess/branded/invalid evidence を fail-closed） | slot-normalizer.ts | wired-pure |
| `TravelPlanWindow`(single_day/range・nights 1-2) / `TravelPlanScope`(mode/window) / `TravelMode`(daily/travel) | core-types.ts | pure |
| `DateOrRangeValue` = `TravelPlanWindow \| {kind:"fuzzy",descriptor}` | slot-types.ts | pure |
| `MissingSlotQuestion`{slotKey,priority,questionIntent} / `ExtractedSlotSet`{participantIds,slots,missingSlotQuestions} | slot-types.ts | pure |
| G1 `getSessionIntakeTravelInput` / `getProductionTravelInput`（5 状態・participantIds は slot と**別**供給） | session-intake-provider.ts / production-travel-input.ts | pure・dev のみ |

**★ gap（absent/future）**: **surface→slot を作る層が無い**。form 提出 / quick action / `/plan` 選択日/window / participant 選択 → `ExtractedSlot` 化する code は**存在しない**（抽出は「将来 LLM」コメント・`chat_message` は placeholder・raw text→slot は無い）。downstream（normalizer→provider→engine）は全配線。

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **A. real session/intake source binding design**（本書） | **推奨**。real input を作る**唯一の欠落層**。これが無いと provider は fixture intake しか食えない |
| B. Tier1 safe links / Maps URL | **後**（confirmed destination/date が binding で出せてから・CEO 既決） |
| C. production `/plan` wiring preflight | **後**（binding adapter が ready を出せてから wiring 設計） |
| D. M2 personalization provider design | **後**（M2 は soft enrichment のみ・hard 不可・runtime HOLD） |

**推奨: A。** 根拠（①⑤）: grounding 上 **downstream は全部ある**。real input path を完成させる残り 1 ピースは「**構造化された明示 surface → ExtractedSlot**」。これは **NLP でなく決定論**（form/quick-action/選択日 = 構造化値）。chat_message（LLM 抽出）は**本 binding の範囲外（future）**。

### ★ 設計の核（⑥⑦ honesty firewall）
**slot の `status` は surface から DERIVE する（caller が hand-assert しない）**。既存 `SURFACE_INITIAL_STATUS` をそのまま使い、binding builder は `status = SURFACE_INITIAL_STATUS[event.surface]` を強制 → **chat surface から "confirmed" destination を偽造できない**（`realOnly is derived from sources` と同じ honesty 原理）。これが「ユーザーの明示行為からのみ confirmed が生まれる」= plan の信頼性（⑧）。

---

## 2. 現在の gap

- `getProductionTravelInput` は存在し ready/missing/unconfirmed/unavailable/invalid を分類できる。
- dev route は **fixture intake** で provider path を実証できる。
- **だが real `/plan`/session surface は `TravelIntakeInput` を作っていない**。
- confirmed slot が **実 UI/session 操作に束縛されていない**（fixture のみ）。

---

## 3. source surface（§3・本 binding が扱うのは構造化された明示系のみ）

| surface event | binding 対象 | surface | 備考 |
|---|---|---|---|
| 選択 `/plan` date/window | date_or_range | session_context | TravelPlanWindow を注入 |
| 明示 travel mode/session start | scope.mode（slot でなく scope）/ explicit_travel_mode provenance | form_input | |
| destination/area input | destination_area | form_input/quick_action | **明示のみ** |
| date/date-range input | date_or_range | form_input/quick_action | |
| participant selector | **participantIds（slot でなく別供給）** | — | 1-2/unique/viewer∈ |
| budget/pace/mobility/red_line/soft_preference/time_window input | 各 soft slot | form/quick/adjustment | soft enrichment |
| manual entity candidate/evidence | **hard 不可**（entity 側・将来 candidate enrich のみ） | manual_entity_evidence(source) | dest/date/participants を作らない |
| future chat extraction | （**範囲外・future**） | chat_message | proposed まで・本 binding 非対象 |
| future CoAlter prompt capture | （**範囲外・HOLD**） | — | |

---

## 4. slot 生成ルール（§4）

- 選択 `/plan` date/window → **session_context** evidence の **normalized** `date_or_range`（TravelPlanWindow 具体形）。
- 明示 date/date-range input → **form_input/quick_action** の **confirmed** `date_or_range`。
- 明示 destination/area input → **confirmed** `destination_area`（explicit surface のみ）。
- **generic session mode/window context は `destination_area` を作らない**（binding が destination を session_context から**生成しない**＝downstream の HARD_CONFIRMING と二重で構造排除）。
- participant selector → **participantIds（slot evidence 外・別供給）**（現 provider 設計を維持）。
- budget/pace/mobility/red_line/soft_preference/time_window = **soft enrichment**（proposed/confirmed/private 可）。
- **manual_entity_evidence は destination/date/participants を hard-confirm しない**（entity 側 source・slot surface でない）。
- future chat extraction は **user 確認まで proposed**（本 binding 非対象）。
- **retracted slot は無視**。**partial/missing fillState は hard 前提を満たさない**（fuzzy date 等は partial）。

---

## 5. 確認意味論（§5・既存 status 体系を踏襲）

- **confirmed** = 明示ユーザー操作（form_input/quick_action/adjustment_card）or 信頼 session surface。`status = SURFACE_INITIAL_STATUS[surface]` で**自動導出**（偽造不能）。
- **normalized** = session_context（`/plan` 選択日/window）。date は満たすが destination は満たさない。
- **proposed** = 抽出/提案だが user 未確認（chat_message・本 binding 非対象）。
- **derived（profile_prior/relation_context/after_action）は destination/date を hard-confirm しない**（soft default のみ）。
- 確認は **可逆/訂正可能**（slot は retracted で撤回・再入力で更新・binding は冪等）。

---

## 6. binding 出力（§6）

```
// スケッチ（未実装）
type SessionSurfaceEvent =                        // ★ 構造化・明示のみ（raw text なし）
  | { kind: "selected_plan_window"; window: TravelPlanWindow }                      // → date_or_range(session_context/normalized)
  | { kind: "destination_input"; areaText: string; surface: ExplicitSurface }       // → destination_area(confirmed)
  | { kind: "date_input"; window: TravelPlanWindow; surface: ExplicitSurface }      // → date_or_range(confirmed)
  | { kind: "budget_input"; value: BudgetBand; surface: ExplicitSurface }           // soft
  | { kind: "pace_input"; value: Pace; surface: ExplicitSurface }                   // soft
  | { kind: "mobility_input"; value: MobilityToleranceValue; surface: ExplicitSurface }
  | { kind: "descriptor_input"; slotKey: "red_line"|"soft_preference"; value: DescriptorSlotValue; surface: ExplicitSurface; visibility?: Visibility; participantId?: string }
  | { kind: "time_window_input"; value: TimeWindowValue; surface: ExplicitSurface };
  //  ★ manual_entity_evidence / chat_message は event 種別に**含めない**（hard 不可・future）

interface TravelSessionBindingInput {
  events: SessionSurfaceEvent[];
  participantIds: string[];            // participant selector（slot でなく別供給）
  viewerId?: string;
  policy?: ReadinessPolicy;
  fairnessHistory?: FairnessHistoryInput;
}
// helper（pure・決定論）:
//   bindTravelSessionIntake(input): TravelIntakeInput
//     各 event → candidate slot（status = SURFACE_INITIAL_STATUS[surface]・値は構造化入力）→ normalizeSlot で gate → ExtractedSlot
//     retracted/invalid event は drop（捏造しない）・participantIds は pass-through
```

- 出力 = **`TravelIntakeInput`**（slots: ExtractedSlot[] / participantIds / viewerId? / policy? / fairnessHistory?）。
- **持たない**: display packet/projection/cues・raw chat text・raw LLM output・engine output。
- **status は surface 由来**（honesty）。binding は `normalizeSlot` で validate（既存 gate 再利用）。

---

## 7. fail-closed（§7）

destination 無→**missing**（provider 側）/ date 無→**missing** / proposed destination・date→**unconfirmed** / participant 数不正→**invalid** / session source 無→**unavailable** / **fixture fallback なし** / **generic user fallback なし** / **entity evidence からの暗黙 destination/date なし**。binding 自体は slot を作るだけで、ready 判定は provider（`getProductionTravelInput`）が行う。

## 8. privacy（§8）

private red_line/preference は **server-side**・private soft enrichment は engine input を形成してよいが leak しない・client は後に **質問/確認プロンプトのみ**見る（raw private input でなく）・**client-only privacy filtering 禁止**。

## 9. production `/plan` 関係（§9）

本 design は production `/plan` を wiring しない・将来 production `/plan` は **別 GO の後にのみ** binding adapter を呼ぶ・binding not ready で **fail-closed**・raw diagnostics 既定非表示。

## 10. Tier1 safe links 関係（§10）

Tier1 safe links は confirmed destination/entity intent を使い得るが、**binding が destination/date/participants を confirm できるまで待つ**・**本 phase で URL 生成なし**。

## 11. M2/Stargazer 関係（§11）

M2 は将来 soft/private enrichment を供給し得るが **destination/date を hard-confirm できない**・**M2 runtime HOLD**・**本 phase で pair personalization runtime なし**。

---

## 12. 実装オプション + 推奨（§12・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure binding types** | `SessionSurfaceEvent` / `TravelSessionBindingInput` / `ExplicitSurface` | 推奨バンドル前提 |
| **B. pure binding helper** | `bindTravelSessionIntake(input): TravelIntakeInput`（event→slot・status は surface 由来・normalizeSlot gate・retracted drop・participantIds pass-through・**決定論・NLP なし**） | 推奨 keystone |
| **C. dev preview route（binding fixture → provider → engine）** | form-fixture（SessionSurfaceEvent[]）→ bind → getProductionTravelInput → runTravelPlanEngine → display chain。**form→slot→provider→engine の全 real path を実証**・flag-gated・read-only | 推奨 demonstration（最も完全な証明） |
| D. production `/plan` wiring preflight | wiring 設計のみ | **後**（§9 HOLD） |
| E. Tier1 safe links design | URL hand-off | **後**（§10 HOLD） |

**推奨: A + B + C を 1 slice（split 許可）。** keystone は **B**（既存 `SURFACE_INITIAL_STATUS`/`normalizeSlot` を再利用した決定論 builder・honesty firewall）。C は dev route で **form→slot→provider→engine** を初めて end-to-end 実証（既存 `/plan/dev-travel-engine-session-intake` 拡張 or 兄弟）。D/E は HOLD。
> ★ premise note: downstream 全配線・本 slice は **唯一欠落の surface→slot builder**（決定論・NLP なし・status surface 由来）。新たな未消費層でなく real input path を閉じる最後のピース。

---

## 13. 将来 test（§13・実装時）

- 選択 plan date → **session_context normalized `date_or_range`**。
- 明示 date input → **confirmed `date_or_range`**。
- 明示 destination input → **confirmed `destination_area`**。
- generic mode context → **destination を作らない**。
- participant selector → 1-2/unique を検証（provider 経由）。
- proposed chat destination → **unconfirmed のまま**（binding が confirmed にしない）。
- **manual_entity_evidence は destination/date/participants を満たさない**。
- red_line/soft_preference は **private soft enrichment** になり得る。
- **retracted slot 無視**。
- **partial fillState は hard 前提を満たさない**。
- binding は **engine を呼ばない**。
- binding は **display/projection/cues を返さない**。
- fetch/API/DB/Supabase import なし・M2 runtime なし・pure なら app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 14. Stop

- 本書（Real Session/Intake Source Binding Design）で**停止**。
- binding 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **前提訂正（①）**: downstream（normalizer gate・provider・engine）は全配線。real input path の**唯一の欠落 = 構造化された明示 surface → ExtractedSlot の builder**（決定論・NLP なし・chat は future 範囲外）。
- **honesty firewall（⑥⑦）**: slot `status` は **surface から DERIVE**（既存 `SURFACE_INITIAL_STATUS` 強制）→ 偽造不能。binding は `normalizeSlot` gate を再利用。
- **binding 出力** = `TravelIntakeInput`（slots + participantIds 別供給）。display/raw text/LLM/engine output なし。manual_entity_evidence は hard 不可・generic session_context は destination を作らない。
- **fail-closed**: ready 判定は provider 側（missing/unconfirmed/invalid/unavailable）・fixture/generic-user fallback なし・entity からの暗黙 dest/date なし。
- **推奨次バンドル**: **A（binding types）+ B（決定論 builder・keystone）+ C（form→slot→provider→engine 実証 dev route）**。D（production wiring）/ E（safe links）は HOLD。production `/plan`・M2 runtime・外部 retrieval・route/weather/place・URL 生成 全 HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
