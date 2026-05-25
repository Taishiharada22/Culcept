# Alter Plan P2 Step 3 — Real Stargazer Personal Model Read-only Wire Readiness

**Status**: readiness 起草 (= 着手前停止、 実装/実行は **G3-B + G3-C 通過後、 preview canary 前**)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: P2 Step 2 v3.1 の synthetic / stub PersonalModelV2 を **実 Stargazer 既存 module 経由** に置換する readiness。 GPT 「preview canary 前必須」 受領。
**CEO 思考原則 ①〜⑦ 適用**: 「人間同等推論 (⑥)」 「実 Stargazer 既存資産活用 (= 既存 50+ module の Aneurasync 競争優位)」 を結合する。

---

## 0. 結論 (= TL;DR)

GPT G3 後の追加条件:
- **synthetic / stub ではなく real Stargazer read-only PM を通した smoke が preview canary 前に必須**
- ただし **G3-B / G3-C を止めて先行しない** (= GPT 明示)
- readiness 起草は G3-B / G3-C と並行可 (= 本 doc)

本 doc は **readiness 起草のみ**。 実装は G3 完了後の別 phase。

### 設計の核心

- Step 2 v3.1 = **interface + synthetic adapter** 完成
- Step 3 = **interface を保ったまま実 Stargazer 4 module からの抽出** に差し替え
- read-only (= Stargazer 既存 module 改変 0、 参照のみ)
- safe degrade (= 軸データ未完成 user で全 field undefined return、 Step 1 同等動作)

---

## 1. 既存 Stargazer 4 module mapping (= readiness v3 §1.3 完成済)

### 1.1 Stable layer source (= 12 module から抽出)

| Personal Model field | 既存 Stargazer module | 取得 API (推定) | wire 想定 |
|---|---|---|---|
| `judgmentMode` | `axisRegistry.ts` + `axisInferenceEngine.ts` | `getAxisProfile(userId)` 系 (= 確定 wire は別 phase) | 「集中型」 / 「分散型」 等 short tag に縮約 |
| `psycheTone` | `psycheSignature.ts` | `getPsycheSignature(userId)` | 「内向 + 整理欲求」 等 |
| `timePreference` | `chronotypeFitness.ts` | `getChronotype(userId)` | 「朝強い」 / 「夜強い」 / 「中庸」 |
| `lifeStageHint` | `baselineContext.ts` | `getBaselineContext(userId)` | LifeStage の hint のみ (= PII 化避け) |
| `traitTone` | `traitAxes.ts` | `getTraitTone(userId)` | 「内向的」 等 |
| `archetype` | `archetypeFigure.ts` + `archetypeResolver.ts` | `resolveArchetype(userId)` | 「賢者型」 / 「整え手型」 等 |
| `decisionMode` | `decisionOracle.ts` | `getDecisionMode(userId)` | 「直感先行」 / 「分析優先」 等 |
| `strengthAxis` | `uniqueStrengthDetector.ts` | `getStrengthAxis(userId)` | 「深い集中」 / 「対話力」 等 |
| `workStyle` | `workStyleFitness.ts` | `getWorkStyle(userId)` | 「solo deep work」 等 |

注: 上記 API 名は **推定**。 Step 3 着手時に 各 module の実 export を確認して wire 化。

### 1.2 Recent layer source (= 13 module から抽出)

| Personal Model field | 既存 Stargazer module |
|---|---|
| `innerWeather` | `innerWeather.ts` |
| `recentMood` | `microEMA.ts` + `microEMABridge.ts` |
| `recentEvents` | `lifeEvents.ts` |
| `reactionPattern` | `reactionPatternEngine.ts` (= W5 Reaction Learning) |
| `fluctuation` | `fluctuationEngine.ts` |
| `stressLoad` | `stressResponseCascade.ts` |
| `recentRupture` | `ruptureDetection.ts` |
| `recentRhythm` | `lifeContext.ts` (= W1 直近リズム) |

### 1.3 Contextual layer source (= 9 module から抽出)

