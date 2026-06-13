# RJ2b-0 — SurfaceClaim / Claim Evidence / Redaction Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: surface claim 実装設計セッション
- 位置づけ: RJ2b で実装する `SurfaceClaimV0` / claim-level evidence contract / claim assertability cap / G4 redaction の **実装境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G3 EVIDENCE/CLAIM + G4 REDACTION）。本書はその claim/redaction 面を実装契約に落とす。矛盾時は RJ2-0 が優先。
- 上流: RJ2a `lib/plan/realityCore/judgmentSurfacePlan.ts`（`JudgmentSurfacePlanV0` = exposure 包絡）。RJ2b は plan を consume して **何を主張してよいか（claim）**を埋める。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2b 実装 GO は CEO 確認後**（§8）。RJ2b-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2b は **claim 候補の構造化（assertion ではなく「主張してよい envelope」）+ claim-level evidence contract + assertability cap + G4 redaction/genericize** のみ。**user-facing copy（文面）は RJ2e で HOLD**。question 文面（RJ2c）・proposal（RJ2d）・notification（RJ2f）も HOLD。
- **RJ2b-0A 改訂（2026-06-14）**: CEO 監査で **claim binding と walker の責務曖昧**を補正。①`surfacePlanViolations(plan)` は **plan 単体検証に留める**（claimSet の中身を見ない）。②claim 検証を `surfaceClaimSetViolations(claimSet)`（claim 単体）+ `surfaceClaimBindingViolations(plan, claimSet)`（整合）の **3-walker に責務分離**。③walker #6' 緩和を**撤回** → `allowedClaimRefs` は v0 で [] 据え置き・**RJ2b は judgmentSurfacePlan.ts を完全不接触**（純 additive）。④`SurfaceClaimSetV0` 単体を consumer payload 扱いしない不変条件。⑤`exposureBinding ≤ plan.exposureLevel` は `userFacingExposureRank`（none=internal_only=0/passive=1/ask=2）で比較・internal_only と passive_only を混ぜない。⑥`confirmation_needed` claim ≠ question candidate。詳細は §11（§3.4/§5/§9 に優先）。

---

## 0. 前提を疑う（CEO ① — RJ2b の核心と誤読リスク）

**RJ2b は「文章を作る層」ではない。** claim = 「この判断について、**真実として主張してよいことの構造化された envelope**」であって、レンダリングされた一文ではない。文面生成（自然言語化）は RJ2e。RJ2b が誤って文面を持つと、surface boundary の最重要不変条件（INV-10 surface object ≠ display / copy は RJ2e HOLD）が崩れる。

**最大の誤読リスク = feasibility verdict の user-facing assertion**。Feasibility 判断（feasible/infeasible）は **internal judgment** であって、それを「あなたの予定は成立しません」とユーザーに**断定として主張してはいけない**（CEO「feasibility_state assert 禁止」）。RJ2b は collapse の脆さ要因・未解決入力・確認要否を **記述的（descriptive）claim** として構造化できるが、feasibility verdict 自体を assertable claim にしない。これは Aneurasync 哲学「AI は提案・実行候補まで、最終決定はユーザー」の claim 層での機械化。

**もう一つの誤読 = evidence leak**。claim の evidenceRefs は内部 trace 用の field 識別子（node#field）であって、**consumer payload にも user display にも出さない**。raw content（displayLabel 等）は claim subject に持たせない（sensitive genericize）。

---

## 1. 対象ファイル案

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加** | `lib/plan/realityCore/surfaceClaim.ts` | 型（SurfaceClaimV0 等）+ `deriveSurfaceClaims` + `surfaceClaimViolations` + `SURFACE_CLAIM_VERSION` |
| **追加** | `tests/unit/surfaceClaim.test.ts` | §6 の fixtures |
| **不接触（RJ2b-0A 撤回）** | `lib/plan/realityCore/judgmentSurfacePlan.ts` | **触らない**。当初 walker #6' 緩和を提案したが RJ2b-0A で撤回。`allowedClaimRefs` は v0 [] 据え置き・binding は別 walker（§11）で検証。**RJ2b は本ファイルを完全不接触**（純 additive） |
| **変更** | `docs/reality-department-matrix.md` | RJ2b §5 適用記録（実装完了時） |
| **触らない（不接触）** | 既存 6 判断器: `feasibilityJudgment.ts` / `collapseRisk.ts` / `collapsePropagation.ts` / `interventionEligibility.ts` / `interventionDecision.ts` / `realityJudgmentInput.ts` | consume のみ（読み取り専用入力） |
| **触らない** | `eventRealityNode.ts` / `commitmentSignal.ts` / `movementReality.ts` / `momentSnapshot.ts` / `realityGraphSnapshot.ts` / `graphIdentity.ts` / `realityAttribute.ts` | 型 import のみ。enrichment しない |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |

