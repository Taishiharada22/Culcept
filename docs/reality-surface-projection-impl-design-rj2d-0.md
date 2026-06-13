# RJ2d-0 — SurfaceProjection / Boundary Integration Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: surface projection 実装設計セッション
- 位置づけ: RJ2d で実装する `SurfaceProjectionV0`（**内部 → consumer-facing payload の唯一の境界**）/ validated binding 統合 / internal trace strip / genericize / proposal・departure boundary の **実装境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G5 DELIVERY 前段）。上流 = RJ2a plan / RJ2b claimSet+BoundSurface / RJ2c questionSet。矛盾時は RJ2-0 が優先。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2d 実装 GO は CEO 確認後**（§8）。RJ2d-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2d は **plan+claimSet+questionSet の validated binding 統合 + consumer-facing projection（internal trace strip + genericize）+ proposal/departure の boundary 構造（content は HOLD）** のみ。**user-facing copy（文面）は RJ2e で HOLD**。notification/contact（RJ2f）も HOLD。

---

## 0. 前提を疑う（CEO ① — RJ2d の核心と境界の意味）

**RJ2d は「文章を出す層」ではない。** これまで RJ2a/b/c の出力（plan/claim/question）は全て **internal object**（consumer payload でない・direct read 禁止）だった。RJ2d は初めて **consumer-facing projection** を作る境界だが、それでも **copy（自然言語文面）は出さない**（RJ2e HOLD）。projection が運ぶのは「**表示してよい構造**」（exposure level・claim kind・question kind・answerShape・genericized subject ref）であって、文・選択肢・ラベル文面ではない。

**境界の本質 = strip + genericize + opaque化。** internal object には trace（evidenceRefs / sourceRefs / missingInputRefs）と pseudonymous id（ern:/cl:/q: 等）が含まれる。これらは**内部監査用**であって consumer に出してはいけない。RJ2d projection は:
- **internal trace を strip**（evidenceRefs / sourceRefs / missingInputRefs を projection に含めない）
- **node id を opaque 化**（ern:/cl:/q: を projection-local の `subject_1` 等に置換 → consumer は group できるが内部 id に辿れない）
- **genericize**（sensitive/displayRedactionRequired で category hint を出さない・safeDisplayLabel は文面でなく構造 placeholder）

**direct read の解禁点 = ここだけ。** RJ2a/b/c で「direct read 禁止」としてきたのは、consumer が internal object を読む経路を塞ぐため。RJ2d projection が**唯一の consumer 読取り対象**になる。consumer は plan/claimSet/questionSet を読まず、`SurfaceProjectionV0` のみを読む。

**failure-loud。** projection は validated binding を前提にする。plan+claimSet+questionSet の全 walker（5 種）が空でなければ projection を作らない（throw）。RJ2b `bindClaimsToPlan` と同思想。

---

## 1. 対象ファイル案

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加** | `lib/plan/realityCore/surfaceProjection.ts` | 型（SurfaceProjectionV0 等）+ `deriveSurfaceProjection` + `surfaceProjectionViolations` + `SURFACE_PROJECTION_VERSION` |
| **追加** | `tests/unit/surfaceProjection.test.ts` | §6 の fixtures |
| **変更** | `docs/reality-department-matrix.md` | RJ2d §5 適用記録（実装完了時） |
| **触らない（不接触）** | `judgmentSurfacePlan.ts` / `surfaceClaim.ts` / `clarificationQuestion.ts` | consume のみ（型 + walker import・mutate しない） |
| **触らない（不接触）** | 既存 6 判断器 + ern/cs/mv/snapshot/identity | 型 import のみ |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |

**方針**: RJ2d 専用ファイル `surfaceProjection.ts` を新設。plan + claimSet + questionSet を **import + consume**（+ 既存 5 walker を import して validated binding を再検証）する一方向依存。**RJ2a/b/c の 3 ファイル不接触**（純 additive）。

---

## 2. 実装する型の確定

### 2.1 RJ2d で実装する型（`surfaceProjection.ts`）