| Personal Model field | 既存 Stargazer module |
|---|---|
| `similarDayRecall` | `episodicRecall.ts` |
| `pastSelfDelta` | `temporalSelfMirror.ts` |
| `shiftSignal` | `contextShiftAnalyzer.ts` |
| `narrativeContinuity` | `narrativeThreading.ts` |
| `sameSlotHistory` | 当日 anchor 前後 + 過去 same time-slot (= adapter 内で構築) |

### 1.4 HDM Phase + Trust source

| field | source |
|---|---|
| `hdmPhase` | `hdmPhase.ts` (= `getHdmPhaseState(userId)` 等) |
| `trustLevel` | `alterUnderstanding.ts` |
| `observationCompleteness` | `axisRegistry.ts` の充足度 / `depthPhaseController.ts` 経由 |

---

## 2. 実装 plan (= Step 3 着手時、 G3 通過後)

### 2.1 新規 file (= 1 個、 外科的)

`lib/plan/llm/personalModelExtractorV2.ts` の `extractPersonalModelV2` 実装を **stub → real wire** に置換 (= 既存 file の関数を実装に差し替えるだけ、 新 file 追加 0)。

ただし adapter wire は別 file に分けても OK (= clean separation):
- `lib/plan/llm/personalModelStargazerAdapter.ts` (= new、 server-only)
  - 4 module からの read-only 抽出 helper
  - 各 helper は `fail-open` (= 取得失敗 → undefined return)
  - 全 helper を `extractPersonalModelV2` で組み立て

### 2.2 既存 file 改変 (= 1 個)

`lib/plan/llm/personalModelExtractorV2.ts`:
- `extractPersonalModelV2(userId)` の stub return を実 adapter 呼出に置換
- Step 2 v3.1 の synthetic adapter (= `buildPersonalModelV2FromSynthetic`) は **そのまま保持** (= eval harness 用)

### 2.3 既存 Stargazer module への影響 (= 0、 read-only)

- 全 module は read-only 参照のみ
- API 呼出のみ (= internal logic 改変 0)
- 既存 test 影響 0

### 2.4 Phase 取得

- 現状 `extractPersonalModelV2` は `userId` のみ受領、 内部で `hdmPhase` 取得
- Step 3 では `hdmPhase.ts` から `getHdmPhaseState(userId)` (= 既存 API、 確定 wire は実装時) で取得

### 2.5 Safe degrade pattern

各 module read で例外 / undefined → 該 field undefined:

```typescript
async function safeGetJudgmentMode(userId: string): Promise<string | undefined> {
  try {
    // 実 axisRegistry / axisInferenceEngine wire
    const profile = await getAxisProfile(userId);
    return mapAxisProfileToJudgmentMode(profile);
  } catch {
    return undefined;
  }
}
```

これで:
- 軸データ未完成 user → 全 field undefined
- Phase ≥ 2 + 一部 field 充足 → 部分 PM (= 充填済 field のみ prompt 注入)
- Phase < 2 → meta-only (= Phase gate で個別化 skip)

---

## 3. Step 3 着手手順 (= G3 通過後)

### Phase 1: branch 維持 (= 既存 `feat/alter-plan-p2-llm-step1` 上)

GPT 「Step 1 + Step 2 まとめて merge」 通り、 Step 3 も同 branch に積む。

### Phase 2: personalModelStargazerAdapter.ts 実装
1. 既存 Stargazer 4 module の実 export 確認 (= grep / read)
2. 各 module の signature を adapter helper に wrap (= safe degrade)
3. `extractPersonalModelV2` を adapter 経由に変更

### Phase 3: 単体 test
- `tests/unit/plan/llm/personalModelStargazerAdapter.test.ts` (= mock Stargazer module)
- 各 helper の safe degrade path 検証
- 既存 `personalModelExtractorV2.test.ts` の更新 (= stub から real adapter 経由に)

