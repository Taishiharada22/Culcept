# RJ2c-0 — ClarificationQuestionCandidate Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: clarification question 実装設計セッション
- 位置づけ: RJ2c で実装する `ClarificationQuestionCandidateV0`（**question kind のみ・文面なし**）/ hard gate / confirmation_needed claim との分離 / redaction の **実装境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A）+ `docs/reality-surface-claim-impl-design-rj2b-0.md`（RJ2b-0/RJ2b-0A・`confirmation_needed` claim）。矛盾時は RJ2-0 が優先。
- 上流: RJ2a `judgmentSurfacePlan.ts`（exposure 包絡）+ RJ2b `surfaceClaim.ts`（`confirmation_needed` claim）。RJ2c は plan/eligibility を consume して **何について確認するか（question slot）**を構造化する。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2c 実装 GO は CEO 確認後**（§8）。RJ2c-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2c は **question candidate の構造化（kind のみ・文面なし）+ ask_clarification hard gate + gate→question 写像 + redaction/evidence visibility** のみ。**question 文面（自然言語）は RJ2e で HOLD**。proposal（RJ2d）・departure（RJ2d/RC4）・notification（RJ2f）も HOLD。
- **RJ2c-0A 改訂（2026-06-14）**: CEO 監査で **question identity / dedupe / unresolved scope** の危険を補正。①`dedupe by questionKind` を**撤回** → identity を (surfacePlanId + questionKind + subjectScope + subjectNodeId + relationRef + gateReasonCode + evidence basis + version) に再定義（同 kind でも subject/relation/evidence が違えば**別 question**・dedupe で evidenceRefs/sourceRefs/missingInputRefs を失わない）。②subjectNodeId は **gate reason の targetNodeId**（plan 集約 null でなく per-event）。time collision は **relationRef 単位**。③`resolve_unresolved_input` を **allowlist 方式**にし leaveBy/eta/route/currentLocation/place/sourceRevisionPending/duplicate-identity を question 化しない（→ suppressedQuestionRefs/missingInputRefs）。④question candidate は `relatedClaimRefs` + `gateReasonCode` で confirmation_needed claim/gate へ辿れる（claim を入力に取らず mutate しない）。⑤answerShape は internal structure only（選択肢文面/label/yes-no なし・duplicate 前提なし）。⑥questionSet direct read 禁止。詳細は §11（§3.3/§5 に優先）。

---

## 0. 前提を疑う（CEO ① — RJ2c の核心と 2 つの誤読リスク）

**RJ2c は「質問文を作る層」ではない。** ClarificationQuestionCandidate = 「**何について確認するかの構造化 slot**」であって、ユーザーに見せる質問文ではない。文面生成は RJ2e。RJ2c が誤って文面を持つと INV-10（surface object ≠ display）と copy HOLD が崩れる。

**誤読リスク①: `confirmation_needed` claim（RJ2b）と question candidate（RJ2c）の混同。** 両者は別オブジェクト・別責務:
- `confirmation_needed` claim（RJ2b）= 「**確認を要する gate がある**」という descriptive な主張（envelope）。「状態の記述」。
- `ClarificationQuestionCandidateV0`（RJ2c）= 「**この gate について確認する質問の slot**」という具体的な question 候補（kind のみ）。「行為の候補」。
- 関係: claim は「確認が要る事実」、candidate は「その確認の question 枠」。candidate は claim を**前提**にするが、claim を**昇格**させたものではない（claim はそのまま残る）。RJ2c は claim を mutate しない。

**誤読リスク②: exact_time_collision_ambiguous を duplicate と断定する質問。** RJ1b-A の核心: 同一 timeWindow の overlap は「真の衝突」か「同一現実イベントの二重取り込み」か**確定できない曖昧状態**であって duplicate の証拠ではない。RJ2c の question candidate は「これは重複ですか？」と**断定的に聞かない**。`resolve_time_collision_ambiguity` kind は「同じ予定ですか、それとも別の予定が重なっていますか？」という**両義を開いたまま**の確認 slot であり、duplicate を前提にしない（文面は RJ2e だが kind 段階で断定構造を持たせない）。

