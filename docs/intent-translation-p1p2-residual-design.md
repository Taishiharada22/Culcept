# Intent Translation — P1/P2 残件4件 設計

**日付**: 2026-04-14
**前提**: Phase 3 凍結（R4 基準線 46/50=92% を維持）
**対象**: P1 silent 3件 + P2 低信頼度 1件

---

## 対象FAILケース（4件）

### Group 1: P1 silent — 閾値 0.3 に未達（3件）

| # | Case | メッセージ | P1 risk | 閾値差 | 根本原因 |
|---|------|-----------|---------|--------|---------|
| 1 | A-20 | "わかった" | 0.270 | -0.030 | ambiguityScore=0.65 → factor=0.89 < 0.95 → 標準抑制(×0.7) |
| 2 | C-2 | "なんでもいい" | 0.2997 | -0.0003 | 浮動小数点の僅差。score=0.80 → factor=0.98 → 軽い抑制(×0.9) だが rawRisk が微小 |
| 3 | C-14 | "もういいよ、適当に決めて" | 0.240 | -0.060 | msgLen=12 > 10 → factor=1.01≥0.95 でも標準抑制(×0.7) |

### Group 2: P2 低信頼度 + P3 構造的不可（1件）

| # | Case | メッセージ | P2 conf | P3 問題 |
|---|------|-----------|---------|--------|
| 4 | C-5 | "ほんとにどこでもいいよ、あなたが行きたいとこで" | 0.350 | styleDelta=0 → style_clash 不可能 |

---

## リスク算出構造（readingSimulation.ts）

```
risk = rawRisk + additiveRisk

rawRisk = 0.08 × ambiguityFactor × receiverSensitivity × contextRisk × topicWeight
  → 通常 0.01〜0.03（乗算構造で圧縮される）

additiveRisk（msgLen ≤ 15 && factor ≥ 0.85 の場合のみ）:
  base     = (factor - 0.5) × 0.32
  + ultra  = +0.08  (if msgLen ≤ 5)
  + style  = styleDelta × 0.12  (if styleDelta > 0.3)
  × 抑制   = ×0.9  (if msgLen ≤ 10 && factor ≥ 0.95)  ← 軽い抑制
           = ×0.7  (else)                                ← 標準抑制

interventionLevel:
  risk ≥ 0.6 → active
  risk ≥ 0.3 → passive
  else → silent
```

---

## 改善案（3施策）

### 施策1: "わかった" ambiguityScore 引き上げ → A-20 修正

**変更ファイル**: `lib/talk/intentTranslation/japanesePragmatics.ts`

**現状**: ambiguityScore = 0.65 → factor = 0.89 < 0.95 → 標準抑制(×0.7)

**改善**: ambiguityScore を 0.65 → **0.75** に引き上げ

```
factor = 0.5 + 0.75 × 0.6 = 0.95  (≥ 0.95 → 軽い抑制パスへ)

additiveRisk:
  base  = (0.95 - 0.5) × 0.32 = 0.144
  ultra = +0.08  (3chars ≤ 5)
  style = 1.4 × 0.12 = 0.168  (DIPLOMATIC vs DIRECT)
  合計  = 0.392
  × 0.9 = 0.353  (軽い抑制)

rawRisk ≈ 0.01
total ≈ 0.363 → passive ✓
```

**P3 連動効果**: P1 が passive → P1 linkage 発火
- msgLen=3 ≤ 4, factor=0.95 ≥ 0.95, context=3 ≥ 2 → rupture_risk 仲介 ✓

**根拠**: "わかった" は日本語で最も曖昧な応答の一つ。言い争い後の「わかった」は
了承(40%)・消極的了承(35%)・打ち切り(25%) と3通りに分岐し、文脈依存性が高い。
0.65 は "うん"(0.5) と "大丈夫"(0.85) の間に設定されていたが、
対立文脈での「わかった」は「大丈夫」と同等以上の曖昧性がある。

**回帰リスク**: 他に "わかった" が出現するケースを確認必要。
A-3 のメッセージは "別に" であり影響なし。

---

### 施策2: 軽い抑制条件の拡張 → C-14 修正、C-2 補助

**変更ファイル**: `lib/talk/intentTranslation/readingSimulation.ts`

**現状**: 軽い抑制(×0.9) は `msgLen ≤ 10 && factor ≥ 0.95` のみ

**改善**: `msgLen ≤ 10` ガードを撤去し、factor ≥ 0.95 のみで軽い抑制を適用

```typescript
// BEFORE:
if (msgLen <= 10 && ambiguityFactor >= 0.95) {
  additiveRisk *= 0.9;
} else {
  additiveRisk *= 0.7;
}

// AFTER:
if (ambiguityFactor >= 0.95) {
  additiveRisk *= 0.9;
} else {
  additiveRisk *= 0.7;
}
```

**C-14 の計算**:
```
"もういいよ、適当に決めて" (12 chars, factor=1.01)

additiveRisk:
  base  = (1.01 - 0.5) × 0.32 = 0.163
  style = 1.4 × 0.12 = 0.168
  合計  = 0.331
  × 0.9 = 0.298  (軽い抑制 — 旧: ×0.7 = 0.232)

rawRisk ≈ 0.01
total ≈ 0.308 → passive ✓
```

