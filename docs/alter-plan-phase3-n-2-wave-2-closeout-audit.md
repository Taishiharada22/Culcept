# Phase 3-N-2 Wave 2 Closeout Audit (= P-009 規約 24 全 plan component 適用 smoke PASS + freeze 宣言)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 wave 2 impl `94bcd220` 着地後、 「visual smoke 6 件問題なし、 PASS として進めてください。 1. wave 2 closeout audit 2. freeze 宣言 3. wave 3 plan audit の順で進めてください」 指示)
**範囲**: wave 2 impl の closeout + freeze 宣言 + 達成事項 + 永続規約 24 全展開記録 + wave 3 への接続点
**前提**: N-2 wave 2 impl `94bcd220` + 58 frozen branches + dev server localhost:3000 起動済 + CEO smoke PASS 6 件全件確認済

> 本 audit は **docs only**。 wave 2 を visual-only closeout として閉じ、 wave 3 plan へ接続する。 実装には進まない (= wave 3 plan は別 audit)。 brand color へは戻さない、 slate 系 focus-visible 規約は維持。

---

## 0. CEO Visual Smoke 結果 (= 6 件 PASS)

### 0.1 wave 2 plan audit `73a7405d` で確定した smoke 計画

| # | 確認項目 | 期待挙動 | 結果 |
|---|---|---|---|
| 1 | MapTab で予定 / カテゴリ card click | 強い青 stuck ring 出ない | ✅ PASS (= CEO 確認) |
| 2 | FlowTab で予定 card click | 同上 | ✅ PASS |
| 3 | CalendarTab で予定 card click | 同上 | ✅ PASS |
| 4 | AddAnchorModal の入力 field focus / PlaceCandidatesPanel | 青 ring + offset が消える、 slate ring に変わる | ✅ PASS |
| 5 | EditAnchorModal の入力 field focus | 同上 | ✅ PASS |
| 6 | 全 component の Tab navigation で focus-visible ring 維持 | slate-300 で統一 | ✅ PASS |

→ **6 件全件 PASS、 CEO 視覚 smoke 成立**。

### 0.2 機械検証との対応 (= 二重保証)

| Smoke 確認 | 機械検証対応 |
|---|---|
| ① MapTab card 強い青 ring 消える | `planComponentsFocusRingRegimeWiring.test.ts §1+§4` (= `focus:ring-indigo` 不在 + `focus-visible:ring-slate-300` 存在) |
| ② FlowTab card 同上 | 同 test §1+§4 |
| ③ CalendarTab card 同上 | 同 test §1+§4 |
| ④ PlaceCandidatesPanel field slate ring | 同 test §2+§3+§4 (= `focus-visible:ring-indigo` 不在 + `focus-visible:ring-offset-*` 不在 + `focus-visible:ring-slate-300` 存在) |
| ⑤ AnchorFormFields field slate ring | 同 test §2+§3+§4 |
| ⑥ Tab navigation 統一 | 6 file × 4 invariants = 24 tests + 2 cross-file 宣言 = **26 tests** で機械保証 |

→ **visual + 機械の二重保証で wave 2 範囲完全成立**。

### 0.3 GPT 補正反映 (= 否定系 + 肯定系の二重 assertion)

| 補正前 | 補正後 |
|---|---|
| 3 invariants (= 否定系のみ) | 4 invariants (= §1 §2 §3 否定系 + §4 肯定系) |
| `focus:ring-indigo` 不在のみ確認 | + `focus-visible:ring-slate-300` 存在を肯定系 assertion |
| 18 tests | **26 tests** (= 6 file × 4 + 2 cross-file 永続性宣言) |

理由: 「悪い class が無い」 だけだと、 focus ring 自体が消えても通る可能性がある → 肯定系 assertion で focus ring 自体の消失も検知可能。

---

## 1. Wave 2 達成事項

### 1.1 構造的達成