**禁止: leaveBy / departure 逆算質問。** 「何時に出ますか？」「いつ家を出れば間に合いますか？」のような出発線・departure 逆算の質問は RJ2c で**作らない**（RJ2d/RC4 領域・v0 構造遮断）。movement 未解決は `confirmation_needed` でも question でもなく、RJ2b の `movement_unresolved_reference` claim（参照のみ）に留める。

---

## 1. 対象ファイル案

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加** | `lib/plan/realityCore/clarificationQuestion.ts` | 型（ClarificationQuestionCandidateV0 等）+ `deriveClarificationQuestions` + `clarificationQuestionSetViolations` + `clarificationQuestionBindingViolations` + `SURFACE_QUESTION_VERSION` |
| **追加** | `tests/unit/clarificationQuestion.test.ts` | §6 の fixtures |
| **変更** | `docs/reality-department-matrix.md` | RJ2c §5 適用記録（実装完了時） |
| **触らない（不接触）** | `judgmentSurfacePlan.ts` / `surfaceClaim.ts` | consume のみ（plan/claim 型 import・mutate しない） |
| **触らない（不接触）** | 既存 6 判断器 + `eventRealityNode.ts` / `commitmentSignal.ts` / `movementReality.ts` / `momentSnapshot.ts` / `realityGraphSnapshot.ts` / `graphIdentity.ts` | 型 import のみ |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |

**方針**: RJ2c 専用ファイル `clarificationQuestion.ts` を新設。plan + eligibility（+ decision）を **import + consume** する一方向依存（question → plan → core・逆流なし）。**judgmentSurfacePlan.ts / surfaceClaim.ts 不接触**（純 additive）。binding walker は RJ2b の 3-walker パターンを踏襲（plan 単体 / questionSet 単体 / binding 整合）。

---

## 2. 実装する型の確定

### 2.1 RJ2c で実装する型（`clarificationQuestion.ts`）

