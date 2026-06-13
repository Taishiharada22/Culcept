# RJ2d-0A — SurfaceProjection / ConsumerView / InternalTrace / SafeKind Revised Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: surface projection 実装設計セッション（RJ2d-0A 改訂・red-team 反映）
- 位置づけ: RJ2d で実装する `SurfaceProjectionConsumerViewV0`（**consumer が読む唯一の object**）/ `SurfaceProjectionInternalBundleV0`（internal）/ consumer-safe kind 変換 / validated binding（BoundSurface 採用）/ proposal・departure boundary の **実装境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G5 DELIVERY 前段）。上流 = RJ2a plan / RJ2b BoundSurfaceV0(plan+claimSet) / RJ2c questionSet。矛盾時は RJ2-0 が優先。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2d 実装 GO は CEO 確認後**（§8）。
- 範囲: RJ2d は **BoundSurface+questionSet の validated binding 統合 + ConsumerView/InternalBundle 分離 + consumer-safe kind 変換 + internal trace strip + proposal/departure boundary（content は HOLD）** のみ。**user-facing copy（文面）は RJ2e で HOLD**。notification/contact（RJ2f）も HOLD。
- **RJ2d-0A 改訂（2026-06-14）**: CEO 監査 8 点 + 内部 red-team（4 レンズ・29 leak vector・うち 26 が CEO 8 点外・15 high）を反映。中核裁定 = **「strip 方式」を捨て「allowlist 構築方式」に転換**（consumer view は安全 field のみを 1 つずつ明示構築・内部 object を spread/copy しない → field 追加による leak-by-omission を構造的に不可能化）。詳細は §11。

---

## 0. 前提を疑う（CEO ① — RJ2d の核心・2 つの境界原則）

**RJ2d は「文章を出す層」ではない。** RJ2a/b/c の出力（plan/claim/question）は全て internal object（consumer payload でない）。RJ2d は初めて **consumer-facing object** を作るが、それでも **copy（文面）は出さない**（RJ2e HOLD）。consumer view が運ぶのは「**表示してよい最小構造**」（display 可否・consumer-safe kind・opaque subject ref）であって、文・選択肢・ラベル・assertability・evidence・decision metadata ではない。

### 原則 A — allowlist 構築（strip しない）

red-team が示した最重要欠陥: 初版は「claim/question から不要 field を strip」する設計だった。これは**脆い** — 上流型に field が増えると consumer view に leak-by-omission する。RJ2d-0A は転換する:

> **consumer view object は、安全 field のみを 1 つずつ明示的に構築する（allowlist）。内部 object を spread（`{...claim}`）も copy もしない。**

これにより「内部 field は consumer view に**そもそも入る経路がない**」を構造保証する。walker は consumer view の**許可 key 集合を完全一致**で検証し、未知 key を FAIL にする。さらに `JSON.stringify(consumerView)` に禁止トークン（ern:/cl:/q:/sp:/snapshot/evidence/trace/why/gate/derivedFrom/sensitive/work/reservation/confirmed/inferred 等）が出ないことを test で backstop する。

### 原則 B — ConsumerView と InternalBundle の型分離（CEO #1/#2）

internal trace（surfacePlanId/snapshotId/projectionId/counts/decision metadata）を consumer object に**同居させない**。2 型に分離:
- `SurfaceProjectionConsumerViewV0` … consumer が読む唯一の object（trace なし・id なし・decision metadata なし）
- `SurfaceProjectionInternalBundleV0` … internal only（consumerView + projectionTrace + 検証 trace + source ids）。**consumer へ直接渡さない**

`deriveSurfaceProjection` は **InternalBundle** を返す。consumer は `bundle.consumerView`（= allowlist 構築済の安全 object）のみ受け取る。

---

