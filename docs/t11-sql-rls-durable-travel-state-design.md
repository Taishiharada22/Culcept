# SQL/RLS Durable Travel State Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし・SQL/migration なし・apply なし**。実装は CEO 承認後。
> DB migration = CLAUDE.md §1 CEO 承認案件。M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / production deny 解除 は HOLD。
> 上位文脈: external link ladder（Tier1-A〜C + Preparation + producer/consumer + gated option + render distinction）完成。`t11-d-durable-travel-state-persistence-preflight.md` の in-memory harness が durable 契約を encode 済。
> **本書 = production `/plan` が confirmed travel input / inert・external link state / recompute 可能 display を将来永続するための DB スキーマ + RLS 境界**（authoritative packet / raw engine output / raw diagnostics / private rationale / action authority は**永続しない**）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- **harness（`travel-session-intent-harness-types.ts`）= 既存の durable 契約**: 保持＝`events`（構造化 input intent）+ `ownerUserId` + inert `SafeTravelLinkIntent[]` + visibility。**保持しない**＝AuthoritativePacketForServer / raw TravelPlanEngineOutput / raw diagnostics / PlanIntelligenceProjection / CoAlterProjectionCue[] / DisplayPacketForClient / executionAuthority / booking/calendar/action / href / generatedUrl / live availability・price。`non_inert_safe_link`/`forbidden_field` を拒否。
- RLS 規約（既存・例 `prm_model_entries`）: **`auth.uid() = user_id`** owner-only（SELECT/INSERT/UPDATE/DELETE）・**service_role 非前提**・user_visible。
- ephemeral 経路: `TravelLiveActionState`（useActionState 返却）→ refresh で消える。`display: {packet, projection, cues, externalLinks?}` は全て display 派生。`provided.input`（slots）は server-only。
- ExtractedSlot: destination_area(areaText)/date_or_range/budget_band/pace/mobility_tolerance/red_line/soft_preference/time_window + SlotBase{status, fillState, confidence, owner, visibility, evidence}。
- migration 規約: `supabase/migrations/<ts>_<name>.sql`・additive。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **SQL/RLS durable state design（本書・docs-only）** | 低（設計のみ・SQL/apply なし） | 高（production 露出前に「何を保存可/絶対保存しない」を DB 前提で確定。refresh 消失の解） | **推奨・次（設計のみ）** |
| M2 production merge | 中 | — | 後（CEO 既決で後） |
| CoAlter runtime | **高**（大規模面） | 中 | 後 |
| production deny release | 最大 gate | — | **最後**（durable モデル確定後でないと露出不可） |
| link work freeze | — | — | 却下（link は完成・次の gap は durability） |

**推奨: SQL/RLS durable state design 次・docs-only。** 根拠（①⑤⑧）: link/表示/action-state は整ったが **refresh で Travel live state が消える**。production deny release（最終）の前に **「何を保存してよいか / 何を絶対保存しないか」を DB 前提で切り分ける**必要。harness が契約を encode 済ゆえ、それを **table + RLS スキーマに具体化**する設計が次。実装（SQL）は CEO migration GO まで HOLD。

### ★ 設計の核（③⑥⑦）— 「input intent を保存・display を recompute」
honesty backstop: **正本は構造化 input intent（confirmed/explicit のみ）+ inert link metadata**。**display（engine output/packet/projection/cues/href/generated URL）は永続せず毎回 recompute**。これにより「古い display が confirmed 状態と矛盾」「authoritative/private が client-readable table に漏れる」事故を**構造で**排除（harness と同型）。

---

## 2. 現 ephemeral state（②）
| state | 区分 | refresh |
|---|---|---|
| `TravelLiveActionState` | display-safe 返却 | **消える** |
| `TravelPlanDisplayPayload{packet,projection,cues,externalLinks?}` | display-safe・**recompute 可** | 消える |
| `PlanIntelligenceProjection` / `CoAlterProjectionCue[]` | display 派生・**recompute 可** | 消える |
| `SafeTravelLinkIntent`（inert manual） | **永続可**（inert metadata） | 消える |
| `SafeTravelLinkHrefModel[]` / generated Maps intent | display 派生・**recompute 可** | 消える |
| `provided.input`（slots・engine input） | **server-only**（confirmed 部分のみ永続可・private は別扱い） | 消える |
| authoritative packet / engine output / diagnostics | **server-only・永続不可** | 消える |