```ts
export const SURFACE_QUESTION_VERSION = 0;

/**
 * 確認 question の種別（**kind のみ・文面なし**）。gate→question の構造写像。
 *   confirm_other_people        : 他者関与の確認（otherPeople gate）
 *   confirm_reservation_payment : 予約/支払いの確認（reservation gate）
 *   confirm_work_shift          : 仕事/シフトの確認（work gate）
 *   confirm_sensitive_handling  : sensitive な扱いの確認（sensitive gate・**category を露出しない**）
 *   resolve_time_collision_ambiguity : 同一 timeWindow の曖昧性（**duplicate 断定しない**・両義を開く）
 *   resolve_unresolved_input    : 判断材料の欠落の確認（unresolved・**leaveBy/departure 逆算は含めない**）
 */
export type ClarificationQuestionKind =
  | "confirm_other_people"
  | "confirm_reservation_payment"
  | "confirm_work_shift"
  | "confirm_sensitive_handling"
  | "resolve_time_collision_ambiguity"
  | "resolve_unresolved_input";

/** question-level evidence contract（internal trace 専用・RJ2b ClaimEvidenceContract と同思想） */
export interface QuestionEvidenceContract {
  readonly evidenceRefs: ReadonlyArray<string>;       // field 識別子（node#field）・raw content 不含
  readonly evidenceVisibility: "internal_trace_only"; // v0 固定
  readonly derivedFromGate: "other_people" | "reservation" | "work" | "sensitive" | "time_collision" | "unresolved";
}

export interface QuestionRedactionPolicy {
  readonly genericizeRequired: boolean;          // displayRedactionRequired || sensitive 由来
  readonly subjectExposesCategory: false;        // v0 固定（sensitive でも category hint なし）
  readonly assertsDuplicate: false;              // **v0 固定**: time collision で duplicate を断定しない（構造保証）
  readonly redactionReason: ReadonlyArray<string>;
}

export interface ClarificationQuestionCandidateV0 {
  readonly schemaVersion: 0;
  readonly questionId: string;                   // 決定的・raw viewerId 不含
  readonly questionKind: ClarificationQuestionKind;
  readonly subjectScope: TargetScope;
  readonly subjectNodeId: string | null;         // **id のみ**（gate reason の targetNodeId・per-event・RJ2c-0A）
  readonly relationRef: string | null;           // **RJ2c-0A**: time collision の relationId（pairwise 単位）。gate question は null
  readonly gateReasonCode: string | null;        // **RJ2c-0A**: 由来 gate code（other_people_involved 等）。dedupe/trace の一部
  readonly relatedClaimRefs: ReadonlyArray<string>; // **RJ2c-0A**: 紐づく confirmation_needed claimId（claim を mutate しない・無くても gate reason から作る）
  readonly exposureBinding: "ask_eligible";      // **v0 固定**: ask_eligible のみ（hard gate）
  readonly questionTextDraft: null;              // **RJ2e HOLD**（v0 常に null・文面を持たない）
  readonly answerShape: "binary_confirm" | "disambiguate_two_way" | "open_unresolved"; // **internal structure only**（選択肢文面/label/yes-no なし・RJ2c-0A §11.5）
  readonly evidenceContract: QuestionEvidenceContract;
  readonly redactionPolicy: QuestionRedactionPolicy;
  readonly whyAsked: ReadonlyArray<FeasibilityReason>;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly surfacePlanId: string;
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: ClarificationQuestionTrace;
}

export interface ClarificationQuestionSetV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly questions: ReadonlyArray<ClarificationQuestionCandidateV0>; // ask_eligible 以外は必ず []
  readonly suppressedQuestionRefs: ReadonlyArray<SuppressedSurfaceRef>; // 出さなかった question と理由（departure/duplicate 断定等）
  readonly trace: ClarificationQuestionSetTrace;
}

export function clarificationQuestionSetViolations(set: ClarificationQuestionSetV0): string[];
export function clarificationQuestionBindingViolations(plan: JudgmentSurfacePlanV0, set: ClarificationQuestionSetV0): string[];
```

`FeasibilityReason` / `TargetScope` / `SuppressedSurfaceRef` / `JudgmentSurfacePlanV0` は既存型を **import**。trace 型は RJ2b と同形。

> **answerShape の裁定（CEO ① 前提を疑う）**: answerShape は「回答の**構造**」（binary/二択 disambiguate/open）であって選択肢の**文面**ではない。`disambiguate_two_way` は time collision 用で「同じ予定 / 別の予定」の two-way を**構造として**持つが、duplicate を**断定しない**（`assertsDuplicate=false`）。文面は RJ2e。

### 2.2 RJ2c で **実装しない**型（明示 defer）

| 型 / 機能 | 所有 slice | RJ2c での扱い |
|---|---|---|
| question 文面 / 選択肢テキスト | RJ2e | **HOLD**。`questionTextDraft` 常に null。text/copy field を型に持たせない |
| `ProposalCandidateV0` / 3案 | RJ2d | 未実装 |
| departure / leaveBy 逆算質問 | RJ2d/RC4 | **構造遮断**。questionKind に含めない・suppressedQuestionRefs に記録 |
| notification / contact | RJ2f | **HOLD**。型すら定義しない |
| consumer-facing projection | RJ2d 以降 | 未実装。questionSet は internal object |

---

## 3. `deriveClarificationQuestions` の入力 / 出力契約

### 3.1 入力

```ts
export interface DeriveClarificationQuestionsInput {
  readonly surfacePlan: JudgmentSurfacePlanV0;            // exposure ask_eligible が hard gate
  readonly feasibilityJudgment: FeasibilityJudgmentV0;   // unresolved / time collision の素材
  readonly collapseRiskProfile: CollapseRiskProfileV0;   // exact_time_collision_ambiguous failure mode
  readonly interventionEligibility: InterventionEligibilityV0; // gate reasons（otherPeople/reservation/work/sensitive）
  readonly interventionDecision: InterventionDecisionV0; // decisionKind 正本（plan と一致確認）
}
```