## 1. 対象ファイル案

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加** | `lib/plan/realityCore/surfaceProjection.ts` | 型 + `deriveSurfaceProjection` + `surfaceProjectionConsumerViewViolations` + `surfaceProjectionBindingViolations` + kind 変換 + `SURFACE_PROJECTION_VERSION` |
| **追加** | `tests/unit/surfaceProjection.test.ts` | §6 fixtures（serialization backstop 含む） |
| **変更** | `docs/reality-department-matrix.md` | RJ2d §5 適用記録（実装完了時） |
| **触らない（不接触）** | `judgmentSurfacePlan.ts` / `surfaceClaim.ts` / `clarificationQuestion.ts` | consume のみ（型 + walker import・mutate しない） |
| **触らない（不接触）** | 既存 6 判断器 + ern/cs/mv/snapshot/identity | 型 import のみ |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |

**方針**: RJ2d 専用ファイル `surfaceProjection.ts` を新設。`BoundSurfaceV0`（RJ2b）+ questionSet（RJ2c）を consume。既存 walker（RJ2a/b/c）を import して validated binding を再検証。**RJ2a/b/c 3 ファイル不接触**（純 additive）。

---

## 2. 実装する型の確定

### 2.1 consumer-safe kind（internal kind を出さない・CEO #3/#4 + red-team kind-enum レンズ）

internal kind（SurfaceClaimType 5 種 / ClarificationQuestionKind 6 種）を consumer view に**そのまま出さない**。category-free な consumer-safe enum に**完全変換**する:

```ts
/** consumer-safe claim kind（4・category を漏らさない） */
export type ProjectedClaimKind = "observation" | "status_note" | "info_incomplete" | "needs_confirmation";
// passive_observation        → observation
// collapse_fragility_present → status_note
// unresolved_input_present   → info_incomplete
// movement_unresolved_reference → info_incomplete
// confirmation_needed        → needs_confirmation

/** consumer-safe question kind（3・gate category を漏らさない） */
export type ProjectedQuestionKind = "needs_verification" | "resolve_overlap" | "resolve_missing_info";
// confirm_other_people / confirm_reservation_payment / confirm_work_shift / confirm_sensitive_handling
//                            → needs_verification   ★ 4 gate を 1 つに潰し sensitive/work/reservation/otherPeople を区別不能化
// resolve_time_collision_ambiguity → resolve_overlap
// resolve_unresolved_input   → resolve_missing_info
```

**裁定（CEO #4 を改善）**: 「genericized 時に safe kind をさらに汎化」は、**4 gate question を最初から `needs_verification` の 1 値に潰す**ことで達成（sensitive と work/reservation/otherPeople が consumer view 上で構造的に同一になる）。これは「条件付き collapse（= それ自体が side-channel）」より強い。sensitivity を consumer view から**観測不能**にする（per-item genericized boolean も redactionApplied も出さない・§2.2）方が、条件付き汎化より安全（red-team: dual-channel leak の排除）。

### 2.2 RJ2d で実装する型（`surfaceProjection.ts`）

