# Production Travel Input / Provider Preflight（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: 候補レーン凍結（`docs/t11-travel-candidate-lane-freeze-resume-gate.md`）後、CEO 選択の次ブランチ **B = real-input path**。
> 既存基盤: `docs/t11-g1-session-intake-provider-design.md` + `lib/shared/travel/session-intake-provider.ts`（**既に pure 実装あり**）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 0. grounding（既存 input/provider 資産 — 大半が pure 実装済）

| 資産 | 出典 | 状態 |
|---|---|---|
| `TravelPlanEngineInput`（slots/participantIds + 任意 policy/fairnessHistory/scenarios/fit/cancelWeather） | engine-types.ts:21-45 | pure・engine 消費 |
| `runTravelPlanEngine(input)` | engine.ts:43 | dev preview のみ |
| **provider seam** `TravelInputProvider = (gate)=>TravelInputResult` | travel-input-provider-types.ts:93 | pure・未配線 |
| **dev fixture provider** `getDevFixtureTravelInput(fixture, gate)` | travel-input-provider.ts | dev-only |
| **★ session/intake provider** `getSessionIntakeTravelInput(intake)` | session-intake-provider.ts:119 | **pure 実装済・未配線** |
| `TravelIntakeInput`（slots/participantIds/viewerId?/policy?/fairnessHistory?） | travel-input-provider-types.ts:105-116 | pure |
| `TravelInputResult` = `ready{input,provenance}` \| `not_ready{provenance,missing[],unconfirmed?[]}` | travel-input-provider-types.ts:71-90 | pure |
| `TravelInputProvenance`{sources: TravelInputSourceKind[], realOnly, completeness?} | :51-58 | pure |
| `TRAVEL_INPUT_SOURCE_KINDS` = dev_fixture/session_slots/user_intake/m2_personalization/route_weather_place_enriched | :26-32 | pure |
| `TRAVEL_INPUT_PREREQUISITES` = fixture_not_allowed/session_slots/user_intake/destination/date_or_range/participants/m2_personalization/route_weather_place | :35-44 | pure |
| ExtractedSlot（8 key 判別 union）/ `SLOT_STATUSES`=proposed/normalized/confirmed/retracted / `SLOT_FILL_STATES`=filled/partial/missing / `EXTRACTION_SURFACES`=chat_message/quick_action/adjustment_card/form_input/session_context/profile_prior/relation_context/after_action | slot-types.ts:53-72,196-204 | pure |
| **G1 confirmed-real 述語 / HARD_CONFIRMING_SURFACES_BY_KEY / classifyParticipants(1-2・unique・viewer∈)** | session-intake-provider.ts:32-78 | **pure 実装済** |
| dev engine preview = `getDevFixtureTravelInput(FIXTURE_ENGINE_INPUT, {fixtureAllowed: PLAN_FLAGS.travelProjectionPreview})` | dev-travel-engine-projection/page.tsx:43-66 | dev・flag-gated・fixture |

→ **session/intake provider（G1）は既に存在**し、hard 必須（destination_area / date_or_range / participants）= confirmed-real、soft = proposed/派生/private 可、`destination` は explicit 操作のみ・`date` は explicit ∪ session_context、participants 1-2/unique/viewer∈ を**実装済**。

---

## 1. まず前提を疑う（① — 既存実装が premise を変える）

| 候補 | いま着手すべきか |
|---|---|
| **A. production travel input/provider preflight**（本書） | **推奨**。だが ★ greenfield でない。**G1 provider は実装済**。本書は **production-readiness の DELTA + binding** を設計する |
| B. Tier1 safe links / Maps URL | **後**（CEO 既決: input が ready になる前に外部リンク先行は禁物） |
| C. production `/plan` integration preflight | **本書に内包**（§10）。実 wiring は別 GO |
| D. candidate acceptance capture design | **後**（capture consumer は凍結 gate・honest-audit critical path でない） |