### Phase 4: real PM read-only smoke
- dev server + Playwright + 実 Stargazer データを持つ test user
- env: `PLAN_ALTER_NOTE_LIVE=true` + `PLAN_PERSONAL_MODEL_INTEGRATION=true`
- 観測:
  - dev log で `[plan/pm]` 等 で extractor の発火確認
  - V2 path 発火 (= taskType plan_alter_note + V2 prompt 内容)
  - PM field の prompt 注入確認 (= dev log 出力)
  - UI で 「あなたらしい」 文 表示確認 (= judgmentMode / timePreference が反映された文)
- 5 観測項目:
  1. real PM 抽出成功 (= Stable layer 1+ field 充填)
  2. Phase gate 正常 (= Phase ≥ 2 で個別化 ON)
  3. V2 path 発火 (= promptBuilderV2 経由)
  4. LLM 出力に 「あなたらしさ」 反映 (= 一般 LLM ではない、 個別化 visible)
  5. UI render 正常 (= popcorn なし、 console error 0)

### Phase 5: atomic commit + CEO smoke 仰ぐ

### Phase 6: preview canary GO 判定

real PM smoke PASS + G3 (= G3-A + G3-B + G3-C) PASS → preview canary GO (= G4)

---

## 4. 工数見積もり

| Phase | 内容 | 想定 day |
|---|---|---|
| 1 | branch / readiness 確認 | — |
| 2 | personalModelStargazerAdapter.ts 実装 | 2-3 |
| 3 | 単体 test | 1 |
| 4 | real PM read-only smoke | 1 (= ~1-2 hour Playwright) |
| 5 | atomic commit + docs | 0.5 |
| 6 | preview canary GO 判定 | — |

合計 **4-5 day** (= Step 3 範囲、 G3 通過後着手)。

---

## 5. Step 3 不変原則 (= readiness 確定)

- DB / env / package / dependency 変更 0
- 既存 Stargazer module **完全 frozen** (= read-only 参照のみ)
- 既存 frozen file 不触
- 規約 24 維持
- alter plan scope 限定
- safe degrade (= 軸データ未完成 user で Step 1 同等動作)
- read-only (= Stargazer 軸データ 改変 0、 DB write 0)

---

## 6. CEO 判断 (= Step 3 着手前停止、 G3 通過後)

| # | 質問 | 推奨 |
|---|---|---|
| Q1 | adapter 分離 (= 新 file) vs 既存 file 内拡張 | **新 file** (= personalModelStargazerAdapter.ts、 clean separation) |
| Q2 | safe degrade 戦略 | **try/catch + undefined return** (= 各 field 独立) |
| Q3 | real PM smoke test user | **CEO 自身 user account** (= 実 軸データ取得) |
| Q4 | smoke 観測項目 | **5 項目** (= 上記 Phase 4) |
| Q5 | Stable layer wire の優先順位 | judgmentMode + timePreference を最初に (= 即効性高) |

---

## 7. 関連 readiness / 設計書

- `docs/alter-plan-p2-llm-step2-readiness-v3.md` (= Step 2 親 readiness、 v3.1)
- `docs/alter-plan-p2-step2-forced-failure-smoke-plan.md` (= G3-C 手順)
- 既存 `lib/stargazer/*.ts` (= read-only 参照対象)
- `docs/heart-dynamics-model-v1.md` (= HDM Phase 設計)

---

## 8. GPT 受領条件への応答

| GPT 条件 | 対応 |
|---|---|
| preview canary 前必須 | 本 readiness で実装 plan 確定済、 着手は G3 通過後 |
| G3 を止めて先行しない | 本 doc は readiness 起草のみ、 実装着手なし |
| 「あなたらしさ」 を見る | Phase 4 観測項目 4 で機械保証 |

---

**結語**: Step 3 は **Step 2 v3.1 の synthetic 接点を real Stargazer に置換** する readiness が確立。 着手は G3-B + G3-C 通過後。 「実データ待ち禁止」 ルール継続遵守 (= 本 doc は実装 docs only、 G3-B/C は synthetic で進行中)。
