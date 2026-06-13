# RJ2a-0 — JudgmentSurfacePlan Implementation Design（設計提出のみ・コード禁止）

- 日付: 2026-06-14 / 作成: surface plan 実装設計セッション
- 位置づけ: RJ2a で実装する `JudgmentSurfacePlanV0` / `deriveSurfacePlan` / `surfacePlanViolations` の **実装境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A 設計）。本書はその §7-A・§8.4 を実装契約に落とす。矛盾時は RJ2-0 が優先。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2a 実装 GO は CEO 確認後**（§8）。RJ2a-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2a は **surface plan の包絡（exposure envelope）+ suppression honesty + walker** のみ。claim 生成（RJ2b）・question 生成（RJ2c）・proposal/departure boundary 実動（RJ2d）・copy（RJ2e）・notification（RJ2f）は HOLD。
- **RJ2a-0A 改訂（2026-06-14）**: CEO 監査で `internal_prepare → passive_only` の危険な意味論を補正。`SurfaceExposureLevel` に **`internal_only`** を追加し `internal_prepare → internal_only`（user-facing でない）に分離。導出を min-rank から **decisionKind 直接写像**に変更（internal_only と passive_only は非線形・別枝）。詳細は §11。

---

## 1. 対象ファイル案

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加** | `lib/plan/realityCore/judgmentSurfacePlan.ts` | 型（JudgmentSurfacePlanV0 等）+ `deriveSurfacePlan` + `surfacePlanViolations` + `SURFACE_PLAN_VERSION` |
| **追加** | `tests/unit/judgmentSurfacePlan.test.ts` | §6 の fixtures |
| **変更** | `docs/reality-department-matrix.md` | RJ2a §5 適用記録（実装完了時） |
| **触らない（不接触）** | 既存 6 判断器ファイル: `feasibilityJudgment.ts` / `collapseRisk.ts` / `collapsePropagation.ts` / `interventionEligibility.ts` / `interventionDecision.ts` / `realityJudgmentInput.ts` | **原則不接触**。surface plan は consume のみ（読み取り専用入力） |
| **触らない** | `eventRealityNode.ts` / `commitmentSignal.ts` / `movementReality.ts` / `momentSnapshot.ts` / `realityGraphSnapshot.ts` / `graphIdentity.ts` / `realityAttribute.ts` | 型 import のみ。enrichment しない |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |
| **docs 更新範囲** | 本書 + matrix のみ。設計正本 RJ2-0 は追記しない（確定済み） | |
| **test 追加範囲** | `judgmentSurfacePlan.test.ts` のみ | |

**方針**: 既存 6 判断器ファイルは **不接触**。surface plan 専用ファイル `judgmentSurfacePlan.ts` を新設し、6 判断器の出力を **import + consume** する一方向依存（surface → core のみ・逆流なし）。

---

## 2. 実装する型の確定

### 2.1 RJ2a で実装する型（`judgmentSurfacePlan.ts`）

