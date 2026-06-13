# T10 計画書 — After-Action Learning (regret→constraint) pure layer

**作成日**: 2026-06-12 / **ステータス**: **計画/設計のみ・実装なし**（CEO プロセス: phase ごとに最小スコープ計画→CEO 監査→承認後に実装）。
**前提**: Travel pure engine T1〜T9 完成（`runTravelPlanEngine` facade まで・全 pure/未配線/private 非漏洩/authority 境界）。
**スコープ**: 本ステップは docs-only。コード変更なし。実装は CEO 承認後。

---

## §1 前提を疑う — T10 は本当に regret か？

候補を比較した（ゴールから逆算: 「runtime 統合前に揃えるべき pure logic は何か」）。

| 候補 | 何を作るか | pure 実現性 | いま作る価値 | 依存/前提 |
|---|---|---|---|---|
| **A. regret / after-action learning** | 旅行後の明示フィードバック → 次回の制約/選好デルタ | ✅ 高（transform は純粋・永続化不要） | ★**競合の moat**（嗜好の蓄積でなく「判断の補正」）。T9 input に還流 | なし（feedback は explicit input） |
| B. itinerary skeleton / solver-preflight | 採用 proposal → 実 itinerary DAG（T1A TravelCandidate） | △ 中（**場所/経路なしでは空の時間枠 scaffold のみ**） | 低（solver が DAG を作り直す可能性・places は HOLD） | solver 設計・place API（HOLD）に依存 |
| C. input-assembly | engine input(slots+history+policy+scenarios) を上流から組立 | △（merge/validate は純だが、源は runtime: 抽出/M2/ledger/sensor） | 低（薄い・大半が runtime 関心） | 上流 runtime |
| D. normalizer+engine facade | T2C normalizeSlotSet → runTravelPlanEngine の連結 | ✅（薄い chaining） | 低（sub-scope 規模・phase に非ず） | なし |

**推奨: A. regret / after-action learning。** 理由:
1. **戦略的 moat**: 先行リサーチ（ChatGPT memory / Romie）は「嗜好の蓄積」止まり。Aneurasync の差別化は「後悔→次回の判断補正」。これを pure に作れるのは今。
2. **いま pure 実現可能**: 「feedback → 制約デルタ」の transform は純粋・決定論・永続化不要。デルタの保存先（memory/M2）は runtime（HOLD）だが、**transform 契約とロジックを先に固める**のは T1〜T9 と同じ哲学。
3. **T9 input への clean な還流**: デルタは次回 `TravelPlanEngineInput`（slots / fairnessHistory）にマージできる。アーキテクチャ適合が最良。
4. **B は時期尚早**: skeleton は places/solver（HOLD）に依存し、空の時間枠のみでは価値が薄く、solver が作り直すリスク。C/D は薄く phase に非ず。

**境界（重要）**: T10 は**観測可能な「行動補正」デルタ**を作る層。Stargazer 軸/判断原理の**深い更新は M2 runtime（HOLD）**の領分。T10 のデルタは将来 M2 へ feed し得るが、T10 自体は M2 に触れない。

---

## §2 T10 = regret / after-action learning の定義

- **purpose**: 過去プランへの明示フィードバック（後悔/満足）を、**次回プランの制約/選好デルタ**へ決定論変換する pure layer。
- **product value**: 「移動が多すぎた」「予算オーバー」「朝が早すぎた」「Aばかり優先された」→ 次回に自動反映。**判断の補正ループ**＝大手が持たない moat。
- **input contract（pure・explicit）**:
  - `feedback: RegretFeedbackItem[]` — { dimension, direction, magnitude, owner(participantId|shared), visibility, (preference 時 descriptor) }
  - `pastConditions?` — 過去プランで効いていた条件（pace/budgetBand/mobility/time_window）。**相対デルタの anchor**。無ければ方向性デフォルト。
  - `participantIds: string[]`
- **output contract（pure）**:
  - `deltas: RegretDelta[]` — { target(slot 種別 or fairness_bias), value(調整後の typed 値 or bias 増分), owner, visibility, rationale }
  - `clarifications: RegretClarification[]` — 矛盾フィードバックの要確認
  - `rationale: ViewerScopedRationale`（M5 二層）
  - + 純 merge helper `applyRegret(baseInput, deltas): TravelPlanEngineInput`（デルタを次回 T9 入力へマージ）