**推奨: A。ただし「実 input への道」の核（G1 session/intake provider）は既にある**。真の gap は 4 点（②③）:
1. **provider 出力状態の粒度不足**: 現 `TravelInputResult` は `ready | not_ready{missing, unconfirmed?}` の 2 値。CEO 要件（§7）の **ready / not_ready_missing / not_ready_unconfirmed / unavailable / invalid** に**未対応**（unavailable / invalid が無い・missing/unconfirmed が top-level でない）。
2. **provenance 語彙の粒度不足**: 現 `TravelInputSourceKind` に **selected_plan_date / explicit_travel_mode / manual_entity_evidence** が無い（§8）。
3. **production gate の不統一**: `getDevFixtureTravelInput` は gate を取るが **`getSessionIntakeTravelInput` は gate を取らない**。production 相当（fixtureAllowed:false）で **dev_fixture を構造的に禁止**する統一が必要。
4. **binding 契約の不在**: real `/plan`/session の surface（選択日 → session_context の date_or_range / 明示 form → confirmed destination/participants / 明示 mode → travel mode・scope）→ confirmed slot への**写し方が未定義**。これが「real-input path」の本体。

---

## 2. production input problem の定義

- 現 dev engine preview は **fixture `TravelPlanEngineInput`**（FIXTURE_ENGINE_INPUT）で駆動。
- session/intake provider は **pure 実装済**だが **real session に未接続**。
- **confirmed slot は input になり得る**が、**unconfirmed/proposed は ready にしてはいけない**。
- production は **real user/session input** を要する。
- 現 production `/plan` は **fixture を silent 代入してはならない**。
- **no M2 runtime・no route/weather/place live enrichment・no external entity retrieval**（全 HOLD）。

---

## 3. 既存資産の ready / dev-only / HOLD 区分（§3）

- **ready（pure 実装済・再利用）**: G1 session/intake provider（confirmed-real 述語・hard/soft 区分・participants 検証）・slot 語彙・provenance/prerequisite 語彙・provider seam・`TravelInputResult`。
- **dev-only**: `getDevFixtureTravelInput` + FIXTURE_ENGINE_INPUT + dev preview route（flag-gated）。
- **HOLD**: m2_personalization・route_weather_place_enriched source・real session 接続・production `/plan` wiring・外部 entity retrieval。

---

## 4. 許可される production input surface（§4）

- 選択された `/plan` の date/window（→ **session_context** normalized の `date_or_range`）。
- 明示の travel mode/session 意図（→ scope.mode・**explicit_travel_mode** provenance）。
- 明示のユーザー提供 destination/area（→ **form_input** confirmed の `destination_area`）。
- 明示の date_or_range（form_input/quick_action confirmed）。
- 明示の participantIds（1-2・unique・viewer∈）。
- 明示の budget/pace/mobility を **soft enrichment** として。
- 明示の red_line / soft_preference。
- 手動供給の entity 候補（あれば・**manual_entity_evidence**）。
- ★ **禁止**: raw chat text / raw LLM output / UI コピーからの暗黙推論（chat_message surface は将来 runtime・本 path では hard 確定に使わない）。

---

## 5. hard 前提条件（§5・G1 を踏襲）

- `destination_area` / `date_or_range` / `participantIds` /（必要なら trip scope 必須 field）。
- 各々 **confirmed-real**（status≠retracted ∧ fillState=filled ∧ (status=confirmed ∨ (normalized ∧ session_context evidence)) — ただし **destination は explicit 操作のみ**・session_context 不可）。
- **proposed chat slot は hard 前提を満たさない**。**retracted は無視**。
- **profile_prior / relation_context / after_action は destination/date を hard-confirm できない**（soft default のみ）。
- participantIds は **1-2・unique・非空**（viewerId 指定時は ∈）。

---

## 6. soft enrichment（§6・G1 踏襲）