| 達成 | 内容 |
|---|---|
| **P-009 規約 24 全 plan component 適用実現** | MapTab / FlowTab / CalendarTab / PlaceCandidatesPanel / AnchorFormFields の 9 箇所が `focus-visible:ring-slate-300` に統一 |
| **「観測層 OS visual 規約」 全展開完成** | wave 1 で DayGraphTimeline、 wave 2 で plan 全主要 component に展開、 11 箇所で統一 |
| **brand color 焼き付き完全排除** | indigo-400 / indigo-300 の focus ring を plan 全体から排除 (= 「観測の幕間」 思想整合) |
| **ring-offset 削除完了** | `focus-visible:ring-offset-1` を 5 箇所から削除、 「ring が前面に出る」 visual 主張を排除 |
| **外科的緻密実装** | 5 file / 9 line + 1 新規 test file の最小実装 (= 機能変更 0、 副作用なし) |
| **WCAG 2.1 a11y 改善** | mouse user に stuck ring 排除 + keyboard user に slate-300 ring 維持を全 component で実現 |
| **「観測の幕間」 思想 visual 整合性** | 「観測しない時は何も主張しない」 を plan 全 component で visual 実証 |

### 1.2 数値的達成

| 項目 | 値 |
|---|---|
| **新規 regression tests** | **26 PASS** (= 6 file × 4 invariants + 2 cross-file 宣言) |
| **全 plan tests** | **2652 PASS** (= 0 fail、 wave 1 の 2626 から +26) |
| 変更 file | 6 (= MapTab + FlowTab + CalendarTab + PlaceCandidatesPanel + AnchorFormFields + 新規 test file) |
| 既存 file 改変行数 | **9 行** (= class 文字列のみ) |
| 新規 file | 1 (= `tests/unit/plan/planComponentsFocusRingRegimeWiring.test.ts`) |
| tsc errors | **0** |
| K / L / M phase / wave 1 既存 file 改変 | **0** (= 9 行は全て polish 適用、 機能不変) |
| DB / env / package / dependency 変更 | **0** |
| 新規 fetch / endpoint / localStorage / runtime telemetry | **0** |
| 新規 component / hook 追加 | **0** |
| CEO smoke 確認項目 | **6 件全件 PASS** |
| 規約 24 適用箇所 (= 累積) | **11 箇所** (= wave 1 EventItem 1 + M-3c-ui TransitionItem 1 + wave 2 9) |

### 1.3 思想的達成 (= Aneurasync 中心問い接続)

> 「自分って、 そういう人間だったのか」

wave 2 で:
- 「観測の幕間」 を plan 全 component で visual 実証 (= 全 card / field click 後 ring が消える)
- 「観測層 OS の visual 階調」 が plan 全体で統一感を持つ (= brand color 焼き付き 0、 slate-* 階調のみ)
- 警告化リスク 0 を維持 (= indigo / ring-offset の「目立つ」 visual を完全排除)
- 思想保護が visual で機械保証 (= 26 tests で永続化、 将来の brand color 復活を構造的に禁止)

---

## 2. Freeze 宣言

### 2.1 Freeze 対象 (= 触らない、 追加 commit 禁止)

- **`feat/alter-plan-phase3-n-2-wave-2-focus-ring-regime-applied`** @ **`94bcd220`**: **frozen** (= CEO smoke PASS 6 件で確定)
- N-2 wave 2 plan audit `docs/plan-phase3-n-2-wave-2-plan-audit` @ `73a7405d`: **frozen**
- N-2 wave 1 closeout audit `docs/plan-phase3-n-2-wave-1-closeout-audit` @ `8449bb64`: frozen (= 既存)
- N-2 wave 1 impl `feat/alter-plan-phase3-n-2-wave-1-focus-ring-unify` @ `3d9bf8f5`: frozen (= 既存)
- N-2 wave 1 plan audit `docs/plan-phase3-n-2-wave-1-plan-audit` @ `d3bf0cc8`: frozen (= 既存)
- N-1 closeout audit `docs/plan-phase3-n-1-closeout-audit` @ `8f1d7432`: frozen (= 既存)
- N-1 readiness audit `docs/plan-phase3-n-1-home-plan-final-surface-audit` @ `5c8600f2`: frozen (= 既存)
- 全 既存 frozen branches (= K/L/M phase + N-1 + N-2 wave 1)

### 2.2 凍結 file (= wave 2 範囲)

