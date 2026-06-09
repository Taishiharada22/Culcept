# Reality Control OS — A-4-0 Apply Target Decision / Cross-track Contract（**docs-only / read-only**）

> 2026-06-09 / Build Unit / CEO 指示「A-4-a 実装へ直行する前に、apply target / cross-track 境界 / granularity gap を確定する」。
> **docs-only・no code・no DB write・no route・no PlanClient・no apply・no migration・no notification・no production・no enable・no user-facing**。
> 前提: A-3 設計（`afaefd1b`・`docs/reality-apply-transaction-design.md`）+ read-only 実装調査（`consumed-seed-merge.ts` / `plan-seed-status-executor.ts` / `draft-plan.ts` / plan_seeds migration）。
> Repo alignment 済（2026-06-09 CEO 決定）: 本トラックの正本 = branch `main` / worktree `/Users/haradataishi/Culcept-main-reflect-20260604`。

---

## 1. Apply target decision（確定）

| 段 | target | 採否 |
|---|---|---|
| **Display-apply（提案を見せる）** | **DraftPlan reflection（computation・DB write ゼロ）** | ✅ **確定** |
| **Commit-apply（提案を確定）** | （当面）**保留** — empty-day timed block の自動 DB 永続化は**行わない** | ⏸ **deferred** |
| 永続化が真に必要なとき | **user 明示確認 → 既存 confirmed-anchor 経路（external_anchors・confirmed_at・user_owned）** をユーザー起点で | 🔒 別 gate・本セッション scope 外 |

### 採用しない target と理由
- **`external_anchors` への自動 write**: ✗。`confirmed_at NOT NULL`（未確認は永続化禁止・Invariant 2.1）。alter の tentative 提案を confirmed 外部予定として書くのは**意味論的に危険**（並行トラック A1-6-5d が「誤設計」として排除済）。**ユーザーが明示確認した時のみ** confirmed anchor になる（＝自動 apply ではない・本セッション scope 外）。
- **`plan_seeds` への empty-day timed block の write**: ✗（§3 granularity）。plan_seeds は **band-level 意図**（時刻なし）。時刻ブロックを seed に落とすと**時刻が失われ意味論も壊れる**（seed = 配置前の意図、block = 配置済み）。
- **PlanItem 直接 write / 新 `alter_plan_blocks` table**: ✗。DraftPlan reflection（computation）で足りる。新 table は DraftPlan 概念の重複・migration 負債。

### 本セッションの責務範囲（確定）
- **やる**: empty-day ChangeSet → **DraftPlan reflection（pure・no-write）** の helper + fake tests（A-4-a）。**A-1/A-2/A-3 の安全層を維持**（将来 commit が要るときの gate）。
- **やらない**: DB write / plan_seeds status write / external_anchors write / migration / PlanClient 接続 / Plan 本線 pipeline 配線 / production。
- **触らない**: 並行トラック所管ファイル（§2）。

→ **結論**: empty-day 提案の apply は **「見せる（Display・no-write・時刻保持）」を正とし、「書く（Commit）」は当面 deferred**。これにより **A-4 で DB write が不要**になり、最初の gate（A-4-d write）を開かずに価値（提案の可視化）を出せる。

## 2. Cross-track ownership（境界の確定）

| 資産 | 所管 | 本セッションの扱い |
|---|---|---|
| `lib/plan/reality/integration/plan-seed-status-executor.ts` | **並行トラック（A1-6）** | **read-only 参照のみ**。改変・複製・再実装 **禁止**。Commit が将来要るとき `CandidateActionExecutor` port を **注入 consume**（fork しない） |
| `lib/plan/reality/consumed-seed-merge.ts` | **並行トラック（A1-6-5c）** | **改変禁止**。merge **意味論**（additive / date-filter / duplicate-guard / no-mutation）を**参照規範**にする。`mergeConsumedSeedsIntoDraftPlan` は **seed 専用**ゆえ直接 consume 不可（§4） |
| `create_plan_seed_capture_bundle`（RPC）/ plan_seeds migration | **並行トラック（A1-5）** | **改変・apply 禁止**。Commit が将来要るときのみ参照 |
| `lib/plan/draft-plan.ts`（`DraftPlan` / `DraftPlanItem` / `DraftPlanItemOrigin`） | **Plan 本線（cross-track shared 型）** | **型は consume**。`DraftPlanItemOrigin` union への**追加は cross-track 決定**（§3.3・unilateral に追加しない） |
| `lib/plan/reality/permission/*`（A-1/A-2）+ 本トラックの apply 層 | **本セッション** | 実装・改変可 |

