# Intent Translation Engine — 基準線 Round 3

**日付**: 2026-04-14
**ステータス**: 基準達成版（80%合格ライン到達）
**以降の比較元として固定**

---

## 合格指標

| 指標 | 結果 | 基準 | 判定 |
|------|------|------|------|
| 総合PASS率 | **40/50 (80.0%)** | 80%以上 | PASS |
| false_positive | **0** | 0 | PASS |
| scary_hint | **0** | 0 | PASS |
| alter_takeover | **0** | 0 | PASS |
| unnatural_rewrite | **0** | 5以下 | PASS |

## Provider Health

| 区分 | PASS率 | 件数 |
|------|--------|------|
| LLM成功 | 24/32 (75.0%) | 32件 |
| LLM失敗(fallback) | 16/18 (88.9%) | 18件 |

## カテゴリ別

| カテゴリ | PASS率 | 推移 |
|----------|--------|------|
| A. 曖昧短文 | 13/17 (76.5%) | 58.8% → 76.5% |
| B. 軽い摩擦 | 14/17 (82.4%) | 70.6% → 82.4% |
| C. 共同意思決定 | 13/16 (81.3%) | 56.3% → 81.3% |

## Round 3 で実施した変更

### 1. japanesePragmatics.ts

- **"なんでもいい" ambiguityScore**: 0.6 → 0.8（低すぎて検出漏れ）
- **"まあいいよ" 複合パターン追加**: score 0.85（"まあ"と"いいよ"の個別パターンでは捕捉不可）
- **"えっ" パターン追加**: score 0.45（驚き+困惑の曖昧表現）
- **摩擦パターン3件追加**:
  - `unfair_burden` "ばっかり" (Group 1, score 0.30) — C-10, C-28 修正
  - `demand_acknowledgment` "ちゃんと言って" (Group 2, score 0.30) — C-70 修正
  - `anger_expression` "ふざけないで" (Group 2, score 0.30) — C-83 修正

### 2. readingSimulation.ts

- **ambiguityFactor 閾値**: 0.95 → 0.85（"了解" 0.83 は安全圏、"..." 0.89 は検出対象に）
- **contextRisk 抑制の段階化**:
  - 超短文(≤10) + 高曖昧(≥0.95): ×0.9（確実な曖昧表現は軽い抑制のみ）
  - それ以外: ×0.7（標準抑制を維持）
  - 回帰防止: C-41 "先に帰ってていいよ" (factor=0.89<0.95) は標準抑制 → PASS維持

## 回帰検証

既存31件のPASS全件維持。特に以下のリスクケースを確認済み:

- A-91 "了解" (shouldIntervene=false): factor=0.83 < 0.85 → additive未発火 → safe
- A-79 "気にしないで" (shouldIntervene=false): 曖昧表現未検出 → safe
- C-41 "先に帰ってていいよ" (shouldIntervene=false): factor=0.89 < 0.95 → 標準抑制 → safe

---

## 残り10件 FAIL 内訳

### Group 1: Phase 3 不発動（6件）— P1, P2 は通過済み

| Case | メッセージ | 期待 reason | escalation | 不発動の原因 |
|------|-----------|------------|------------|-------------|
| A-10 | "別に" | rupture_risk | 0.000 | 会話に攻撃性なし。withdrawal パターンだが streak<3 |
| A-38 | "はいはい" | four_horsemen | 0.050 | contempt 0.6 検出だが Gate 3 不通過（単一パターン, severity<0.7） |
| A-75 | "もういいって" | repeated_pattern | 0.067 | 繰り返し話題検出ロジックなし |
| B-4 | "いつもあなたはそうだよね。何回言えばわかるの" | four_horsemen | 0.000 | criticism 0.8+0.7 だが Gate 2 不通過（context 1ターン） |
| B-11 | "もういい" | rupture_risk | 0.033 | 攻撃性なし。withdrawal/despair パターン未捕捉 |
| B-25 | "ちゃんと答えてよ" | escalation_detected | 0.056 | Demand-Withdraw パターン未検出 |

### Group 2: P1 閾値ギリギリ + P3 不発動（2件）

| Case | メッセージ | P1 risk | P3 期待 reason | 備考 |
|------|-----------|---------|---------------|------|
| A-20 | "わかった" | 0.270 | rupture_risk | factor=0.89, 標準抑制(×0.7)で 0.3 未達 |
| C-14 | "もういいよ、適当に決めて" | 0.240 | style_clash | msgLen=12>10 → 標準抑制。escalation=0.024<0.1 で style_clash gate 不通過 |

### Group 3: その他（2件）

| Case | メッセージ | 問題 | 備考 |
|------|-----------|------|------|
| C-2 | "なんでもいい" | P1 risk≈0.2997 (表示0.300) | PASSIVE_THRESHOLD=0.3 にわずかに未達。P2は通過 |
| C-5 | "ほんとにどこでもいいよ、あなたが行きたいとこで" | P2 conf=0.350 + P3 | 外交型同士で styleDelta=0 → style_clash不発。conf<0.5でバブル非表示 |

---

## Phase 3 不発動の構造的原因

### 原因1: escalation.level が低すぎる
`assessEscalation()` は conversationContext（最新メッセージを含まない）の攻撃性スコアから level を算出。
日常的な口論（「なんで怒ってるの」「怒ってない」等）は四騎士パターンに合致せず、level が 0.00-0.07 に留まる。
MEDIATION_ESCALATION_THRESHOLD=0.5 に全く届かない。

### 原因2: Gate 2/Gate 3 が文脈ゲートとして厳しすぎる
B-4（criticism 0.8+0.7 の2パターン）は Gate 3 の `distinctPatterns>=2` を満たすが、
Gate 2 の `hasConversation` チェックで context 1ターンのため不通過。
A-38（contempt 0.6）は Gate 2 は通過するが Gate 3 の severity<0.7 で不通過。

### 原因3: 非攻撃的な rupture/withdrawal パターンの検出不足
A-10("別に"), B-11("もういい"), A-20("わかった") は攻撃性が低く四騎士に該当しないが、
関係破綻のリスクは高い。現在の Phase 3 は「攻撃性ベース」の検出に偏っており、
「撤退・諦め・打ち切り」パターンの検出が弱い。

### 原因4: repeated_pattern 検出ロジックが存在しない
A-75 の「同じ話題の堂々巡り」を検出する仕組みがない。

---

## 厳守事項（次フェーズ以降）

1. Phase 1 / Phase 2 は原則触らない
2. 総合PASS率 80%未満に戻る変更は入れない
3. false_positive / scary_hint / alter_takeover は 0維持
4. Phase 3 改善は設計先行（閾値調整前にケース別定義）