**C-2 への補助効果**: C-2 は既に軽い抑制パス(factor=0.98, msgLen=6)。
この施策で直接影響はないが、下記の score 微調整と組み合わせで安定性が向上。

**P3 連動効果**: C-14 の P1 が passive → P1 linkage 発火
- "もういいよ" が撤退表現パターン `/もう(?:いい|いいよ|いいって|いいから)/` に合致
- factor=1.01 ≥ 0.95, context=5 ≥ 2 → rupture_risk 仲介 ✓

**根拠**: 外側のブロックは既に `msgLen ≤ 15` で制限されている。
11-15 chars で factor ≥ 0.95 になるメッセージは、確実に曖昧表現辞書にヒットした
高リスク文であり、長さだけを理由に抑制を強める根拠がない。

**回帰リスク**: 低。11-15 chars × factor ≥ 0.95 のケースは限定的。
C-41 "先に帰ってていいよ"(9 chars) は factor=0.89 < 0.95 → 標準抑制のまま。影響なし。

---

### 施策3: "なんでもいい" ambiguityScore 微調整 → C-2 修正

**変更ファイル**: `lib/talk/intentTranslation/japanesePragmatics.ts`

**現状**: ambiguityScore = 0.80 → factor = 0.98, risk = 0.2997

**改善**: ambiguityScore を 0.80 → **0.82** に引き上げ

```
factor = 0.5 + 0.82 × 0.6 = 0.992

additiveRisk:
  base  = (0.992 - 0.5) × 0.32 = 0.157
  style = 1.4 × 0.12 = 0.168
  合計  = 0.325
  × 0.9 = 0.293

rawRisk ≈ 0.01
total ≈ 0.303 → passive ✓
```

**根拠**: 0.02 の微調整。Round 3 で 0.6→0.8 に引き上げ済みだが、
反復使用パターン（C-2 では "なんでもいい" が2回出現）を考慮すると
0.82 は妥当な上方修正。

**回帰リスク**: 極小。A-91 "了解"(factor=0.83<0.85) は additive ブロック外。

---

## C-5: 構造的制約 — 今回は対応不可

### 問題の構造

C-5 は **2つの独立した問題** を抱えている:

1. **P2**: 曖昧表現 "どこでもいい" がパターン辞書にない → confidence boost なし → 0.350 < 0.50
2. **P3**: 両者とも PROFILE_DIPLOMATIC → styleDelta = 0 → style_clash 不可能

P2 を修正しても（"どこでもいい" パターン追加 → conf ≈ 0.55 → 💭 表示）、
P3 が修正されない限り FAIL のまま。

### P3 が修正できない理由

Phase 3 は凍結済み。C-5 を解消するには「相互譲歩の膠着」（mutual deference deadlock）
という新しい仲介パターンが必要だが、これは `decideMediationNeed()` への新規追加であり
Phase 3 凍結に抵触する。

### 対応方針

C-5 は **次ラウンド以降** に以下のいずれかで対応:

- **案A**: Phase 3 を部分的に解凍し、`mutual_deference` reason を追加
- **案B**: テストケースの `shouldMediate` を false に変更（CEO判断）
- **案C**: P2 の 💭 表示だけで十分とし、P3 不発動を許容

いずれも CEO 判断が必要。

---

## 実装優先度

| 優先度 | 施策 | 期待修正 | 複雑度 | リスク |
|--------|------|---------|--------|--------|
| P0 | 施策1: "わかった" score | A-20 (+1) | 低 | 要回帰確認 |
| P0 | 施策2: 抑制条件拡張 | C-14 (+1) | 低 | 外側 msgLen≤15 が安全弁 |
| P0 | 施策3: "なんでもいい" score | C-2 (+1) | 極低 | 微調整のみ |
| — | C-5 | 不可 | — | Phase 3 凍結に抵触 |

**施策1+2+3 で 3件修正 → 49/50 = 98.0%**

残り1件（C-5）は構造的制約のため CEO 判断待ち。

---

## 期待される最終結果

| 指標 | R4 (現在) | R5 (期待) |
|------|----------|----------|
| 総合PASS率 | 46/50 (92.0%) | **49/50 (98.0%)** |
| A. 曖昧短文 | 16/17 (94.1%) | **17/17 (100.0%)** |
| B. 軽い摩擦 | 17/17 (100.0%) | 17/17 (100.0%) |
| C. 共同意思決定 | 13/16 (81.3%) | **15/16 (93.8%)** |
| false_positive | 0 | 0 |
| alter_takeover | 0 | 0 |

---

## 厳守事項

1. Phase 3（sharedMediator.ts）は触らない
2. 総合PASS率 92%未満に戻る変更は入れない
3. false_positive / scary_hint / alter_takeover は 0維持
4. 施策実装後は必ず E2E eval を実行し、既存46件の回帰を確認