```ts
export const SURFACE_PLAN_VERSION = 0;

/**
 * surface 露出の包絡（RJ2a-0A: 4 値・**非線形**）。decisionKind/actionBoundary を超えない。
 *   none         : 何も surface 化しない（silent/blocked）
 *   internal_only : internal prepared material boundary。**user-facing 不可**（internal_prepare・準備のみ許可）
 *   passive_only  : L1 passive object を将来作れる可能性（observe・copy/UI はまだ不可）
 *   ask_eligible  : L2 clarification candidate object を将来作れる可能性（ask_clarification・文面はまだ不可）
 * user-facing exposure 順: none = internal_only < passive_only < ask_eligible（internal_only は user-facing 0）。
 */
export type SurfaceExposureLevel = "none" | "internal_only" | "passive_only" | "ask_eligible";

/** 抑制された surface の正直な記録（何を・なぜ出さなかったか） */
export interface SuppressedSurfaceRef {
  readonly surfaceKind: string;        // "departure_line" / "proposal_candidate" / "three_option" / "notification" / "clarification" / "user_facing_judgment" ...
  readonly reason: FeasibilityReason;  // code + targetNodeId + field-level evidenceRefs
}

export interface SurfacePlanTrace {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;            // 決定的 cache key・内容証明でない・raw viewerId 不含
  readonly surfacePlanVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly feasibilityJudgmentId: string;
  readonly collapseRiskProfileId: string;
  readonly collapsePropagationId: string;
  readonly eligibilityId: string;
  readonly interventionDecisionId: string;
  readonly usedInputRefs: ReadonlyArray<string>;   // field-level
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evaluatedAtInstant: RealityInstant;     // = decision.evaluatedAtInstant・identity 対象外
}

export interface JudgmentSurfacePlanV0 {
  readonly schemaVersion: 0;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  // ── 露出包絡（decisionKind/actionBoundary を超えない） ──
  readonly exposureLevel: SurfaceExposureLevel;
  readonly carriedDecisionKind: DecisionKind;       // carry（監査）
  readonly carriedActionBoundary: ActionBoundary;   // carry
  // ── 許可された surface 集合（default-deny・RJ2a は content を埋めない＝空） ──
  readonly allowedClaimRefs: ReadonlyArray<string>;          // RJ2b が埋める。RJ2a 常に []
  readonly clarificationCandidateRefs: ReadonlyArray<string>; // RJ2c が埋める。RJ2a 常に []
  readonly proposalCandidateRefs: ReadonlyArray<string>;      // v0 常に []
  readonly departureLineRefs: ReadonlyArray<string>;          // v0 常に [](G2.5 構造遮断)
  // ── surface gate（carry・無視不可） ──
  readonly redactionPolicyRef: string | null;       // RJ2b。RJ2a 常に null
  readonly permissionGateRef: string | null;        // RJ2d。RJ2a 常に null
  readonly displayRedactionRequired: boolean;       // eligibility から carry
  readonly clarificationOnly: boolean;              // decisionKind==="ask_clarification" のみ true（INV-CLAR-A）
  // ── 正直さ ──
  readonly suppressedSurfaces: ReadonlyArray<SuppressedSurfaceRef>;
  readonly whyExposable: ReadonlyArray<FeasibilityReason>;
  readonly whyNotExposable: ReadonlyArray<FeasibilityReason>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;  // carry
  readonly evidenceRefs: ReadonlyArray<string>;     // field-level・carry
  readonly confidence: JudgmentConfidence;          // decision から carry
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
    readonly collapseRiskProfileId: string;
    readonly collapsePropagationId: string;
    readonly eligibilityId: string;
    readonly interventionDecisionId: string;
  };
  readonly trace: SurfacePlanTrace;
}

/** SurfacePlanViolation = 文字列 reason（既存 *Violations と同形）。最小実装 */
export function surfacePlanViolations(p: JudgmentSurfacePlanV0): string[];
```

`FeasibilityReason` / `MissingInputRef` / `RealityInstant` / `TargetScope` / `DecisionKind` / `ActionBoundary` / `JudgmentConfidence` / `RealityDisplayPolicy` は既存型を **import**（新規定義しない）。

### 2.2 RJ2a で **実装しない**型（明示 defer）

| 型 / 機能 | 所有 slice | RJ2a での扱い |
|---|---|---|
| `SurfaceClaimV0` + claim 生成器 | RJ2b | 未実装。`allowedClaimRefs` は string id ref のみ（RJ2a 常に []） |
| `ClarificationQuestionCandidateV0` + 生成器 | RJ2c | **型すら RJ2a に追加しない**（`clarificationCandidateRefs` は string id ゆえ型不要）。文面・質問生成は不可 |
| `ProposalCandidateBoundaryV0` | RJ2d | 未実装。`proposalCandidateRefs` 常に [] |
| `DepartureLineBoundaryV0` 実動 | RJ2d/RC4 | 未実装。`departureLineRefs` 常に [](構造遮断) |
| `SurfaceRedactionPolicyV0` 本格 | RJ2b | 未実装。`redactionPolicyRef` 常に null・`displayRedactionRequired` は carry のみ |
| user-facing copy | RJ2e | **HOLD**。text/copy field を型に持たせない |
| notification / contact | RJ2f | **HOLD**。型すら定義しない |