- `app/(culcept)/plan/tabs/MapTab.tsx` L 1463, 1586 (= polish 適用後 form)
- `app/(culcept)/plan/tabs/FlowTab.tsx` L 566 (= 同上)
- `app/(culcept)/plan/tabs/CalendarTab.tsx` L 516 (= 同上)
- `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` L 342, 452, 487 (= 同上)
- `app/(culcept)/plan/components/AnchorFormFields.tsx` L 405, 499 (= 同上)
- `tests/unit/plan/planComponentsFocusRingRegimeWiring.test.ts` (= 26 tests 含む regression)

### 2.3 frozen branches 合計

- **59 frozen branches** (= 58 + 1 = 本 closeout audit を含めて)

内訳:
- 既存 56 (= wave 1 closeout 時点)
- + N-2 wave 2 plan audit `73a7405d` → 57
- + N-2 wave 2 impl `94bcd220` → 58
- + N-2 wave 2 closeout audit (= 本 commit) → 59

### 2.4 凍結原則 (= 永続規約継承)

frozen branch (= 59 件) への追加 commit は **絶対禁止**。 新規変更は別 branch + 別 PR で対応。 wave 2 の 9 line は今後 touch しない。

---

## 3. 永続規約 24 全展開完成 (= wave 2 で完成)

### 3.1 規約 24 の最終形

**M phase で確立した slate-* + focus-visible 階調を「観測層 OS visual 規約」 として plan 全 component で永続適用**:
- すべての focus ring は `focus-visible:` + `slate-300` (= K/L/M phase + N-2 wave 1+2 全 UI 統一)
- mouse click 後の「stuck ring」 禁止 (= `focus:` 不使用)
- ring color は brand color (= indigo, purple) を **focus ring の文脈では使わない**
- `ring-offset-*` も「観測の幕間」 思想に合わない (= ring が前面に出る = 観測の主張)
- regression test 26 件で plan 全 component に対し機械保証 (= grep pattern: 否定系 3 + 肯定系 1)

### 3.2 規約 24 の現在の適用範囲 (= wave 2 で全 plan 主要 component に展開済)

| component | 状態 |
|---|---|
| DayGraphTimeline EventItem | ✅ wave 1 で適用済 (= `3d9bf8f5`) |
| DayGraphTimeline TransitionItem | ✅ M-3c-ui で適用済 (= 既存) |
| MapTab 予定 card | ✅ wave 2 で適用 |
| MapTab カテゴリ card | ✅ wave 2 で適用 |
| FlowTab 予定 card | ✅ wave 2 で適用 |
| CalendarTab 予定 card | ✅ wave 2 で適用 |
| PlaceCandidatesPanel button × 3 | ✅ wave 2 で適用 |
| AnchorFormFields field × 2 | ✅ wave 2 で適用 |

→ **plan 主要 component の interactive surface 全 11 箇所で規約 24 適用完成**。

### 3.3 「観測層 OS visual 規約」 の全リスト (= M phase + wave 1+2 確立分)

1. amber / orange / red 警告色禁止 (= M phase / L phase 継承)
2. icon / badge / warning box 禁止 (= M phase 継承)
3. text-xs italic text-slate-400 (= K-3c-iii tier_2 disclosure 階調)
4. text-sm text-slate-500 (= L-4d movement 階調)
5. text-base font-medium text-slate-900 (= K-3a event 階調)
6. **focus-visible:ring-2 focus-visible:ring-slate-300** (= wave 1 + 2、 plan 全 component で適用)
7. **「観測の幕間」** = mouse click 後 ring 消える (= wave 1 + 2、 plan 全 component)
8. **`ring-offset-*` 禁止** (= wave 2 新規、 「ring が前面に出る」 visual 主張排除)

### 3.4 規約 24 の永続保証

- **機械保証**: `planComponentsFocusRingRegimeWiring.test.ts` (= 26 tests、 6 file × 4 invariants + 2 cross-file 宣言)
- **将来違反予防**: 否定系 3 (= `focus:ring-indigo` 不在 / `focus-visible:ring-indigo` 不在 / `focus-visible:ring-offset-*` 不在)
- **focus ring 消失予防**: 肯定系 1 (= `focus-visible:ring-slate-300` 存在) — GPT 補正反映
- **TARGET_FILES 数永続管理**: cross-file 宣言で 6 file 全件読込可能性 + TARGET_FILES.length 監視