**方針**: RJ2b 専用ファイル `surfaceClaim.ts` を新設。RJ2a plan + 判断チェーンを **import + consume** する一方向依存（claim → plan → core・逆流なし）。**RJ2b-0A: judgmentSurfacePlan.ts は完全不接触**（純 additive・walker #6' 緩和は撤回）。

### 1.1 plan binding の裁定（CEO ① 前提を疑う）

RJ2a は `allowedClaimRefs=[]`（claim 未実装の v0 構造保証）。RJ2b で claim が出来たとき **plan.allowedClaimRefs をどう埋めるか**の選択肢:

- **案 A（採用・RJ2b-0A 改訂）**: plan は immutable のまま。`allowedClaimRefs` は plan の structural [] を **v0 で据え置く**（RJ2b でも埋めない）。RJ2b は別オブジェクト `SurfaceClaimSetV0`（`surfacePlanId` を参照）を返し、binding の妥当性は **`surfaceClaimBindingViolations(plan, claimSet)`** で検証する（plan.allowedClaimRefs を書き換えない）。
  - 利点: RJ2a の deriveSurfacePlan・型・v0 invariant・walker を**一切変えない**（judgmentSurfacePlan.ts 不接触）。claim は分離オブジェクトで gate を二重に通せる。
- **案 B（不採用）**: deriveSurfacePlan が内部で claim も derive して allowedClaimRefs を直接埋める。
  - 欠点: surface plan（exposure 包絡）と claim（主張内容）の責務が混ざる。RJ2a の純度が落ちる。

**裁定（RJ2b-0A）**: 案 A。plan = exposure gate（誰に何を出してよいか）、claim = content envelope（何を主張してよいか）を分離維持。**当初案の「walker #6' を緩和して allowedClaimRefs を埋める」は撤回**。理由（CEO #1）: `surfacePlanViolations(plan)` は plan 単体しか見られず claimSet の中身（claimId 実在/withheld/exposureBinding/verdict 除外/claimTextDraft null）を検証できない → walker が形だけになり claimSet が plan を迂回する穴になる。よって `allowedClaimRefs` は **v0 [] 据え置き**、binding は §11 の 3-walker で別途検証する。`bindClaimsToPlan` は allowedClaimRefs を mutate せず **検証済み `BoundSurfaceV0` ラッパを返す**（§11.4）。

---

## 2. 実装する型の確定

### 2.1 RJ2b で実装する型（`surfaceClaim.ts`）