```ts
export const SURFACE_PROJECTION_VERSION = 0;

/** consumer に見せてよい claim（**allowlist 構築・decision metadata なし**） */
export interface ProjectedClaimView {
  readonly kind: ProjectedClaimKind;   // consumer-safe（internal claimType を出さない）
  readonly subjectRef: string | null;  // **opaque projection-local**（"subject_1" 等・raw ern:/cl: でない）
  // assertability / derivedFromBucket / evidenceRefs / whyAssertable / whyCapped / sourceRefs /
  // redactionReason / genericized / displayPolicy / claimId は **含まない**（allowlist 外）
}

/** consumer に見せてよい question（**allowlist 構築・decision metadata なし**） */
export interface ProjectedQuestionView {
  readonly kind: ProjectedQuestionKind;       // consumer-safe（gate category を出さない）
  readonly subjectRef: string | null;         // **opaque projection-local**
  readonly relationRef: string | null;        // **opaque projection-local**（resolve_overlap の grouping のみ）
  // answerShape は kind が含意（needs_verification→binary / resolve_overlap→two-way / resolve_missing_info→open）ゆえ
  //   consumer view に持たせない。gateReasonCode / derivedFromGate / whyAsked / relatedClaimRefs / evidenceRefs /
  //   redactionReason / genericized / questionTextDraft / questionId は **含まない**（allowlist 外）
}

/** consumer が読む唯一の object（trace なし・id なし・decision metadata なし） */
export interface SurfaceProjectionConsumerViewV0 {
  readonly schemaVersion: 0;
  readonly display: "render" | "suppress";    // 粗い表示可否。exposure none/internal_only→suppress / passive_only・ask_eligible→render
                                              //   （exposureLevel/decisionKind 列挙を出さない・inversion 防止）
  readonly claims: ReadonlyArray<ProjectedClaimView>;     // display suppress なら []
  readonly questions: ReadonlyArray<ProjectedQuestionView>; // ask_eligible 以外 []
  readonly proposalAvailable: false;          // **v0 固定 boolean のみ**（reason 文字列を出さない・roadmap leak 防止）
  readonly departureAvailable: false;         // **v0 固定 boolean のみ**
  // projectionId / exposureLevel(enum) / displayPolicy / redactionApplied / projectionTrace / counts は **含まない**
}

/** internal only（consumer へ直接渡さない）。projectionTrace + 検証 + source ids を保持 */
export interface SurfaceProjectionInternalBundleV0 {
  readonly schemaVersion: 0;
  readonly consumerView: SurfaceProjectionConsumerViewV0; // 唯一の consumer 出口
  readonly projectionId: string;              // 決定的・internal（consumer view には出さない・CEO #6）
  readonly surfacePlanId: string;             // internal
  readonly snapshotId: string;                // internal
  readonly internalReasons: {                 // boundary の internal 理由（consumer に出さない・CEO #8）
    readonly proposal: "proposal_hold_content";
    readonly departure: "departure_blocked";
  };
  readonly subjectRefMap: ReadonlyArray<{ readonly opaque: string; readonly internalNodeId: string }>; // internal 対応表
  readonly relationRefMap: ReadonlyArray<{ readonly opaque: string; readonly internalRelationId: string }>;
  readonly projectionTrace: SurfaceProjectionTrace; // surfacePlanId/snapshot/counts 等・**internal**
}

export function surfaceProjectionConsumerViewViolations(v: SurfaceProjectionConsumerViewV0): string[];
export function surfaceProjectionBindingViolations(bound: BoundSurfaceV0, questionSet: ClarificationQuestionSetV0): string[];
```

`BoundSurfaceV0` / `ClarificationQuestionSetV0` / `SurfaceClaimType` / `ClarificationQuestionKind` は既存型を **import**。

### 2.3 RJ2d で **実装しない**型（明示 defer）

| 型 / 機能 | 所有 slice | RJ2d での扱い |
|---|---|---|
| user-facing copy / claimText / questionText / 選択肢文面 | RJ2e | **HOLD**。consumer view に text field なし |
| assertability の consumer 露出 | RJ2e | **internal bundle のみ**（phrasing 強度は RJ2e が internal から読む。consumer view には出さない・red-team: assertability 分布が bucket を漏らす） |
| ProposalCandidate content | RJ2d+/RJ2e | **boolean boundary のみ**（available:false） |
| DepartureLine content | RC4/RJ2d+ | **構造遮断**（departureAvailable:false・refs なし） |
| notification / contact / dispatch / 実配信 | RJ2f | **HOLD**。型すら定義しない |
| consumer-facing id（projectionId/viewId） | — | consumer view に **id を持たせない**（CEO #6）。ephemeral id が要れば RJ2f が付与 |

---

## 3. `deriveSurfaceProjection` の入力 / 出力契約

### 3.1 入力（CEO #7 = 採用案 A: BoundSurfaceV0 を使う）

