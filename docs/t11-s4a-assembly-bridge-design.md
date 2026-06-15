# S4→A Assembly Bridge Gate Design（server-only 橋渡し・docs-only・HOLD）

**作成日**: 2026-06-14 / **ステータス**: docs-only・実装なし・bridge は HOLD（別 GO）・stop after report。
**スコープ**: Travel 専属・**server-only**。**禁止**: 実装・solver/reorder/placement・外部/route/weather/place/Maps API・fetch/DB/M2 runtime・booking/calendar/action authority・**TravelCandidate 構築**・`TravelCorePlan.candidates` 挿入・ranking・本番 `/plan`・UI/dev preview・push。

**★核心**: S4 の **server-only `AssemblyInputCandidate`** を、既存 **copy-only `assembleScheduledDraft`** に渡して `ScheduledTravelItineraryDraft` を作る、**唯一かつ明示の橋渡し gate**。solver でも UI でも本番統合でも TravelCandidate 構築でもない。bridge は **second 独立 fail-closed gate**（候補の invariant 再検証 + `detectAssemblyReadiness` 独立再実行）を経てのみ assembler を呼ぶ。

---

## §1 前提を疑う — S4→A bridge が次か
- **vs S5（minimal-perturbation 再計画）**: S5 は「既に accepted な draft」を摂動する。その accepted draft = `ScheduledTravelItineraryDraft` を作るのが bridge。**bridge が先**（S5 の基盤）。
- **vs Bundle 2（ranking）**: ranking は候補間競争・直交。bridge は単一候補の最終 assemble。**bridge が先**。
- **vs scheduled-draft dev preview**: preview は `ScheduledTravelItineraryDraft` を**表示**するが、それを生む bridge と display-safe projection が無いと preview は捏造になる。**bridge が先**（さらに display projection は別 gate）。
**推奨 = S4→A bridge**。S1-S4(finalization)→A(copy-only assemble) を**明示・監査可能・fail-closed に接続する唯一の欠落**。

---

## §2 Closeout
| 層 | 成果 | 状態 |
|---|---|---|
| **A1-A4 copy-only assembly** | `assembly-types.ts`/`assembly-readiness-detector.ts`(detectAssemblyReadiness)/`scheduled-draft-assembler.ts`(assembleScheduledDraft=copy-only・explicit interval/day/duration/cost のみ・assemblyReady ⊂ feasible)・`ScheduledTravelItineraryDraft`{outcome:scheduled_draft, authoritative:false, draft:true, candidateId, itinerary:TravelItinerary, provenance?} | 完成 |
| **S1-S4 solver/finalization** | S1 型壁・S2 STN region・S3 sequencing 半順序・S4 selection-ledger→**server-only `AssemblyInputCandidate`**{outcome:assembly_input_candidate, serverOnly:true, authoritative:false, draft:true, candidateId, assemblyInput:AssemblyInput, handoffProvenance, resolutionTrace} / `UnresolvedChoiceReport` / `SelectionRejection` / needs_input / infeasible | 完成 |
| **S4→A bridge** | 本書 | **HOLD** |

**今完成**: S4 が完全解決 candidate を、A が explicit AssemblyInput から draft を、独立に作れる。
**HOLD のまま**: **bridge**（candidate→assemble の明示接続）・S5（再計画）・TravelCandidate 構築・display projection・dev preview・本番配線・外部/M2/booking。

---

## §3 bridge 問題
- S4 は server-only `AssemblyInputCandidate` を産める。
- A-stage は `ScheduledTravelItineraryDraft` を assemble できる。
- だが**明示の bridge 契約が無い**。
- bridge は **server-only かつ完全解決の candidate のみ** が assembler に届くことを保証する。
- bridge は **`AssemblyInputCandidate` を client に晒さない**。
- bridge は **`TravelCandidate` を作らない**。

---

## §4 許可入力
- `S4ResolutionResult`（S4 の戻り値全体）。
- 進行は **`outcome === "assembly_input_candidate"` のみ**。
- かつ `serverOnly === true`・`authoritative === false`・`draft === true`・`assemblyInput` 完備。
- unresolved choice なし・selection_rejected でない・private 検証失敗でない・client へ diagnostics を出さない。

## §5 禁止入力（→ no draft）
`UnresolvedChoiceReport` / `SelectionRejection` / `needs_input` / `infeasible` / `serverOnly !== true` の candidate / unresolved choice 残存 candidate / client/display payload / raw `ScheduleChoicePoint` / raw `FitResult` / raw private diagnostic。**いずれも draft を作らず neutral no_draft**。

---

## §6 bridge 出力
- **`ScheduledTravelItineraryDraft` のみ**（assembler 由来）。
- `authoritative === false`・`draft === true`。
- **`TravelCandidate` でない**・`TravelCorePlan.candidates` に挿入しない。
- executionAuthority/booking/calendar/action authority なし。
- provenance は assembler が付すもの（`ScheduledDraftProvenance`・shared-safe）を保持。
- **client-only projection を作らない**（display は別 gate）。