> **判定**: `ClarificationQuestionCandidateV0` は RJ2a で型不要（ref が string id）。CEO の「型だけ必要なら最小 skeleton」は **不要**と裁定。RJ2c で初出。

---

## 3. `deriveSurfacePlan` の入力 / 出力契約

### 3.1 入力

```ts
export interface DeriveSurfacePlanInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly collapsePropagationMap: CollapsePropagationMapV0;
  readonly interventionEligibility: InterventionEligibilityV0;
  readonly interventionDecision: InterventionDecisionV0;
}
```

- **主入力**: `interventionDecision`（exposure 決定）+ `interventionEligibility`（displayRedactionRequired / gate reasons）+ `graphSnapshot`（identity）。`fj/crp/prop` は **integrity guard + suppression reason のソース**（ambiguity 等）。
- **integrity guard 8 段**（不一致 throw）: `fj/crp/prop/eligibility/decision` の snapshotId が graphSnapshot 一致（×5）+ chain（`crp.feasibilityJudgmentId===fj.id` / `prop.collapseRiskProfileId===crp.id` / `eligibility.feasibilityJudgmentId===fj.id` / `decision.eligibilityId===eligibility.id`）。scope は decision.targetScope を正本とし eligibility と一致確認。

### 3.2 出力（v0 制約）

`JudgmentSurfacePlanV0`。**v0 で必ず守る**:
- `proposalCandidateRefs === []` / `departureLineRefs === []`（構造的・walker assert）
- `allowedClaimRefs === []`（RJ2b 未実装）/ `clarificationCandidateRefs === []`（RJ2c 未実装）
- `redactionPolicyRef === null` / `permissionGateRef === null`
- **user-facing copy field なし / notification・contact field なし / action field なし**（型に存在しない）

### 3.3 導出ロジック（exposure 包絡）

**RJ2a-0A 修正**: exposureLevel は **decisionKind の直接写像**で導く（min-rank をやめる）。internal_only と passive_only は
**非線形・別枝**ゆえ単一 rank で min を取ると `internal_prepare → passive_only` に化けて user-facing と誤読される（CEO #1）。
decisionKind は core で既に actionBoundary に capped 済み（`decisionKind ≤ actionBoundary`）なので、直接写像で十分。

```
// ★ decisionKind 直接写像（min-rank ではない）
exposureForDecisionKind(decisionKind):
  blocked          → "none"
  silent           → "none"
  observe          → "passive_only"
  internal_prepare → "internal_only"    // ★ user-facing でない（passive_only にしない）
  ask_clarification→ "ask_eligible"
exposureLevel = exposureForDecisionKind(decision.decisionKind)

// 防御 cap（INV-4・decisionKind ≤ actionBoundary は core 保証なので通常発火しない）:
//   user-facing exposure rank: none=0, internal_only=0(user-facing 無), passive_only=1, ask_eligible=2
//   actionBoundary rank: blocked=0, display_only=1, draft_only=1, ask_confirmation=2
//   if userFacingRank(exposureLevel) > actionBoundaryRank → user-facing を 1 段下げる（internal_only は下げない）

clarificationOnly = (decision.decisionKind === "ask_clarification")                  // INV-CLAR-A
displayRedactionRequired = eligibility.displayRedactionRequired                      // carry
confidence = decision.confidence                                                     // carry（permission 緩めない）
displayPolicy = (exposureLevel==="none" || exposureLevel==="internal_only") ? "notActionable" : "visible"
                // ★ internal_only も user-facing でない → notActionable
```