## 3. persistence problem（③）
- useActionState/live action 結果は ephemeral → **refresh で travel 結果消失**。
- external link は表示可能になったが **durable でない**。
- production release には **coherent な persisted input/session モデル**が要る。
- **保存しすぎ → private/authoritative leak**・**保存しなさすぎ → travel live が使えない**。
- DB/RLS は **hard gate**（migration = §1 CEO 承認）。

## 4. 保存してよいもの（§4）
- **構造化 travel session intent**:
  - `destination_area`: **explicit confirmed のみ**（areaText・confirmed-real）。
  - `date_or_range`: **explicit / selected plan date のみ**。
  - `participantIds` / `owner_user_id`。
  - `budget_band` / `pace` / `mobility_tolerance`: **explicit のみ**（band/enum・raw score 禁止）。
  - shared `red_line` / `soft_preference`: **explicitly shared のみ**（private は別扱い・§12）。
- **safe link intent metadata**: inert manual URL metadata（**explicitly supplied のみ**）。generated maps search intent は **recompute**（保存必須でない）。
- **provenance / visibility markers**（source kind・shared/private・evidence surface 参照 id）。
- not-ready status summary（**中立・private detail なし**・任意）。

## 5. recompute すべきもの（§5・永続しない）
TravelPlanEngineOutput / AuthoritativePacketForServer / DisplayPacketForClient / PlanIntelligenceProjection / CoAlterProjectionCue[] / SafeTravelLinkHrefModel[] / generated Maps 検索 URL（confirmed shared-safe label から）/ candidate・comparison display state。

## 6. 絶対に保存しないもの（§6）
AuthoritativePacketForServer / raw TravelPlanEngineOutput / raw TravelPlanEngineInput（unfiltered/private/generated を含む形）/ raw provider diagnostics / raw private rationale / raw FitResult / raw M2・Stargazer output / **private red_line/preference を client-readable table に** / executionAuthority / booking/calendar/action field / live price・availability・route・weather claim / **private data から生成した href** / external link の preview・fetch 内容。

## 7. table 候補（§7）
| table | 役割 | MVP? |
|---|---|---|
| **`plan_travel_sessions`** | session root（owner・status・visibility・timestamps） | **MVP** |
| **`plan_travel_session_inputs`** | 構造化 slot intent（confirmed/explicit・shared 部分） | **MVP** |
| **`plan_travel_session_links`** | inert safe-link metadata（manual のみ・generated は recompute） | **MVP** |
| `plan_travel_session_participants` | 多人数（current-user binding が現状単独ゆえ） | **HOLD**（多人数解禁時） |
| `plan_travel_session_private_inputs` | private slot（red_line 等）を owner-only 分離 | **HOLD/条件付き**（private を持つ段階で） |
| `plan_travel_session_entities` | entity 束縛 | HOLD |
| `plan_travel_session_display_cache` | display 投影キャッシュ | **HOLD（原則 recompute・cache しない）** |

★ MVP = sessions + inputs + links（**shared/confirmed/explicit のみ**）。private slot を持つなら `_private_inputs`（owner-only）を別 GO で。participants は多人数解禁まで HOLD。display_cache は **作らない**（recompute 原則）。

