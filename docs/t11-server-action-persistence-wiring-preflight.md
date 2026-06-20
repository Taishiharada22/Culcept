# Server Action Persistence Wiring Preflight（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし・persistence 配線実装なし・real DB 不要**。実装は CEO 承認後。
> 上位文脈: durable DB path（SQL/RLS 設計・pure types+contract・in-memory harness・SQL draft〔apply smoke 済〕・DB port+mapping adapter・structural Supabase port〔mock-only〕）まで完成。**real-DB 配線は Docker/generated types/RLS smoke 待ちで停止**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- action `submitTravelLiveIntakeAction`: gate → **auth（`supabaseServer().auth.getUser()`・未認証/anonymous → unavailable）** → events（FormData・identity 非読込）→ `buildTravelPlanDisplayResult` → `toTravelLiveActionState`。**persistence なし**・`ownerUserId = authUserId`。
- ★ **永続すべき「confirmed structured intent」は `provided.input.slots`（adapter 内部・server-only）にしか無く、display result に露出していない**（B/C-E と同型）。action が持つのは `events` + `authUserId` のみ。
- 完成済: `TravelSessionRepositoryContract` / in-memory harness / DB port + mapping adapter / structural Supabase port（mock-only）。real Supabase 未配線・SQL 未 apply・generated types 不在・production deny active。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | 評価 |
|---|---|
| **persistence wiring preflight（本書・docs-only）** | **推奨・次**。real DB を待つ間に **配線境界（何を/いつ/誰が/失敗時/出力）を確定**。zero risk・「confirmed slots が adapter 内部」問題を早期に surface |
| real DB / generated types を待つ | 後（gated 前提・本 preflight が配線の前提を scope） |
| production deny preflight（継続） | 既出（gate matrix）。persistence は durable beta の hard blocker |
| M2 production merge | 後（CEO 既決） |

**推奨: persistence wiring preflight 次・docs-only。** 根拠（①⑤）: DB 実装は停止中。だが「action がいつ/何を/どう永続するか」の**境界を先に確定**すれば、real DB が揃った時の配線が小さく安全になる。かつ **「confirmed structured intent が adapter 内部にしか無い」設計上の前提**を今 surface できる。

## 2. 現状（②）
action は display-safe action state を返すのみ・persistence なし。repository contract / in-memory harness 在り。structural Supabase port は **mock-only**・real port 未配線・SQL 未 apply・generated types 不在・production deny active。

## 3. persistence wiring problem（③）
- action は構造化 FormData（events）+ auth を持つ。
- binding/provider/engine/display chain は在る（adapter 内部）。
- durable repository contract は在る。
- だが action 内 persist は **write side effect / owner-auth 依存 / 失敗意味論 / RLS 依存 / privacy リスク / refresh-durable UX 決定**を導入 → **別 gate が要る**。
- ★ **central wrinkle**: 永続対象の confirmed slots は `provided.input.slots`（adapter 内部）。display result に無い → 配線は **(i) adapter から structured intent を server-only で露出** か **(ii) events→write-input の pure 再 bind mapper** が前提。

## 4. action が永続してよいもの（§4）
- **構造化 travel session intent のみ**（persisted-model write input）:
  - confirmed destination / date / participants。
  - explicit budget / pace / mobility。
  - shared soft preferences（**explicitly shared のみ**）。
  - inert manual safe link metadata（**explicitly supplied のみ**）。
  - provenance / visibility markers。
- **永続しない**: display packet / projection / cues / generated Maps href / raw diagnostics / raw engine output。

## 5. 永続してはならないもの（§5）
AuthoritativePacketForServer / TravelPlanEngineOutput / DisplayPacketForClient / PlanIntelligenceProjection / CoAlterProjectionCue[] / FitResult / raw provider diagnostics / raw private rationale / executionAuthority / booking・calendar・action / href・generatedUrl / **generated_maps_search rows** / availability・price・route・weather / private M2・Stargazer output。（DB port row + mapping guard + SQL CHECK で多層に排除済）

## 6. auth / owner モデル（§6）
- **auth user は server からのみ**（`supabaseServer().auth.getUser()`）。
- **FormData から user_id を読まない**。
- **ownerUserId = auth user id**。
- **未認証 → persistence なし**・**anonymous → persistence なし**。
- repository write は **owner-scoped**・**RLS が DB 最終 gate**（real 配線後）。

## 7. timing（§7・①比較）
| 案 | 内容 | 評価 |
|---|---|---|
| A. engine 前に persist | 早すぎ（confirmed 前提が無い） | ✗ |
| B. provider-ready 後・engine 前に persist | confirmed structured intent を持つ最初点 | ◎ 候補 |
| C. display 成功後に persist | display 依存（display は recompute 可ゆえ不要結合） | △ |
| **D. explicit input のみ・engine 成功と独立に persist** | display 出力に依存せず confirmed input だけ保存 | **◎ 推奨（B と整合）** |
| E. DB chain 完成まで persist しない | 現状 | 現状維持（real 配線まで） |

**推奨: B+D — provider-ready で confirmed structured input のみ persist・engine/display 成功と独立**（display は recompute 可）。**provider not-ready → write なし（MVP）**（draft/incomplete intent の保存は **別承認**まで HOLD）。
> ★ 根拠（③⑤）: 正本は input intent・display は派生（durable 設計の核と一致）。engine 失敗でも confirmed input は保存価値があるが、MVP は **ready のみ**で十分かつ安全。

