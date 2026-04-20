# Intent Translation — Phase 3 仲介改善設計

**日付**: 2026-04-14
**前提**: Round 3 基準線 40/50=80% を維持する範囲で改善
**対象**: Phase 3 不発動 6件 + P1連携 2件 + その他 2件

---

## 対象FAILケース（10件）

### Group 1: Phase 3 のみ不発動（6件）

| # | Case | メッセージ | 期待reason | escalation | 根本原因 |
|---|------|-----------|------------|------------|---------|
| 1 | A-38 | "はいはい" | four_horsemen | 0.050 | Gate 3 不通過: contempt 0.6 < 0.7, distinctPatterns=1 |
| 2 | B-4 | "いつもあなたはそうだよね。何回言えばわかるの" | four_horsemen | 0.000 | Gate 2 不通過: context=1ターン |
| 3 | A-10 | "別に" | rupture_risk | 0.000 | 攻撃性なし。撤退パターン未検出 |
| 4 | B-11 | "もういい" | rupture_risk | 0.033 | 同上 |
| 5 | B-25 | "ちゃんと答えてよ" | escalation | 0.056 | Demand-Withdraw パターン未検出 |
| 6 | A-75 | "もういいって" | repeated_pattern | 0.067 | 繰り返し話題検出なし |

### Group 2: P1 + P3（2件）

| # | Case | メッセージ | P1 risk | P3 期待reason |
|---|------|-----------|---------|--------------|
| 7 | A-20 | "わかった" | 0.270 | rupture_risk |
| 8 | C-14 | "もういいよ、適当に決めて" | 0.240 | style_clash |

### Group 3: その他（2件）

| # | Case | メッセージ | 問題 |
|---|------|-----------|------|
| 9 | C-2 | "なんでもいい" | P1 risk≈0.2997（0.3に僅差未達） |
| 10 | C-5 | "ほんとにどこでもいいよ、あなたが行きたいとこで" | P2 conf=0.350 + P3 style_clash |

---

## 改善案（4施策）

### 施策A: 四騎士 Gate 緩和（→ A-38, B-4 修正）

**現状**: Gate 1(severity≥0.5) → Gate 2(hasConversation) → Gate 3(strongSignal)

**問題**:
- A-38: contempt 0.6 ≥ 0.5 → Gate 1通過, Gate 2通過(temperatureGap>0), Gate 3不通過(severity<0.7, patterns=1, no cascade)
- B-4: criticism 0.8+0.7 → Gate 1通過, Gate 2不通過(context=1ターン)

**改善案A-1**: Gate 2 に高確信度バイパスを追加

```
// Gate 2 バイパス: 複数の高severity パターンが同時出現 → 1ターンでも明確に危険
const multipleHighSeverity = significantHits.length >= 2
  && significantHits.every(h => h.severity >= 0.6);
if (multipleHighSeverity) {
  // Gate 2 をスキップして Gate 3 へ
}
```

→ B-4 修正: criticism 0.8 + 0.7 の2パターン、両方 ≥ 0.6 → バイパス

**改善案A-2**: Gate 3 に P1 risk 連携を追加

```
// P1 が介入判定済み → Gate 3 の severity 閾値を緩和
// Phase 1 が「この表現は危険」と判断 + 四騎士検出 → 仲介すべき
const p1Intervened = phase1Result.interventionLevel !== "silent";
if (p1Intervened && maxSeverity >= 0.5) {
  strongSignal = true;
}
```

→ A-38 修正: P1=active (risk≈0.35) + contempt 0.6 ≥ 0.5 → strongSignal=true

**影響範囲**: Gate 1 の severity≥0.5 は維持するため、低severity の日常表現（はい 0.3, 笑 0.4）は引き続きブロック。

### 施策B: P1 risk 連携仲介（→ A-10, B-11, A-75 修正、A-20 部分修正）

**現状**: Phase 3 は攻撃性ベースの escalation のみ。撤退・諦め表現は検出できない。

**改善案**: `decideMediationNeed()` に P1 結果連携ルールを追加