- `budget_band` / `pace` / `mobility_tolerance` / `red_line` / `soft_preference` / `time_window`。
- `after_action` deltas / relation・profile 派生値は **server-side soft enrichment のみ**。
- **private enrichment は display に漏らさない**（visibility=private slot は engine input に寄与してよいが shared 投影に出さない）。

---

## 7. provider 出力状態（§7・★ DELTA = 既存 2 値を 5 値へ）

設計目標（既存 `TravelInputResult` を拡張・破壊しない）:

```
// スケッチ（未実装）
type ProductionInputOutcome =
  | { status: "ready"; input: TravelPlanEngineInput; provenance }       // 全 hard confirmed-real
  | { status: "not_ready_missing"; provenance; missing[] }              // 非 retracted slot 無し（聞く）
  | { status: "not_ready_unconfirmed"; provenance; unconfirmed[] }      // slot は在るが confirmed-real でない（確認させる）
  | { status: "unavailable"; provenance }                               // session/intake source 自体が無い（fixture 代入しない）
  | { status: "invalid"; provenance; reasons[] };                       // participants 重複/>2/viewer∉ 等の構造違反
```

- 現 `not_ready{missing, unconfirmed?}` を **not_ready_missing / not_ready_unconfirmed に分離**（actionable）。
- **`unavailable`** 追加: session source 不在（**fixture fallback しない**・production-like で fail-closed）。
- **`invalid`** 追加: classifyParticipants が現状 unconfirmed に畳む構造違反（重複/>2/viewer∉）を **invalid に昇格**（「確認」でなく「不正」）。
- **production-like context で fixture fallback なし・fake generic user なし・捏造 destination/date/budget なし**。

## 8. provenance（§8・★ DELTA = source 語彙拡張）

既存 `TRAVEL_INPUT_SOURCE_KINDS` に対し production-readiness の語彙を明確化:

- 使用可: **session_slots / user_intake / selected_plan_date / explicit_travel_mode / manual_entity_evidence**。
- **HOLD**: `m2_personalization`（M2 runtime 凍結）・`route_weather_place_enriched`（外部 enrich 凍結）。
- **production-like で `dev_fixture` 禁止**（gate fixtureAllowed:false → 構造的に排除・realOnly=false を弾く）。
- `selected_plan_date` / `explicit_travel_mode` / `manual_entity_evidence` は既存 source に**追加**するか、既存 evidence surface（session_context/form_input）への写像として表現するかを実装時に確定（§13 で types slice 判断）。

## 9. privacy（§9）

- provider input は **server-side**（`TravelPlanEngineInput` は private slot/fit/cancelWeather を含み得る）。
- **client は raw provider input を受け取らない**。
- private red_line/preference は engine input を形成してよいが **leak しない**。
- **client-only privacy filtering 禁止**（server 完了）。**diagnostics を既定で client に出さない**。

## 10. production `/plan` 関係（§10）

- **本 phase は production `/plan` を wiring しない**。
- 将来 production `/plan` は **別 GO の後にのみ** provider を呼ぶ。
- provider not ready → **fail-closed**（fixture 代入なし・raw diagnostics 非表示・action button なし）。

## 11. Tier1 safe links 関係（§11）

- Tier1 safe links は **confirmed destination/entity intent を消費**すべき。
- safe links は **confirmed input に先行しない**。Maps URL hand-off は別 gate。**本 phase で URL 生成しない**。

## 12. M2/Stargazer 関係（§12）

- M2/Stargazer は将来 **soft/private enrichment** を供給し得るが **M2 runtime は HOLD**。
- M2 は **destination/date を hard-confirm してはならない**（profile_prior は soft のみ）。
- **本 phase で pair personalization runtime なし**。

---