```ts
export const SURFACE_CLAIM_VERSION = 0;

/**
 * 主張してよい claim の種別。**feasibility verdict（feasible/infeasible）は含めない**（CEO: feasibility_state assert 禁止）。
 * 全て descriptive（記述的）であって verdict ではない。
 *   collapse_fragility_present     : 崩れる兆候がある（脆さ要因の存在・断定でない）
 *   unresolved_input_present       : 判断に必要な材料が欠けている（unknown の存在・記述）
 *   confirmation_needed            : 確認を要する gate がある（ask_eligible 時のみ）
 *   passive_observation            : 中立な passive 言及（observe・状態の記述のみ）
 *   movement_unresolved_reference  : 移動材料が未解決（出発線は出さない・参照のみ）
 */
export type SurfaceClaimType =
  | "collapse_fragility_present"
  | "unresolved_input_present"
  | "confirmation_needed"
  | "passive_observation"
  | "movement_unresolved_reference";

/**
 * claim をどこまで主張してよいか（assertability cap）。judgmentConfidence + status + exposure で上限が決まる。
 *   assertable        : confirmed 根拠で記述可（**ただし feasibility verdict には決して使わない**）
 *   hedged            : 兆候どまり（inferred・「〜かもしれない」相当の hedge 必須・文面は RJ2e）
 *   observation_only  : unknown/unresolved（材料不足の記述のみ・主張しない）
 *   withheld          : 出さない（none/internal_only/blocked・claim 化しても表示に進まない）
 */
export type ClaimAssertability = "assertable" | "hedged" | "observation_only" | "withheld";

/** claim-level evidence contract（internal trace 専用・consumer payload に出さない） */
export interface ClaimEvidenceContract {
  readonly evidenceRefs: ReadonlyArray<string>;      // field 識別子（node#field）・raw content 不含
  readonly evidenceVisibility: "internal_trace_only"; // v0 固定。consumer/display には出さない
  readonly derivedFromBucket: "confirmed" | "inferred" | "unresolved" | "risk" | "gate"; // どの判断バケット由来か
}

/** G4 redaction policy（sensitive genericize） */
export interface ClaimRedactionPolicy {
  readonly genericizeRequired: boolean;               // displayRedactionRequired || sensitiveFlagged 由来
  readonly subjectExposesCategory: false;             // v0 固定: subject は category hint を持たない（構造保証）
  readonly redactionReason: ReadonlyArray<string>;    // field-level
}

export interface SurfaceClaimV0 {
  readonly schemaVersion: 0;
  readonly claimId: string;                           // 決定的・raw viewerId 不含
  readonly claimType: SurfaceClaimType;               // feasibility verdict を含まない
  readonly subjectScope: TargetScope;                 // day / event
  readonly subjectNodeId: string | null;              // **id のみ**（displayLabel/raw text を持たない）
  readonly assertability: ClaimAssertability;         // cap 適用後
  readonly exposureBinding: SurfaceExposureLevel;     // ≤ plan.exposureLevel（claim も plan を超えない）
  readonly actionAffordance: "none";                  // RJ2b 常に none（notActionable passive reference）
  readonly claimTextDraft: null;                      // **RJ2e HOLD**（v0 常に null・文面を持たない）
  readonly evidenceContract: ClaimEvidenceContract;
  readonly redactionPolicy: ClaimRedactionPolicy;
  readonly whyAssertable: ReadonlyArray<FeasibilityReason>;
  readonly whyCapped: ReadonlyArray<FeasibilityReason>;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly surfacePlanId: string;
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: SurfaceClaimTrace;
}

export interface SurfaceClaimSetV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;                     // どの plan の claim か
  readonly claims: ReadonlyArray<SurfaceClaimV0>;     // exposure none/internal_only なら必ず空
  readonly suppressedClaimRefs: ReadonlyArray<SuppressedSurfaceRef>; // 出さなかった claim と理由
  readonly trace: SurfaceClaimSetTrace;
}

/** binding 検証を通過した plan + claimSet の対（RJ2b-0A・§11.4）。これ無しに surface emission に渡せない */
export interface BoundSurfaceV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly surfacePlan: JudgmentSurfacePlanV0;
  readonly claimSet: SurfaceClaimSetV0;
}

// ── 3-walker（責務分離・RJ2b-0A §11）──
export function surfaceClaimSetViolations(set: SurfaceClaimSetV0): string[];                       // claim 単体（§11.2）
export function surfaceClaimBindingViolations(plan: JudgmentSurfacePlanV0, set: SurfaceClaimSetV0): string[]; // 整合（§11.3）
export function bindClaimsToPlan(plan: JudgmentSurfacePlanV0, set: SurfaceClaimSetV0): BoundSurfaceV0;         // 検証通過時のみ（§11.4・plan を mutate しない）
// 注: `surfacePlanViolations(plan)` は RJ2a の現行関数を**そのまま使う**（不接触・§11.1）
```

`FeasibilityReason` / `TargetScope` / `SurfaceExposureLevel` / `SuppressedSurfaceRef` / `JudgmentSurfacePlanV0` は既存型を **import**（新規定義しない）。trace 型は §2.1 の他 trace と同形（id/version/chain id/evidenceRefs/evaluatedAtInstant）。

### 2.2 RJ2b で **実装しない**型（明示 defer）

| 型 / 機能 | 所有 slice | RJ2b での扱い |
|---|---|---|
| user-facing copy / claimText | RJ2e | **HOLD**。`claimTextDraft` 常に null。text/copy field を型に持たせない |
| `ClarificationQuestionCandidateV0` + 文面 | RJ2c | 未実装。confirmation_needed claim は「確認要」の構造のみ・質問文は持たない |
| `ProposalCandidateV0` / 3案 / departure line | RJ2d | 未実装。movement_unresolved_reference は参照のみ・出発線文面なし |
| notification / contact / dispatch | RJ2f | **HOLD**。型すら定義しない |
| consumer-facing **SurfaceProjection**（evidenceRefs strip 済の配信用 payload） | RJ2d 以降 | 未実装。claim は internal object（§4 G4/G5）。projection は別 slice |