```
// P1 risk 連携: Phase 1 が介入判定 + 会話に緊張の兆候 → 仲介
// Phase 1 が「送信者に伝わり方注意」と判断している = ルール層の確認済み
// 会話緊張の兆候: escalation.level > 0 OR temperatureGap > 0.2 OR withdrawalStreak >= 1
if (phase1Result.interventionLevel !== "silent") {
  const hasTension = escalation.level > 0
    || escalation.temperatureGap > 0.2
    || escalation.withdrawalStreak >= 1;
  if (hasTension) {
    return {
      shouldMediate: true,
      reason: "rupture_risk",
      urgency: phase1Result.interventionLevel === "active" ? "medium" : "low",
    };
  }
}
```

**期待結果**:
- A-10 "別に": P1=passive/active, withdrawalStreak=1 ("別に"=2chars) → 条件成立
- B-11 "もういい": P1=active, level=0.033>0 → 条件成立
- A-75 "もういいって": P1=active, temperatureGap確認必要
- A-20 "わかった": P1=silent (risk=0.270) → 条件不成立。この施策では救えない

**注意**: この施策には Phase 1 の結果を Phase 3 に渡すインターフェース変更が必要。
現在の `MediationInput` に `phase1Result` を追加するか、P1 risk スコアを直接渡す。

### 施策C: Demand-Withdraw 検出（→ B-25 修正）

**現状**: 「一方が追い詰め、他方が逃げる」パターンの検出がない。

**改善案**: `assessEscalation()` に Demand-Withdraw 検出を追加

```
// Demand-Withdraw 検出:
//   - receiver の末尾メッセージが短文化（≤5chars が2連続）
//   - sender のメッセージに要求/追及パターン
//   → escalation.level に +0.2
```

B-25 の文脈:
- diplomatic-001: "うん..." (3chars) → "..." (1-3chars) — 短文化
- direct-001: "意見を聞きたいんだけど" → "ちゃんと答えてよ" — 要求パターン
- → demand_withdraw 検出 → level boost → 仲介トリガー

**検出パターン**:
- ある話者の直近2メッセージが `bodyLength <= 5` AND
- 相手の直近メッセージに friction pattern の `demand_properly` OR `criticism_repetition` が検出
- → demand_withdraw として `escalation.level += 0.2`

### 施策D: withdrawalStreak の閾値拡張（→ A-75 補助）

**現状**: `bodyLength <= 5` でカウント

**改善案**: `bodyLength <= 10` に拡張

**理由**: "もういいって" (6chars), "わかった" (3chars), "もういい" (4chars) 等の撤退表現は
5chars 前後に集中。閾値を 10 に広げることで、これらを streak にカウントできる。

**リスク**: 通常の短文応答も streak にカウントされるが、streak >= 3 の判定は維持するため
false positive は限定的。また施策B の条件（streak >= 1 + P1 介入済み）と組み合わせることで安全性を確保。

---

## 実装優先度

| 優先度 | 施策 | 期待修正件数 | 複雑度 | リスク |
|--------|------|-------------|--------|--------|
| P0 | A: Gate 緩和 | 2件 (A-38, B-4) | 低 | Gate 1 severity≥0.5 が安全弁 |
| P1 | B: P1 連携仲介 | 3件 (A-10, B-11, A-75) | 中 | インターフェース変更必要 |
| P2 | C: Demand-Withdraw | 1件 (B-25) | 中 | 新パターン検出の追加 |
| P3 | D: withdrawal 閾値 | 補助的 | 低 | 施策B との組み合わせ |

**P0+P1+施策D で 5件修正 → 45/50=90%**
**P0+P1+P2+D で 6件修正 → 46/50=92%**

残り4件（A-20, C-2, C-5, C-14）は P1 閾値調整 or P2 改善が必要。厳守事項（P1/P2 原則不可触）を踏まえ、次フェーズ以降で個別検討。

---

## 厳守事項

1. Phase 1 / Phase 2 のコードは触らない
2. 総合PASS率 80%未満に戻る変更は入れない
3. false_positive / scary_hint / alter_takeover は 0維持
4. 施策実装後は必ず E2E eval を実行し、既存40件の回帰を確認
