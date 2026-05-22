# Phase 3-J Deferred Smoke Ledger (= 未消化 smoke 一覧 + 解消条件)

**作成日**: 2026-05-22
**承認**: CEO (= 2026-05-22 closeout 整理指示)
**範囲**: J-6e / J-7 で deferred とした real UI smoke 項目の管理台帳

---

## 0. Purpose

Phase 3-J closeout 時点で **「FAIL ではなく、 構造的に smoke 不能だった」** 項目を明示的に台帳化する。
将来 (= 自然な data 累積成立後) に **どの条件が揃えば** どの smoke が **どの手段で** 解消できるかを記録する。

これは:
- 「やり残し」 ではなく **「計画通りの境界線」** の記録
- 将来の re-smoke trigger を明確化
- 「fully smoke PASS」 と誤記しないための歴史的 trace

---

## 1. Deferred 項目一覧

### Item 1: proposal chip visibility (= 表示そのもの)

| 項目 | 内容 |
|---|---|
| 状態 | deferred |
| 設計上の正常性 | ✅ 「現設計では出ないことが正しい挙動」 (= Invariant 36 Onboarding Quietude + Idea ι pattern_repeat 閾値) |
| 解消条件 | (A) AND (B) AND (C) AND (D) すべて |
| 解消条件 (A) | 最古 anchor `confirmedAt` が **8 日以上前** (= Onboarding Quietude 解除) |
| 解消条件 (B) | 過去 28 日以内に同曜日 + 同 hour + 同 verb / one_off / **3 件以上** の反復 anchor |
| 解消条件 (C) | 当該 proposal の reversibility score >= 50 (= 「カフェ」 70 / 「ジム」 40 等の verb 依存) |
| 解消条件 (D) | dismiss filter / Theory-of-Mind Pause / Entropy Budget いずれも非発火 |
| 解消手段 | **初期テストユーザー自然利用 1-2 週間** (= CEO 方針 「初期ユーザー獲得」 が走った時点で自然発生) |
| 解消時の検証方法 | DevTools で `/api/plan/anchors` 確認 → 条件成立確認 → /plan の CalendarTab で selected day に chip 表示確認 |
| 解消 NG 手段 | dev fixture API / TestOverrideContext production 注入 / DB 直接 insert / confirmedAt schema 変更 |
| 担当 | 初期テストユーザー獲得 phase 担当 (= 別 phase) |

### Item 2: dismiss real UI smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred |
| 設計上の正常性 | ✅ chip が出ないため操作経路に到達不能 (= Item 1 派生) |
| 解消条件 | Item 1 解消後 |
| 解消手段 | Item 1 解消後、 「無視」 link tap → localStorage `proposalDismiss.v1` 書込確認 → chip 即消失確認 |
| 解消時の検証方法 | DevTools Application タブ → Local Storage で entry 増加確認 + UI で chip 消滅確認 |
| 担当 | Item 1 と同時 |

### Item 3: accept real UI smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred |
| 設計上の正常性 | ✅ chip が出ないため操作経路に到達不能 |
| 解消条件 | Item 1 解消後 |
| 解消手段 | chip 全体 tap → 9-step transaction 動作確認 → anchor 即時作成確認 → subtle pending 表示確認 → 「戻す」 link 5 分表示確認 |
| 解消時の検証方法 | (1) DevTools Network で `POST /api/plan/anchors` 200 確認 (2) /api/plan/anchors GET で新 anchor 確認 + source.notes に `alter-proposal:<id>` prefix 確認 (3) Local Storage `proposalUndo.v1` に entry 確認 |
| 担当 | Item 1 と同時 |

### Item 4: undo real UI smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred |
| 設計上の正常性 | ✅ accept 後 5 分以内の操作のため Item 3 依存 |
| 解消条件 | Item 3 解消後、 かつ accept から 5 分以内 |
| 解消手段 | accept 直後の subtle 「戻す」 link tap → anchor 削除確認 → undo record 消滅確認 → chip 復活可能性確認 |
| 解消時の検証方法 | (1) DevTools Network で `DELETE /api/plan/anchors/<id>` 200 確認 (2) Local Storage から undo record 消失確認 (3) chip 復活確認 |
| 担当 | Item 3 と同時 |

