# T11-A(R2F) Retrieval-to-Fit Integration Design（retrieved entity → fit → ProposalFitInput・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: 設計のみ・実装なし（docs-only）。
**位置づけ**: 外部/M2/本番 gate の前の **Travel pure pipeline 最後の未接続ピース**（GPT 補正: Travel pure logic の絶対最後ではない＝Bundle 2 ranking / solver-DAG は将来 pure 残）。
**核心**: `EntityRetrievalCandidate(TravelObjectState)` を proposal id に **strict join** → `evaluateFit(user, entity)` → **`ProposalFitInput`** へ。ranking 不変・raw FitResult 非露出・外部/M2/本番/booking/runtime を開けない。

## §1 前提を疑う — 次は retrieval-to-fit integration で正しいか
| 候補 | 評価 |
|---|---|
| **A retrieval-to-fit integration design** | **★ 採用**。provider→retrieval→fit の**唯一残った純接続**・外部前の基盤完成・advisory のみ |
| Tier1 safe links/Maps URL | 外部寄り・fit 接続が先（entity が fit に流れないと link 価値も限定） |
| Bundle 2 fit dominance/ranking | A(fit が entity を評価)後・advisory 固定を崩す前提 |
| solver/itinerary DAG preflight | runtime gate 寄り・place 解決要・後 |
| Travel 凍結し Stargazer 本流 | A 完了後の選択肢（CEO 最優先=Stargazer）。ただし A は「予約直前 Travel の安全基盤の最後の接続」ゆえ先に閉じる価値大 |

**推奨 = A**。理由: session/intake→input(G1)・evidence→entity state(G2)・fit engine は entity 評価可・T11-F は ProposalFitInput を受ける——が、**retrieved entity を fit に流す pass だけが無い**。A はこれを pure に繋ぎ（外部/本番/M2 を開けず）、予約直前 Travel の安全基盤を閉じる。

## §2 現在の gap
- session/intake provider → `TravelPlanEngineInput`（G1・DONE）
- Tier0 retrieval → `EntityRetrievalCandidate`/`TravelObjectState`（G2・DONE）
- fit engine は `TravelObjectState` を評価可（`evaluateFit`・DONE）
- T11-F は `ProposalFitInput`/fit summary を受ける（DONE）
- ★ **retrieval candidate を proposal fit input に繋ぐ純 pass が無い**（= 本設計）

## §3 input contract
- 既存 proposal 層の **proposal/candidate id**（順序なし参照）
- `EntityRetrievalCandidate[]`（G2 出力）
- `FitUserState`（または `FitSubject` = solo/group の fit subject・**供給**＝今は fixture・M2 later）
- 任意 `FitContext`
- **caller 供給 binding map**: `proposalId/candidateId → retrievalCandidateId/placeRefId`
- ★ **entity 捏造しない・proposal copy/areaPlaceholder から推論しない**（binding は caller 責務・T11-F 同型）

## §4 join semantics
- **strict id 一致のみ**。未知 proposal id → **diagnostic only**。未知 entity id → **diagnostic only**。
- **重複 binding → fail-closed / deterministic reject**（T11-F join 規律）。
- proposal あたり複数 entity は**明示表現時のみ**（既定 1:1）。
- **retrieval 自身は user-agnostic**。caller が proposal↔entity を束ねる。**adapter は binding 検証 + fit 評価のみ**。

## §5 fit pass
- 各 valid binding について:
  - `TravelObjectState`（candidate.entity）を取り
  - 供給 `FitUserState`（FitSubject）を取り
  - **`evaluateFit({ entity, subject, context? })`** を呼ぶ（★これは **fit model の pure 評価**であって `runTravelPlanEngine`(engine) ではない）
  - **bounded** `ProposalFitInput{ candidateId, fit: FitResult }` を産む
- **FitResult は server-side に留める**（packet には入れない）。
- **fit summary adapter（T11-F）を再利用**（後段が ProposalFitInput→bounded fitSummary 化）。
- ★ **PlanDecisionPacket に raw FitResult を入れない**・**ここで display packet/projection を生成しない**。

## §6 output contract
- **`ProposalFitInput[]`**（= `TravelPlanEngineInput.fit` の型）
- diagnostics: 未知 proposal id / 未知 entity id / 重複 binding / FitUserState 欠如 / candidate-entity mismatch
- ★ **no ranking result / no booking・action authority / no display projection / no raw private user state**