## 8. table 目的 + 主要列（§8）
- **`plan_travel_sessions`**: `id`(uuid pk) / `owner_user_id`(uuid・auth.users) / `status`(text: draft/ready_snapshot 等・中立) / `visibility`(text: shared/private) / `created_at` / `updated_at`。**authoritative 出力列なし**。
- **`plan_travel_session_inputs`**: `id` / `session_id`(fk) / `slot_key`(text: destination_area/date_or_range/budget_band/pace/mobility_tolerance/soft_preference・**red_line は shared 明示時のみ**) / `value`(jsonb・band/enum/areaText・**raw score 禁止**) / `slot_status`(text: confirmed/normalized) / `fill_state` / `owner`(text/jsonb: shared|participant) / `visibility` / `provenance`(jsonb: surface 参照 id のみ・本文なし)。
- **`plan_travel_session_links`**: `id` / `session_id` / `source`(text: user_provided/manual_official/manual_maps・**generated_maps_search は保存しない=recompute**) / `external_reference`(text・inert value・**fetched 内容なし**) / `generated`(bool・manual は false) / `inert`(bool true) / `rendered`(bool false) / `eligibility`(text)。**preview/fetched content 列なし・availability/price 列なし**。
- **authoritative output 列を一切持たない**（全 table）。

## 9. RLS モデル（§9）
- **core predicate = `auth.uid() = owner_user_id`**（sessions）/ session 経由（inputs/links は session owner で gate）。
- owner は自分の session を read/write。
- participant の shared 読取は **多人数解禁時のみ**（`_participants` + shared visibility）。
- **private field は server-filter か別 table（owner-only）**。
- **public access なし**・**client-only privacy filtering 禁止**・**service_role runtime write 非前提（MVP）**。
- **`/talk` 非依存**・**CoAlter pair state 非依存**。

## 10. write モデル（§10）
- 承認時のみ **user-RLS insert/update**（自分の構造化 input）。
- **server action 特権 write は初期設計に含めない**（別承認）。
- **booking/calendar/action write なし**・**external fetch 結果 write なし**・**read receipt/realtime なし**。
- 編集は **構造化 input の append/update**（raw chat log でない）。
- retracted/corrected slot は **明示 status**（保存するなら slot_status に retracted）。

## 11. safe link persistence（§11）
- Tier1-A **inert metadata は保存可**。
- Tier1-B href model は **recompute**（intent から）。
- Tier1-C generated Maps intent は **recompute**（confirmed shared-safe label から・保存しない）。
- **fetched URL 内容を保存しない**・**link preview を保存しない**・**live availability/price を保存しない**。
- generated URL は **private state を含めない**。
- `rendered` flag は **action authority を含意しない**（保存しても false）。

## 12. privacy / visibility（§12）
- **shared field**（destination/date/participants/explicit budget-pace-mobility/explicitly-shared descriptor）→ shared table。
- **private field**（private red_line/soft_preference・M2 soft enrichment 由来）→ **owner-only（別 table or server-filter）・client-readable shared table に置かない**。
- **server-only field**（confirmed の元 evidence 本文等）→ 保存するなら server-only・UI に出さない。
- **display-safe field** のみ client read。
- **private soft enrichment/M2 は private のまま**（shared に昇格しない・M2 merge は別 GO・production action へ merge しない CEO 既決）。
- not-ready prompt は **private detail を出さない**（中立 ask）。
- **raw userId を UI に出さない**（参加者は「あなた」表示・既存 B 原則）。

## 13. migration safety（§13）
- **additive only**（CREATE TABLE + RLS のみ）。
- **ALTER/DROP legacy table なし**。
- **production apply なし**・**staging apply は CEO GO なしで行わない**。
- migration draft 承認後に **local-only smoke**（別 GO）。
- rollback 期待: 新規 table の DROP のみで戻る（既存に非接触）。
- generated types（`supabase gen types`）は **local apply 後・承認後のみ**。

## 14. 実装オプション + 推奨（§14・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. docs-only schema/RLS 設計 closeout | 本書で確定 | 本 phase の成果 |
| **C. pure repository/interface types のみ** | persisted-model TS 型 + repository interface（read/write 契約）・**SQL/apply なし** | **◎ 次推奨**（pure・testable・DB gate 不要・harness と整合） |
| B. SQL draft only（apply なし） | migration ファイル草案 | C の後（CEO migration GO 前提・review 用） |
| D. in-memory harness alignment のみ | harness を schema に合わせる | C に内包可（harness は既に契約 encode 済） |
| E. persistence 後回し・M2 merge 設計へ | — | 却下（durability が production release の前提） |

