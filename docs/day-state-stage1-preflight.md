# Day State — Stage 1 Preflight（W0 成果物・Stage 1 GO 前の必読）

- 日付: 2026-06-12 / 作成: 契約管理セッション（W0 docs-only）
- 前提: Session B 正式 close（branch `claude/session-b-ui-from-7a817ab1`・UI 最終 `5bb868fd`・closeout `9cdbfd5d`）= **デザイン/レイアウト受領。Stage 1 配線 GO ではない**
- 正本: `docs/alter-tab-visual-contract.md`（v0.1 = 緩和反映版）/ `docs/day-state-alter-tab-v0-design.md`（v0.4）
- 受領監査の証跡: B 成果は runtime 純度違反 0（30 ファイル全新規・import type 9 箇所のみ・三重ガード・N-3 ゼロ — 監査 3 系統で機械検証済み）

---

## 1. Stage 1 前ブロッカー一覧

### 🔴 HIGH（W1 で解消必須）→ **W1 で解消済み（2026-06-12）**
| # | 事項 | 内容 |
|---|---|---|
| H-1 | **睡眠入力導線の喪失**（B closeout の stale 項目） | closeout「睡眠シート ✅」は初版時点の記録であり、**最終 UI では導線が消滅**（トリガーが dead code の RealityContextCards.tsx:79 にのみ存在。現用 StateBackgroundPanel の睡眠セルにタップハンドラなし）。`user_reported` の睡眠 h 表示（visual-contract §0.1）は本導線が前提。**W1 で復旧、または正式廃止の CEO 判断** → ✅ **復旧済み**: StateBackgroundPanel の睡眠セルをタップ可能化し AlterTabBody の睡眠シート（よく眠れた/浅い/短い）へ接続（ack/local UI のみ・保存なし） |

### 🟡 契約 → 実装（W2 で実装。契約は v0.4 で確定済み）
| # | 事項 | 内容 |
|---|---|---|
| C-1 | `MomentStateV0.timeBucket: TimeBucket \| "unknown"` | parse 不能時 placeholder の廃止（Stage 0 受領監査 3）。設計書 §2.1 v0.4 で契約確定。実装 + fixture は W2 |
| C-2 | `dailyModeHint` 供給 | server 側で resolveDailyMode 実行 + `dailyModeHintConfidence`（入力 min confidence）併送の additive input（設計書 §3.3 v0.4）。固定 0.5 廃止。実装 W2-W3 |
| C-3 | builder が `nightCheck.state="followup"` を出力しない | B closeout 記録事項。W2 で状態機械に追加 |
| C-4 | Morning Reveal の dayFelt アンカー語（「少し余った」等）が VM にない | 帯語代用中。アンカー語表示は additive 改訂（W2 任意） |

### 🟡 W1 衛生（B branch merge 直後に実施）→ **W1 で全件処理済み（2026-06-12）**: W1-1 ✅（unknown は `—`+note・bar 0）/ W1-2 ✅（RefBadge「参考値」を睡眠h・体質スタミナ・消耗予測・回復見込み・推移チャートに付与）/ W1-3 ✅（AlterHeader・TodayFlowStrip・RealityContextCards・AlterChatPreview を削除、AlterAvatar.tsx へ移設、withChat prop 除去 — importer 0 を機械確認）/ W1-4 ✅（B 側 2 + main 側 2 のコメント精密化・ロジック不変）/ W1-5 ✅（MitateBadge に zone.source 配線・本人=インディゴ表示・confidence は title 保持）/ W1-6 ✅（assets/README.md で superseded 記録・残置）
| # | 事項 | 内容 |
|---|---|---|
| W1-1 | **unknown→0% の修正（禁止事項）** | band→% 写像 5 表が unknown=0 のまま StateBackgroundPanel / ForecastGrid が「0%」を無条件描画。**unknown は `—` /「まだ読めていません」へ**（visual-contract §0.1。0 は実測風に読める） |
| W1-2 | mock_reference の「参考値」明示 | 体質スタミナ・睡眠 5.8h・消耗予測・回復後予測・推移カーブ動態に UI 上の mock 明示が無い（コメント宣言のみ）。「参考値」バッジ等を付ける。**実測断定は禁止・本番 activation 前に再裁定必須** |
| W1-3 | dead code 3 ファイルの整理 | `AlterHeader.tsx`（B5 削除）/ `TodayFlowStrip.tsx` / `RealityContextCards.tsx` = importer ゼロ（≈319 行）。**削除 or 明示 superseded 化**。あわせて AlterChatPreview（avatar 供給のみ）・withChat dead prop |
| W1-4 | stale コメント 4 箇所 | B 側: `bandDisplay.ts:7` / `BatteryCallout.tsx:9`（「% は一切出さない」残骸）。main 側: `lib/plan/dayState/dayStateTypes.ts:236` / `buildAlterBatteryViewModel.ts:6`（「画面に数値として出さない」→「正本 VM の文字列に数値を出さない（数値化は derived 層の責務）」へ精密化。canonical VM 自体の規律は不変） |
| W1-5 | MitateBadge の source 未配線 | zone.source（"見立て"/"本人"）を読まず固定表示。confidence も未消費。配線する |
| W1-6 | アセット原本 ≈5.9MB の置き場 | 実使用は processed 2 点 + over.png（dev のみ）。原本 PNG 6 点の repo 内置き場（docs/assets 退避 or 削除）を判断 |