### 触ってよい範囲 / いけない範囲
- **触ってよい**: `lib/plan/reality/permission/` 配下に新規 reflect helper（pure・no-write）。`draft-plan.ts` の型を import して consume。
- **触ってはいけない**: 上表「並行トラック」の実体ファイル（改変・複製・再実装）。`DraftPlanItemOrigin` union の追加。Plan 本線 pipeline への配線。
- **再利用の interface boundary**: 並行トラックの pure 関数は **import して consume**（DI port も）。意味論が同じなら **再実装しない**。shape が違う場合（ChangeSet ↔ seed）は**本セッション側に薄い adapter** を置く（fork ではなく adapter）。
- **重複回避方針**: merge 意味論を二重実装しない。理想は将来の **shared 汎用 merge primitive 抽出**（cross-track refactor・別 gate）。A-4-a では既存 file を触らず、本セッション側に **意味論を一致させた reflect helper** を置き、重複は「merge の 4 規範」のみに限定（§4）。

## 3. Granularity gap（暫定結論）

### 事実
- **empty-day ChangeSet** = HH:mm の **時刻ブロック**（add op に startMin/endMin）。
- **plan_seeds** = **band-level**（desired_time_hint: morning/afternoon/evening/anytime・**exact time なし**）。
- **DraftPlanItem** = **exact time 保持**（`startTime: "HH:MM"`・`endTime?`）。`consumed-seed-merge` は `formatMinutes(min)` で時刻文字列化（既存 util 再利用）。

### 暫定結論（gap を「解消」ではなく「回避」する）
- **Display-apply は時刻を完全保持**: ChangeSet block.startMin/endMin → `DraftPlanItem.startTime/endTime`（HH:MM）。**ロスなし**。
- **時刻を seed に押し込まない**: 時刻ブロックを plan_seeds（band-level）に commit すると劣化＋意味論破壊。よって **empty-day timed block を plan_seeds に書かない**。
- **時刻保持の担保場所 = DraftPlan（computation 層）**。empty-day 提案は**再計算可能な advisory**であり、永続化対象ではない。「見せる」価値が本質。
- **plan_seeds への時刻列追加（migration）は不要**: 時刻は DraftPlan 側で保持・再計算するため。seed の semantics（配置前意図）を汚さない。
- **真に「この時刻で確定したい」ユーザー要求**: それは **confirmed anchor**（external_anchors・user 起点・confirmed_at）への昇格であり、自動 Commit-apply ではない（本セッション scope 外・別 gate）。

### 3.3 未確定の cross-track 点
- **empty-day block の `DraftPlanItemOrigin` 値**: 現 union に empty-day/Reality-engine 由来の値が無い可能性。候補 =（a）既存 `rhythm_inferred` を流用（engine 推論ブロックとして近い）/（b）cross-track 調整で新値（例 `reality_engine`）を追加。**A-4-a の fake tests では既存値を仮用**し、最終 origin は **cross-track 決定**（union 追加は unilateral にしない）。

## 4. A-4-a 実装前の最終決定

| 論点 | 決定 |
|---|---|
| A-4-a `reflectChangeSetIntoDraftPlan` を本セッションで実装してよいか | ✅ **よい**（pure・no-write・Plan 本線非接続・fake tests のみ）— ただし **本報告後の CEO 判断を挟む**（cross-track 境界が絡むため） |
| 既存 `consumed-seed-merge` を consume するだけか | ✗ 直接 consume 不可。`mergeConsumedSeedsIntoDraftPlan` は **seed 専用**（`ReflectableConsumedSeed[]` を取り `consumedSeedToDraftPlanItem` で map） |
| 新 reflection helper を作るか | ✅ 作る。`lib/plan/reality/permission/`（本セッション所管）に **`reflectChangeSetIntoDraftPlan(draftPlan, prepared, opts)`**（ChangeSet add op → DraftPlanItem・additive merge）。**既存 file は触らない** |
| helper を作る場合、Plan 本線に接続しない保証 | DraftPlan を **引数で受け取り新 DraftPlan を返す pure 関数**。`PlanClient` を import しない・fetch しない・DB を読まない・pipeline に配線しない。**source-contract test で固定** |
| fake tests のみで止める範囲 | DraftPlan fixture + ChangeSet fixture で **merge 規範（additive / 同日 filter / duplicate guard / no-mutation / 時刻保持 HH:MM / redaction）** を検証。実 DraftPlan pipeline・staging render（A-4-c）には進まない |