**suppressedSurfaces**（正直化・常に記録・**RJ2a-0A: 4 状態を理由で分離**）。internal_prepare の「内部準備可能」を
silent/blocked と同じ理由で潰さない:
- `blocked`（eligibility/decision blocked）→ 全 user-facing + internal を suppress。reason: `surface_suppressed_blocked`。
- `silent`（contact/output なし）→ 全 surface suppress。reason: `surface_suppressed_silent_no_contact`。
- `internal_prepare`（**internal-only boundary** ゆえ user-facing のみ suppress・internal 準備は許可）→ user-facing 層を
  suppress。reason: `user_facing_suppressed_internal_only_boundary`（**blocked/silent とは別理由**・internal preparation は allowed）。
- `observe`（passive surface eligible・user-facing passive 可）→ ask/proposal/departure を suppress（passive は eligible）。reason: `clarification_suppressed_by_decisionKind:observe` 等。
- `departure_line` — 常に（v0 leaveBy null・INV-DEP-A）。reason: `departure_suppressed_movement_unresolved` + evidence。
- `proposal_candidate` / `three_option` — 常に（v0 HOLD）。reason: `proposal_hold_v0`。
- `notification` / `contact` — 常に（RJ2f HOLD）。reason: `contact_hold_rj2f`。
- `clarification` — `decisionKind !== "ask_clarification"` のとき。reason: `clarification_suppressed_by_decisionKind:<kind>`。

**whyExposable**: exposureLevel passive→`decision_permits_passive_surface` / ask_eligible→`decision_permits_clarification_eligible`（evidence: decision whyNow）。
**whyNotExposable**: cap・blocked・suppression の reasons（evidence: decision whyNot + eligibility blocked/confirmation reasons）。

**identity**: `surfacePlanId = sp:fnv64(canonical({s:snapshotId, scope, dk:decisionKind, k:"surface_plan", v:VERSION}))`。raw viewerId 不含（snapshotId 擬名化済）。`evaluatedAtInstant = decision.evaluatedAtInstant`（identity 対象外）。

---

## 4. gate pipeline 実装方針

RJ2a が **実装**するのは G0–G2.5（exposure 包絡の確定）。G3/G4/G5 は **carry / placeholder / 構造的不在の検証** に留める。

| gate | RJ2a 実装 |
|---|---|
| **G0 KILL** | `eligibilityLevel==="blocked"` または `decisionKind==="blocked"` → `exposureLevel="none"`・全 ref []・`clarificationOnly=false`・suppressedSurfaces に全 user-facing 層を記録。**`notActionable` では kill しない**（INV-9） |
| **G1 DECISION** | `exposureLevel` を decisionKind から**直接写像**（silent→none / observe→passive_only / **internal_prepare→`internal_only`**[user-facing でない] / ask_clarification→ask_eligible）。internal_prepare の internal material 実体は RJ2a で生成しない（L3 は RJ2b+） |
| **G2 PERMISSION** | actionBoundary で cap（`min`）。decisionKind ≤ actionBoundary は core 不変だが二重で min を採る |
| **G2.5 MOVEMENT-INPUT** | `departureLineRefs=[]` を**構造的に強制**（RJ2a は departure ref を生成する経路を持たない）。suppressedSurfaces に departure を記録 |
| **G3 EVIDENCE/CLAIM** | **placeholder**: claim 生成は RJ2b。RJ2a は evidenceRefs を field-level で carry するのみ（plan 自身は claim を持たない・`allowedClaimRefs=[]`） |
| **G4 REDACTION** | **carry のみ**: `displayRedactionRequired` を carry。genericize 実体は RJ2b（claim 段）。plan は raw を持たない（evidenceRefs は field 識別子で内部 trace 用） |
| **G5 DELIVERY** | **不実装**: plan に delivery/dispatch field を持たせない。`deliveryModeCeiling` は decision 側（plan は配信しない）。RJ2f まで型すら無し |