---

## 4. Wave 2 の Visual-Only Closeout 性格

### 4.1 「Visual-Only」 の意味

wave 2 は **完全に visual のみ** の変更:
- 機能変更: 0
- API 変更: 0
- DB / env / package / dependency 変更: 0
- 新規 component / hook / 関数追加: 0
- 既存 test 既存 invariants 影響: 0

→ wave 2 は「観測層 OS visual 規約」 の **思想保護完成** を目的とした最小実装。

### 4.2 Wave 2 で完成したこと

| 項目 | 状態 |
|---|---|
| 規約 24 (= focus-visible + slate-300) の plan 主要 component 全展開 | ✅ 完成 |
| brand color (= indigo) の focus ring 文脈 plan 全排除 | ✅ 完成 |
| `ring-offset-*` の plan 全排除 | ✅ 完成 |
| visual 規約の機械保証 (= 26 regression tests) | ✅ 完成 |
| 「観測の幕間」 思想の visual 実証 (= 全 component) | ✅ 完成 |

### 4.3 Wave 2 で完成しなかったこと (= wave 3+ 候補)

| 項目 | 理由 |
|---|---|
| Home component / Settings 等 plan 外 surface | scope 外、 wave 2 は plan 専用 |
| screen reader / voice control polish | a11y の他軸、 wave 3+ 候補 |
| Modal animation polish | scope 中-大、 wave 3+ 候補 |
| 他 7 polish 候補 (= P-002〜P-008) | 各候補の自律分析で wave 2 不採用 |

---

## 5. Wave 3 への接続点

### 5.1 残 polish 候補 (= wave 2 plan audit で再評価必要)

wave 2 plan audit `73a7405d` で wave 2 範囲は P-009 のみに絞り込んだ。 残候補 P-002〜P-008 は **wave 3 plan audit で再評価**:

| ID | surface | wave 2 判定 | wave 3 再評価必要性 |
|---|---|---|---|
| P-002 | M-2a/L-4a displayText spacing | ❌ 不採用 (= CEO 具体提案待ち) | CEO 具体提案あれば再評価 |
| P-003 | DayGraphTimeline hint span 位置 | ⚠️ smoke 評価次第 | 再評価候補 |
| P-004 | FeasibilityDisclosureLine padding | ❌ 不採用 (= 違和感なし) | 必要に応じて |
| P-005 | Plan header copy tone 統一 | ❌ 不採用 (= wave 3+) | 再評価候補 |
| P-006 | Modal animation polish | ❌ 不採用 (= scope 中-大) | 再評価候補 |
| P-007 | Empty state copy 統一 | ❌ 不採用 (= 既に統一感) | 不要 (= 既に統一感) |
| P-008 | swipe boundary 体験 | ❌ 不採用 (= scope/risk 中-大) | 再評価候補 |

### 5.2 Wave 3 の前提 (= CEO 明示)

- **brand color には戻さない** (= 永続規約 24 維持)
- **slate 系 focus-visible 規約を維持** (= 規約 24 全展開状態を維持)
- **他候補を混ぜず、 残候補 P-002〜P-008 の再評価から始める** (= 新規候補追加禁止)
- **wave 2 は visual-only closeout として閉じる** (= 機能変更近接禁止)

### 5.3 Wave 3 plan audit の必須項目

wave 3 plan audit (= 別 doc) で扱うべき項目:

1. P-002〜P-008 の **実態再調査** (= wave 2 で発見した P-009 のように、 自律分析で隠れた surface を発見可能)
2. 各候補の **wave 3 採否判定** (= CEO 方針 7 点との整合確認)
3. 自律推奨候補 (= wave 3 で実装すべき最小範囲)
4. risk 評価 + smoke 計画
5. 連続 GO 判定

### 5.4 自律推論の境界 (= wave 3 plan で守るべき)

- 「polish 候補」 と「規約整合性違反」 を区別 (= P-009 のような重大発見が再発する可能性を排除しない)
- 各候補の **実態を確認してから判定** (= P-007 の自律推奨改訂のように、 N-1 closeout 時の推奨を盲信しない)
- wave 2 で確立した規約 24 全展開状態を **基準線** として扱う (= 違反候補は wave 3 で即対応)