```ts
// proposed (未実装・AB1)
export const BRIDGE_NO_DRAFT_REASONS = [
  "non_candidate_input",   // outcome ≠ assembly_input_candidate（unresolved/rejected/needs_input/infeasible）
  "not_server_only",       // serverOnly !== true（or authoritative/draft 不整合）
  "not_assembly_ready",    // detectAssemblyReadiness 独立再実行が not ready（second gate）
  "assembler_rejected",    // assembleScheduledDraft が not_ready を返した
] as const;
export type BridgeNoDraftReason = (typeof BRIDGE_NO_DRAFT_REASONS)[number]; // ★ neutral・private を含まない
export type AssemblyBridgeResult =
  | ScheduledTravelItineraryDraft                        // 既存型（assembler 由来）
  | { outcome: "no_draft"; serverOnly: true; reason: BridgeNoDraftReason };
// function bridgeAssemblyCandidate(result: S4ResolutionResult): AssemblyBridgeResult  // proposed・pure・server-only
```

**bridge ロジック（AB2・骨子）**:
```
if (result.outcome !== "assembly_input_candidate") → no_draft(non_candidate_input)
if (result.serverOnly !== true || result.authoritative !== false || result.draft !== true) → no_draft(not_server_only)
const readiness = detectAssemblyReadiness(result.assemblyInput)   // ★ second 独立 gate
if (!readiness.assemblyReady) → no_draft(not_assembly_ready)
const out = assembleScheduledDraft(result.assemblyInput)          // ★ 唯一許可された assembler 呼出
if (out.outcome !== "scheduled_draft") → no_draft(assembler_rejected)
return out                                                        // ScheduledTravelItineraryDraft（authoritative:false/draft:true）
```

---

## §7 bridge がしてはならない
solve しない・reorder しない・時刻割当しない・日割しない・overlap 修復しない・lock 緩和しない・duration/cost/transport/budget 推論しない・route/weather/place API なし・proposal ranking しない・`runTravelPlanEngine` 非呼出・`evaluateFit` 非呼出。**bridge は candidate の検証 + 1 回の copy-only assemble のみ**。

## §8 失敗挙動
非 candidate 入力→no draft / serverOnly 欠→no draft / assembly-readiness 失敗→no draft / assembler rejection→no draft / private/authoritative 検証失敗→no draft / shared/client error は **neutral**（private 理由を出さない）/ **partial itinerary を出さない**（all-or-nothing）。

## §9 privacy
- bridge は **server-only**。
- `AssemblyInputCandidate` は **shared/client projection に決して届かない**（bridge 入力は server 内）。
- `ScheduledTravelItineraryDraft` は後に**別の display-safe projection 経由でのみ**表示し得る（本 bridge は projection を作らない）。
- shared client に見せる draft provenance に private 理由を出さない（assembler 由来 `ScheduledDraftProvenance` は presence|explicit/single_day_zero|explicit で private を含まない）。
- **client-only privacy filtering なし**（server で完結）。

---

## §10 future TravelCandidate との関係
`ScheduledTravelItineraryDraft` は **`TravelCandidate` でない**。candidate 構築は別 GO・`TravelCorePlan.candidates` 挿入は別 GO・ranking/dominance は別 Bundle 2。bridge は draft までで停止。

## §11 S5 との関係
S5 は後に `ScheduledTravelItineraryDraft` を prior accepted draft として使える。S5 は HOLD。**bridge に再計画なし**。

---

## §12 承認後の実装スライス
- **AB1** bridge 型（`AssemblyBridgeResult`・`BridgeNoDraftReason`・必要なら proposed のみ）。*narrow*
- **AB2** pure bridge helper（`bridgeAssemblyCandidate`: 候補検証 + detectAssemblyReadiness second gate + **唯一の `assembleScheduledDraft` 呼出** + neutral no_draft）。*narrow・assembler を呼ぶ唯一の場所*
- **AB3** tests（§13）。
- **UI/dev preview の前で STOP**・**TravelCandidate 構築の前で STOP**。

## §13 将来 golden test
- assembly_input_candidate → `ScheduledTravelItineraryDraft`。
- unresolved choice → no draft。
- stale rejection（SelectionRejection）→ no draft。
- serverOnly false/欠 → no draft。
- bridge は **valid server-only candidate の時のみ** assembler を呼ぶ。
- bridge は `TravelCandidate` を出さない・candidates に挿入しない。
- bridge は executionAuthority を与えない。
- bridge は `authoritative:false`/`draft:true` を保持。
- bridge は solve/reorder/repair しない。
- `runTravelPlanEngine` 非呼出・`evaluateFit` 非呼出・route/weather/place API なし。
- 外部 fetch/API/DB/Supabase import なし・app/UI import なし・M2 runtime なし。
- detectAssemblyReadiness not ready の candidate → no draft（second gate）・assembler not_ready → no draft。
- 既存 travel test green・tsc baseline 不変。

## §14 Stop
本 bridge 設計 report で停止。**bridge を CEO 承認まで実装しない**。

---

## §15 CEO 判断請求
1. S1-S4 + A1-A4 を**凍結点**として承認し、次 = **S4→A assembly bridge 設計（本書）** を承認するか。
2. **★bridge=second 独立 fail-closed gate**（候補 invariant 再検証 + detectAssemblyReadiness 独立再実行 → 唯一の assembleScheduledDraft 呼出 → ScheduledTravelItineraryDraft のみ・neutral no_draft）で良いか。
3. server-only 規律（AssemblyInputCandidate を client に晒さない・display は別 gate・TravelCandidate/candidates 挿入は別 GO）で良いか。
4. 実装順 = **AB1(型)→AB2(bridge helper)→AB3(tests)・UI/TravelCandidate 前 STOP** で良いか（各別途 GO）。

**本書で停止**。bridge 実装は CEO 承認まで着手しない。