## §7 ranking / dominance 境界
- **first slice は advisory のみ**・**dominance/pareto/ranking を変えない**。
- fitSummary は既存 T11-F 経路で後に出る（packet の advisory）。
- **Bundle 2 ranking は別 GO**。
- ★ **fit は hard blocker / readiness を override しない**（fit literal false・readiness が gate）。

## §8 privacy
- `FitUserState` は private 値を含み得る。
- **`evaluateFit` の full result は server-only**。
- **shared fit summary は shared-safe view（`toSharedFitView`）から再導出**（既存 T11-F 保証）。
- **private fit reason を diagnostics/output に漏らさない**・**diagnostics は private user state を明かさない**。
- **client-only privacy filtering しない**（除去は engine 射影で）。

## §9 provenance / confidence
- retrieval candidate confidence は、**既にモデル済みの範囲でのみ** fit summary confidence に流れる（新規 score 化しない）。
- **source popularity は confidence のみ**（INV-4 踏襲）。
- **missing entity field は confidence 減 / question**（hallucinate しない）。
- ★ **fit は source kind を quality 扱いしない**。

## §10 既存 engine との関係
- 産んだ `ProposalFitInput[]` は **後に `TravelPlanEngineInput.fit` に渡される**（caller or engine fixture）。
- ★ **本 adapter は engine(`runTravelPlanEngine`)を呼ばない**（test-only を除く）。`evaluateFit`(fit pass) は呼ぶ。
- **設計フェーズで packet 挙動を変えない**・**本番 route 統合なし**。

## §11 実装スライス（承認後）
| slice | 内容 |
|---|---|
| **A-B** pure types | retrieval-to-fit binding 型（`ProposalEntityBinding{proposalId, retrievalCandidateId}`）+ diagnostics 型（`RetrievalFitDiagnostics`）+ input 型 |
| **A-C** pure helper | `deriveProposalFitInputsFromRetrievedEntities(proposalIds, candidates, subject, bindings, context?) → { fitInputs: ProposalFitInput[]; diagnostics }`（strict join → evaluateFit → ProposalFitInput） |
| **A-D** tests | strict id join / valid binding のみ evaluateFit / invalid binding diagnostics / no ranking change / no raw FitResult 露出 |
**stop**: engine/runtime/UI 統合・本番・外部 retrieval は別承認。

## §12 tests（将来）
valid binding → ProposalFitInput / 未知 proposal id → diagnostic only / 未知 entity id → diagnostic only / 重複 binding → fail-closed / FitUserState 欠如 → fail-closed / proposal copy・areaPlaceholder から entity 推論しない / private user state は full fit に効くが diagnostics/output に出ない / raw FitResult 非露出 / output に ranking/dominance/authority 無 / retrieval candidate popularity は confidence のみ / no external fetch・API・DB・Supabase import / no M2 runtime / no app・UI import / 既存 travel green / tsc baseline 不変。

## §13 stop conditions
external retrieval が要る / M2 runtime が要る / proposal-entity binding を text から推論する必要 / raw FitResult が packet/output に要る / ranking・dominance を変える必要 / 本番 `/plan` に触れる / DB・API・fetch・Supabase が要る——いずれかで即停止。

## §14 出力 + CEO 判断請求
- 本書は **retrieval-to-fit 接続の設計のみ**。実装・engine 呼出・外部・本番なし。
- **推奨実装バンドル（承認後）= A-B+C+D**（pure binding types + `deriveProposalFitInputsFromRetrievedEntities` + tests・engine/runtime/UI 統合なし）。

### CEO 判断請求
1. 次 = **A（retrieval-to-fit integration design・docs-only）** で良いか（vs Tier1/Bundle2/solver/Stargazer 復帰）。
2. **input = proposal ids + EntityRetrievalCandidate[] + FitUserState 供給 + caller binding map**（entity 捏造なし・text 推論なし）で良いか。
3. **join strict 一致・invalid は diagnostic/fail-closed・adapter は binding 検証+evaluateFit のみ**（engine 呼ばない）で良いか。
4. **first slice advisory のみ（ranking 不変）・raw FitResult 非露出・shared summary は toSharedFitView 由来**で良いか。
5. 承認後 **A-B/C/D 実装**（pure types + helper + tests・engine/外部/本番なし）の GO。

実装は CEO 承認まで着手しない（A 設計レポートで停止）。