```ts
export interface DeriveSurfaceProjectionInput {
  readonly boundSurface: BoundSurfaceV0;          // RJ2b の validated bundle（plan + claimSet）を再利用
  readonly questionSet: ClarificationQuestionSetV0;
}
```

- **CEO #7 裁定 = 案 A**: RJ2b `BoundSurfaceV0`（validated internal bundle）を入力にし、claim binding を**再利用**する。RJ2d は bound + questionSet を統合。`bindClaimsToPlan` の検証を二重実行しないが、整合のため §3.3 で plan↔questionSet binding は再検証する。**BoundSurfaceV0 は consumer payload ではない**。
- **validated binding（failure-loud）**: 以下を実行し**全て空でなければ throw**:
  - `surfaceClaimBindingViolations(bound.surfacePlan, bound.claimSet)`（BoundSurface 再確認）
  - `clarificationQuestionSetViolations(questionSet)` + `clarificationQuestionBindingViolations(bound.surfacePlan, questionSet)`
  - 整合: `bound.surfacePlanId === bound.surfacePlan.trace.surfacePlanId === questionSet.surfacePlanId`。不一致 throw。

### 3.2 出力（v0 制約）

`SurfaceProjectionInternalBundleV0`（consumer は `.consumerView` のみ）。**consumerView で必ず守る**:
- 許可 key のみ（schemaVersion/display/claims/questions/proposalAvailable/departureAvailable）。それ以外の key 存在で walker FAIL。
- claims/questions の item は許可 key のみ（ProjectedClaimView: kind/subjectRef / ProjectedQuestionView: kind/subjectRef/relationRef）。
- kind は **consumer-safe enum**（internal kind を出さない）。
- subjectRef/relationRef は **opaque**（raw ern:/cl:/q:/relationId を出さない）。
- display suppress → claims/questions []。
- proposalAvailable/departureAvailable は **false 固定 boolean**（reason 文字列なし）。
- **id / exposureLevel(enum) / displayPolicy / redactionApplied / counts / trace / decision metadata を持たない**。

### 3.3 導出ロジック（allowlist 構築・strip しない）

```
// validated binding（failure-loud）
violations = [...surfaceClaimBindingViolations(plan, claimSet),
              ...clarificationQuestionSetViolations(questionSet),
              ...clarificationQuestionBindingViolations(plan, questionSet)]
if violations.length > 0 || surfacePlanId 不一致: throw   // 静かに落とさない

// opaque map（raw id → projection-local opaque・**決定的だが内容非漏洩の採番**）
//   採番順は「内部 id の出現順」でなく「内部 id を sort 後の index」にすると時刻順序等が漏れる懸念 → §11.5:
//   採番は claims/questions の**配列出現順**（= 既に内部で決定的整列済）に subject_1,2,... を振る。raw id へ戻せない。
subjectRefMap = 出現順 distinct subjectNodeId → "subject_<n>"
relationRefMap = 出現順 distinct relationId → "relation_<n>"

display = (plan.exposureLevel === "none" || plan.exposureLevel === "internal_only") ? "suppress" : "render"

// claim view を **allowlist 構築**（claimSet.claims を spread しない・1 field ずつ）
claims = display==="suppress" ? [] :
  claimSet.claims.filter(c => c.assertability !== "withheld").map(c => ({
    kind: PROJECTED_CLAIM_KIND[c.claimType],        // consumer-safe 変換
    subjectRef: opaque(subjectRefMap, c.subjectNodeId),
  }))

// question view を **allowlist 構築**（questionSet.questions を spread しない・1 field ずつ）
questions = (plan.exposureLevel !== "ask_eligible") ? [] :
  questionSet.questions.map(q => ({
    kind: PROJECTED_QUESTION_KIND[q.questionKind],  // consumer-safe 変換（4 gate→needs_verification）
    subjectRef: opaque(subjectRefMap, q.subjectNodeId),
    relationRef: opaque(relationRefMap, q.relationRef),
  }))

consumerView = { schemaVersion: 0, display, claims, questions, proposalAvailable: false, departureAvailable: false }
// internal bundle に projectionId/surfacePlanId/snapshotId/maps/internalReasons/trace を保持（consumer へ出さない）
```