## 13. 実装オプション + 推奨（§13・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure production-input provider types** | 5 状態 `ProductionInputOutcome` + provenance 語彙 delta（selected_plan_date/explicit_travel_mode/manual_entity_evidence） | 推奨バンドル要素（§7/§8 の契約を型化） |
| **B. pure production-input provider helper（explicit slot set のみ）** | 既存 `getSessionIntakeTravelInput` を **production gate（fixtureAllowed:false）付き**で wrap し 5 状態へ写す・fail-closed・**explicit slot set のみ**受ける | 推奨バンドル keystone（既存ロジック再利用・薄い delta） |
| **C. dev preview provider substitution（session/intake fixture）** | dev-travel-engine-projection を FIXTURE_ENGINE_INPUT でなく **session/intake fixture → getSessionIntakeTravelInput** で駆動（confirmed→ready / proposed→not_ready_unconfirmed を実証）・flag-gated・read-only | 推奨 demonstration（real-input path を初めて end-to-end で証明・production 非接触） |
| D. production `/plan` preflight only | wiring 設計のみ | **後**（§10 HOLD） |
| E. Tier1 safe links design | URL hand-off | **後**（§11・confirmed input 先行） |

**推奨: A + B + C を 1 slice（split 許可）。** keystone は **B**（既存 G1 provider を production gate + 5 状態で wrap・**新規ロジックでなく delta**）、A はその型前提、C は dev preview を「fixture input」→「session/intake fixture を provider 経由」に差し替える**実証**（production 非接触・flag-gated）。D/E は HOLD。
> ★ premise note: B の中核（hard/soft/confirmed-real/participants 検証）は**既存**。本 slice は **状態粒度・provenance・production gate・dev preview 差し替え**の delta であり、新たな未消費 pure 層を増やさない（既存 provider を production-ready に昇格 + 実証）。

---

## 14. 将来 test（§14・実装時）

- confirmed destination/date/participants → **ready**。
- proposed destination → **not_ready_unconfirmed**。
- proposed date → **not_ready_unconfirmed**。
- missing destination → **not_ready_missing**。
- missing date → **not_ready_missing**。
- 重複 participants → **invalid**。
- viewer ∉ participants → **invalid**。
- production-like gate（fixtureAllowed:false）が **dev_fixture を拒否**（→ unavailable/反 fixture）。
- **fixture fallback なし**。
- profile_prior が destination/date を hard-confirm **しない**。
- relation_context が destination/date を hard-confirm **しない**。
- after_action が destination/date を hard-confirm **しない**。
- private soft enrichment は **server-only に留まる**（shared/client へ leak しない）。
- provider は **engine を呼ばない**。
- provider は **display packet/projection/cues を返さない**。
- fetch/API/DB/Supabase import なし・pure なら app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 15. Stop

- 本書（Production Travel Input / Provider Preflight）で**停止**。
- provider の実装（A/B/C）は **CEO 承認まで行わない**。

---

## 出力サマリ

- **前提訂正（①）**: real-input path の核 **G1 session/intake provider は既に pure 実装済**。本 phase は greenfield でなく、**production-readiness の DELTA**（5 状態化 / provenance 語彙 / production gate 統一 / real surface→confirmed slot binding）+ 実証の設計。
- **hard 前提**（destination/date/participants = confirmed-real・destination は explicit のみ・date は explicit ∪ session_context・participants 1-2/unique/viewer∈）と **soft enrichment**（budget/pace/mobility/red_line/soft_preference/time_window・private 非 leak）は G1 を踏襲。
- **provider 出力 5 状態**: ready / not_ready_missing / not_ready_unconfirmed / unavailable / invalid。**fixture fallback・fake user・捏造 destination/date/budget なし**。
- **provenance**: session_slots/user_intake/selected_plan_date/explicit_travel_mode/manual_entity_evidence 使用可・m2_personalization/route_weather_place_enriched/dev_fixture（production）は HOLD/禁止。
- **推奨次バンドル**: **A（delta types）+ B（既存 provider を production gate+5 状態で wrap・keystone）+ C（dev preview を session/intake 経由に差し替え・実証）**。D（production wiring）/ E（safe links）は HOLD。production `/plan`・M2 runtime・外部 retrieval・route/weather/place・URL 生成は全 HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
