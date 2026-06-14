# T11-G1 Server Session/Intake Provider Design v2（実ユーザー入力→TravelPlanEngineInput・再設計・設計のみ）

**ステータス**: 設計のみ・実装なし（docs-only）。CEO「自立再思考・再設計」指示で v1 を全面改訂。CEO ロードマップ「4→1→2」の **(1)**。
**位置づけ**: provider tier 2（dev_fixture の次）。**server 側の実 session/intake から real `TravelPlanEngineInput` を作る**（real_only・fail-closed）。M2/route/weather/place は別 tier、本番配線・抽出 NLP は含まない。

## §0 v1 からの再設計点（独立思考・実 enum grep 確認）
v1 は「slot が存在すれば prerequisite 充足」としていた。**これは誤り**（GPT 指摘 + 実コード検証で確定）。実 `SlotStatus = proposed | normalized | confirmed | retracted`（GPT 推測の `context_provided` は存在しない）。surface→status は実 as-const で確定:
| surface | status | explicit |
|---|---|---|
| chat_message（LLM 提案・「たぶん箱根」） | **proposed** | false |
| form_input / quick_action / adjustment_card（明示操作） | **confirmed** | true |
| session_context（/plan 選択日・mode window 注入） | **normalized** | false |
| profile_prior(M2) / relation_context / after_action(T10) | **normalized** | false（派生） |

★ 再設計の核（v1→v2）:
1. **存在でなく「confirmed-real」で判定**（proposed/retracted/派生のみ は不可）。
2. **hard 必須 と soft 補完 を分離**（全 slot を confirmed 要求しない）。
3. **not_ready を missing と unconfirmed に分け actionable 化**（聞く vs 確認させる）。
4. **provider not_ready ≠ engine needs_question**（層分離）。

## §1 hard 必須 vs soft 補完（独立追加）
| 区分 | slot | 要件 |
|---|---|---|
| **hard 必須**（ready の前提） | destination_area / date_or_range / **participantIds**(1–2) | **confirmed-real** 必須 |
| **soft 補完**（任意・engine が部分で動く） | budget_band / pace / mobility_tolerance / red_line / soft_preference / time_window | 任意・proposed/派生/private 可（confirmed 不要） |

→ 確定した行先・日程・人数が無ければ「現実の旅」は組めない（hard）。一方、好み/NG/予算は部分でよく、**M2/relation/after_action 由来の派生 soft slot はそのまま enrichment として流入**（CEO の「過去後悔(after_action)・関係性(relation_context)」を tier2 でも private soft として反映）。

## §2 confirmed-real 述語（実 enum grounded・pure）
hard 必須 slot が prerequisite を満たすのは:
```
isHardPrereqSatisfied(slot) =
  slot.status !== "retracted"                                  // 撤回は除外
  && slot.fillState === "filled"                               // partial/missing 不可
  && ( slot.status === "confirmed"                             // 明示操作（form/quick/adjustment）
       || (slot.status === "normalized"
            && slot.evidence.some(e => e.surface === "session_context")) ) // context-confirmed のみ
```
- **count**: confirmed（明示）+ session_context-normalized（context 確定）。
- **除外**: proposed（chat 推測）→ unconfirmed / retracted → 無視 / 派生のみ normalized（profile_prior・relation・after_action）→ hard 不充足（soft default 扱い・上書き可）。
- participants: `participantIds.length ∈ {1,2}`（MVP）。

## §3 consume / produce
- consume `TravelIntakeInput`（server-only 型・新規）: `slots: ExtractedSlot[]`（session 抽出+正規化済・upstream）/ `participantIds` / 任意 `policy?`(intake で確認した予約意図・provider は derive せず pass-through) / `viewerId?`。**生会話は受けない**（抽出 NLP は upstream・別）。
- produce `TravelInputResult`（E-B 再利用 + §4 拡張）。

## §4 not_ready の actionable 化（E-B additive 拡張）
hard prerequisite ごとに 3 状態へ分類:
- `confirmed`（充足）/ `unconfirmed`（slot 在るが proposed・派生・partial）/ `missing`（非 retracted slot 無し）。
- **ready ⟺ 3 hard 全て confirmed**。それ以外 not_ready。
- 拡張: `TravelInputNotReadyResult` に **`unconfirmed?: TravelInputPrerequisite[]`** を additive 追加（既存 `missing[]` と分離）。
  - missing → 「聞く」（destination/date を提供させる）。
  - unconfirmed → 「確認させる」（"たぶん箱根" を confirm）。
- ★ これは **input 確定性**の not_ready。**engine の needs_question/tie/blocked（意味的決定可否）とは別層**（contradiction 等は engine が判定。provider は再実装しない）。

## §5 real_only / privacy / 境界
- provenance.sources = 充足に寄与した surface 由来で導出（confirmed=`user_intake`/`session_slots`、session_context=`session_slots`）。**dev_fixture 混ぜない**・realOnly 派生 true・`assertNoFixtureSource` 通過。
- private（per-participant soft_preference/red_line・relation/after_action 由来）は **server-only slot として input に入る**（client 非 serialize・既存 two-layer で full に効くが shared 非露出）。相手非開示条件は private owner/visibility で保持。
- **やらない**: 抽出 NLP（upstream）/ M2・Stargazer enrichment（tier3）/ route・weather・place（tier4）/ production aggregator（tier5）/ 本番 `/plan` / engine 呼出（caller が provider→engine）/ real entity retrieval（option2）/ env 読み（gate 引数受け）。

## §6 推奨実装バンドル（承認後・docs→pure types+helper+tests）
- pure types: `TravelIntakeInput` / `TravelInputNotReadyResult.unconfirmed?`（E-B additive）/ hard prerequisite 列挙。
- helper（pure）: `isHardPrereqSatisfied(slot)` / `classifyTravelIntakePrerequisites(intake)` / `getSessionIntakeTravelInput(intake, gate)` → ready/not_ready。
- tests: confirmed→ready/real_only ・ proposed のみ→not_ready(unconfirmed) ・ 欠如→not_ready(missing) ・ retracted/partial 除外 ・ 派生のみ normalized は hard 不充足だが soft は input に入る ・ private soft は input(server-only)・shared 非露出 ・ dev_fixture 混ぜない ・ 抽出/M2/route/weather/production/engine/本番 import なし ・ tsc 55 ・ 既存 green。
- **production 配線・抽出・M2・route/weather・real entity は含めない**。

## §7 HOLD 継続
M2-B-2 / route・weather・place API / real entity retrieval(option2) / 本番 `/plan` / CoAlter runtime / useCoAlter / talk / send / booking / 予約リンク / solver-DAG / persistence / staging・production・push。

## §8 CEO 判断請求
1. **「存在」でなく「confirmed-real」で hard 判定**（proposed/retracted/派生のみ は不可・§2 述語）で良いか。
2. **hard(destination/date/participants) vs soft(その他) 分離**（soft は派生/private/proposed 可）で良いか。
3. **not_ready を missing/unconfirmed に分離**（intake 会話を駆動・engine の needs_question とは別層）で良いか。
4. after_action/relation 由来の **private soft slot を tier2 で input に流入**（server-only）で良いか。
5. 次フェーズ = この v2 の **pure types + intake provider helper 実装**（docs 承認後・M2/route/weather/本番なし）で良いか。