`projectionId = pj:fnv64(canonical({sp:surfacePlanId, k:"surface_projection", v:VERSION}))` — **internal bundle のみ**（consumer view には入れない・CEO #6）。

### 3.4 残留 leak の明示（red-team・正直化）

完全な無 leak は不可能。consumer は item を render するため、以下は**機能上不可避な残留**として明示（CEO 報告・no silent cap）:
- **件数**: `claims.length` / `questions.length` は render に必要ゆえ露出。ただし kind を category-free に潰したので「3 件の確認」までで「sensitive/work/reservation」は漏れない。padding（偽 item 注入）は UX を壊すため**しない**。
- **observe vs ask_clarification**: questions 有無で区別可能だが、これは「質問を render するか」という機能そのもの。decisionKind 列挙は出さない。
- **subject 基数**: distinct subjectRef 数 = 関与 subject 数。render の grouping に必要。opaque・projection-local・cross-projection 非追跡ゆえ相関不可。
- これらは **kind category-free 化 + opaque ref + id/trace/metadata 全除去**により「機微カテゴリ・内部判断状態・相関 id」は漏れない。残留は「件数と表示可否」のみ。

---

## 4. gate pipeline 実装方針（RJ2d 担当 = consumer projection boundary）

| gate | RJ2d 実装 |
|---|---|
| **G3/G4 carry** | claim/question は RJ2b/c で redaction 済。RJ2d は **allowlist 構築 + consumer-safe kind 変換 + opaque 化** で「raw id/trace/decision metadata を consumer view に入れない」を構造保証 |
| **G5 DELIVERY（前段）** | consumer view は consumer-facing object だが**配信ではない**。実配信（push/notification）は RJ2f。dispatch/delivery field を持たせない |
| **proposal/departure boundary** | **boolean のみ**: proposalAvailable=false / departureAvailable=false。reason 文字列は internal bundle |

**必須遵守**:
- consumer view を **allowlist 構築**（内部 object を spread/copy しない）。
- consumer view に **decision metadata（assertability/bucket/gate/why/evidence/redactionReason/genericized）を入れない**。
- **raw id（ern:/cl:/q:/sp:/pj:/relationId/snapshotId）を入れない**（opaque ref のみ・id 自体は internal）。
- **copy / 選択肢文面 / text を入れない**（RJ2e HOLD）。
- proposal/departure は **boolean boundary**（reason 文字列・slice 名・version を consumer に出さない）。
- withheld claim を射影しない。
- validated binding なしに projection を作らない（failure-loud）。

---

## 5. walker 設計（2-walker・最小・空=適合）

### 5.1 `surfaceProjectionConsumerViewViolations(view)`（**許可 key 完全一致**）

1. view の top-level key が許可集合 `{schemaVersion, display, claims, questions, proposalAvailable, departureAvailable}` と**完全一致**でない（未知 key 存在で FAIL = allowlist 強制）
2. 各 ProjectedClaimView の key が `{kind, subjectRef}` と完全一致でない
3. 各 ProjectedQuestionView の key が `{kind, subjectRef, relationRef}` と完全一致でない
4. claim.kind が consumer-safe enum 外（internal claimType 混入 = FAIL）
5. question.kind が consumer-safe enum 外（internal questionKind 混入 = FAIL）
6. subjectRef/relationRef が opaque 形式（`subject_`/`relation_`）でない（raw id 露出）
7. display が "render"/"suppress" 以外
8. display suppress なのに claims/questions 非空
9. proposalAvailable/departureAvailable が false でない
10. **禁止トークン scan**: view の全 string 値に ern:/cl:/q:/sp:/pj: prefix / "snapshot" / "evidence" / "trace" / "gate" / "sensitive" / "reservation" / "work" / "confirmed" / "inferred" / "rj2d" / "_v0" 等が含まれる（leak backstop）