### A-4-a の merge 規範（`consumed-seed-merge` と一致させる・重複は最小）
1. **additive**: 既存 items 末尾に追加・既存 items/id/basedOn/他 field 不変・対象なし→同一参照返し。
2. **date filter**: `draftPlan.date` 一致のみ。
3. **duplicate guard**: 既存 item.id と一致する real itemId は再追加しない（idempotent re-merge）。
4. **no-mutation**: 元 DraftPlan / 元 ChangeSet を破壊しない。
5. **time-preserving**: block.startMin/endMin → DraftPlanItem.startTime/endTime（`formatMinutes`・HH:MM）。
6. **redaction**: title は abstract label のみ（A-2 が provenance の raw を排除済）・seedRef/PII を出さない。

## 5. A-4 以降の gate 再整理

| slice | 内容 | write | CEO GO |
|---|---|---|---|
| **A-4-a** | `reflectChangeSetIntoDraftPlan` pure helper + fake tests（本セッション所管に新規・Plan 本線非接続） | なし | 🔒 **本 A-4-0 報告後に 1 度 GO**（cross-track 境界ゆえ・以後 pure は自律） |
| **A-4-b** | （任意）dedup 用 partial unique index の migration **設計**（apply しない） | なし | 🔒 migration design gate（任意・不要見込み） |
| **A-4-c** | Display reflection の staging smoke（DraftPlan に反映表示） | なし | 🔒 **Plan 本線 / DraftPlan pipeline = cross-track + CEO gate** |
| **A-4-d** | Commit write smoke（plan_seeds status・**当面 deferred**） | **DB write** | 🔒 **初の write・CEO write gate（閉じたまま）** |
| **A-4-e** | PlanClient / UI 接続 / confirmation UI / production | route/UI | 🔒 後続 gate（段階） |

- **CEO GO が必要な点**: A-4-a 着手（本報告後・cross-track ゆえ）/ A-4-c（Plan 本線配線）/ A-4-d（write）/ A-4-e（UI・production）/ `DraftPlanItemOrigin` union 追加（cross-track）/ 並行トラック file への実配線。

---

## 6. 報告（CEO 判断用）

### A-4-0 で決定した apply target
- **Display-apply = DraftPlan reflection（no-write・時刻保持）で確定**。
- **Commit-apply（DB write）は deferred**。empty-day timed block を plan_seeds にも external_anchors にも自動 write しない。永続化が要るときのみ **user 起点で confirmed anchor** へ（別 gate・scope 外）。

### cross-track 境界
- `plan-seed-status-executor` / `consumed-seed-merge` / capture RPC / plan_seeds migration / `draft-plan.ts` の型 = **並行トラック / Plan 本線所管 → 改変・複製・union 追加・配線は禁止**。**型 consume と pure 関数の DI consume のみ可**。
- 本セッションは `lib/plan/reality/permission/` に **新 reflect helper** を置く（既存 file 不接触・merge 意味論のみ一致）。

### granularity gap への暫定結論
- **時刻は DraftPlan（computation）で保持**し、**seed に押し込まない**。Display-apply は HH:MM をロスなく保持。**plan_seeds への時刻列追加 migration は不要**。`DraftPlanItemOrigin` の empty-day 用値のみ cross-track 未確定（A-4-a は既存値で仮実装）。

### A-4-a に進んでよい最小 scope
- `reflectChangeSetIntoDraftPlan(draftPlan, prepared, opts)`（pure・no-write・Plan 本線非接続）+ fake tests（merge 規範 6 点）。**実 DraftPlan pipeline / staging render / cross-track file 改変には進まない**。

### A-4-d write gate
- **閉じたまま**。本セッションでは **DB write をしない**（Display-apply のみ）。Commit-apply（plan_seeds status・write）は deferred で、開けるのは CEO write gate。

→ A-4-0 完了。**A-4-a 実装の前に CEO 判断を挟む**（pure でも cross-track 境界が絡むため）。