### 🟠 Stage 1 判断事項（CEO）
| # | 事項 | 内容 |
|---|---|---|
| D-1 | **「今日の流れ」事実帯の消滅** | ResourceTrendChart への置換で予定ラベル等の事実表示が render 木から消滅（flowTimeline.segments の label がどこにも描画されない）。CEO 判断（2026-06-12）= **推移予測へ統合** → ✅ **W1 で実施**: ResourceTrendChart 下部に流れレール（実セグメント由来のみ・event/travel/余白・予定ラベル最大 3 件・凡例追加） |
| D-2 | 緩和の本番 activation 再裁定 | 数値・mock_reference 表示は dogfood 検証まで許可済み。**本番一般公開前に再裁定**（visual-contract §0.1） |
| D-3 | A0-A4 dogfood 7 日判断（6/16 頃）との順序 | タブ配線 ON（tab bar ピル = 共有表面の変化）は 7 日判断後を推奨（N-3 監査対象） |

## 2. W1 以降の実行計画（精密化版。各 W に gate — GO はまだ無い）

| W | 内容 | gate / 不変条件 |
|---|---|---|
| **W1** | B branch merge（`claude/session-b-ui-from-7a817ab1` → A 系。全新規 30 ファイルのため conflict リスク低）+ 衛生一式（H-1 睡眠導線復旧 / W1-1〜W1-6） | CEO の merge 指示。UI コードに触るのはこの W から |
| **W2** | pure 追補（lib/plan/dayState）: C-1 timeBucket unknown / C-2 dailyModeHint+confidence input / C-3 followup state / （任意 C-4）+ fixture 追補 | 契約 v0.4 準拠。runtime 不接続のまま |
| **W3** | 配線: PlanClient TABS に alter 追加（const flag 既定 OFF）+ adapter 層（anchors/DayGraph→DaySegmentLite・resolveDailyMode・interpersonalLoadHint・estimatedWalkLevel・weather・shift・jstNow 注入）→ 実 VM → screenViewModel 接続 | 「UI 追加」stop gate 解錠（CEO）。D-3 の順序 |
| **W4** | localStorage dogfood: `plan_day_state_v0` / `plan_night_check_v0` / `plan_morning_reveal_v0` + 補正 UI→`applyUserCorrection` + Night Check→`gradeNightCheck` + Morning Reveal 初表示 | 「新規データ保存」stop gate 解錠（CEO） |
| **W5** | 状態入力スリット → 既存 route `source:"plan"` 送信のみ（会話→構造抽出は Stage 1.5 のまま・センサー未完） | — |
| **W6** | dogfood 計測 7-14 日（開封率 / Night Check 回答率 / 補正率 / 見立て match 率 baseline）+ 28 日減衰チェック | — |

## 3. 不変条件（Stage 1 全体）

- Supabase / DB write なし（**Stage 2 は NO 継続**）・push / 通知なし（B2/R6 gate）・A0-A4 dogfood 表面不接触
- canonical `AlterBatteryViewModel` を表示都合で拡張しない（数値は derived 層 — visual-contract §4.1）
- 数値の出自 5 分類と unknown 数値禁止（visual-contract §0.1）
- 緩和は Alter タブ表面限定 — A3 What-if / N-3 表面の数字・語彙禁止は不変
- 実装セッションは契約 docs を変更しない（矛盾発見時は差し戻し停止 — Stage 0 closeout で固定済み）