### 5.2 `surfaceProjectionBindingViolations(bound, questionSet)`（整合・emission 前提ゲート）

1. `bound.surfacePlanId !== bound.surfacePlan.trace.surfacePlanId`
2. `questionSet.surfacePlanId !== bound.surfacePlanId`
3. `surfaceClaimBindingViolations(bound.surfacePlan, bound.claimSet)` 非空
4. `clarificationQuestionBindingViolations(bound.surfacePlan, questionSet)` 非空
5. `clarificationQuestionSetViolations(questionSet)` 非空

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/surfaceProjection.test.ts`（synthetic chain → BoundSurface + questionSet → deriveSurfaceProjection → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `exposure none/internal_only → display suppress・claims []・questions []` | 何も render しない |
| 2 | `passive_only → display render・claims（consumer-safe kind）・questions []` | claim のみ・kind 変換 |
| 3 | `ask_eligible → claims + questions（consumer-safe kind）` | claim + question 射影 |
| 4 | `consumer-safe kind 変換（internal kind が出ない）` | 5 claimType→4 / 6 questionKind→3 の写像・全 gate→needs_verification |
| 5 | `**serialization backstop**: JSON.stringify(consumerView) に ern:/cl:/q:/sp:/snapshot/evidence/trace/gate/sensitive/reservation/work/confirmed/inferred/rj2d/_v0 が出ない` | 全 leak の最終 backstop |
| 6 | `opaque subject/relation ref（raw ern:/cl:/relationId が出ない・projection-local）` | id 秘匿 |
| 7 | `withheld claim は射影しない` | assertability gate |
| 8 | `consumer view に id/exposureLevel(enum)/displayPolicy/redactionApplied/assertability/genericized/trace/counts field が無い` | 許可 key 完全一致 |
| 9 | `proposalAvailable false / departureAvailable false・reason 文字列なし` | boundary boolean only |
| 10 | `4 gate question（otherPeople/reservation/work/sensitive）が全て needs_verification に潰れ区別不能` | sensitive 非漏洩（CEO #3/4 + red-team） |
| 11 | `internal bundle は projectionId/surfacePlanId/trace を持つが consumerView は持たない` | 型分離（CEO #1/2） |
| 12 | `validated binding failure → throw（walker 違反で projection 作らない）` | failure-loud |
| 13 | `binding mismatch（別 plan の questionSet）→ throw` | 整合 |
| 14 | `surfaceProjectionConsumerViewViolations: 未知 key / internal kind / raw id / 禁止トークン → 非空` | walker FAIL 再現 |
| 15 | `same input で決定的 projectionId（internal）` | identity |
| 16 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |

---

## 7. HOLD 項目（RJ2d で実装しない）

- **user-facing copy / claimText / questionText / 選択肢文面**（RJ2e）
- **assertability の consumer 露出**（internal bundle のみ・RJ2e が読む）
- **ProposalCandidate content**（boolean boundary のみ）
- **DepartureLine content**（構造遮断）
- **Notification / contact / dispatch / 実配信**（RJ2f・型すら定義しない）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / write / send / book / pay / push / PR / deploy

---

## 8. RJ2d 実装 GO 条件（全て CEO 確認後に GO）

1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`surfaceProjection.ts` は BoundSurface/questionSet consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。**RJ2a/b/c 3 ファイル不接触**。
3. **既存 6 判断器 + ern/cs/mv/snapshot/identity 不接触**。新規 1 + test 1 のみ。
4. **v0 制約**: ConsumerView allowlist 構築 / consumer-safe kind / opaque ref / id・trace・decision metadata 非露出 / boundary boolean only / copy・notification・action field なし。
5. **walker §5** が全 fixture で機能（許可 key 完全一致 / kind / raw id / 禁止トークン backstop / binding）。
6. **全 fixture PASS**（serialization backstop 含む）。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
7. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。
8. **HOLD 維持**: RJ2e（copy）/ RJ2f（notification）に進まない。

> **重要**: RJ2d-0A 完了時点で**勝手に実装に進まない**。CEO の RJ2d 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2d-0A・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（consumer projection 境界を所有・copy/配信は HOLD） |
| consultedDepartments | Permission（exposure/redaction）・Risk（claim/question 素材）・Plan/Mobility/Context（subject ref・opaque 化） |
| blockingDepartments | **Permission**（露出可否）+ **CEO**（RJ2e/f 承認必須） |
| outputs | RJ2d-0A 設計（ConsumerView/InternalBundle 分離・consumer-safe kind・allowlist 構築・BoundSurface 採用・walker・fixtures・HOLD・GO 条件）。**コードなし** |
| safetyGate | **allowlist 構築**（内部 object を spread しない・leak-by-omission 不可能化）・**ConsumerView/InternalBundle 型分離**（trace 同居なし）・**consumer-safe kind**（internal kind/gate category 非露出・4 gate→needs_verification）・**id/exposureLevel(enum)/decision metadata/assertability/genericized/redactionApplied 非露出**・opaque subject/relation ref（projection-local・非相関）・boundary boolean only（reason/slice 名/version 非露出）・**serialization backstop test**・validated binding failure-loud（BoundSurface 再利用）・notification/contact/dispatch 型に無し |
| traceRefs | projectionId / surfacePlanId（**internal bundle のみ**）。consumer view は opaque ref のみ |

---

## 10. 自己判定（RJ2d 実装に進めるか）

- **判定: RJ2d は実装設計 ready（RJ2d-0A 補正後・red-team 反映）**。対象ファイル（新規 1 + test 1・RJ2a/b/c 不接触）・型（ConsumerView/InternalBundle 分離・ProjectedClaimView/QuestionView・consumer-safe kind 2 enum・Proposal/Departure boundary boolean）・deriveSurfaceProjection 入出力契約（BoundSurface+questionSet・5 walker validated binding・allowlist 構築）・walker（2・許可 key 完全一致 + serialization backstop）・fixtures（16）・HOLD・GO 条件が確定。
- **ただし RJ2d 実装 GO は CEO 専管**。本書は RJ2d を自己承認しない。**RJ2d-0A の CEO 確認 → RJ2d 実装 GO** の順。
- 最重要安全則を構造で担保: ①allowlist 構築（strip しない・leak-by-omission 不可）、②ConsumerView/InternalBundle 型分離、③consumer-safe kind（gate category 潰し）、④id/trace/decision metadata 非露出、⑤opaque projection-local ref、⑥boundary boolean only、⑦serialization backstop、⑧BoundSurface 採用・failure-loud。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。

---

## 11. RJ2d-0A 補正サマリ（CEO 監査 8 点 + 内部 red-team）

### 11.0 内部 red-team（4 レンズ・参考）

field-leak / kind-enum-leak / id-identity-leak / structural-serialization-leak の 4 レンズで 29 leak vector を抽出（26 が CEO 8 点外・15 high）。中核学び = 初版の **strip 方式は脆い**（field 追加で leak）→ **allowlist 構築方式**へ転換（§0 原則 A）。

### 11.1 ConsumerView と InternalBundle 分離（CEO #1/#2）

`SurfaceProjectionConsumerViewV0`（consumer 唯一の出口・trace/id なし）と `SurfaceProjectionInternalBundleV0`（internal・projectionTrace 等）に**型分離**。`deriveSurfaceProjection` は InternalBundle を返し、consumer は `.consumerView` のみ。

### 11.2 projectionTrace 非 consumer 方針

projectionTrace / surfacePlanId / snapshotId / counts は **InternalBundle のみ**。consumerView は allowlist 構築ゆえ trace が**入る経路がない**。walker が許可 key 完全一致を強制 + serialization backstop test。

### 11.3 consumer-safe kind 変換表（CEO #3 + red-team・全 11 internal kind）

| internal | consumer-safe |
|---|---|
| passive_observation | `observation` |
| collapse_fragility_present | `status_note` |
| unresolved_input_present | `info_incomplete` |
| movement_unresolved_reference | `info_incomplete` |
| confirmation_needed | `needs_confirmation` |
| confirm_other_people / confirm_reservation_payment / confirm_work_shift / confirm_sensitive_handling | `needs_verification`（**4→1・gate category 潰し**） |
| resolve_time_collision_ambiguity | `resolve_overlap` |
| resolve_unresolved_input | `resolve_missing_info` |

加えて consumer view から除去（red-team）: assertability / derivedFromBucket / derivedFromGate / gateReasonCode / whyAssertable / whyCapped / whyAsked / relatedClaimRefs / evidenceRefs / sourceRefs / redactionReason / missingInputRefs / answerShape / displayPolicy / per-item genericized。

### 11.4 genericized 時の safe kind 方針（CEO #4 を改善）

**条件付き collapse をしない**。代わりに「**sensitivity を consumer view から観測不能化**」する: ①4 gate question を最初から `needs_verification` 1 値に潰す、②per-item genericized boolean と plan-level redactionApplied を consumer view から**除去**（dual-channel leak 排除）、③subject は常に opaque。これにより sensitive item が非 sensitive item と構造的に同一になり、条件付き汎化（それ自体が side-channel）より安全。

### 11.5 opaque ref 安定範囲（CEO #5 + red-team id レンズ）

opaque subject/relation ref は **projection-local scope**: 同一 projection 内で同一内部 id → 同一 opaque ref / projection を跨いだ追跡 id でない / raw id へ戻せない / authority 判断に使わない。**採番は配列出現順**（既に内部で決定的整列済）に `subject_1,2,...` を振る（内部 id を sort して採番すると時刻順序等が漏れる懸念を回避）。

### 11.6 projectionId / viewId 裁定（CEO #6）

- `projectionId`（決定的 hash）は **InternalBundle のみ**。consumer view には **id を持たせない**（決定的 id は cross-projection 相関・同一性証明に使われ得る）。
- ephemeral な viewId が将来要れば RJ2f（配信層）が非決定的に付与する（pure core は乱数を持たないため RJ2d では付与しない）。

### 11.7 BoundSurfaceV0 採用可否（CEO #7 = 採用 A）

RJ2d 入力に **BoundSurfaceV0 を採用**（RJ2b の validated bundle を再利用）。`DeriveSurfaceProjectionInput = { boundSurface, questionSet }`。claim binding は RJ2b 成果を再利用し、question binding を再検証。BoundSurfaceV0 は consumer payload ではない。

### 11.8 boundary reason の consumer 非露出（CEO #8 + red-team）

consumer view の boundary は **boolean のみ**（`proposalAvailable: false` / `departureAvailable: false`）。internal reason（`proposal_hold_content` / `departure_blocked`・slice 名/version を含めない）は InternalBundle のみ。reason 文字列・slice 名・version を consumer に出さない（roadmap leak 防止）。

### 11.9 RJ2d 実装 GO 可否の自己判定

- **判定: RJ2d は実装設計 ready（補正後・red-team 反映・内部無矛盾）**。allowlist 構築 + 型分離 + consumer-safe kind + id/trace/metadata 全除去 + serialization backstop で、CEO 8 点 + red-team 26 追加 vector を構造的に封鎖。残留は「件数・表示可否」のみで機微カテゴリ・内部判断・相関 id は漏れない（§3.4 明示）。
- **RJ2d 実装 GO は CEO 専管**。RJ2d-0A の CEO 確認 → RJ2d 実装 GO の順。RJ2e/RJ2f は HOLD 維持。