**推奨次フェーズ（CEO 承認後）: C（pure repository/interface types のみ）。** 根拠（③④）: DB に触れず、persisted-model 型 + repository interface（`saveTravelSessionIntent` / `loadTravelSessionIntent` 等の契約）を **harness 契約と整合**する形で pure に定義。forbidden field を型で排除し、display を recompute する read 契約を固める。**SQL draft（B）+ local apply は CEO migration GO の別 GO**。
```
// スケッチ（未実装・pure types）
interface PersistedTravelSession { id; ownerUserId; status; visibility; }  // authoritative/raw を型に持てない
interface PersistedTravelInput { sessionId; slotKey; value; slotStatus; fillState; owner; visibility; provenanceRefIds }
interface PersistedTravelLink { sessionId; source; externalReference; generated; inert; rendered; eligibility }
//   ※ 全て display-safe/inert・href/generatedUrl/preview/availability/authoritative を型で持たない
interface TravelSessionRepository {
  save(input): Promise<...>;   // forbidden field を型で排除
  load(sessionId, ownerUserId): Promise<{ session; inputs; links } | null>;  // display は呼び元が recompute
}
```
- **SQL/migration/apply / M2 merge / CoAlter / production deny は HOLD。**

## 15. 将来 test（§15・実装時）
- persisted model に **AuthoritativePacketForServer / raw TravelPlanEngineOutput / raw diagnostics / raw FitResult を持てない**（型 + runtime guard）。
- **private red_line が shared read に出ない**。
- inert `SafeTravelLinkIntent` は **保存後も inert**。
- **stored private data から href を生成しない**。
- generated Maps URL は **confirmed shared-safe label からのみ recompute**。
- **RLS が non-owner read/write を block**。
- **service_role runtime write なし**。
- **`/talk` 非依存**・**CoAlter pair 仮定なし**・**booking/calendar/action authority なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

## 16. Stop
- 本書（SQL/RLS Durable Travel State Design）で**停止**。
- SQL/migration 実装は **CEO 承認まで行わない**（DB migration = §1 CEO 承認案件）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **SQL/RLS durable state design（docs-only）**。link/表示/action-state は整ったが **refresh で消える** → production deny release（最終）の前に「何を保存可/絶対保存しない」を DB 前提で確定する必要。harness が契約 encode 済ゆえ table+RLS に具体化。
- **核（③⑥⑦）**: **input intent（confirmed/explicit）+ inert link metadata を保存・display は recompute**。authoritative/raw/diagnostics/private-client/href/generatedUrl/availability/price を**永続しない**（harness と同型・honesty を構造で担保）。
- **table（§7-8）**: MVP = `plan_travel_sessions` + `plan_travel_session_inputs` + `plan_travel_session_links`（shared/confirmed/explicit のみ）。private slot は `_private_inputs`（owner-only）別 GO・participants は多人数解禁まで HOLD・**display_cache は作らない**。authoritative 出力列ゼロ。
- **RLS/write（§9-10）**: `auth.uid()=owner_user_id` owner-only・service_role 非前提・public なし・client-only filtering 禁止・`/talk`/CoAlter 非依存。write は user-RLS の構造化 input append/update のみ（特権 write/booking/fetch/realtime なし）。
- **link/privacy（§11-12）**: Tier1-A inert のみ保存・href/generated は recompute・fetched/preview/availability/price を保存しない。private（red_line/M2）は owner-only 分離・shared に昇格しない・raw userId を UI に出さない。
- **migration safety（§13）**: additive only・ALTER/DROP なし・production/staging apply は CEO GO まで HOLD・rollback は新規 table DROP のみ。
- **推奨次フェーズ**: **C（pure repository/interface types のみ・SQL/apply なし・harness と整合・forbidden field を型排除）**。B（SQL draft）+ local apply は CEO migration GO の別 GO。**M2 merge / CoAlter / production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト/SQL 不変・tsc 55・push なし・production 非接触。