```ts
export const SURFACE_PROJECTION_VERSION = 0;

/** consumer に見せてよい claim の射影（**trace strip 済・文面なし・opaque subject**） */
export interface ProjectedClaim {
  readonly claimKind: SurfaceClaimType;        // RJ2b の claimType（verdict 含まない）
  readonly assertability: ClaimAssertability;  // assertable/hedged/observation_only（withheld は射影しない）
  readonly subjectRef: string | null;          // **opaque**（"subject_1" 等・raw ern id でない）
  readonly genericized: boolean;               // redaction 適用済か
  // **evidenceRefs / sourceRefs / claimTextDraft は含まない**（strip）
}

/** consumer に見せてよい question の射影（**trace strip 済・文面なし・opaque subject**） */
export interface ProjectedQuestion {
  readonly questionKind: ClarificationQuestionKind;
  readonly answerShape: "binary_confirm" | "disambiguate_two_way" | "open_unresolved"; // 構造のみ・選択肢文面なし
  readonly subjectRef: string | null;          // **opaque**
  readonly relationRef: string | null;         // **opaque relation index**（"relation_1" 等・raw relationId でない）
  readonly genericized: boolean;
  // **evidenceRefs / gateReasonCode / relatedClaimRefs / questionTextDraft は含まない**（strip）
}

/** proposal の boundary（**content は HOLD・boundary のみ**・RJ2d は空構造） */
export interface ProposalCandidateBoundaryV0 {
  readonly available: false;                   // **v0 固定**: proposal content を出さない
  readonly reason: "proposal_hold_rj2d_content"; // 構造保証
}

/** departure line の boundary（**v0 構造遮断**） */
export interface DepartureLineBoundaryV0 {
  readonly departureLineRefs: ReadonlyArray<string>; // **v0 常に []**
  readonly reason: "departure_blocked_v0";
}

export interface SurfaceProjectionV0 {
  readonly schemaVersion: 0;
  readonly projectionId: string;               // 決定的・raw viewerId 不含
  readonly exposureLevel: SurfaceExposureLevel; // plan から carry（consumer は exposure で表示判断）
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly projectedClaims: ReadonlyArray<ProjectedClaim>;       // exposure none/internal_only なら []
  readonly projectedQuestions: ReadonlyArray<ProjectedQuestion>; // exposure ask_eligible 以外 []
  readonly proposalBoundary: ProposalCandidateBoundaryV0;        // available:false 固定
  readonly departureBoundary: DepartureLineBoundaryV0;           // refs:[] 固定
  readonly redactionApplied: boolean;          // genericize したか
  // **internal trace（evidenceRefs/sourceRefs/missingInputRefs）/ copy / claimTextDraft / questionTextDraft は含まない**
  readonly projectionTrace: SurfaceProjectionTrace; // **internal**（projectionTrace は consumer payload から分離・§3.4）
}

export function surfaceProjectionViolations(p: SurfaceProjectionV0): string[];
```

`SurfaceClaimType` / `ClaimAssertability` / `ClarificationQuestionKind` / `SurfaceExposureLevel` は既存型を **import**。

> **projectionTrace の裁定（CEO ① 前提を疑う・§3.4）**: consumer payload は projectionTrace を**含まない**のが理想。しかし監査用に internal trace は残す必要がある。解 = `SurfaceProjectionV0` は **consumer view**（projectedClaims/Questions/boundary）と **projectionTrace**（internal・surfacePlanId/snapshot 等）を **同一オブジェクトに持つが、consumer 抽出関数 `toConsumerView(projection)` が trace を除いた純 view を返す**設計とする（§3.4）。または projectionTrace を `debugOnly` displayPolicy で隔離。RJ2d-0 では **trace を別 field に隔離し、consumer view 抽出を walker で保証**する方針を提案（最終形は RJ2d-0A で精査余地）。

### 2.2 RJ2d で **実装しない**型（明示 defer）