### Item 5: modify real UI smoke

| 項目 | 内容 |
|---|---|
| 状態 | deferred |
| 設計上の正常性 | ✅ chip が出ないため 「教え直す」 link に到達不能 |
| 解消条件 | Item 1 解消後 |
| 解消手段 | 「教え直す」 link tap → AddAnchorModal が proposal draft で prefill されて open 確認 → subtitle 「提案を編集 / YYYY-MM-DD」 確認 → user 編集 + submit で通常 anchor 作成確認 |
| 解消時の検証方法 | (1) Modal の form fields が prefill されているか目視 (2) submit で `POST /api/plan/anchors` 200 (3) 新 anchor の source.notes に proposalId prefix が **入らないこと** 確認 (= modify は sentiment 独立) |
| 担当 | Item 1 と同時 |

---

## 2. 共通の Data Gate 解説

Phase 3-J の proposal 系は **3 重の自然 gate** で意図的に発火を絞っている:

### Gate 1: Onboarding Quietude (= Invariant 36)

- 利用初期 7 日: proposal 完全 silent
- 8-30 日: max 1 proposal / day
- 30+ 日: 通常運用 (= Entropy Budget で制御)
- **根拠**: 「まず観察、 話すのは後」 (= Aneurasync 思想)

### Gate 2: pattern_repeat 閾値 (= Idea ι)

- 過去 28 日内 / 同曜日 / 同 hour / 同 verb / one_off で **3 件以上**反復が必要
- **根拠**: 「初めて」 になり気づき発火しない (= Reverse-Engineered Pattern Highlight)

### Gate 3: Reversibility (= score >= 50)

- 「ジム」 「医療」 等の高 commitment 系は proposal にしない
- **根拠**: 「気軽に試せる範囲」 のみ propose

→ この 3 重 gate が「proposal が出にくい設計」 の核心。 dev fixture でこれらを迂回することは思想と整合しない。

---

## 3. Re-test trigger conditions (= 解消観測タイミング)

| Trigger | 期待される観測 |
|---|---|
| 初期テストユーザー獲得 1-2 週間経過 | Onboarding Quietude 自然解除 + pattern 累積開始 |
| 任意 user の最古 confirmedAt から 8 日経過 | Gate 1 解除 |
| 同曜日 + 同 hour + 同 verb の anchor 3 件目作成 | Gate 2 通過候補発生 |
| 同 user での chip 表示の **初観測** | Item 1 → 2 / 3 / 4 / 5 の連鎖 smoke 可能化 |

---

## 4. Tracking ownership

| 項目 | 観測責任 |
|---|---|
| Item 1-5 解消 | 初期テストユーザー獲得 phase (= 別 phase) |
| Re-test 実施判定 | CEO (= 「fully smoke PASS」 を打つかの最終判断者) |
| 本台帳の更新 | Item 解消時に **新 entry** を decision-log に追加し、 本台帳の該当 Item 状態を `deferred → resolved` に変更 |

---

## 5. 関連 docs

- `docs/alter-plan-phase3-j-closeout-audit.md` — Phase 3-J closeout 監査本体
- `docs/alter-plan-phase3-j-pr-runbook.md` — GitHub 復旧後 PR 手順
- `docs/alter-plan-phase3-predictive-day-orchestration-architecture.md` — 設計書 (= Invariant 36 / Idea ι の出典)
- `docs/decision-log.md` — J-7 limited smoke/audit PASS entry + closeout entry

---

## 6. Wording 規約 (= 永続)

| OK | NG |
|---|---|
| Item 1-5 は deferred | Item 1-5 は FAIL |
| limited smoke/audit PASS | fully smoke PASS |
| real-data proposal chip visibility smoke remains deferred due to data gate not satisfied | proposal chip 表示確認できなかったので smoke は不成立 |
| 計画通りの境界線で停止 | やり残し / 中途半端 |

