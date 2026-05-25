# Phase 3-K Deferred Smoke Ledger

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 K closeout docs 整理指示)
**範囲**: K-1 〜 K-3c-iii で deferred とした real UI smoke 項目の管理台帳

---

## 0. Purpose

Phase 3-K closeout 時点で「**FAIL ではなく、 構造的に smoke 不能だった**」 項目を明示的に台帳化。
将来 (= 自然な data 累積成立後) に **どの条件が揃えば** どの smoke が **どの手段で** 解消できるかを記録する。

J 系 deferred ledger と同 pattern。

---

## 1. Deferred 項目一覧

### Item K-1: sensitive redaction visual smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred / not applicable |
| 設計上の正常性 | ✅ unit test で完全検証済 (= DayGraphRedactionContract + grep test、 sensitive raw 文字列 0) |
| 解消条件 | dev account に sensitive 予定実データを追加 |
| 解消手段 | (1) sensitive=medical/legal/exam/other の anchor を 1+ 件作成 → (2) CalendarTab/MapTab/FlowTab で表示確認 → (3) displayLabel 「予定 (= 医療系)」 等を視認 |
| 解消時の検証 | (1) graph object に raw title/locationText が含まれない (= DevTools React Components 確認) (2) ASCII formatter で raw 文字列なし (3) shared_view では generic 「予定」 |
| 解消 NG 手段 | dev fixture API / TestOverrideContext production 注入 (= 永続禁止) |
| 担当 | 初期テストユーザー獲得 phase or dev による sensitive 予定追加後 |

### Item K-2: EventNode click visual smoke

| 項目 | 内容 |
|---|---|
| 状態 | 未確認 |
| 設計上の正常性 | ✅ unit test で bridge 配線検証済 (= onEventClick → anchors.find → onAnchorClick) |
| 解消条件 | 別 session で実機 tap 確認 |
| 解消手段 | (1) DayGraphTimeline 内 EventNode を tap → (2) AnchorDetailModal が開くことを確認 |
| 解消時の検証 | 3 tab (= CalendarTab / MapTab / FlowTab) すべてで bridge 動作確認 |
| 担当 | CEO 別 session、 又は次 dev session |

### Item K-3: warnings あり日 visual smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred / not applicable |
| 設計上の正常性 | ✅ unit test で「warnings あり → 通常 timeline fallback (= compact しない)」 検証済 |
| 解消条件 | dev account に invalid anchor (= startTime 不正、 end_before_start 等) を意図的に作成 |
| 解消手段 | (1) anchor の startTime に不正値を入力 → (2) FlowTab で「予定なし」 と誤表示されないことを確認 → (3) 通常 timeline (= start + gap + end) が表示されることを確認 |
| 解消時の検証 | warnings ありの日は compact ではなく通常 timeline (= 「予定なし」 誤表示防止、 Negative Capability) |
| 解消 NG 手段 | dev fixture API での warning 強制 (= 永続禁止) |
| 担当 | 初期テストユーザー獲得 phase で自然発生 or dev で手動データ作成 |

---

## 2. 解消条件の共通解説

### 2.1 Data gate (= K-1 / K-3)

Aneurasync は 「ユーザーが自然に使う」 ことで data が積まれる設計。 dev fixture で強制的に作るのは **永続禁止** (= 思想整合)。

→ 解消は:
- **初期テストユーザー獲得 phase** (= CEO 方針) で自然に sensitive / warning / 多様データが発生
- **2-4 週間使用後**に visual smoke 可能化

### 2.2 別 session 確認 (= K-2)

EventNode click は機能的に配線済 (= unit test PASS)。 visual smoke は CEO の別 session で 5 分以内に確認可能。

→ 解消は:
- 次 CEO 実機 session で tap 確認
- 又は K-3+ 段階での再 smoke

---

## 3. Re-test trigger conditions

| Trigger | 期待観測 |
|---|---|
| 初期テストユーザー利用 1-2 週間経過 | 自然な data 多様化、 sensitive / warning データ発生可能性 |
| CEO 別 session 5 分以内 | EventNode tap → modal 開く確認 |
| sensitive 予定追加 (= 任意の dev 操作) | sensitive UI redaction visual smoke 解消可能化 |
| invalid anchor 作成 (= 任意の dev 操作) | warnings あり日 visual smoke 解消可能化 |

---

## 4. Tracking ownership

| 項目 | 観測責任 |
|---|---|
| Item K-1 sensitive | 初期テストユーザー獲得 phase or dev manual data |
| Item K-2 EventNode click | CEO 別 session or 次 dev session |
| Item K-3 warnings あり日 | 初期テストユーザー獲得 phase or dev manual invalid anchor |
| 本台帳の更新 | Item 解消時に **新 entry** を decision-log に追加し、 本台帳の該当 Item 状態を `deferred → resolved` に変更 |

---

## 5. K-3+ Refinement (= future improvement、 not deferred bugs)

これらは「未実装機能」 であり「smoke 不能」 ではない。 K phase 範囲外として明示。

### 候補 list (= 設計提案でリスト化済、 実装は別 phase)

- TimeBucket 帯背景 (= 7 帯薄色)
- Boundary Soft-fade (= 上下グラデーション)
- 重心 strip (= dayMood / density 細帯)
- 高度 Overlap Notation (= 隣接 connector)
- Density observation line (= 下部 self-evidence 文)
- 連続 empty day grouping (= 「5/24-5/27 予定なし」 集約)
- FlowTab compact mode の lazy mount (= 性能観測後判断)
- MapTab spatial-temporal highlight (= 選択 pin の event を timeline 内で強調)
- FlowTab "day shape silhouette" (= scan 性向上)
- Cross-day pattern hint (= 「3 回目の火曜」)

→ これらは 3-L/M/N 完了後、 K-4 / 別 phase で順次検討。

---

## 6. 関連 docs

- `docs/alter-plan-phase3-k-closeout-audit.md` — K phase 完了監査
- `docs/alter-plan-phase3-k-pr-runbook.md` — GitHub 復旧後 PR 手順
- `docs/alter-plan-phase3-k-daygraph-design.md` — K design v1.0-v1.2
- `docs/decision-log.md` — 全 K decision の chronological 正史

---

## 7. Wording 規約 (= 永続)

| OK | NG |
|---|---|
| K-3c-iii visual smoke PASS | K-3c fully smoke PASS |
| sensitive visual smoke deferred (= data gate) | sensitive smoke 失敗 |
| EventNode click smoke 未確認 (= unit test 検証済) | EventNode click 未テスト |
| warnings あり日 smoke not applicable (= 該当データなし) | warnings あり日 smoke 不能 |
| 計画通りの境界線で停止 | やり残し / 中途半端 |