| 型 / 機能 | 所有 slice | RJ2d での扱い |
|---|---|---|
| user-facing copy / claimText / questionText / 選択肢文面 | RJ2e | **HOLD**。projection に text field なし |
| ProposalCandidate content | RJ2d+/RJ2e | **boundary のみ**（available:false）。content は HOLD |
| DepartureLine content | RC4/RJ2d+ | **構造遮断**（departureLineRefs []） |
| notification / contact / dispatch / 実配信 | RJ2f | **HOLD**。型すら定義しない |

---

## 3. `deriveSurfaceProjection` の入力 / 出力契約

### 3.1 入力

```ts
export interface DeriveSurfaceProjectionInput {
  readonly surfacePlan: JudgmentSurfacePlanV0;
  readonly claimSet: SurfaceClaimSetV0;
  readonly questionSet: ClarificationQuestionSetV0;
}
```

- **validated binding（failure-loud）**: 以下 5 walker を実行し**全て空でなければ throw**:
  - `surfacePlanViolations(plan)`（RJ2a）
  - `surfaceClaimSetViolations(claimSet)` + `surfaceClaimBindingViolations(plan, claimSet)`（RJ2b）
  - `clarificationQuestionSetViolations(questionSet)` + `clarificationQuestionBindingViolations(plan, questionSet)`（RJ2c）
- さらに整合: `claimSet.surfacePlanId === plan.trace.surfacePlanId === questionSet.surfacePlanId`。不一致 throw。

### 3.2 出力（v0 制約）

`SurfaceProjectionV0`。**v0 で必ず守る**:
- exposure none/internal_only → `projectedClaims === []`。exposure != ask_eligible → `projectedQuestions === []`。
- **internal trace を含まない**（evidenceRefs/sourceRefs/missingInputRefs を projection の consumer view に出さない）。
- **opaque subject/relation ref**（raw ern:/cl:/q:/relationId を出さない）。
- `proposalBoundary.available === false` / `departureBoundary.departureLineRefs === []`。
- **copy / claimTextDraft / questionTextDraft / 選択肢文面 / notification / contact field なし**（型に存在しない）。
- `withheld` claim は射影しない。

### 3.3 導出ロジック（strip + genericize + opaque化）

```
// validated binding（failure-loud）
violations = [...surfacePlanViolations(plan), ...surfaceClaimSetViolations(claimSet),
              ...surfaceClaimBindingViolations(plan, claimSet), ...clarificationQuestionSetViolations(questionSet),
              ...clarificationQuestionBindingViolations(plan, questionSet)]
if violations.length > 0: throw   // 静かに落とさない

// opaque map（raw id → projection-local opaque ref・決定的順序）
subjectMap = order-stable map of distinct subjectNodeId → "subject_<n>"
relationMap = order-stable map of distinct relationRef → "relation_<n>"

// claim 射影（withheld は除外・trace strip・opaque subject）
projectedClaims = claimSet.claims
  .filter(c => c.assertability !== "withheld")
  .map(c => ({ claimKind: c.claimType, assertability: c.assertability,
               subjectRef: opaque(subjectMap, c.subjectNodeId),
               genericized: c.redactionPolicy.genericizeRequired }))

// question 射影（trace strip・opaque subject/relation）
projectedQuestions = questionSet.questions
  .map(q => ({ questionKind: q.questionKind, answerShape: q.answerShape,
               subjectRef: opaque(subjectMap, q.subjectNodeId),
               relationRef: opaque(relationMap, q.relationRef),
               genericized: q.redactionPolicy.genericizeRequired }))

redactionApplied = plan.displayRedactionRequired || any genericized
proposalBoundary = { available: false, reason: "proposal_hold_rj2d_content" }
departureBoundary = { departureLineRefs: [], reason: "departure_blocked_v0" }
displayPolicy = plan.displayPolicy   // carry
```

`projectionId = pj:fnv64(canonical({sp:surfacePlanId, k:"surface_projection", v:VERSION}))`。決定的・raw viewerId 不含。

### 3.4 consumer view と internal trace の分離（CEO 前提 ①）