- **主入力**: `surfacePlan`（exposure ask_eligible 以外は question を出さない）+ `eligibility`（gate reasons = question kind の源）+ `crp`（time collision）。
- **integrity guard**: plan/fj/crp/eligibility/decision の snapshotId 一致 + chain（plan.sourceRefs.interventionDecisionId === decision.trace.decisionId 等）。不一致 throw。

### 3.2 出力（v0 制約）

`ClarificationQuestionSetV0`。**v0 で必ず守る**:
- `plan.exposureLevel !== "ask_eligible"` → `questions === []`（**hard gate**・suppressedQuestionRefs に理由）。
- 各 question: `questionTextDraft === null` / `exposureBinding === "ask_eligible"` / `evidenceVisibility === "internal_trace_only"` / `subjectNodeId` は id のみ。
- `assertsDuplicate === false`（time collision で duplicate 断定しない）。
- **leaveBy/departure 逆算 question kind を作らない**（questionKind に存在しない + suppressedQuestionRefs に記録）。
- copy / 選択肢文面 / notification / contact / action field **なし**（型に存在しない）。

### 3.3 導出ロジック（gate → question kind）

**RJ2c-0A 改訂**: `dedupe by questionKind` を撤回。**per-event / per-relation 単位**で question を作り、identity は full tuple（§11.2）。

```
// hard gate
if plan.exposureLevel !== "ask_eligible":
    questions = []
    suppress 全 kind（reason: question_suppressed_not_ask_eligible:<exposure>）
    return

// ── ask_eligible のみ ──
// (a) gate question = eligibility.confirmationReasons を **per-reason（per-event）**で写像。subjectNodeId = reason.targetNodeId
candidates = []
for reason in eligibility.confirmationReasons:
    other_people_involved / other_people_unverified → confirm_other_people（binary_confirm・subjectNodeId=reason.targetNodeId）
    reservation_or_payment / *_unverified           → confirm_reservation_payment（binary_confirm・per-event）
    work_or_shift / *_unverified                     → confirm_work_shift（binary_confirm・per-event）
    sensitive_flagged                                → confirm_sensitive_handling（binary_confirm・per-event・category 非露出）
    // gateReasonCode = reason.code / evidence = reason.evidenceRefs（**失わない**）
    // relatedClaimRefs = [confirmation_needed claimId for this plan]（決定的・claim を入力に取らない・mutate しない）

// (b) time collision = fj.judgmentTrace.timeRelations の relationKind==="exact_time_collision_ambiguous" を **per-relation**で
for rel in timeRelations where exact_time_collision_ambiguous:
    → resolve_time_collision_ambiguity（disambiguate_two_way・**assertsDuplicate=false**・relationRef=rel.relationId・
       subjectNodeId=rel.fromEventRealityNodeId・evidence=rel.evidenceRefs・missingInputRefs=rel.missingInputRefs を carry）

// (c) unresolved = **allowlist 方式**（§11.3）。movement/eta/leaveBy/route/place/source-pending/duplicate-identity は除外
for reason in fj.unresolvedCriticalInputs where reason.code in ALLOWED_UNRESOLVED_FOR_QUESTION:
    → resolve_unresolved_input（open_unresolved・per-reason）
for reason in fj.unresolvedCriticalInputs where reason.code NOT in allowlist:
    suppress(reason.code)  // suppressedQuestionRefs + missingInputRefs に carry（question 化しない）

// **departure/leaveBy 逆算は構造的に作らない**（写像に存在しない・allowlist 外）
suppress("departure_question_blocked_v0")

// dedupe by **questionId（full tuple）**。衝突時は evidenceRefs を **union**（trace を失わない）

// redaction
genericizeRequired = plan.displayRedactionRequired || sensitive gate present
```