---

## 3. `deriveSurfaceClaims` の入力 / 出力契約

### 3.1 入力

```ts
export interface DeriveSurfaceClaimsInput {
  readonly surfacePlan: JudgmentSurfacePlanV0;             // RJ2a の出力（exposure gate）
  readonly feasibilityJudgment: FeasibilityJudgmentV0;    // claim 由来バケット（confirmed/inferred/unresolved/risk）
  readonly collapseRiskProfile: CollapseRiskProfileV0;    // fragility 兆候
  readonly interventionEligibility: InterventionEligibilityV0; // gate/redaction
  readonly interventionDecision: InterventionDecisionV0;  // exposure 正本（plan と一致確認）
}
```

- **主入力**: `surfacePlan`（exposure 上限 = claim の天井）+ `feasibilityJudgment`（claim の素材バケット）+ `eligibility`（redaction/gate）。
- **integrity guard**: `plan.sourceRefs.interventionDecisionId === decision.trace.decisionId` / `plan.sourceRefs.feasibilityJudgmentId === fj.judgmentTrace.judgmentId` / 全 snapshotId 一致。不一致 throw。

### 3.2 出力（v0 制約）

`SurfaceClaimSetV0`。**v0 で必ず守る**:
- exposure `none` / `internal_only` → `claims === []`（**internal_only も user-facing claim を出さない**・suppressedClaimRefs に理由）。
- 各 claim: `claimTextDraft === null` / `actionAffordance === "none"` / `evidenceVisibility === "internal_trace_only"` / `subjectNodeId` は id のみ（label なし）。
- `claimType` に **feasibility verdict を含めない**（型に存在しない）。
- claim の `exposureBinding ≤ plan.exposureLevel`（claim は plan を超えない）。
- copy / notification / contact / action / dispatch field **なし**（型に存在しない）。

### 3.3 導出ロジック（assertability cap）

```
// exposure ごとに claim を出せるか
if exposureLevel ∈ {none, internal_only}:
    claims = []   // user-facing claim を出さない（internal material は claim 化しない）
    suppress 全 candidate（reason: claim_suppressed_exposure_<level>）
    return

// exposure passive_only / ask_eligible のみ claim 候補を作る
candidates = []
// ── descriptive claim を判断バケットから作る（verdict は作らない）──
if crp に fragility 兆候（inferred/risk signal）  → collapse_fragility_present
if fj.unresolvedCriticalInputs 非空            → unresolved_input_present
if exposure==ask_eligible ∧ eligibility.confirmationReasons 非空 → confirmation_needed
if exposure==passive_only                      → passive_observation（中立言及）
if fj に movement unresolved 系 reason          → movement_unresolved_reference

// ── assertability cap（CEO: feasibility_state assert 禁止・confidence 連動）──
for each candidate:
    base =
        confirmed バケット由来 ∧ judgmentConfidence high → assertable
        inferred バケット由来 ∧ confidence moderate      → hedged
        unresolved バケット由来                          → observation_only
        otherwise                                        → hedged
    // feasibility verdict は claimType に存在しないので「成立/不成立」を assert する経路が**構造的に無い**
    // 追加 cap: exposure ask_eligible でも confirmation_needed は hedged 上限（確認を促すが断定しない）
    assertability = min(base, exposureCap(exposureLevel))
        // exposureCap: passive_only → max hedged / ask_eligible → max assertable（ただし confirmation_needed は hedged）

// ── G4 redaction ──
genericizeRequired = plan.displayRedactionRequired || (eligibility に sensitive_flagged reason)
// genericizeRequired のとき subjectNodeId は id のみ（既に label 不持参・構造保証）・claimType が category を露出しないことを検証
```

`claimId = cl:fnv64(canonical({sp:surfacePlanId, t:claimType, n:subjectNodeId, k:"surface_claim", v:VERSION}))`。決定的・raw viewerId 不含。

### 3.4 walker 責務分離（RJ2b-0A 改訂・§11 が正本）