---

## 6. Wave 2 の限界 (= 明示認識)

### 6.1 plan 専用の visual 規約完成

- 規約 24 は plan 主要 component で完成
- Home / Settings / Stargazer 等の他 surface は未着手 (= scope 外、 別 phase で対応)

### 6.2 visual のみの polish

- 機能 polish (= empty state / animation / boundary 体験 等) は wave 3+ 候補
- 「思想保護」 を visual で完成、 「体験完成度」 は wave 3+

### 6.3 keyboard a11y 中心の a11y 改善

- focus-visible で keyboard ring 統一 (= 改善)
- screen reader / voice control の polish は未着手 (= wave 3+ 候補)

### 6.4 「規約 24 全展開」 の plan 内 完全性

- plan 主要 interactive surface は全カバー (= 11 箇所)
- ただし、 将来追加される component / button / field は再度規約 24 確認必要 (= regression test で機械保証)

---

## 7. CEO 報告 + 停止条件

### 7.1 本 audit の到達点

- wave 2 visual smoke PASS の正式記録 (= 6 件)
- freeze 宣言 (= `94bcd220`)
- 達成事項の言語化 (= 7 件構造的 + 11 数値的 + 4 思想的)
- 永続規約 24 全展開完成記録 (= plan 全 11 箇所統一)
- GPT 補正反映の機械保証 (= 26 regression tests with 否定系 + 肯定系)
- Visual-Only Closeout 性格の明示 (= 機能変更 0)
- 残 polish 候補 P-002〜P-008 を wave 3 plan audit へ接続

### 7.2 N-2 wave 2 完了の条件 (= 5 件全達成)

| # | 条件 | 状態 |
|---|---|---|
| 1 | wave 2 plan audit (= `73a7405d`) | ✅ |
| 2 | wave 2 impl (= `94bcd220`) | ✅ |
| 3 | CEO smoke PASS (= 6 件) | ✅ |
| 4 | regression test 永続化 (= 26 件、 GPT 補正反映) | ✅ |
| 5 | **wave 2 closeout audit** (= 本 commit) | ✅ |

→ **N-2 wave 2 完了**。

### 7.3 次への接続

- 本 audit 着地後、 **freeze 宣言** (= decision-log 追記、 `94bcd220` を正式 frozen 記録)
- 次に **wave 3 plan audit** (= 別 doc、 残候補 P-002〜P-008 再評価から開始)
- wave 3 plan で wave 3 範囲確定 + 連続 GO 判定

### 7.4 停止条件 (= 自律推論の境界)

以下のいずれかが発生した場合、 **即停止**:
- frozen branches (= 59 件) への追加 commit
- N-2 wave 2 の追加変更
- DayGraphTimeline (= wave 1 適用済) への追加変更
- 規約 24 違反候補 (= `focus:ring-indigo` / `focus-visible:ring-indigo` / `ring-offset-*`) の復活
- **brand color (= indigo, purple) の focus ring 文脈での復活** (= CEO 明示禁止)
- slate 系 focus-visible 規約からの離脱 (= CEO 明示禁止)
- 他 polish 候補 (P-002〜P-008) の本 closeout 段階での混入
- 「不足 N 分」 を常時表示
- amber / orange / red / icon / badge 追加
- M phase の追加変更
- M-2a / L-4a 文言の変更
- Arrival Risk / warning / recommendation / optimization 近接
- localStorage / DB / env / package / dependency 変更
- fetch / endpoint / runtime telemetry sink
- Counterfactual / Routes API
- **Deploy readiness / Stargazer pivot / 初期 user 獲得** (= /plan complete 後)

---

**完了**: N-2 wave 2 closeout audit 着地。 smoke PASS 6 件記録 + freeze 宣言 (= `94bcd220`) + 達成事項 + 永続規約 24 全展開完成 (= plan 全 11 箇所統一) + GPT 補正反映 26 tests + Visual-Only Closeout 性格明示 + 残 polish 候補 P-002〜P-008 wave 3 接続。 次は **freeze 宣言の decision-log 追記** → **N-2 wave 3 plan audit** (= 別 doc、 残候補再評価から開始、 CEO 前提 4 点維持)。