**必須遵守（CEO #4）**:
- `notActionable` は G0 kill にしない（exposureLevel は decisionKind 由来・displayPolicy=notActionable を kill 入力にしない）。notActionable→passive+action-none の実体は RJ2b（claim affordance）。RJ2a の plan に affordance field は無い。
- `blocked` → 全 surface ref 空。
- `silent` → contact/output なし（exposureLevel none・ref 空）。
- `observe` → passive object まで（exposureLevel passive_only・clarificationCandidateRefs []）。
- `internal_prepare` → **exposureLevel `internal_only`**（user-facing でない・passive_only にしない）。internal material は許可されるが **user-facing refs / copy なし**（RJ2a は plan のみ・material 実体は RJ2b+）。silent/blocked とは異なり internal 準備は allowed（suppressedSurfaces で別理由）。
- `ask_clarification` のみ `clarificationOnly=true`（ただし RJ2a は clarificationCandidateRefs を埋めない＝[]・候補生成は RJ2c）。
- `departureLineRefs` は v0 常に []。
- `active_prompt` は dispatch でない（plan に dispatch field 無し・§4 G5）。

---

## 5. `surfacePlanViolations` walker 設計

最小実装で以下を機械検証（空 = 適合）。**RJ2a-real**（plan 段で検証可能）/ **RJ2b-defer**（claim/projection 段）を区別。

| # | 違反 | RJ2a 実装 |
|---|---|---|
| 1 | blocked なのに refs 非空 | **real**: exposureLevel none / decisionKind blocked / eligibility blocked のいずれかで allowedClaimRefs/clarificationCandidateRefs/proposalCandidateRefs/departureLineRefs が非空→FAIL |
| 2 | silent なのに user-facing refs 非空 | **real**: decisionKind silent → exposureLevel none ∧ 上記 refs []。違反で FAIL |
| 3 | decisionKind !== ask_clarification なのに clarificationOnly=true | **real** |
| 4 | decisionKind !== ask_clarification なのに clarificationCandidateRefs 非空 | **real** |
| 5 | departureLineRefs 非空 | **real**（v0 常に []） |
| 6 | proposalCandidateRefs 非空 | **real**（v0 常に []） |
| 7 | notActionable が action affordance を持つ | **RJ2b-defer**: plan に affordance field 無し（vacuous）。RJ2b claim/SurfacePermissionGate で検証。本書に明記 |
| 8 | notActionable が clarification/proposal/departure/contact に進む | **real（部分）**: exposureLevel none（notActionable 由来含む）で上記 refs 非空→FAIL。完全版は RJ2b |
| 9 | active_prompt / deliveryModeCeiling を dispatch 扱い | **real（構造）**: plan に delivery/dispatch field が存在したら FAIL（型に無いので vacuous + 構造 assert） |
| 10 | raw evidenceRefs / sourceRefs / graphViewerKey を consumer payload へ | **RJ2b-defer**: plan は internal object（consumer payload でない・それは RJ2b SurfaceProjection）。**real（構造）**: plan に graphViewerKey field が無いことを assert |
| 11 | exposureLevel が decisionKind / actionBoundary を超える | **real**: rank(exposureLevel) > min(rank decisionKind, rank actionBoundary)→FAIL |
| 12 | user-facing copy field が存在する | **real（構造）**: 型に text/copy/claimTextDraft field が無い（コンパイル時保証 + 構造 assert） |
| 13 | notification/contact/external communication field が存在する | **real（構造）**: 型に該当 field 無し |

**追加（RJ2a-0A: internal_prepare 違反検出・全て real）**:
| # | 違反 | 実装 |
|---|---|---|
| 15 | `decisionKind==="internal_prepare"` なのに `exposureLevel==="passive_only"` | **real**: internal_prepare は internal_only 必須・passive_only にしたら FAIL |
| 16 | `decisionKind==="internal_prepare"` なのに user-facing refs（allowedClaimRefs/clarificationCandidateRefs/proposalCandidateRefs/departureLineRefs）が非空 | **real** |
| 17 | `decisionKind==="internal_prepare"` なのに `clarificationOnly===true` | **real** |
| 18 | `exposureLevel===exposureForDecisionKind(carriedDecisionKind)` でない（写像の厳密一致） | **real**: 直接写像の整合（min-rank 由来の化けを防ぐ） |
| 19 | internal_prepare（または exposureLevel internal_only）を **user-facing passive surface として扱う field** が存在 | **real（構造）**: plan に user-facing emission field 無し（vacuous + 構造 assert） |

