# P2 Step 3 Phase 6 — Real PM Read-Only Smoke 手順

**Status**: 着手準備完了 (= Phase 5 接続 commit `19e1cc2e` 後)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: `aneurasync@outloo.com` で real Stargazer Personal Model 読み取り経路を実機検証し、 「synthetic 限界 vs prompt 弱さ」 を切り分ける。

---

## 0. 目的

CEO + GPT 判定 (= 2026-05-25):
- Stage C (= recentRhythm) を**先に足さず**、 Stage B 完了状態 (= judgmentMode + timePreference のみ) で smoke
- real PM で P3/P4 が adoption 圏に上がるなら synthetic 限界が主因、 Stage C 後回し可
- real PM でも弱いなら prompt or recentRhythm 不足、 Stage C or prompt 再補正へ

---

## 1. 観測 9 項目 (= CEO 5 + GPT 4)

| # | 項目 | 観測 channel | 判定基準 |
|---|---|---|---|
| 1 | real PM 抽出成功 | server log `[plan/pm] extracted` | `observedAxesCount > 0`、 `judgmentMode` or `timePreference` が non-null |
| 2 | Phase gate 正常 | server log `[plan/pm] extracted` | `hdmPhase ≥ 2` で `layer != "meta-only"` |
| 3 | V2 path 発火 | server log `[plan/alterNote] path` | `path: "v2"`、 `hasStable: true` |
| 4 | LLM 出力 「あなたらしさ」 反映 | UI 表示 + 文比較 | 既存 Step 2 v3.2 prompt の few-shot profile 差 (= P1/P2/P3/P4) と整合する語彙傾向 |
| 5 | UI render 正常 | DevTools console | console error 0、 popcorn なし (= 1 transition で全 events 表示) |
| **6** | **P1/P2 regression なし** | flag OFF vs ON 比較 | flag OFF (= 既存 alterNote) と比較し、 user 経験が明確に劣化しない |
| **7** | **latency 悪化なし** | server log `latencyMs` | 既存 Step 1 baseline (= 中央値) と比べて +20% 以内 |
| **8** | **fallback 維持** | flag OFF 状態 | `PLAN_PERSONAL_MODEL_INTEGRATION=false` で再起動 → 既存 Step 2 v3.2 と完全同 動作 |
| **9** | **抽出失敗時 meta-only 落ち** | unit test 22/22 + 異常系 confirm | adapter test で fail-open 確認済 (= 56a1a6e7)、 production 上は 「[plan/pm] error」 系 log が出ないこと |

---

## 2. 実施手順 (= 着手前停止、 CEO 認可待ち)

### 2.1 dev server 起動

```bash
# 1. flag ON で dev server 起動
PLAN_ALTER_NOTE_LIVE=true \
PLAN_PERSONAL_MODEL_INTEGRATION=true \
npm run dev
```

`http://localhost:3000/plan` を開く。 `aneurasync@outloo.com` で sign-in 済の前提。

### 2.2 観測対象 anchor を 1 日分準備

「予定を教える」 → 以下の 3 件を入力 (= category 多様性確保):
- 朝の anchor (= e.g., 「08:00 自宅で支度」)
- 仕事 anchor (= e.g., 「10:00 オフィスで会議」)
- 学習 anchor (= e.g., 「19:00 カフェで読書」)

### 2.3 server log 観測

`npm run dev` のターミナルで以下のキーワードを監視:
- `[plan/pm] extracted` (= 1 user 1 day 1 回出るはず)
- `[plan/alterNote] path` (= 各 anchor で 1 回ずつ出るはず、 path=v2)

### 2.4 UI 観測

各 EventCard の alterNote を確認:
- 集中型 user なら 「静かに」 「ひとり」 「集中」 系の語彙
- 朝強い user なら 朝の anchor で 「リズム」 「整える」 系
- 夜強い user なら 夜の anchor で 「沈む」 「深まる」 系

### 2.5 比較 baseline (= 項目 6, 8)

dev server 再起動 (= flag OFF):
```bash
PLAN_ALTER_NOTE_LIVE=true \
PLAN_PERSONAL_MODEL_INTEGRATION=false \
npm run dev
```

同じ 3 anchor で alterNote を比較。 Step 2 v3.2 と同じ alterNote が出れば fallback 維持。

---

## 3. 認証 / 実施方式 — **CEO 判断仰ぐ**

`aneurasync@outloo.com` への sign-in が必要。 私 (= Claude) は credentials を保持していないため、 以下 3 方式から CEO 選択:

| 方式 | 内容 | 必要情報 |
|---|---|---|
| A | **CEO が手動で smoke 実施** | 私が dev server 起動 + 観測ガイド提示、 CEO が browser 操作・log 収集 |
| B | **Playwright 自動化** (= 既存 Step 1 ON-path smoke ②方式) | CEO から credentials または `.env.local.test` 等の test login 経路提示 |
| C | **既存 logged-in cookie 流用** | CEO が browser export した cookie を一時 dev session に流し込む |

私の推奨は **A (= 手動 smoke)**:
- credentials 共有不要 (= privacy 最小)
- CEO 自身が UI を肌感覚で見る (= 「あなたらしさ」 判定は subjective、 CEO 直視が最も価値)
- log 出力は明確 (= 上記 §2.3 の grep 一発)

私側 work:
1. dev server 起動 (= flag ON / OFF 切替)
2. log filter 命令を CEO に提供
3. CEO 観測結果を docs 化 (= 9 項目を表形式で記録)
4. judge 採点 (= judgmentMode + timePreference の入った real PM が P3/P4 に効くか)
5. CEO 4 項目報告 (= readiness §6.5)

---

## 4. 緊急停止

- adapter exception 連続発生 → 即 dev server kill、 env revert
- LLM cost 急増 → cost cap 20 / view が効くはず、 念のため監視
- UI 完全壊れる (= console error 多数) → flag OFF revert で復帰確認

---

## 5. 終了後 commit + 報告

smoke 完了後:
1. dev server kill
2. 観測結果 doc (= 本 file の §3 テーブル埋め) を atomic commit
3. CEO 報告 4 項目 (= readiness §6.5 通り):
   - P3/P4 改善幅
   - P1/P2 regression 有無
   - naturalness / personalness / non_pushy 3 軸所感
   - 実 PM 由来で効いた field
4. Stage C 要否判断

---

## 6. 次

- smoke 結果が POSITIVE (= P3/P4 上がる、 regression なし、 fallback 維持) → preview canary GO 判定 (= Step 3 完了)
- smoke 結果が NEGATIVE (= P3/P4 弱い) → Stage C or prompt 再補正 (= v3.4) 検討
