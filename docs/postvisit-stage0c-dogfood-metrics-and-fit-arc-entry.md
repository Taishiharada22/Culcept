# 評価OS Stage 0-C — dogfood 計測設計 + Fit-Arc entry criteria

作成: 2026-06-22 / 状態: **docs + pure instrumentation helper（実 dogfood は全実装完了後・本書は計測の準備のみ）**
対象: post-visit 答え合わせ器官（Stage 0 / 0-B）／ helper: `lib/plan/postVisit/postVisitMetrics.ts`

> ★前提（CEO 補足）: 実 dogfood（ユーザー利用）は **すべての実装が完了し UX に繋がってから** 開始する。
> dogfood のために開発を中断しない。本書は「その時に使える計測」を pure に整えるもの。Fit-Arc/Aneura-star は作らない。

---

## 1. なぜ測るか

deep research の結論: post-visit 答え合わせ器官が cold-start の生死を分ける。生死は **1つの経験的問い**に還元される
——「決定後の prompt に、ユーザーは実際に答えるか」。Oura（睡眠＝毎晩自動）はこれを満たし、16Personalities（1回で終わる）は満たさない。
**この数字（post-decision-observation rate）が出るまで、Fit-Arc に進むのは false-aliveness のリスク**。だから先に測る。

---

## 2. funnel（区別する状態）

1 回の「決定後の機会」は以下のいずれかになる（store の elicitLog に local 記録・PII なし）:

```
決定後の機会
 ├─ suppressed   … shouldElicit が抑止（理由付き: sensitive/home_work/habitual/high_fatigue/after_skip/recent_same）
 └─ shown        … prompt を実表示（funnel の分母）
       ├─ answered  … 1タップ回答（= 観測獲得）
       ├─ skipped   … 「今は答えない」
       └─ (無反応)  … どちらも押さず離脱（shown のみ）
別軸: mirror_shown … 観測の鏡を実表示した回数
```

イベントは `recordPromptShown / recordPromptSuppressed(reason) / recordPostVisitObservation(=answered) / recordPostVisitSkip(=skipped) / recordMirrorShown` で記録。全て **flag OFF / SSR で no-op**。

---

## 3. 主指標（dogfood metrics）

`computeDogfoodMetrics(loadElicitLog(), loadPostVisitObservations())` が pure 集計で返す:

| 指標 | 定義 | 意味 |
|---|---|---|
| **post-decision-observation rate（主指標）** | `answered / promptShown` | 決定後の prompt のうち、実際に観測を残した割合。**Oura か 16Personalities かを分ける単一の数字** |
| answer rate | `answered / promptShown`（主指標と同義・明示用） | 答えてくれる割合 |
| skip rate | `skipped / promptShown` | 「今は答えない」割合（高すぎ＝邪魔の疑い） |
| suppress rate | `suppressed / (suppressed + promptShown)` | trigger 適格機会のうち抑止された割合（**高すぎ＝効きすぎて出ない**） |
| suppress by reason | 抑止理由別件数 | どの suppress が効きすぎか診断 |
| mirror activation count | `mirror_shown` | 観測の鏡が自然に出ているか |
| **redaction violation count** | `countRedactionViolations(observations)` | **必ず 0**。非 whitelist キー / 非 opaque placeKey の混入を検出 |

---

## 4. 計測方法

- **収集**: 器官（Stage 0/0-B）が flag ON の時、card が funnel イベントを localStorage に local 記録（既存 `aneurasync.postvisit.v1` の elicitLog）。サーバ送信なし・集計はクライアント pure。
- **算出**: `computeDogfoodMetrics()` を呼ぶだけ（pure・副作用なし）。dev で console 出力 or 内部ダッシュボードで読む（本書時点では helper のみ・UI 化は別途）。
- **redaction 監視**: `countRedactionViolations()` を常時 0 確認。1 でも出たら **即 Fit-Arc 進行停止**（honesty firewall 違反）。
- **suppress 健全性**: `suppressByReason` で「habitual/high_fatigue が過大に分母を食っていないか」を見る。effが効きすぎなら閾値を緩める判断材料。

---

## 5. 保存する / しないデータ

| 保存する（local-only・集計用） | 保存しない |
|---|---|
| elicitLog: `{ placeKey(opaque), at, outcome, suppressReason? }`（最大100件） | 生 GPS・住所・場所名原文・notes・正確な滞在分 |
| 観測: Stage 0 の whitelist 8項目（placeKey opaque 等） | 同上 |
- 指標は**集計値（件数・率）**のみ。個別の場所同定や PII は出さない。サーバ・DB・外部送信なし。

---

## 6. Fit-Arc（Stage 1）へ進む条件 / 進まない条件

`evaluateFitArcEntry(metrics)` が pure 判定。**定量条件 + 定性条件（人判断）** の二段。

### 進む条件（定量・helper が自動評価／既定閾値）
- `promptShown ≥ 20`（dogfood で一定数の prompt 表示）
- `answered ≥ 5`（回答が少なくとも数件溜まる）
- `redactionViolations === 0`（**絶対**）
- `answerRate ≥ 30%`（prompt が邪魔だという強い違和感がない proxy）
- `suppressRate ≤ 70%`（suppress が効きすぎていない＝出る機会が枯れていない）
- `mirrorShown ≥ 1`（観測の鏡が仮説トーンで出ている）

### 進む条件（定性・計測不能・CEO/人判断）
- prompt が邪魔だという強い違和感がない
- 観測の鏡が仮説トーンで自然に見える
- ユーザーが「これなら答えてもいい」と感じる

### 進まない条件
- 上記定量のいずれか未達（特に **redaction 違反 ≥ 1**・**answerRate が低い（邪魔）**・**suppressRate が高い（出ない）**）
- post-decision-observation rate が低位安定（毎回スルー）＝ trigger/タイミング/文言の見直しが先。Fit-Arc を出しても答え合わせが溜まらず凍結する。
- 定性で「邪魔」「説教臭い」「答えたくない」が出る

→ **quantitativeReady=true かつ 定性 3 点を CEO が承認** したら Stage 1 Fit-Arc に進む。それ以前は readout を出さない（critical path: 答え合わせ → アーク）。

---

## 7. 境界（本 Stage でやらないこと）

Fit-Arc UI / Aneura-star / ranking 反映 / DB / API route / crowd aggregation / Local Intel 公開 / streak・gamification / 外部 API は **一切なし**。本 Stage は計測の **定義 + pure helper** のみ。

> 実装: helper `postVisitMetrics.ts`（pure）+ store funnel イベント（shown/suppressed/mirror_shown）+ card 最小配線。flag OFF で完全 no-op。