追加（carry 健全性）: `evidenceRefs` が field-level（node#field 形式 or 既知 token）/ `displayRedactionRequired` が boolean / `displayPolicy` が internal_only/none のとき notActionable / `missingInputRefs` の source trace（dedupeKey）保持 / `surfacePlanId` 非空 / `suppressedSurfaces` の reason が silent/blocked/internal_prepare/observe で区別される（internal_prepare は blocked/silent と別 reason code）。

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/judgmentSurfacePlan.test.ts`（synthetic snapshot で chain を構築 → deriveSurfacePlan → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `blocked → all refs empty・exposureLevel none` | permission 0 → eligibility blocked → plan exposureLevel none・全 ref []・suppressedSurfaces 記録・violations [] |
| 2 | `silent → no contact / no output refs` | upcoming なし day → decisionKind silent → exposureLevel none・clarificationCandidateRefs []・contactPolicy 由来 suppress |
| 3 | `observe → passive_only・no clarification` | clean observe → exposureLevel passive_only・clarificationOnly false・clarificationCandidateRefs [] |
| 4 | `internal_prepare → internal_only・no user-facing refs・no copy` | allowed+collapse elevated → decisionKind internal_prepare → **exposureLevel internal_only**（passive_only でない）・allowedClaimRefs/clarificationCandidateRefs/proposalCandidateRefs/departureLineRefs 全 []・copy field 不在・clarificationOnly false・displayPolicy notActionable・**user-facing passive surface でない**・suppressedSurfaces に `user_facing_suppressed_internal_only_boundary`（blocked/silent と別理由） |
| 5 | `ask_clarification → ask_eligible・clarificationOnly true・候補は RJ2c ゆえ []` | confirmed gate → decisionKind ask_clarification → exposureLevel ask_eligible・clarificationOnly true・clarificationCandidateRefs [](RJ2a 未生成) |
| 6 | `observe + ambiguity → clarificationOnly false` | 同一 window ambiguity だが decisionKind observe → clarificationOnly false（INV-AMB-A/INV-CLAR 整合・RJ2-0A #2） |
| 7 | `leaveBy null + ask_clarification → departureLineRefs []` | movement 未解決 + ask → departureLineRefs []・suppressedSurfaces に departure（INV-DEP-A・RJ2-0A #1） |
| 8 | `notActionable では kill しない（exposureLevel は decisionKind 由来）` | decisionKind observe（displayPolicy visible）で passive・別途 silent/blocked のみ none。notActionable を kill 入力にしない構造を確認（INV-9） |
| 9 | `active_prompt present → no dispatch field` | decision の deliveryModeCeiling に関わらず plan に dispatch/delivery field 無し（INV-11） |
| 10 | `graphViewerKey not authority / not exposed` | plan に graphViewerKey field 無し・snapshotId は擬名化形式（raw viewerId 不含）（INV-7） |
| 11 | `claimTextDraft absent/null` | plan に text/copy/claimTextDraft field 無し（型 + 構造 assert・RJ2e HOLD） |
| 12 | `exposureLevel ≤ decisionKind ≤ actionBoundary（全 case violations []）` | blocked/silent/observe/internal_prepare/ask_clarification/allowed の各 case で violations [] |
| 13 | `integrity guard: 別 snapshot/別 chain → throw` | decision/eligibility が別 snapshot 由来 → throw |
| 14 | `IO 不接触（source-scan）` | judgmentSurfacePlan.ts に fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |
| 15 | `internal_prepare の exposureLevel/clarificationOnly 違反検出` | internal_prepare plan を walker で検証→[]・故意に exposureLevel=passive_only / user-facing refs 非空にすると violations 非空（§5 #15-19） |
| 16 | `suppressedSurfaces は silent/blocked/internal_prepare/observe を別 reason で分ける` | 4 decisionKind の plan の suppressedSurfaces reason code が相互に異なる（internal_prepare は `user_facing_suppressed_internal_only_boundary`・silent は `..._silent_no_contact`・blocked は `..._blocked`・observe は passive eligible で ask/proposal のみ suppress） |

> **fixture 注**: `notActionable + sensitive → withhold/redacted only` と `notActionable → passive reference allowed / action none` の **affordance / redaction 実体**は claim 段（RJ2b）で検証する。RJ2a の plan には affordance/claim text が無いため、RJ2a では「notActionable を kill しない（#8）」「sensitive の displayRedactionRequired carry」までを検証し、affordance/redaction 実体は RJ2b fixture に defer すると明記。

---

## 7. HOLD 項目（RJ2a で実装しない）

- `SurfaceClaim` generation（RJ2b）
- `ClarificationQuestion` generation（RJ2c・文面・質問生成）
- `ProposalCandidate` generation（RJ2d）
- Three-option proposal（RJ2d+）
- Departure line（RC4/RJ2d・v0 構造遮断）
- **User-facing copy**（RJ2e・CEO 承認まで）
- **Notification / contact**（RJ2f・CEO 承認まで・型すら定義しない）
- UI connection / API 追加 / DB・Supabase write / localStorage 変更 / migration
- external read / location・currentLocation 使用
- action / write / send / book / pay / 自動変更
- push / PR / deploy

---

## 8. RJ2a 実装 GO 条件

RJ2a 実装が満たすべき条件（**全て CEO 確認後に GO**）:

1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`judgmentSurfacePlan.ts` は 6 判断器出力を consume する読み取り専用。
2. **additive**: tsc baseline 維持（55・新規型は additive）。
3. **既存 6 判断器ファイル不接触**（+ ern/cs/mv/snapshot/identity 不接触）。新規ファイル 1 + test 1 のみ。
4. **v0 制約**: `proposalCandidateRefs=[]` / `departureLineRefs=[]` / `allowedClaimRefs=[]` / `clarificationCandidateRefs=[]` / copy・notification・action field なし。
5. **walker §5 の RJ2a-real 検出**が全 fixture で機能（1–6/8/9/11/12 + carry 健全性）。RJ2b-defer（7/10 affordance）は本書に明記。
6. **全 fixture PASS**（§6 の 14 件）。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
7. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。
8. **HOLD 維持**: RJ2e（copy）/ RJ2f（notification）に進まない。

> **重要**: RJ2a-0 完了時点で**勝手に実装に進まない**。CEO の RJ2a 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2a-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（surface plan 編成を所有・copy/配信は HOLD） |
| consultedDepartments | Permission（decisionKind/eligibility/actionBoundary 由来）・Risk（fj/crp/prop guard + suppression reason）・Plan/Mobility/Context（node refs） |
| blockingDepartments | **Permission**（露出可否の拒否権）+ **CEO**（RJ2a 実装 GO・RJ2e/f は承認必須） |
| outputs | RJ2a-0 設計（対象ファイル・型・deriveSurfacePlan 契約・gate 実装方針・walker・fixtures・HOLD・GO 条件）。**コードなし** |
| safetyGate | core 直結禁止（plan 経由・INV-0）・exposureLevel ≤ decisionKind ≤ actionBoundary・default-deny・notActionable で kill しない（INV-9）・clarificationOnly は decisionKind===ask_clarification のみ・departureLineRefs/proposalCandidateRefs v0 []・active_prompt 非配信（INV-11）・surface object≠display（INV-10）・graphViewerKey を authority/payload に出さない・copy(RJ2e)/notification(RJ2f) HOLD |
| traceRefs | surfacePlanId / interventionDecisionId / eligibilityId / 全 chain id + evidenceRefs(field-level) + missingInputRefs carry |

---

## 10. 自己判定（RJ2a 実装に進めるか）

- **判定: RJ2a は実装設計 ready（RJ2a-0A 補正後）**。対象ファイル（新規 1 + test 1・6 判断器不接触）・型（5 種・SurfaceExposureLevel 4 値・ClarificationQuestionCandidate は defer）・deriveSurfacePlan 入出力契約（6 入力 + 8 段 guard + **decisionKind 直接写像**）・gate 実装方針（G0–G2.5 実装 / G3–G5 carry-placeholder）・walker（19 + carry・real/defer 区別）・fixtures（16 件・FAIL 再現含む）・HOLD・GO 条件が確定。
- **ただし RJ2a 実装 GO は CEO 専管**。本書は RJ2a を自己承認しない。**RJ2a-0A の CEO 確認 → RJ2a 実装 GO** の順。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。

---

## 11. RJ2a-0A 補正サマリ（CEO 監査・internal_prepare exposure 矛盾）

### 11.1 internal_prepare exposure 再裁定 → **採用 A（internal_only 新設）**

- **矛盾**: §3.3 が `internal_prepare → passive_only` にマッピング。`passive_only` は L1 user-facing passive と読め、将来 RJ2b/c/e が「表示可能」と誤読する危険（CEO #1）。RJ2-0 正本では internal_prepare は L3 internal material（user-facing でない）。
- **裁定（採用 A）**: `SurfaceExposureLevel` を **4 値**に: `none` / **`internal_only`** / `passive_only` / `ask_eligible`。`internal_prepare → internal_only`（user-facing でない）。RJ2-0 §7-A の型も更新。

### 11.2 SurfaceExposureLevel の定義固定（CEO #3）

- `none`: 何も surface 化しない（silent/blocked）
- `internal_only`: internal prepared material boundary。**user-facing 不可**（internal 準備のみ許可）
- `passive_only`: L1 passive object を将来作れる可能性（observe・copy/UI はまだ不可）
- `ask_eligible`: L2 clarification candidate object を将来作れる可能性（ask_clarification・文面はまだ不可）
- **非線形**: user-facing exposure は none = internal_only < passive_only < ask_eligible。これにより RJ2a 以降で internal_prepare と observe が混ざらない。

### 11.3 deriveSurfacePlan 導出ロジック修正（CEO #1/#3）

- **min-rank をやめ decisionKind 直接写像に変更**（§3.3）。silent/blocked→none・observe→passive_only・internal_prepare→internal_only・ask_clarification→ask_eligible。decisionKind は core で actionBoundary に capped 済みゆえ直接写像で十分。防御 cap は user-facing rank（internal_only=0）でのみ作用。
- `displayPolicy = (none || internal_only) ? notActionable : visible`（internal_only も user-facing でない）。

### 11.4 fixtures / tests 修正（CEO #2）

- fixture #4 を修正: `internal_prepare → internal_only・no user-facing refs・no copy`（passive_only でない・user-facing passive surface でない・各 ref []・suppressedSurfaces 別理由）。
- fixture #15/#16 追加: internal_prepare 違反検出 / suppressedSurfaces 4 状態分離。

### 11.5 walker 追加検出（CEO #4）

§5 #15–19: internal_prepare で exposureLevel=passive_only / user-facing refs 非空 / clarificationOnly=true / 写像不一致 / user-facing passive 扱い field → FAIL。

### 11.6 suppressedSurfaces の 4 状態分離（CEO #5）

silent（`..._silent_no_contact`）/ blocked（`..._blocked`）/ **internal_prepare（`user_facing_suppressed_internal_only_boundary`・internal 準備は allowed）** / observe（passive eligible で ask/proposal のみ suppress）を**別 reason** で記録。internal_prepare の内部準備可能を silent/blocked と同じ理由で潰さない。

### 11.7 RJ2a 実装 GO 可否の自己判定

- **判定: RJ2a は実装設計 ready（補正後・内部無矛盾）**。internal_prepare の user-facing 誤読リスクを exposure 型の分離で構造的に解消。
- **RJ2a 実装 GO は CEO 専管**。RJ2a-0A の CEO 確認 → RJ2a 実装 GO の順。RJ2e/RJ2f は HOLD 維持。
