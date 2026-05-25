# Alter Plan P2 Step 3 — Real Stargazer Personal Model Read-only Wire Readiness

**Status**: readiness v3.3 失敗 教訓反映済 (= 着手前停止、 **CEO 「v3.3 不採用 → v3.2 ベース real PM smoke 直行」 受領で即着手 GO 段階**)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: P2 Step 2 v3.2 の synthetic / stub PersonalModelV2 を **実 Stargazer 既存 module 経由** に置換し、 **synthetic 限界 vs prompt 弱さの切り分け** を実 PM で行う。
**CEO 思考原則 ①〜⑦ 適用**: 「人間同等推論 (⑥)」 「実 Stargazer 既存資産活用 (= 既存 50+ module の Aneurasync 競争優位)」 を結合する。

## 改訂履歴

| Version | 内容 |
|---|---|
| 初版 (= eb46b95f) | G3 通過後着手前提、 4 module mapping + 6 phase 手順 |
| v3.3 後補正 | **v3.3 P4 失敗の教訓反映**: 「synthetic 限界 vs prompt 弱さ切り分け」 が本 Step 3 の主要目的に格上げ、 P4 中庸型の本質的判定困難への対応観点追加 |
| **Stage A 補正 (= 本稿、 着手後)** | **Phase 2 を Stage A-D の wire enablement sub-stage に分割**: A (= scaffold + safe fallback、 本 commit) / B (= judgmentMode + timePreference、 CEO Q5 1st) / C (= recentRhythm、 CEO Q5 次点) / D (= 後続)。 各 stage で commit + 単体 test、 全体 commit 数を 3-4 に分割 |

---

## 0. 結論 (= TL;DR、 v3.3 後 更新)

GPT 判定 (= 2026-05-25 v3.3 失敗後):
- **v3.3 不採用** (= P3 部分改善のみ、 P4 後退、 net negative)
- v3.2 base (= P1+P2 adoption pass) を local main に統合済 (= `cf53c9c5`)
- **Real PM smoke を次フェーズとして直接着手 GO**
- 結果見て v3.4 要否判断

本 Step 3 の主要目的 (= v3.3 失敗後の再定義):
- **synthetic limitation vs prompt 弱さ** の切り分け
  - synthetic で 2 回試行 (= v3.2 / v3.3) で P4 中庸型 strict 3.5 達成できず
  - 実 Stargazer 軸データ (= 「中庸の中の個性」 が明確) なら P3/P4 が adoption pass する可能性
  - real PM で達成 → synthetic 限界が主因 (= prompt は正しい)
  - real PM でも未達 → prompt 弱さが主因 (= v3.4 必要)

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

内部的に **Stage A → D の wire enablement sub-stage** に分割 (= 各 stage で commit + smoke):

| Stage | 範囲 | WIRE_* 状態 | 想定 commit |
|---|---|---|---|
| **A** | scaffold + safe fallback (= 既存 stub と同 挙動) | 全 false | 1 |
| **B** | judgmentMode + timePreference 実 wire (= CEO Q5 1st) | `WIRE_JUDGMENT_MODE` / `WIRE_TIME_PREFERENCE` = true | 1 |
| **C** | recentRhythm 実 wire (= CEO Q5 次点、 P4 中庸型対策) | `WIRE_RECENT_RHYTHM` = true | 1 |
| **D** | energyRecovery / 等 後続 field 段階拡張 | `WIRE_ENERGY_RECOVERY` = true 等 | 段階別 |

手順:
1. 既存 Stargazer 4 module の実 export 確認 (= grep / read)
2. 各 module の signature を adapter helper に wrap (= safe degrade)
3. `extractPersonalModelV2` を adapter 経由に変更 (= 別 Phase 5、 Stage A 後)

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

## 6. CEO 判断 (= 2026-05-25 確定済)

| # | 質問 | 確定 |
|---|---|---|
| Q1 | Step 3 着手 GO? | ✅ **GO** |
| Q2 | adapter 分離 vs 既存拡張 | ✅ **新 file `personalModelStargazerAdapter.ts`** |
| Q3 | smoke test user | ✅ **`aneurasync@outloo.com`** (= 既存 test account) |
| Q4 | smoke 観測 5 項目 | ✅ 採用 (= 下記 §4 通り) |
| Q5 | wire 優先順位 (= v3.3 後補正) | ✅ **判断モード + 時刻偏好 → recentRhythm 次点 → energyRecovery 以後** |

### Q5 wire 優先順 (= CEO 補正、 推奨理由)

| Order | Field | Source module | 推奨理由 |
|---|---|---|---|
| 1st | `judgmentMode` | `axisRegistry` + `axisInferenceEngine` | 即効性高、 P1/P2/P3 個別化に直結 (= 「集中型」 「関係エネルギー型」 等が明確) |
| 1st | `timePreference` | `chronotypeFitness` | 即効性高、 anchor 時刻と直結 (= 「朝強い user の夜予定」 等の対比) |
| **2nd (= 次点)** | **`recentRhythm`** | **`lifeContext` (= W1 直近 7-14 日)** | **直近の状態 reflection が P4 中庸型の 「中の動き」 visible 化に寄与する可能性 (= v3.3 失敗後 補正)** |
| 3rd | `energyRecovery` | `axisRegistry` (= traitTone 経由) | 後段、 P1/P2 の補助 |
| 4th 以後 | psycheTone / archetype / 等 | 各 module | 段階的に拡張 (= 別 Step) |

## 6.5 Step 3 終了後 報告 必須 4 項目 (= CEO 確定、 2026-05-25)

| # | 項目 | 判定基準 |
|---|---|---|
| 1 | **real PM で P3/P4 がどこまで上がったか** | strict 3.5 達成 / near-pass / 未達 を明示 |
| 2 | **P1/P2 regression なしか** | v3.2 base (P1=4.23 / P2=4.04) からの低下幅 |
| 3 | **naturalness / personalness / non_pushy の 3 軸** | 平均値 + Profile 別 + v3.2 synthetic 比 |
| 4 | **実 PM 由来で効いた field は何か** | 「judgmentMode が効いた / timePreference が効いた / recentRhythm が効いた」 等の効き具合分析 |

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