- **projectionTrace は consumer payload でない**。projectionTrace は surfacePlanId/snapshotId/projectionId/claimCount/questionCount 等の internal 監査情報を持つ。
- **方針 A（採用候補）**: `SurfaceProjectionV0` は consumer view fields（projectedClaims/Questions/boundary/exposureLevel/displayPolicy/redactionApplied）+ projectionTrace を持ち、**walker で「consumer view fields に evidenceRefs/sourceRefs/raw id/text が無い」ことを保証**。projectionTrace は明示的に internal とマークし、consumer 配信時は除外（配信は RJ2f）。
- この consumer view ⇄ internal trace の最終分離形は **RJ2d-0A で精査余地**（CEO 監査を仰ぐ）。

---

## 4. gate pipeline 実装方針（RJ2d 担当 = consumer projection boundary）

| gate | RJ2d 実装 |
|---|---|
| **G3/G4 carry** | claim/question は RJ2b/c で claim-level redaction 済。RJ2d は **strip + opaque化 + genericize 適用確認**（raw id/trace を consumer view に出さない） |
| **G5 DELIVERY（前段）** | **projection は consumer-facing object だが配信ではない**。実配信（push/notification）は RJ2f。projection に dispatch/delivery field を持たせない |
| **proposal/departure boundary** | **boundary のみ**: proposalBoundary.available=false / departureLineRefs=[]。content は HOLD（RJ2e/RC4） |

**必須遵守**:
- consumer view に **internal trace（evidenceRefs/sourceRefs/missingInputRefs）を出さない**。
- **raw node id（ern:/cl:/q:/relationId）を出さない**（opaque ref のみ）。
- **copy / 選択肢文面 / text を出さない**（RJ2e HOLD）。
- proposal content / departure content を出さない（boundary のみ）。
- withheld claim を射影しない。
- validated binding なしに projection を作らない（failure-loud）。

---

## 5. walker 設計（`surfaceProjectionViolations`・最小・空=適合）