- **★ 設計原則（superior design）**: デルタは**絶対値でなく相対**。「移動が多すぎた」= 過去値からの低減（anchor 6km + strong → ~4km）。「嗜好の蓄積」でなく「前回比の補正」。
- **privacy model**: §5。
- **authority boundary**: regret は**次回入力への提案**であり実行権限を一切持たない。execution authority 概念は T6/T7/T8 に閉じる。regret 層は authority を生成しない。
- **T9 との関係**: regret OUTPUT → `applyRegret` → 次回 `runTravelPlanEngine` INPUT。**regret は T9 を呼ばない**（T9 が consume するデータを作るのみ）。T9 の前段（次サイクルの入力前処理）。
- **must not touch**: DB/永続化/memory write・M2 runtime・Plan Intelligence・runtime/solver/place/route・calendar/booking・UI・LLM。

---

## §3 最小安全スコープ分割

| Scope | 内容 | 種別 |
|---|---|---|
| **T10-A** | 本計画 + 設計/契約の確定（docs-only） | docs |
| **T10-B** | pure types（RegretFeedbackItem/RegretDelta/AfterActionInput/AfterActionOutput/enums）+ **after_action 由来の provenance 決定**（§4 の決定点） | additive types |
| **T10-C** | 決定論 transformer（feedback→deltas）+ 純 merge helper（deltas→次回 input） | additive pure |
| **T10-D** | tests / golden scenarios（§6） | additive tests |
| **T10-E** | closeout/checkpoint（必要時・decision-log + memory 更新） | docs |

---

## §4 スコープ別詳細

### T10-A（docs・本書）
- **goal**: 前提検証 + 契約確定 + スコープ分割（本書）。
- **files**: `docs/t10-after-action-learning-plan.md`。
- **allowed**: docs のみ。**forbidden**: コード変更。
- **tests**: なし。**stop**: CEO 監査待ち。
- **bundle**: 単独（本書で完了）。

### T10-B（pure types）
- **goal**: regret 契約型を additive 定義。
- **files**: 新規 `lib/shared/travel/after-action-types.ts`。
- **★ 決定点（CEO 監査対象）**: regret デルタが **ExtractedSlot として次回入力にマージ**されるには、provenance の出所が要る。3 案:
  - **Opt1（推奨）**: T2B `EXTRACTION_SURFACES` に `"after_action"` を**追加**（additive: enum 1 + SURFACE_INITIAL_STATUS/IS_EXPLICIT/DEFAULT_VISIBILITY に 1 entry ずつ）。regret 由来 slot が正しい provenance で first-class に。**唯一の committed T2B 触り（純 additive・既存挙動不変）**。
  - Opt2: regret は独自型のみ・merge は fairnessHistory 調整 + 既存 slot の tighten に限定（新規 slot を emit しない）。T2B 不変だが「過去に該当 slot が無い次元」を表現できない。
  - Opt3: 既存 surface（profile_prior 等）で mislabel。**非推奨**（provenance 詐称）。
  - → **推奨 Opt1**。承認時のみ T10-B に含める。否なら Opt2 に縮退。
- **allowed**: 新規 types ファイル + （承認時）T2B への after_action 追加。**forbidden**: ロジック・runtime・他層変更。
- **tests**: enum 網羅性（T10-D に集約可）。**stop**: tsc baseline 55 増 / 既存 surface 挙動変化。
- **bundle**: T10-C/D と bundle 可（同 guardrail）。

### T10-C（transformer + merge）
- **goal**: `deriveRegretDeltas(input): AfterActionOutput`（feedback→deltas・相対・矛盾→clarification）+ `applyRegret(baseInput, deltas): TravelPlanEngineInput`（次回入力へマージ・fairnessHistory 調整 + slot 追加/tighten）。
- **files**: 新規 `lib/shared/travel/after-action-core.ts`。
- **allowed**: pure 関数のみ。import は travel core/types。**forbidden**: DB/fetch/Date.now/random/persistence/M2/runtime/solver。
- **tests**: §6。**stop**: 非決定論・privacy 漏洩・tsc 増・runtime import。
- **bundle**: T10-B/D と bundle 可。