`questionId = q:fnv64(canonical({sp:surfacePlanId, k:questionKind, scope:targetScopeKey, n:subjectNodeId, rel:relationRef, g:gateReasonCode, ev:evidenceBasisKey, kind:"clarification_question", v:VERSION}))`。決定的・raw viewerId 不含。**同 kind でも subjectNodeId / relationRef / gateReasonCode / evidence basis が違えば別 question**（§11.2）。

---

## 4. gate pipeline 実装方針（RJ2c 担当 = ask_eligible question slot）

| gate | RJ2c 実装 |
|---|---|
| **G1 DECISION（ask_clarification）** | **hard gate**: `plan.exposureLevel==="ask_eligible"`（= decisionKind ask_clarification）以外は questions []。decisionKind は core 正本・RJ2c は緩めない |
| **G3 EVIDENCE/CLAIM** | question は claim ではない。evidence contract（field-level・internal_trace_only）を付ける。confirmation_needed claim（RJ2b）とは別オブジェクト |
| **G4 REDACTION** | sensitive → genericize（subject id のみ・category 非露出）。time collision で **duplicate 断定しない**（assertsDuplicate=false 構造保証） |
| **G5 DELIVERY** | **不実装**: question は internal object。文面/配信は RJ2e/RJ2f。dispatch/delivery field を型に持たせない |
| **G2.5 MOVEMENT-INPUT** | **departure/leaveBy 逆算 question を構造遮断**（questionKind に無い・suppressedQuestionRefs に記録） |

**必須遵守**:
- `ask_eligible` 以外 → questions []（hard gate）。
- `questionTextDraft` 常に null（文面なし・RJ2e HOLD）。
- **leaveBy/departure 逆算質問を作らない**（kind に無い）。
- **exact_time_collision_ambiguous を duplicate と断定しない**（assertsDuplicate=false・disambiguate_two_way は両義を開く）。
- sensitive/otherPeople/reservation/work gate → 対応 question kind（category 非露出）。
- evidence は internal_trace_only。

---

## 5. walker 設計（3-walker・RJ2b 踏襲・空=適合）

### 5.1 `clarificationQuestionSetViolations(set)`（question 単体・RJ2c-0A 追補は §11.7）

1. duplicate questionId
2. `questionTextDraft !== null`
3. `exposureBinding !== "ask_eligible"`
4. `evidenceVisibility !== "internal_trace_only"`
5. `questionKind` が許可集合外
6. `assertsDuplicate !== false`（time collision で duplicate 断定）
7. departure/leaveBy 逆算を示す questionKind/field が存在（構造遮断違反）
8. `subjectExposesCategory !== false`（sensitive category 露出）
9. `subjectNodeId` が id 形式でない（raw label）
10. copy/選択肢文面/notification/contact/dispatch/action/label field が型に存在（FORBIDDEN_FIELDS・answerShape 文面化遮断）
11. evidenceRefs が field-level でない
12. suppressedQuestionRefs の reason に evidenceRefs 欠落
13. **RJ2c-0A**: `resolve_time_collision_ambiguity` なのに `relationRef === null`（per-relation identity 欠落）
14. **RJ2c-0A**: gate question（confirm_*）なのに `gateReasonCode === null`（identity/trace 欠落）
15. **RJ2c-0A**: `resolve_unresolved_input` なのに gateReasonCode が allowlist 外（movement/eta/leaveBy/place/source-pending/duplicate を question 化）

### 5.2 `clarificationQuestionBindingViolations(plan, set)`（整合・emission 前提ゲート）

1. `set.surfacePlanId !== plan.trace.surfacePlanId`
2. `plan.exposureLevel !== "ask_eligible"` なのに questions 非空（**hard gate**）
3. question の `exposureBinding !== "ask_eligible"`
4. `plan.clarificationOnly !== true` なのに questions 非空（INV-CLAR 整合）
5. duplicate questionId
6. question が別 plan 由来（sourceRefs.surfacePlanId 不一致）
7. questionSet を consumer payload 扱いする field（direct read 構造遮断）

