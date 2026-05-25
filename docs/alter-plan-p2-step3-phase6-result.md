# P2 Step 3 Phase 6 — Real PM Smoke 結果

**Status**: smoke 完了、 wiring PASS / personalization quality FAIL 判定
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Smoke user**: aneurasync@outloo.com (= userId prefix `1c6ef878***`)
**Scope**: Step 3 Stage A + B + Phase 5 (= Option A' Plan-specific gate) の **実機 wiring 動作確認 + 個別化 quality 評価**。

---

## 0. 結論 (= GPT 解釈 frame 適用)

| Layer | 判定 |
|---|---|
| **Wiring (= 配線)** | **✓ PASS** (= real PM 読み出し + Plan 接続 + framing 格上げ 全 OK) |
| **Personalization quality (= 個別化)** | **✗ FAIL** (= PM ON / OFF で alterNote 大差なし) |
| **「synthetic 限界 vs prompt 弱さ」 切り分け** | **prompt 弱さ濃厚** (= real PM でも generic 寄り、 v3.3 失敗仮説と整合) |

---

## 1. 観測 9 項目 結果

| # | 項目 | 観測値 | 判定 |
|---|---|---|---|
| 1 | real PM 抽出成功 | `observedAxesCount: 39`, `judgmentMode: '集中型'`, `timePreference: '中庸'` | ✓ |
| 2 | Phase gate 正常 | `rawHdmPhase: 0` 維持、 `stableEnabledForPlan: true` (= Plan gate 解放) | ✓ |
| 3 | V2 path 発火 | `path: 'v2'`, `effectiveFramingHint: 'soft_personal_with_hedge'`, `hasStable: true` | ✓ |
| 4 | LLM 出力 「あなたらしさ」 反映 | PM ON 「夜のカフェで、静かに読書する時間」 / PM OFF 「夜カフェで静かに読書を楽しみましょう」 | **✗ (= 文末文体のみ差、 核は同) ** |
| 5 | UI render 正常 | console error 0、 popcorn なし | ✓ |
| 6 | P1/P2 regression なし | PM OFF も既存 V1 path 通常動作 | ✓ |
| 7 | latency 悪化なし | cache hit 多発 (= 同 prompt なので合理的) | ✓ |
| 8 | fallback 維持 | flag OFF (= PM OFF) で完全に V1 baseline 動作 | ✓ |
| 9 | 抽出失敗時 meta-only 落ち | adapter test 26/26 PASS、 production fail-open 動作確認済 | ✓ |

**Wiring 8/9 PASS、 項目 4 (= 個別化) のみ FAIL**

---

## 2. PM ON / OFF 比較 (= GPT 指示の A/B 判定)

| state | alterNote text | 観測日数 |
|---|---|---|
| **PM ON** (= V2 path、 Plan-gate 経由 stable 注入) | 「夜のカフェで、 静かに読書する時間」 | 5 日全て同 |
| **PM OFF** (= V1 path、 baseline) | 「夜カフェで静かに読書を楽しみましょう」 | 6 日全て同 |

### 差分分析

| 観点 | ON | OFF | 評価 |
|---|---|---|---|
| 核となる要素 (= 夜/カフェ/静か/読書) | 全て含む | 全て含む | 同一 |
| 文体 | 観測寄り (= 「時間」 で締め) | 押し付け系 (= 「楽しみましょう」) | ON が contract 通り、 OFF は genericSelfHelpPatterns 境界 |
| 「集中型」 (= profile A) reflection | △ 「静か」 のみ | 「静か」 あり | profile 差なし (= 「静か」 は category reflection 由来) |
| 「中庸時刻偏好」 reflection | なし | なし | 19 時 anchor で偏向押し付けなし → OK だが個別性立たず |
| 日ごと差 | 0 (= 全日同文) | 0 (= 全日同文) | cache 支配、 stable layer のみでは日ごと差なし (= 設計通り) |

### GPT 解釈 frame 照合

> 「ほぼ同じ文」 → stable fields の prompt 反映が弱い → prompt 強化が先

**判定確定**: 今回の比較で **「ほぼ同じ文」**。 「集中型」 「中庸時刻偏好」 の文への具象化が不十分。

---

## 3. CEO 報告必須 4 項目 (= readiness §6.5)

### ① real PM で P3/P4 がどこまで上がったか
**観測不能 (= 1 user / 1 anchor smoke では P3/P4 strict 3.5 判定は無理)**。
ただし文面比較から、 集中型 + 中庸時刻偏好 が **明確には alterNote に表現されていない**。 synthetic harness で 5 user × 50 case を再走すれば数値判定可能だが、 まずは prompt 改善後に再評価が合理的。

### ② P1/P2 regression なしか
**regression なし** ✓
- PM OFF (= V1 path) は既存 Step 1/2 v3.2 と同等動作
- console error / popcorn / latency 悪化なし
- flag OFF 状態は完全互換

### ③ naturalness / personalness / non_pushy 3 軸所感
| 軸 | PM ON | PM OFF | 評価 |
|---|---|---|---|
| naturalness | 良 (= 「時間」 で観測寄り、 自然) | 並 (= 「楽しみましょう」 は genericSelfHelp 境界、 やや押し付け) | ON 優 |
| **personalness** | **弱 (= 集中型らしさ visible しない)** | **弱 (= profile 不在)** | **ON 微優 / 実質同等** |
| non_pushy | 良 (= 「時間」 押し付けなし) | 弱 (= 「ましょう」 押し付け) | ON 明確優 |

**主要発見**: personalness 軸が両方とも弱い。 V2 contract (= 押し付け禁止) は効いているが、 個別化への投影が不十分。

### ④ 実 PM 由来で効いた field
- **judgmentMode (= 集中型)**: prompt に注入されている (= dev log `stableFields.judgmentMode: '集中型'` 確認)、 ただし alterNote 文への寄与は **「静か」 1 語のみ** (= V1 でも出る、 偶然)
- **timePreference (= 中庸)**: prompt に注入されているが、 文への寄与は **観測不能** (= 19 時 anchor で偏向なしは中庸らしいが、 中庸を明示する語彙なし)
- **traitTone (= 未 wire)**: null

**結論**: 注入されているが、 **prompt が profile 情報を 「文の具体的選語」 に変換しきれていない**。

---

## 4. 仮説 確定 (= 「synthetic 限界 vs prompt 弱さ」 切り分け)

### Step 3 開始時の主目的
> synthetic で 2 回試行 (= v3.2 / v3.3) で P4 中庸型 strict 3.5 達成できず。
> real Stargazer 軸データ (= 「中庸の中の個性」 が明確) なら P3/P4 が adoption pass する可能性。
> real PM で達成 → synthetic 限界が主因 (= prompt は正しい)
> real PM でも未達 → prompt 弱さが主因 (= v3.4 必要)

### 結論
**prompt 弱さが主因** (= v3.4 必要)

根拠:
- aneurasync@outloo.com は **39 軸観測** (= 軸データ豊富、 synthetic profile よりも具体的)
- judgmentMode = 集中型、 timePreference = 中庸 が prompt に注入済
- それでも PM OFF baseline と alterNote が **核 95% 同一**
- v3.3 P4 後退仮説 (= 「振り幅 / バランス」 hint が抽象すぎ + 機械的反復) は real PM 環境でも再現

---

## 5. 次の意思決定 — CEO 判断仰ぐ

GPT 指示:
> 3. その場合は prompt 強化か Stage C (`recentRhythm`) のどちらが先か判断

### Option I: prompt 強化 (= v3.4) **先行**
- Plan 専用 stable section の prompt 設計を **「judgmentMode が文の具体的選語に必ず反映」 する** 強制設計に
- 例: 「集中型 + カフェ 予定」 → 「学びに沈む」 「ひとりの没頭」 等を **必須** vocabulary として injection
- 効果: prompt 改善で全 profile に効く、 Stage C より低リスク
- リスク: v3.3 の轍 (= 過剰指示でテンプレ感増加) を踏まないよう慎重設計必要

### Option II: Stage C (= recentRhythm) **先行**
- WIRE_RECENT_RHYTHM = true で lifeEvents + innerWeather → 直近 rhythm 短 tag
- 効果: 日ごと差が出る、 「最近の状態」 で文を変化させられる
- リスク: prompt の根本弱さは未解決 (= rhythm 注入しても核は同じになる懸念)

### Option III: 両方並行
- prompt 強化 + Stage C を別 branch で同時着手
- 効果: 両方の効果を独立に測定可能
- リスク: 1 branch で 2 軸変更 → 何が効いたか切り分け不能 (= v3.3 の轍)

### 私の推奨 (= GPT 指針整合)
**Option I (= prompt 強化 v3.4 先行)**:
- stable injection の prompt 反映が弱いことが今回の主要発見
- recentRhythm を加えても、 同じ prompt 弱さで rhythm も埋もれる懸念
- prompt 強化は外科的 + 全 profile に効く + 1 軸変更で効果切り分け clean

---

## 6. 不変原則 維持 確認

- 既存 Stargazer module 完全 frozen ✓
- DB write 0 ✓
- 既存 frozen file 不触 ✓
- safe degrade 動作 ✓ (= flag OFF で完全 V1 baseline)
- alter plan scope 限定 ✓

---

## 7. 次

1. 本結果 docs を atomic commit
2. CEO 判断仰ぐ (= Option I / II / III)
3. 判断後の readiness 起草 (= v3.4 か Stage C か)
4. 実装 + 再 smoke → 採点 → preview canary GO 判定

dev server kill 済 (= clean state)。
branch: `feat/alter-plan-p2-llm-step3-real-pm`、 最新 commit `76cbb492` (= Option A' Plan-gate)。