### T10-D（tests）
- **goal**: §6 の golden を full カバー。
- **files**: 新規 `tests/unit/travelAfterAction.test.ts`。
- **allowed**: tests。**forbidden**: ソース変更（テスト都合の logic 変更は別途）。
- **stop**: full suite 赤（flaky 除く・teed で名捕捉）・tsc 増。
- **bundle**: T10-B/C と同時 commit。

### T10-E（closeout）
- **goal**: decision-log + memory 更新・次 phase 判断材料。**files**: docs/memory。**forbidden**: コード。

---

## §5 privacy / safety ルール

1. regret は **explicit pure input としてのみ**未来制約に影響（暗黙の観測・memory read 禁止）。
2. **永続化なし・memory write なし・DB なし・M2 runtime なし・Plan Intelligence 投影なし**。
3. **private regret の非漏洩**: private regret 由来デルタは visibility=private。authoritative な次回入力には効く（slot/bias）が、**shared rationale / shared 射影に出さない**（既存 toShared* と同じパターン）。
4. **shared regret** は明示的に shared の場合のみ shared rationale に使用可。
5. **private regret は authoritative future constraints を形成してよいが leak しない**（例: P1 private「Aばかり優先で嫌」→ fairness bias を P1 寄りに補正するが、shared には「次回は配分を調整」程度の一般化のみ）。
6. EngineOnly ブランド値は regret 入出力に混入不可（`assertNoEngineOnlyLeak` 互換）。
7. authority を生成しない（regret は次回 input の素材）。

---

## §6 想定テスト（golden）

1. pace 後悔（「詰め込みすぎ」less）→ 次回 pace 制約（slower）デルタ。
2. budget 後悔（over）→ budget band を tighten するデルタ（相対: anchor からの低減）。
3. mobility/fatigue 後悔（「歩きすぎ/疲れた」）→ mobility tolerance 低減 or pace slower デルタ。
4. participant 不均衡後悔（「Aばかり優先」）→ **fairnessHistory bias 入力**を調整（hard override せず・gently・次回 decide の tie-break のみ）。
5. **private regret は authoritative に効くが shared 射影に出ない**（canary 非漏洩）。
6. **shared regret** は shared rationale に出てよい。
7. **矛盾 regret**（同 owner「less budget」+「more luxury」/ shared で相反）→ **fail-closed = clarification_needed**（黙って一方採用しない）。
8. **相対デルタ**: 同方向でも anchor が違えば結果が違う（絶対化していない）。
9. 決定論/冪等（同一入力→深い等価・derive(derive) 安定）。
10. source kind / provider mode は regret 結果に影響せず・出力に出ない（participantId のみ）。
11. `applyRegret` 後の次回 input が T9 で正しく消費される（end-to-end: regret→applyRegret→runTravelPlanEngine が回る・fairness tilt が効く / hard blocker は覆らない）。
12. no fetch/API/DB/route/UI imports（grep）。

---

## §7 出力（CEO 承認後の実装 bundle 推奨）

- **承認後 bundle**: **T10-B + T10-C + T10-D を 1 commit**（同 guardrail: pure・additive・未配線・private 非漏洩）。Opt1 採用時は after_action surface の additive T2B 追加を T10-B に含める。
- **実装しない**: 本ステップ（T10-A）では一切のコードを書かない。
- **検証規約（実装時）**: 新規 tests PASS・tsc 55 不変・full suite teed・purity/import/runtime importer grep 0・diff scope clean・tree clean・push なし。
- **次 phase は T10 完了後に T11 を個別計画**（broad roadmap を作らない・CEO プロセス遵守）。

### CEO 判断請求
1. **T10 = regret/after-action learning** で良いか（§1 推奨）。
2. **provenance 決定（§4 T10-B）**: Opt1（after_action surface 追加・推奨）か Opt2（独自型のみ）か。
3. 承認後 **T10-B/C/D bundle 実装**の GO。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
