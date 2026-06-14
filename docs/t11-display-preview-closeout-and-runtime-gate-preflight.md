# T11 Display Preview Closeout + Runtime Gate Preflight（preview 凍結・次 gate 判断・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **closeout + gate 判断のみ・実装なし**（docs-only）。
**位置づけ**: 2 つの fixture dev preview（`dev-travel-projection` / `dev-coalter-projection-cues`）を凍結し、
本番 `/plan` / runtime engine / CoAlter / useCoAlter / Bundle 2 / solver のどれに進む前にも、**最も安全な次 gate** を決める。
**スコープ**: 計画のみ。コード変更なし（docs/decision-log のみ）。**UI 変更・新 preview route・本番接続・runtime・CoAlter 配線・送信・push は触らない**。**本レポートで停止**。

> ⚠️ 環境注記: dev server（Turbopack）が `next/package.json` を `/app` から解決できず workspace root 推論で失敗。
> これは **worktree/monorepo の root 推論問題（既存環境要因）で、本 preview 追加とは無関係**（flag-gated default OFF の通常 page）。
> preview components は `renderToStaticMarkup` テスト + full suite green で検証済み。dev server 修正（`next.config` の `turbopack.root` 設定）は
> **本 docs-only フェーズ外**＝CEO 承認後に別途対応可能。

---

## §1 Closeout summary

| Phase | 成果 | コミット |
|---|---|---|
| **T11-A** PI projection fixture preview | `dev-travel-projection`（fixture projection・read-only・default-OFF flag） | `f9a51621` |
| **T11-B** CoAlter cue fixture preview | `dev-coalter-projection-cues`（fixture cues・read-only・**同一 flag 再利用**） | `81d9f2b9` |

- **shared flag strategy**: 両 preview は **同一 `PLAN_TRAVEL_PROJECTION_PREVIEW`（`PLAN_FLAGS.travelProjectionPreview`）**・default OFF。新 flag を増やさない（state 組合せ最小）。
- **read-only**: 両 preview とも表示のみ・button/input/送信なし。
- **fixture-only**: engine runtime を実行せず、hand-built display packet → 実 mapper/helper（`buildPlanIntelligenceProjection` / `deriveCoAlterProjectionCues`）で生成。
- **unwired のまま**: 本番 `/plan`・engine runtime・CoAlter runtime・useCoAlter・/talk・send・booking。

---

## §2 現在の preview map

| route | 入力 | 出力 | flag | fail-closed | tests |
|---|---|---|---|---|---|
| `dev-travel-projection` | fixture `DisplayPacketForClient` | `PlanIntelligenceProjection`（9 section） | `PLAN_TRAVEL_PROJECTION_PREVIEW`（OFF 既定） | flag OFF → `<Disabled>` | render 6 + page 10 = **16** |
| `dev-coalter-projection-cues` | 上記 projection（+explain_plan 1 件） | `CoAlterProjectionCue[]`（5 action） | **同一** flag | flag OFF → `<Disabled>` | render 8 + page 6 = **14** |

- **production `/plan` untouched**: `page.tsx` / `PlanClient.tsx` 不変（git 確認）。両 preview は `dev-*` route で本番非接触。
- preview tests 計 **30**。

---

## §3 安全保証（型 + runtime + test で担保）

1. **authoritative packet なし**（display tier のみ・brand で代入不可）。
2. **raw PlanDecisionPacket なし**（fixture は display packet を cast・projection/cue に raw 非搭載）。
3. **raw FitResult なし**（fitAdvisory は bounded `ProposalFitSummary`）。
4. **diagnostics 露出なし**（packet にも projection/cue にも非搭載）。
5. **executionAuthority 表示なし**（component に authority prop なし）。
6. **useCoAlter なし / `/talk` なし**（両 preview とも import しない）。
7. **engine runtime 実行なし**（fixture・`runTravelPlanEngine` 非呼び出し）。
8. **fetch/API/DB/Supabase なし**。
9. **send/realtime/read receipt なし**。
10. **booking/scheduling action なし**（cue に execute/book/schedule/send なし）。
11. **新 flag-state 複雑性なし**（既存 1 flag を共有）。

---

## §4 Runtime gate inventory（各 gate の HOLD 状態と開放前提）