**当初の「judgmentSurfacePlan.ts の walker #6' 緩和」は撤回**（CEO #1）。`surfacePlanViolations(plan)` は plan 単体検証に留め、claim 検証は **3-walker に分離**する。詳細は **§11**（本節に優先）:
- `surfacePlanViolations(plan)` — plan 単体（RJ2a・**不接触**・`allowedClaimRefs===[]` のまま）
- `surfaceClaimSetViolations(claimSet)` — claim 単体（RJ2b 新規）
- `surfaceClaimBindingViolations(plan, claimSet)` — 整合（RJ2b 新規）

**RJ2b は judgmentSurfacePlan.ts を一切触らない**（純 additive）。

---

## 4. gate pipeline 実装方針（RJ2b 担当 = G3/G4）

| gate | RJ2b 実装 |
|---|---|
| **G3 EVIDENCE/CLAIM** | **本実装**: descriptive claim を判断バケットから構造化。**feasibility verdict を claim 化しない**（型に無い）。evidence contract（field-level・internal_trace_only）を各 claim に付ける。assertability cap を適用 |
| **G4 REDACTION** | **本実装**: `genericizeRequired` を導出。subject は id のみ（label/raw text 不持参・構造保証）。claimType が category を露出しないことを検証。displayRedactionRequired/sensitiveFlagged を redaction reason に field-level で残す |
| **G5 DELIVERY** | **不実装**: claim は internal object（consumer payload でない）。配信/projection は別 slice（RJ2d+）。dispatch/delivery field を型に持たせない |
| G0–G2.5 | RJ2a が実装済（plan 経由）。RJ2b は plan の exposure/displayRedactionRequired/clarificationOnly を **carry / 尊重**するのみ（緩めない） |

**必須遵守**:
- exposure `none`/`internal_only` → claims `[]`。
- `claimTextDraft` 常に null（**文面を持たない**・RJ2e HOLD）。
- `actionAffordance` 常に none（notActionable passive reference・行動 affordance を持たせない）。
- evidenceRefs は **internal_trace_only**（consumer payload / user display に出さない）。
- **feasibility_state（feasible/infeasible）を assertable claim にしない**（claimType に存在しない + assert 経路無し）。
- sensitive → genericize（subject に category hint を出さない）。

---

## 5. walker 設計（最小・空=適合）

> **RJ2b-0A**: 単一 `surfaceClaimViolations` ではなく **3-walker に分離**（§11 が正本）。下表は `surfaceClaimSetViolations(claimSet)`（claim 単体）の検証項目。**binding 整合（claimId 実在/exposureBinding/withheld/surfacePlanId 一致）は `surfaceClaimBindingViolations(plan, claimSet)`（§11.3）**、plan 単体は RJ2a の `surfacePlanViolations`（§11.1・不接触）。