> **注**: RJ2b の `bindClaimsToPlan` に相当する `bindQuestionsToPlan` は **RJ2c では作らない**（claim と question を 1 つの BoundSurface に束ねるのは RJ2d projection の責務）。RJ2c は questionSet + 2-walker までに留め、binding 統合は RJ2d に defer する。これにより RJ2c のスコープを最小に保つ（CEO ③ シンプルから）。

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/clarificationQuestion.test.ts`（RJ2b と同じ synthetic chain → plan → deriveClarificationQuestions → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `exposure != ask_eligible（none/internal_only/passive_only）→ questions []` | hard gate・suppressedQuestionRefs 記録 |
| 2 | `ask_eligible + otherPeople gate → confirm_other_people・文面なし` | gate→kind 写像・questionTextDraft null |
| 3 | `ask_eligible + reservation gate → confirm_reservation_payment` | 写像 |
| 4 | `ask_eligible + work gate → confirm_work_shift` | 写像 |
| 5 | `sensitive gate → confirm_sensitive_handling・category 非露出・genericizeRequired true` | G4 redaction |
| 6 | `exact_time_collision_ambiguous → resolve_time_collision_ambiguity・assertsDuplicate false・disambiguate_two_way` | RJ1b-A duplicate 断定しない |
| 7 | `unresolved → resolve_unresolved_input・open_unresolved` | unresolved 確認 |
| 8 | `leaveBy/departure 逆算 question を作らない` | questionKind に departure 無し・suppressedQuestionRefs に departure 記録 |
| 9 | `questionTextDraft 常に null・copy/選択肢文面 field 不在` | RJ2e HOLD |
| 10 | `evidenceVisibility internal_trace_only` | evidence leak 防止 |
| 11 | `confirmation_needed claim（RJ2b）と question candidate（RJ2c）が別オブジェクト` | 分離検証（claim はそのまま・question は別 set） |
| 12 | `duplicate questionId fails` | walker |
| 13 | `binding: exposure != ask_eligible なのに questions 非空 → 違反` | hard gate walker |
| 14 | `binding mismatch（別 plan）→ 違反` | walker |
| 15 | `walker: duplicate-assertion / questionText 非 null / departure kind / category 露出 → violations 非空` | §5 FAIL 再現 |
| 16 | `integrity guard: 別 snapshot/別 chain → throw` | chain mismatch |
| 17 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |

---

## 7. HOLD 項目（RJ2c で実装しない）

- **question 文面 / 選択肢テキスト**（RJ2e・CEO 承認まで・`questionTextDraft` 常に null）
- **ProposalCandidate / 3案**（RJ2d）
- **departure line / leaveBy 逆算質問**（RJ2d/RC4・構造遮断）
- **Notification / contact**（RJ2f・型すら定義しない）
- consumer-facing projection / claim+question 統合 binding（RJ2d）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / write / send / book / pay / 自動変更 / push / PR / deploy

---

## 8. RJ2c 実装 GO 条件（全て CEO 確認後に GO）

1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`clarificationQuestion.ts` は plan + 判断チェーン consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。**judgmentSurfacePlan.ts / surfaceClaim.ts 不接触**。
3. **既存 6 判断器 + plan/claim + ern/cs/mv/snapshot/identity 不接触**。新規 1 + test 1 のみ。
4. **v0 制約**: `questionTextDraft=null` / `exposureBinding="ask_eligible"` / `assertsDuplicate=false` / departure kind なし / copy・notification・action field なし。
5. **walker §5** が全 fixture で機能（hard gate / duplicate 断定なし / departure 遮断 / category 非露出）。
6. **全 fixture PASS**。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
7. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。
8. **HOLD 維持**: RJ2e（文面）/ RJ2d（proposal/departure/projection）/ RJ2f（notification）に進まない。

> **重要**: RJ2c-0 完了時点で**勝手に実装に進まない**。CEO の RJ2c 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2c-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（question slot を所有・文面/配信は HOLD） |
| consultedDepartments | Permission（gate reasons = question 源・plan exposure）・Risk（time collision/unresolved）・Plan/Mobility/Context（subject node ref・id のみ） |
| blockingDepartments | **Permission**（ask 可否の拒否権）+ **CEO**（RJ2e/d/f 承認必須） |
| outputs | RJ2c-0 設計（対象ファイル・型・deriveClarificationQuestions 契約・hard gate・gate→kind 写像・2-walker・fixtures・HOLD・GO 条件）。**コードなし** |
| safetyGate | **ask_clarification hard gate**（ask_eligible 以外 questions []）・questionTextDraft null（文面 RJ2e HOLD）・**leaveBy/departure 逆算質問禁止**（構造遮断）・**unresolved allowlist**（movement/eta/leaveBy/place/source-pending/duplicate を question 化しない・§11.3）・**exact_time_collision_ambiguous を duplicate 断定しない**（assertsDuplicate=false・relationRef 単位）・**per-event/per-relation identity**（dedupe で source trace を失わない・§11.2）・confirmation_needed claim と分離（relatedClaimRefs で trace・mutate しない）・**answerShape は internal structure only**（label/choices なし・§11.5）・sensitive genericize（category 非露出）・evidence internal_trace_only・questionSet は consumer payload でない・direct read 禁止・notification/contact/dispatch 型に無し |
| traceRefs | questionId / surfacePlanId / interventionDecisionId / snapshotId + evidenceRefs(field-level・internal) + redactionReason |

---

## 10. 自己判定（RJ2c 実装に進めるか）

- **判定: RJ2c は実装設計 ready（RJ2c-0A 補正後）**。対象ファイル（新規 1 + test 1・judgmentSurfacePlan/surfaceClaim 不接触）・型（ClarificationQuestionCandidateV0[+relationRef/gateReasonCode/relatedClaimRefs]/Kind[6]/EvidenceContract/RedactionPolicy/Set）・deriveClarificationQuestions 入出力契約（5 入力 + integrity guard + hard gate + **per-event/per-relation 写像** + **unresolved allowlist**）・gate 方針・2-walker（set/binding）・fixtures・HOLD・GO 条件が確定。
- **ただし RJ2c 実装 GO は CEO 専管**。本書は RJ2c を自己承認しない。**RJ2c-0A の CEO 確認 → RJ2c 実装 GO** の順。
- 最重要安全則を構造で担保: ①ask_eligible hard gate、②文面は questionTextDraft=null、③leaveBy/departure 逆算 kind が存在しない、④time collision で duplicate 断定しない（assertsDuplicate=false）、⑤confirmation_needed claim と別オブジェクト（relatedClaimRefs で trace・mutate しない）、⑥sensitive category 非露出、⑦**per-event/per-relation identity で source trace を失わない**、⑧**unresolved allowlist で movement/eta/leaveBy を question 化しない**。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。

---

## 11. RJ2c-0A 補正サマリ（CEO 監査・question identity / dedupe / unresolved scope closeout）

### 11.1 `dedupe by questionKind` の撤回（CEO #1）

- **撤回**。同 questionKind でも対象 event / relation / gate / evidence が違えば**別の質問候補**。kind だけで潰すと source trace / evidenceRefs / redaction / targetScope が落ちる（予定 A の otherPeople と予定 B の otherPeople を 1 件にすると「どちらへの確認か」が失われる）。

### 11.2 questionId / dedupe key の再定義（CEO #2）

- `questionId` / dedupe は以下を含む: `surfacePlanId` + `questionKind` + `subjectScope` + `subjectNodeId` + `relationRef`(if any) + `gateReasonCode` + `evidence basis`(source field ref) + `version`。
- 方針:
  - same kind でも **subjectNodeId が違えば別 question**
  - same kind でも **relationRef が違えば別 question**
  - same kind でも **evidence basis が違えば別 question**
  - `exact_time_collision_ambiguous` は **relationRef 単位**で保持（fj.judgmentTrace.timeRelations の relationId）
  - sensitive / otherPeople / reservation / work は **targetNodeId 単位**で保持（gate reason の targetNodeId）
  - **dedupe しても evidenceRefs / sourceRefs / missingInputRefs を失わない**（同一 questionId 衝突時は evidenceRefs を union）

### 11.3 `resolve_unresolved_input` の allowlist 化（CEO #3）

- **allowlist 方式**にする。v0 で許す unresolved を限定し、以下は **question 化しない**（suppressedQuestionRefs + missingInputRefs に残す）:
  - `leave_by_unresolved` / `eta_source_missing` / `route_unresolved` / `movement_requirement_unknown` / `movement_feasibility_unverified`
  - `place_resolution_pending`（location・movement の precursor）
  - currentLocation missing / sourceRevisionPending only / duplicate identity unresolved only
- これらは観測・保留・参照であり、question にすると departure / ETA / fake route / 位置推定の入口になる。
- `ALLOWED_UNRESOLVED_FOR_QUESTION` = 明示 allowlist 定数。**v0 は movement/location/source-pending/duplicate を全除外**（= v0 では resolve_unresolved_input はほぼ発火しない・最も保守的）。`unsupported_boundary` / source pending / missing model は question でなく suppressedQuestionRefs / missingInputRefs に残す。

### 11.4 confirmation_needed claim と question candidate の紐づき（CEO #4）

- question candidate は `relatedClaimRefs`（紐づく confirmation_needed claimId）+ `gateReasonCode` を持ち、**source claim / gate reason へ辿れる**。
- **confirmation_needed claim を mutate しない**。
- **claim を入力に取らない（前提にしない）**: question は **gate reason から**作る。`relatedClaimRefs` は RJ2b の決定的 claimId 公式を mirror して算出する（claimSet を import しない・結合度を上げない）か、claimSet を **optional 入力**として渡された時のみ照合する。v0 はどちらでも可だが **gate reason が source・claim は trace 補助**と固定。
- v0 では「**claim は状態記述、question は確認 slot**」と分ける。question candidate が claim を user-facing 文面へ昇格させない。

### 11.5 answerShape の非文面性（CEO #5）

- `answerShape`（binary_confirm / disambiguate_two_way / open_unresolved）は **internal structure only**。
  - answer choices text なし / labels なし / yes-no 文言なし
  - **duplicate を前提にする選択肢なし**
  - `disambiguate_two_way` は **relationRef 付き**で**両義を開いたまま**（assertsDuplicate=false）
  - RJ2e まで自然言語化禁止（FORBIDDEN_FIELDS に label/choices/options/yesLabel/noLabel を含め構造 assert）

### 11.6 questionSet direct read 禁止（CEO #6）

- **`ClarificationQuestionSetV0` 単体は consumer payload ではない**。
- UI / renderer / projection は questionSet を**直接読まない**（direct read 禁止）。
- consumer-facing projection は **RJ2d 以降**。
- evidenceRefs / sourceRefs / missingInputRefs は **internal_trace_only**。questionTextDraft は null のまま。raw label / sensitive category / graphViewerKey を出さない。
- **validated binding / projection なしに surface emission しない**。

### 11.7 walker 追補（§5.1 #13-15 + §5.2）

- §5.1 に #13（time collision で relationRef null）・#14（gate question で gateReasonCode null）・#15（resolve_unresolved_input が allowlist 外 gateReasonCode）を追加。
- §5.2 binding に: question の relatedClaimRefs が plan/snapshot 由来の id 形式であること（raw でない）・direct read 構造 assert。

### 11.8 RJ2c 実装 GO 可否の自己判定

- **判定: RJ2c は実装設計 ready（RJ2c-0A 補正後・内部無矛盾）**。identity を full tuple に再定義し per-event/per-relation の source trace を保持。unresolved を allowlist 化し movement/departure 入口を構造遮断。
- **RJ2c 実装 GO は CEO 専管**。RJ2c-0A の CEO 確認 → RJ2c 実装 GO の順。RJ2e/RJ2d/RJ2f は HOLD 維持。