| gate | 状態 | 開放前に必要なもの |
|---|---|---|
| 本番 `/plan` integration | **HOLD** | engine runtime + CoAlter 方針確定 + CEO 本番承認（最終段） |
| server-side engine runtime wiring | **HOLD** | preflight 設計（runTravelPlanEngine を server で実行・fixture 入力→実 output）。pure 関数ゆえ低リスクだが request-time 実行は初 |
| CoAlter client display wiring | **HOLD** | engine runtime（実 projection）が先・client display path 設計 |
| CoAlter server-authoritative orchestration | **HOLD** | M2-B-2 解錠（特権 runtime・最小開示粒度）・CEO GO |
| useCoAlter | **HOLD** | talk runtime 結線済のため travel projection 流入は M2-B-2 と絡む・別 GO |
| `/talk` runtime | **HOLD** | 同上 |
| M2-B-2 | **HOLD** | 初の特権 runtime 流入・staging 観測・最小開示粒度確定・CEO GO |
| Bundle 2 fit dominance/ranking | **HOLD** | advisory 固定を崩す前に consume 契約凍結済を前提に設計 GO |
| itinerary DAG / solver | **HOLD** | place/route 解決（runtime gate）・engine wiring 後 |
| route/weather/place API | **HOLD** | 実データ源接続（各々独立 GO・production deny 前提） |
| persistence | **HOLD** | DB schema/migration（CEO 承認）・現状 pure 全層非永続 |
| send/realtime/read receipt | **HOLD** | CoAlter runtime + 通信設計・CEO GO |
| booking/calendar | **HOLD** | 最終段・実行権限は readiness authoritative 経由のみ・別 hard gate |

---

## §5 Next branch comparison

| 分岐 | 内容 | 評価 |
|---|---|---|
| A. preview polish | 見た目調整 | 低価値（UX は目視可） |
| B. 本番 `/plan` integration preflight | 本番接続前段 | 早い（engine runtime 未配線で本番設計は順序逆） |
| **C. server-side engine runtime wiring preflight** | dev preview で **実 `runTravelPlanEngine`（fixture 入力）→ 実 projection** を出す設計 | **★ 推奨**。fixture→実 engine の橋・pure 関数ゆえ低リスク・display 契約検証を「実 output」で深化・本番/CoAlter/送信は開けない |
| D. CoAlter client display wiring preflight | CoAlter cue を client へ | C（実 projection）が先・順序的に後 |
| E. Bundle 2 fit dominance/ranking design | fit→ranking | GPT HOLD・advisory 固定維持 |
| F. itinerary DAG / solver preflight | solver 前段 | runtime gate 寄り・engine wiring 後 |

---

## §6 Recommended next phase

**推奨 = C（server-side engine runtime wiring preflight）。docs-only（preflight）**。

- **なぜ最安全/最価値か**: 2 preview は **fixture projection/cue** までを検証した。次の honest な前進は「**実 `runTravelPlanEngine`（pure・決定論・I/O なし）を fixture 入力で server 実行 → 実 `DisplayPacketForClient` → 実 projection/cue**」を、**同じ dev-preview・default-OFF flag・read-only** の枠で行うこと。fixture から「実 engine output」へ橋渡しし、display 契約を実データ経路で検証できる。`runTravelPlanEngine` は **純関数（DB/fetch/weather/route なし）**ゆえ request-time 実行でも runtime リスクが小さい。
- **docs か実装か**: **まず docs-only preflight**（request-time 純 engine 実行の境界・fixture 入力の出所・fail-closed・本番/CoAlter/送信を開けない設計）。その後に実装 GO。初の「engine を実行する」一歩なので設計を先に固める。
- **HOLD のまま**: 本番 `/plan` / CoAlter runtime / useCoAlter / `/talk` / server-authoritative / M2-B-2 / send・realtime / booking・calendar / Bundle 2 / solver / route・weather・place API / persistence / staging・production・push（§4 全件）。

---

## §7 Verification summary

- **latest commits**: `81d9f2b9`(Option B)→`a1a25e06`(log) / `f9a51621`(Option A)→`8f565fe9`(log) / G-H-A-B chain 既コミット。
- **tsc baseline**: **55**（不変）。
- **full suite**: **21096 passed / 1 skipped / 0 failed**。
- **preview test counts**: dev-travel-projection **16** + dev-coalter-projection-cues **14** = **30**（travel-related 計 442）。
- **flaky**: `proposalPlanClientHelpers.test.ts`（travel 無関係）今回再発なし。
- **tree clean**: yes。**push**: なし。
- **dev server**: Turbopack workspace-root 推論で起動失敗（環境要因・本 preview 無関係）。components は render test で検証済。修正は別途（CEO 承認後・`turbopack.root` 設定）。

---

## §8 Stop

本レポートで停止。次分岐（C 推奨）の実装は **CEO 承認まで着手しない**。

### CEO 判断請求
1. 本 closeout を **2 fixture preview の凍結点**として承認するか。
2. §4 runtime gate を **各々独立 HOLD** として確認するか。
3. 次フェーズ = **C（server-side engine runtime wiring preflight・docs-only）** で良いか（vs A/B/D/E/F）。
4. dev server の Turbopack root 問題は **別タスク（CEO 承認後・`next.config` turbopack.root 設定）** として切り出してよいか（本 docs-only フェーズでは触らない）。

実装は CEO 承認まで着手しない（closeout + gate preflight レポートで停止）。