| # | 違反 | RJ2b 実装 |
|---|---|---|
| 1 | exposure none/internal_only なのに claims 非空 | **real** |
| 2 | claim の exposureBinding が plan.exposureLevel を超える | **real** |
| 3 | claimType に feasibility verdict 相当（feasible/infeasible/will_fail 等）が混入 | **real（構造）**: 許可 claimType 集合外を FAIL。型 + runtime assert |
| 4 | `claimTextDraft !== null`（文面を持つ） | **real（構造）**: RJ2e HOLD 違反 |
| 5 | `actionAffordance !== "none"` | **real**: notActionable passive reference 違反 |
| 6 | evidenceVisibility が internal_trace_only でない（evidence leak） | **real** |
| 7 | subjectNodeId に raw label/text が混入（id 形式でない） | **real（部分）**: id prefix（`ern:`/`day` 等）でないものを FAIL。完全な PII scan は別 |
| 8 | genericizeRequired なのに claimType が category を露出 | **real**: sensitive 時は category-revealing claimType を禁止 |
| 9 | assertable なのに confirmed バケット由来でない（過剰主張） | **real**: assertable は derivedFromBucket==="confirmed" のみ |
| 10 | confirmation_needed が exposure ask_eligible 以外で出る | **real** |
| 11 | copy/notification/contact/dispatch/action field が型に存在 | **real（構造）**: FORBIDDEN_FIELDS（RJ2a と同手法） |
| 12 | claim evidenceRefs が field-level（node#field/既知 token）でない | **real（部分）** |
| 13 | suppressedClaimRefs の reason に evidenceRefs 欠落 | **real** |

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/surfaceClaim.test.ts`（RJ2a と同じ synthetic chain → plan → deriveSurfaceClaims → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `exposure none（blocked/silent）→ claims []` | claim を一切出さない・suppressedClaimRefs 記録 |
| 2 | `exposure internal_only（internal_prepare）→ claims []` | internal material を user-facing claim 化しない |
| 3 | `exposure passive_only（observe）→ passive_observation claim・assertability ≤ hedged・action none` | 中立言及まで・断定しない |
| 4 | `exposure ask_eligible（ask_clarification）→ confirmation_needed claim・hedged・文面なし` | 確認要の構造のみ・claimTextDraft null |
| 5 | `feasibility infeasible でも feasibility verdict claim を作らない` | confirmed conflict day でも claimType に verdict 無し・collapse_fragility_present/unresolved どまり |
| 6 | `unresolved 入力 → unresolved_input_present・observation_only` | unknown を断定しない |
| 7 | `sensitive flagged → genericizeRequired true・subject id のみ・category 非露出` | G4 redaction |
| 8 | `claimTextDraft 常に null・copy field 不在` | RJ2e HOLD |
| 9 | `evidenceVisibility internal_trace_only・consumer payload に evidenceRefs を出さない` | evidence leak 防止 |
| 10 | `actionAffordance 常に none` | notActionable passive reference |
| 11 | `assertable は confirmed バケット由来のみ・inferred は hedged` | assertability cap |
| 12 | `claim exposureBinding ≤ plan.exposureLevel（userFacingExposureRank 比較・全 case binding violations []）` | claim も plan を超えない（§11.6） |
| 13 | `bindClaimsToPlan: 整合 plan+claimSet → BoundSurfaceV0 返す・plan.allowedClaimRefs は [] のまま` | §11.4 binding（mutate しない） |
| 13b | `surfaceClaimBindingViolations: 別 surfacePlanId / withheld bound / exposure none で claims 非空 → violations 非空` | §11.3 binding FAIL 再現 |
| 13c | `confirmation_needed が ask_eligible 以外 / ambiguity 単独 → 生成しない（binding violation）` | §11.7 question 分離 |
| 14 | `integrity guard: 別 plan/別 snapshot → throw` | chain mismatch |
| 15 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |
| 16 | `surfaceClaimSetViolations: feasibility verdict 混入 / claimText 非 null / action 非 none / evidence leak → violations 非空` | §11.2 claim 単体 FAIL 再現 |
| 17 | `surfacePlanViolations(plan) は不接触（RJ2a の現行を import・claimSet を見ない）` | §11.1 責務分離 |

---

## 7. HOLD 項目（RJ2b で実装しない）

- **User-facing copy / claimText 文面**（RJ2e・CEO 承認まで・`claimTextDraft` 常に null）
- **ClarificationQuestion 文面**（RJ2c）
- **ProposalCandidate / 3案 / departure line**（RJ2d）
- **Notification / contact / dispatch**（RJ2f・型すら定義しない）
- consumer-facing SurfaceProjection（evidenceRefs strip 済 payload）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / write / send / book / pay / 自動変更 / push / PR / deploy

---

## 8. RJ2b 実装 GO 条件（全て CEO 確認後に GO）

1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`surfaceClaim.ts` は plan + 判断チェーン consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。新規型 additive。**judgmentSurfacePlan.ts 不接触**（RJ2b-0A: walker #6' 緩和撤回）。
3. **既存 6 判断器 + judgmentSurfacePlan + ern/cs/mv/snapshot/identity 不接触**。新規 1 + test 1 のみ（純 additive）。
4. **v0 制約**: `claimTextDraft=null` / `actionAffordance=none` / `evidenceVisibility=internal_trace_only` / claimType に feasibility verdict 無し / copy・notification・contact field なし。
5. **walker §5** が全 fixture で機能。
6. **全 fixture PASS**。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
7. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。
8. **HOLD 維持**: RJ2e（copy）/ RJ2c（question 文面）/ RJ2d（proposal）/ RJ2f（notification）に進まない。

> **重要**: RJ2b-0 完了時点で**勝手に実装に進まない**。CEO の RJ2b 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2b-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（claim envelope を所有・copy/配信は HOLD） |
| consultedDepartments | Risk（fj/crp バケット = claim 素材）・Permission（eligibility redaction/gate）・Plan/Mobility/Context（subject node ref・id のみ） |
| blockingDepartments | **Permission**（redaction/gate 拒否権）+ **CEO**（RJ2b 実装 GO・RJ2e/c/d/f 承認必須） |
| outputs | RJ2b-0 設計（対象ファイル・型・deriveSurfaceClaims 契約・G3/G4 方針・walker・fixtures・HOLD・GO 条件）。**コードなし** |
| safetyGate | **feasibility_state assert 禁止**・claimTextDraft null（copy RJ2e HOLD）・actionAffordance none（notActionable passive reference）・evidence internal_trace_only（consumer payload に出さない）・exposure none/internal_only で claims []・claim exposureBinding ≤ plan.exposureLevel（**userFacingExposureRank 比較・§11.6**）・sensitive genericize（subject id のみ・category 非露出）・notification/contact/dispatch 型に無し・**claimSet 単体は consumer payload でない・direct read 禁止・validated binding 必須（§11.5）**・**confirmation_needed ≠ question candidate（§11.7）**・**3-walker 責務分離（plan/claimSet/binding・§11）** |
| traceRefs | claimId / surfacePlanId / interventionDecisionId / snapshotId + evidenceRefs(field-level・internal) + redactionReason |

---

## 10. 自己判定（RJ2b 実装に進めるか）

- **判定: RJ2b は実装設計 ready（RJ2b-0A 補正後）**。対象ファイル（**新規 1 + test 1 のみ・judgmentSurfacePlan.ts 不接触**）・型（SurfaceClaimV0/ClaimType[verdict 除外]/Assertability/EvidenceContract/RedactionPolicy/ClaimSet/**BoundSurfaceV0**）・deriveSurfaceClaims 入出力契約（5 入力 + integrity guard + assertability cap + G4 redaction）・gate（G3/G4 本実装 / G5 不実装）・**3-walker（plan/claimSet/binding・§11）**・fixtures・HOLD・GO 条件が確定。
- **ただし RJ2b 実装 GO は CEO 専管**。本書は RJ2b を自己承認しない。**RJ2b-0A の CEO 確認 → RJ2b 実装 GO** の順。
- 最重要安全則を構造で担保: ①feasibility verdict は claimType に存在せず assert 経路が無い、②文面は claimTextDraft=null で持てない、③evidence は internal_trace_only、④sensitive は genericize、⑤**claimSet は binding walker を通らねば surface emission に進めない**（§11.5）。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。

---

## 11. RJ2b-0A 補正サマリ（CEO 監査・claim binding / walker contract closeout）

### 11.1 `surfacePlanViolations(plan)` の責務再定義（CEO #1/#2）

- **plan 単体検証に留める**（claimSet の中身を見ない）。RJ2a の現行 `surfacePlanViolations` を**そのまま使う・変更しない**。
- 検証対象: exposureLevel 妥当・blocked/silent/internal_only の refs []・departureLineRefs/proposalCandidateRefs/allowedClaimRefs **常に []**（v0 据え置き）・exposure ≤ actionBoundary ceiling（CEO 防御）・displayPolicy 整合・構造 assert（FORBIDDEN_FIELDS）。
- **見ない**: claimId 実在 / claim assertability / claim exposureBinding / claimTextDraft / actionAffordance / evidenceVisibility / claimType verdict 除外 → これらは claimSet/binding walker の責務。

### 11.2 `surfaceClaimSetViolations(claimSet)` 設計（claim 単体・RJ2b 新規）

claimSet 内の各 claim を **plan 文脈なしで**検証（空=適合）:
- `claimTextDraft === null`（文面なし・RJ2e HOLD）
- `actionAffordance === "none"`（notActionable passive reference）
- `evidenceContract.evidenceVisibility === "internal_trace_only"`（evidence leak 防止）
- `claimType` が許可集合内（**feasibility verdict 相当を含まない**・構造 + runtime assert）
- `assertable` は `derivedFromBucket === "confirmed"` のみ（過剰主張防止）
- `subjectNodeId` が id 形式（`ern:`/`day` 等・raw label なし）
- `redactionPolicy.subjectExposesCategory === false`・genericizeRequired 時 category-revealing claimType 禁止
- `confirmation_needed` は §11.7 制約（後述）
- copy/notification/contact/dispatch/action field が型に無い（FORBIDDEN_FIELDS・RJ2a と同手法）
- suppressedClaimRefs の reason に evidenceRefs

### 11.3 `surfaceClaimBindingViolations(plan, claimSet)` 設計（整合・RJ2b 新規）

plan と claimSet の**整合**を検証（空=適合）。**これが surface emission の前提ゲート**:
- `claimSet.surfacePlanId === plan.trace.surfacePlanId`（別 plan の claim を bind しない）
- `plan.exposureLevel ∈ {none, internal_only}` → `claimSet.claims === []`（user-facing claim を出さない）
- 各 claim の `exposureBinding` が `userFacingExposureRank(claim.exposureBinding) ≤ userFacingExposureRank(plan.exposureLevel)`（§11.6 の rank 比較）
- `withheld` claim を bind しない（claims に withheld を含めない・含むなら FAIL）
- claim refs 実在: もし将来 plan.allowedClaimRefs を使う slice が来ても、各 ref が claimSet.claims の claimId に解決すること（v0 は allowedClaimRefs=[] ゆえ vacuous・前方互換で定義）
- `plan.clarificationOnly === false` なのに `confirmation_needed` claim がある → FAIL（§11.7）

### 11.4 `bindClaimsToPlan(plan, claimSet)` の有無と責務（CEO #2）

- **有り**。ただし **plan.allowedClaimRefs を mutate しない**。`surfaceClaimBindingViolations(plan, claimSet)` を実行し、**空のときのみ** 検証済みラッパ `BoundSurfaceV0 { surfacePlanId, plan, claimSet }` を返す。違反があれば throw（または `{ ok:false, violations }`）。
- `BoundSurfaceV0` は「binding 検証を通過した plan+claimSet の対」を表す型。これ無しに claim を surface emission に渡せない（§11.5）。
- plan は immutable・spread mutation もしない（plan の構造は RJ2a のまま）。

### 11.5 `SurfaceClaimSetV0` を consumer payload 扱いしない不変条件（CEO #3）

- **`SurfaceClaimSetV0` 単体は consumer payload ではない**（internal claim envelope）。
- UI / renderer / projection は **claimSet を直接読まない**（direct read 禁止）。
- consumer-facing projection（evidenceRefs strip 済の配信用 payload）は **RJ2d 以降**。
- surface emission には **validated binding が必要**（`bindClaimsToPlan` または `surfaceClaimBindingViolations` 通過）。これを通らない claim refs は**無効**。
- `evidenceRefs` / `sourceRefs` / `missingInputRefs` は **internal trace only**（consumer/display に出さない）。

### 11.6 `exposureBinding ≤ plan.exposureLevel` の比較規則（CEO #4）

- **文字列順・配列順で比較しない**。`userFacingExposureRank` で比較（RJ2a と同関数を import）:
  - `none = 0` / `internal_only = 0` / `passive_only = 1` / `ask_eligible = 2`
- 規則:
  - plan exposure `none`/`internal_only` → claims `[]`（claim を出さない）
  - `passive_only` → passive / descriptive claim まで（`exposureBinding` rank ≤ 1）
  - `ask_eligible` → `confirmation_needed` claim まで（rank ≤ 2）
  - **`internal_only` は claim exposure に使わない**（claim の exposureBinding に internal_only を設定しない）
  - **`internal_only` と `passive_only` を比較上も混ぜない**（rank は同じ 0 と 1 だが、internal_only は claim 化経路に乗せない＝claims [] で弾く。rank 比較の前に exposure==internal_only を claims [] で早期遮断）

### 11.7 `confirmation_needed` claim と question candidate の分離（CEO #5）

- `confirmation_needed` は **claim であって質問ではない**:
  - **user-facing question ではない**・**文面なし**（claimTextDraft null）
  - `ClarificationQuestionCandidateV0` **ではない**（RJ2c まで質問候補を生成しない・型も作らない）
  - **`ask_eligible` 以外では生成しない**（passive_only/internal_only/none で confirmation_needed を作らない）
  - `exact_time_collision_ambiguous` があっても、**decisionKind/plan exposure（ask_eligible）を通らなければ生成しない**（ambiguity 単独で claim 化しない）

### 11.8 RJ2b 実装 GO 可否の自己判定

- **判定: RJ2b は実装設計 ready（RJ2b-0A 補正後・内部無矛盾）**。walker 責務を 3 分離（plan/claimSet/binding）し、claimSet が plan を迂回する穴を binding walker で塞いだ。judgmentSurfacePlan.ts 不接触で純 additive。
- **RJ2b 実装 GO は CEO 専管**。RJ2b-0A の CEO 確認 → RJ2b 実装 GO の順。RJ2e/RJ2c/RJ2d/RJ2f は HOLD 維持。
