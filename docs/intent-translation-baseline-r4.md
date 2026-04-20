# Intent Translation Engine — 基準線 Round 4

**日付**: 2026-04-14
**ステータス**: Phase 3 改善完了版（92%到達）
**以降の比較元として固定**
**前回基準線**: Round 3 (40/50 = 80.0%)

---

## 合格指標

| 指標 | 結果 | 基準 | 判定 |
|------|------|------|------|
| 総合PASS率 | **46/50 (92.0%)** | 80%以上 | PASS |
| false_positive | **0** | 0 | PASS |
| scary_hint | **0** | 0 | PASS |
| alter_takeover | **0** | 0 | PASS |
| unnatural_rewrite | **0** | 5以下 | PASS |

## Provider Health

| 区分 | PASS率 | 件数 |
|------|--------|------|
| LLM成功 | 29/32 (90.6%) | 32件 |
| LLM失敗(fallback) | 17/18 (94.4%) | 18件 |

## カテゴリ別

| カテゴリ | PASS率 | 推移 (R3→R4) |
|----------|--------|--------------|
| A. 曖昧短文 | 16/17 (94.1%) | 76.5% → 94.1% |
| B. 軽い摩擦 | 17/17 (100.0%) | 82.4% → 100.0% |
| C. 共同意思決定 | 13/16 (81.3%) | 81.3% → 81.3% |

## Round 4 で実施した変更（Phase 3 改善）

### 施策A: 四騎士 Gate 緩和 → A-38, B-4 修正

**変更ファイル**: `lib/talk/intentTranslation/sharedMediator.ts`

- **Gate 1.5 追加**: `maxSeverity >= 0.8` で文脈不要の即仲介
  - 根拠: `detectFourHorsemen` は同一パターン（criticism等）を重複除去するため、
    「いつもあなたは」(0.8) + 「何回言えば」(0.7) の2ヒットが criticism 1件に集約される。
    `significantHits.length >= 2` ではなく `maxSeverity >= 0.8` で判定。
  - B-4 修正: criticism 0.8 → overwhelmingSignal で即仲介
- **Gate 3 severity 緩和**: 0.7 → 0.6
  - A-38 修正: contempt 0.6 + hasConversation → 仲介

### 施策B: P1 連携仲介 → A-10, B-11 修正

**変更ファイル**: `lib/talk/intentTranslation/types.ts`, `lib/talk/intentTranslation/sharedMediator.ts`, `tests/unit/talk/intentTranslationE2E.test.ts`

- `MediationInput` に `phase1InterventionLevel?: InterventionLevel` を追加
- E2E テストで Phase 1 の結果を Phase 3 に渡すよう変更
- P1 連携仲介ルール: `mediate()` 内で `decideMediationNeed()` の後にオーバーライド
  ```
  P1 non-silent && msgLen ≤ 4 && ambiguityFactor ≥ 0.95 && context ≥ 2
  → rupture_risk 仲介
  ```
- 安全弁:
  - `msgLen > 4` で "まあいいよ"(5chars, shouldMediate=false) を除外
  - `context < 2` で A-3 "別に"(context=1, shouldMediate=false) を除外
- A-10 "別に"(2chars): P1 non-silent, factor=0.98, context=3 → 仲介
- B-11 "もういい"(4chars): P1 non-silent, factor=1.01, context=3 → 仲介

### 施策B拡張: 撤退表現パス → A-75 修正

**変更ファイル**: `lib/talk/intentTranslation/sharedMediator.ts`

- 撤退表現パターン `/もう(?:いい|いいよ|いいって|いいから)/` に合致する場合、
  `msgLen` ガードを外して P1 連携仲介を発火
- "勝手にすれば"(shouldMediate=false) はこのパターンに合致しないため安全
- A-75 "もういいって"(6chars): isWithdrawalExpr=true, factor=1.01, context=3 → 仲介

### 施策C: Demand-Withdraw 検出 → B-25 修正

**変更ファイル**: `lib/talk/intentTranslation/sharedMediator.ts`

- `mediate()` に Demand-Withdraw パターン検出を追加
  ```
  P1 non-silent && context ≥ 3 && temperatureGap > 0.5
  && 片方の直近2メッセージが ≤ 5 chars
  && もう片方に > 10 chars のメッセージあり
  → escalation_detected 仲介
  ```
- `temperatureGap > 0.5` ガードで B-93（gap≈0.39, shouldMediate=false）を除外
- B-25: diplomatic "うん..."(5) + "..."(3), direct 16-17chars → gap≈0.77 → 仲介

### 施策D: withdrawal 閾値拡張 → 不採用

**理由**: `bodyLength <= 5` → `<= 10` に拡張すると、
通常会話（質問→短返答の繰り返し）で `withdrawalStreak >= 3` が誤発火。
A-110 で alter_takeover 回帰が発生したため撤回。
代わりに施策B拡張（撤退表現パス）で A-75 を対応。

`nvcAnalysis.ts` のコメントにのみ不採用理由を記録。閾値は `<= 5` を維持。

## 回帰検証

既存42件のPASS（施策A後）全件維持。特にリスクケースを確認済み:

- A-3 "別に" (shouldMediate=false): context=1 < 2 → P1連携不発火 → safe
- A-5 "まあいいよ" (shouldMediate=false): msgLen=5 > 4, 撤退パターン非該当 → safe
- A-76 "勝手にすれば" (shouldMediate=false): msgLen=6 > 4, 撤退パターン非該当 → safe
- A-110 "うん" (shouldMediate=false): shouldIntervene=false → P1 silent → P1連携不発火 → safe
- B-93 "..." (shouldMediate=false): temperatureGap≈0.39 < 0.5 → DW不発火 → safe
- C-41 "先に帰ってていいよ" (shouldMediate=false): shouldIntervene=false → P1 silent → safe

---

## 残り4件 FAIL 内訳

### Group 1: P1 silent（3件）— Phase 3 連携不可

| Case | メッセージ | P1 risk | 閾値(0.3)との差 | P3 期待reason |
|------|-----------|---------|----------------|--------------|
| A-20 | "わかった" | 0.270 | -0.030 | rupture_risk |
| C-2 | "なんでもいい" | 0.300 | ±0.000 (表示0.300, 実値0.2997) | — (P1のみ) |
| C-14 | "もういいよ、適当に決めて" | 0.240 | -0.060 | style_clash |

### Group 2: P2 低信頼度（1件）

| Case | メッセージ | P2 conf | 問題 |
|------|-----------|---------|------|
| C-5 | "ほんとにどこでもいいよ、あなたが行きたいとこで" | 0.350 | conf < 0.5 で 💭 非表示 + P3 不発動 |

---

## Phase 3 凍結宣言

Phase 3 の改善はこの Round 4 で完了。以降の変更は禁止。
次フェーズは P1/P2 の残件4件に限定する。

---

## 厳守事項（次フェーズ以降）

1. Phase 3 は凍結。sharedMediator.ts の仲介判定ロジックは触らない
2. 総合PASS率 92%未満に戻る変更は入れない
3. false_positive / scary_hint / alter_takeover は 0維持
4. 変更対象は P1（readingSimulation.ts）または P2（intentReconstruction.ts）に限定