1. exposure none/internal_only なのに projectedClaims 非空
2. exposure != ask_eligible なのに projectedQuestions 非空
3. consumer view（projectedClaims/Questions）に evidenceRefs/sourceRefs/missingInputRefs field が存在（trace leak）
4. subjectRef/relationRef が opaque 形式でない（raw ern:/cl:/q:/relationId が露出）
5. claimKind が feasibility verdict 相当（RJ2b と同チェック）
6. copy/claimTextDraft/questionTextDraft/選択肢文面/label field が存在（FORBIDDEN_FIELDS）
7. `proposalBoundary.available !== false`
8. `departureBoundary.departureLineRefs` が非空
9. withheld assertability の claim が射影されている
10. notification/contact/dispatch/action field が存在
11. graphViewerKey/viewerId が projection に存在
12. projectionId が空
13. answerShape が enum 外

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/surfaceProjection.test.ts`（synthetic chain → plan/claimSet/questionSet → deriveSurfaceProjection → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `exposure none → projectedClaims [] / projectedQuestions []` | 何も射影しない |
| 2 | `internal_only → projectedClaims []` | internal material を consumer view に出さない |
| 3 | `passive_only → projectedClaims（descriptive）/ projectedQuestions []` | claim のみ射影 |
| 4 | `ask_eligible → projectedClaims + projectedQuestions` | claim + question 射影 |
| 5 | `internal trace strip（evidenceRefs/sourceRefs/missingInputRefs が projection に無い）` | trace leak 防止 |
| 6 | `opaque subject/relation ref（raw ern:/cl:/q:/relationId が出ない）` | id 秘匿 |
| 7 | `withheld claim は射影しない` | assertability gate |
| 8 | `proposalBoundary.available false / departureLineRefs []` | boundary only |
| 9 | `copy/text/選択肢文面 field 不在` | RJ2e HOLD |
| 10 | `genericize（sensitive）→ redactionApplied true・category 非露出` | G4 carry |
| 11 | `validated binding failure → throw（walker 違反で projection 作らない）` | failure-loud |
| 12 | `binding mismatch（別 plan の claimSet/questionSet）→ throw` | 整合 |
| 13 | `same exposure で決定的 projectionId` | identity |
| 14 | `surfaceProjectionViolations: trace leak / raw id / withheld 射影 / proposal available → 非空` | walker FAIL 再現 |
| 15 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |

---

## 7. HOLD 項目（RJ2d で実装しない）

- **user-facing copy / claimText / questionText / 選択肢文面**（RJ2e）
- **ProposalCandidate content**（boundary のみ・content HOLD）
- **DepartureLine content**（構造遮断・refs []）
- **Notification / contact / dispatch / 実配信**（RJ2f・型すら定義しない）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / write / send / book / pay / push / PR / deploy

---

## 8. RJ2d 実装 GO 条件（全て CEO 確認後に GO）

1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`surfaceProjection.ts` は plan/claimSet/questionSet consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。**RJ2a/b/c 3 ファイル不接触**。
3. **既存 6 判断器 + ern/cs/mv/snapshot/identity 不接触**。新規 1 + test 1 のみ。
4. **v0 制約**: internal trace strip / opaque ref / proposalBoundary.available=false / departureLineRefs=[] / copy・notification・action field なし。
5. **walker §5** が全 fixture で機能（trace leak / raw id / withheld / proposal / boundary）。
6. **全 fixture PASS**。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
7. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。
8. **HOLD 維持**: RJ2e（copy）/ RJ2f（notification）に進まない。

> **重要**: RJ2d-0 完了時点で**勝手に実装に進まない**。CEO の RJ2d 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2d-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（consumer projection 境界を所有・copy/配信は HOLD） |
| consultedDepartments | Permission（exposure/redaction）・Risk（claim/question 素材）・Plan/Mobility/Context（subject ref・opaque 化） |
| blockingDepartments | **Permission**（露出可否）+ **CEO**（RJ2e/f 承認必須） |
| outputs | RJ2d-0 設計（対象ファイル・型・deriveSurfaceProjection 契約・strip/opaque/genericize 方針・walker・fixtures・HOLD・GO 条件）。**コードなし** |
| safetyGate | **consumer view から internal trace strip**（evidenceRefs/sourceRefs/missingInputRefs 出さない）・**raw node id opaque化**・**copy/text 出さない**（RJ2e HOLD）・proposalBoundary.available=false・departureLineRefs=[]・withheld 非射影・**validated binding failure-loud**・projection が唯一の consumer 読取り対象（direct read 解禁点）・notification/contact/dispatch 型に無し |
| traceRefs | projectionId / surfacePlanId（projectionTrace・internal）。consumer view は opaque ref のみ |

---

## 10. 自己判定（RJ2d 実装に進めるか）

- **判定: RJ2d は実装設計 ready（一部 RJ2d-0A 精査余地）**。対象ファイル（新規 1 + test 1・RJ2a/b/c 不接触）・型（SurfaceProjectionV0/ProjectedClaim/ProjectedQuestion/ProposalCandidateBoundaryV0/DepartureLineBoundaryV0）・deriveSurfaceProjection 入出力契約（3 入力 + 5 walker validated binding + strip/opaque/genericize）・walker（13）・fixtures（15）・HOLD・GO 条件が確定。
- **精査余地（RJ2d-0A 候補）**: §3.4 の consumer view ⇄ projectionTrace 分離の最終形（同一 object 内 walker 保証 vs `toConsumerView` 抽出 vs trace を別 object）。CEO 監査を仰ぐべき論点。
- **ただし RJ2d 実装 GO は CEO 専管**。本書は RJ2d を自己承認しない。**RJ2d-0 の CEO 確認 → RJ2d 実装 GO** の順。
- 最重要安全則を構造で担保: ①internal trace strip、②raw id opaque化、③copy/text なし（RJ2e HOLD）、④proposal/departure は boundary のみ、⑤validated binding failure-loud、⑥projection が唯一の consumer 読取り対象。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。