## 8. repository injection（§8）
- action は **concrete Supabase port から直接 repository を構築しない**（real DB adapter 承認まで）。
- **provider/factory seam を定義**:
  - test 用 **in-memory harness**。
  - 将来 **Supabase repository factory**（real DB chain 完成 + gate 後）。
- **global singleton 禁止**（cross-user leakage リスク）。**client-side repository なし**・**service_role なし**。
- seam は **gated**（real は DB chain 完成まで返さない・既定 null/no-op）。

## 9. failure 意味論（§9）
- repository unavailable / write rejected / RLS denied / partial write / duplicate / link CHECK violation。
- **raw DB diagnostics を client に出さない**（mapping adapter が中立 error に map・cleanup は best-effort）。
- ★ **推奨: display-without-save（persistence は best-effort・fail-open）** — 保存失敗でも **display result は返す**（draft 体験を壊さない）+ 任意の中立 persistence status。fail-closed（保存失敗で display も拒否）は UX 劣化ゆえ非推奨。
- production 安全: real 配線まで persistence は off（no-op seam）。

## 10. action-state output（§10）
- **raw persistence diagnostics を含めない**。
- 必要なら **中立 persistence status のみ**（`saved` / `not_saved` / `unavailable`）。
- **session id を client に出さない**（later 承認まで）。
- **raw repository bundle なし**・**persisted private field なし**。
- ★ MVP: action-state を**変えない**（persistence off）。配線時に **additive な中立 status field**（既定なし＝従来 byte 等価）。

## 11. 将来 test（§11・実装時）
- 未認証 → persist しない。
- client は ownerUserId を供給できない（auth のみ）。
- client は session id を authority として供給できない（later 承認まで）。
- provider not-ready → persist しない（別承認まで）。
- ready input → **構造化 intent のみ** persist。
- display 出力 / projection / cues / generated maps link を persist しない。
- private red_line を shared model に persist しない。
- repository 失敗 → **raw DB error を leak しない**・display は返る（display-without-save）。
- **service_role なし**・**app/UI repository import なし**・**`/talk` / CoAlter/useCoAlter / booking/calendar/action なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

## 12. 実装オプション + 推奨（§12・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. persistence wiring 型のみ | 中立 status / write 経路の型 | 小 |
| B. repository factory/seam interface のみ | provider seam（in-memory / 将来 Supabase・gated・no singleton） | 候補 |
| **C(pure). events/confirmed-intake → `TravelSessionPersistenceWriteInput` pure mapper** | 「confirmed slots が adapter 内部」問題の **missing pure 部品**・in-memory harness で test・**DB/action 不接触** | **◎ 推奨次 step** |
| D. action 永続を in-memory harness で test 実装 | action 配線（test のみ） | 後（pure mapper + seam の後） |
| E. real Supabase / generated types を待つ | — | 最終（real-DB 配線） |

**推奨次フェーズ: C(pure) — `events`（または confirmed-intake）→ `TravelSessionPersistenceWriteInput` の pure mapper を実装**（in-memory harness で round-trip 検証・**real DB/action wiring 不要**）。これは「confirmed structured intent が adapter 内部」問題を解く missing pure 部品で、本トラックの「無 DB・pure 先行」規律と最も整合。
- ★ mapper の前提決定（実装時）: confirmed slots を **(i) adapter が server-only で露出** か **(ii) mapper が events を再 bind**（`bindTravelSessionIntake` + provider）か。**(ii) 再 bind が action 非改変で最も surgical**（adapter 契約を変えない）。
- その後 **B（repository seam）→ D（action 配線・in-memory・flag gated）→ E（real Supabase）**。
> ★ CEO §12 は「一つ推奨」を求める。本トラック規律（無 DB・pure 先行・action 非改変）に最も整合するのは **C(pure mapper)**。real-DB/action wiring は gated。

## 13. Stop
- 本書（Server Action Persistence Wiring Preflight）で**停止**。
- persistence 配線は **CEO 承認まで行わない**（real DB call / generated types / local reset / staging・production apply / service_role / action 永続 配線も HOLD）。

---

## 出力サマリ
- **性質**: persistence の**配線境界 preflight**（docs-only・配線実装なし・real DB 不要・解禁なし・push なし）。
- **central wrinkle（①③）**: 永続対象 confirmed structured intent は **`provided.input.slots`（adapter 内部・server-only）にしか無く display result に露出しない** → 配線は **(i) adapter 露出 or (ii) events 再 bind mapper** が前提。
- **what/when（④⑦）**: 永続は **confirmed structured intent のみ**（display/projection/cues/generated href/raw を永続しない）。timing は **B+D（provider-ready で input のみ・display 成功と独立・display は recompute）**・not-ready → write なし（MVP・draft 保存は別承認）。
- **auth/owner（⑥）**: ownerUserId=auth user・FormData user_id 不読込・未認証/anonymous → persist しない・owner-scoped・RLS 最終 gate。
- **injection/failure/output（⑧⑨⑩）**: repository は **gated factory seam**（in-memory test / 将来 Supabase・no singleton・no service_role）。失敗は **display-without-save（best-effort・raw diag leak なし）**。action-state は MVP 不変、配線時に additive 中立 status（saved/not_saved/unavailable・session id 非露出）。
- **推奨次フェーズ**: **C(pure) — events→`TravelSessionPersistenceWriteInput` pure mapper（再 bind 方式が action 非改変で surgical・in-memory harness で test・無 DB）**、その後 B（seam）→ D（action 配線・gated）→ E（real Supabase）。
- 本フェーズは **docs-only** — コード/型/テスト/SQL/generated types 不変・tsc 55・push なし・production 非接触。
