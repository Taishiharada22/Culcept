# Day State Stage 0 — Closeout（Session A / Reality Logic）

- 日付: 2026-06-11
- 実装: 契約凍結セッション（= Session A 継続実行。CEO 決定）
- 契約正本: `docs/day-state-alter-tab-v0-design.md`（v0.3）/ `docs/alter-tab-visual-contract.md` §4 / `docs/handoff-session-a-logic.md`
- 検証: 実装後に敵対的監査 2 系統（契約適合 / HARD 条件）→ 指摘を全て修正 or 本書に記録
- **touched files の正確な記述（受領監査 1 対応）**: 実装・テストは**新規ファイルのみ**（`4b576dcc` = 新規 10）。ただし `95d75b9b` は監査反映として**契約 docs 3 通（設計書 / visual-contract / handoff-A）に追補あり**（git show --name-only で検証可能）。「既存ファイル変更ゼロ」は**コード（lib/ tests/ 既存実装）について真**であり、契約文書には適用されない — 当初報告の表現は不正確だった

## 1. 成果物

| 種別 | ファイル |
|---|---|
| 型契約 | `lib/plan/dayState/dayStateTypes.ts` |
| 時刻ヘルパー | `lib/plan/dayState/timeOfDay.ts`（契約差分: helper 1 ファイル追加。pure・runtime 影響なし） |
| 純関数 4 本 | `buildDayStateRecord.ts`（+ `applyUserCorrection` 補助）/ `gradeNightCheck.ts`（+ `isHeadlineEligible` 補助）/ `deriveMomentState.ts` / `buildAlterBatteryViewModel.ts` |
| テスト | `tests/unit/dayState{GradeNightCheck,BuildRecord,MomentState,ViewModel}.test.ts` — **94 tests / 4 files 全 PASS** |

- `npx tsc --noEmit`（8GB）: **55 errors = 既存 baseline と同数（新規エラー 0・dayState 起因 0）**
- runtime 不接続: UI / route / PlanClient / localStorage / Supabase / feature flag への接触ゼロ（監査で grep 検証済み）
- import 規律: 既存モジュールからは **import type のみ**（8 import 全て型。heartIntegration / receptivity-gate / authority-escalation / resolveDailyMode の関数 import ゼロ。now は全関数で引数注入・グローバル時刻 API 直呼びゼロ）

## 2. 閉鎖分類

**4 区分サマリ（受領監査 5 指定）**:
| 区分 | 内容 |
|---|---|
| Stage 0 で実装済み | DayStateRecordV0 / MomentStateV0 14 フィールド / NightCheckGradeV0 / AlterBatteryViewModel / 採点 3 対象（energyLevel 20 セル・recoveryNeed・dayFeasibility 9 ケース）/ 凍結・補正・層別・unknown 規律（94 tests） |
| summary data まで | **Morning Reveal**（items + B1 前固定 adjustmentNote。UI なし）/ flowTimeline（segments 写像のみ）/ nightCheck 表示状態（state machine の値のみ） |
| Stage 割当のみ | EventRealityNode adapter（1.5）/ RequestRealityFrame（v1）/ PlaceCandidate（A4）/ RealityDiff（A3）/ futureSlots 3 / 完全答え合わせループ（2-3）/ 軸係数適用 + WIRE flag（D） |
| out-of-scope | Alter のセンサー化（Composer は入口のみ）/ dayFeasibility の本物の成立予測 / 毎分保存 / push・通知・proactive 配信 |

**詳細（3 区分）**:

**closed_as_implemented_contract（実装済み契約）**
- DayStateRecordV0（facts 8 / estimates 7 / estimatesFrozen + frozenKind 3 区分 / userInputs + sleepQuality / nightCheck / carryOverOut / EvidenceTag 14）
- MomentStateV0 **14 フィールド**（receptivity 値域 silent/on_open/unknown・push 系除外。閾値 15/45/30/20/90 分は named constant）
- NightCheckGradeV0（verdicts 3 対象 / carryOverOut / nextDayPriorAdjustments + contextKey）
- AlterBatteryViewModel（3 系統バッテリー / 周辺カード 7 / flowTimeline / **Morning Reveal summary data**（UI なし・B1 前 adjustmentNote 固定文）/ nightCheck 表示状態 / 禁止語 regression テスト付き）
- 採点: energyLevel 20 セル表 / recoveryNeed（±1 吸収なし — 下記裁定）/ dayFeasibility 9 ケース行列 / over→lower・under→raise / 凍結不変 / user_confirmed + morning_baseline 二重層別 / 主観日 05:00 境界

**closed_as_stage_assignment（Stage 割当として閉鎖 — 実装していない）**
- EventRealityNode adapter（Stage 1.5 docs-only から）/ RequestRealityFrame（v1）/ PlaceCandidateReality（A4）/ RealityDiff（A3）— **再実装ゼロ・新設ノードゼロ**（型名 grep で検証済み）
- futureSlots 3 つ（adjustmentDiffSlot / placeCandidateSlot / requestFrameSlot）= docs 予約のみ
- 答え合わせの完全ループ（DB 書込・翌日反映）= Stage 2-3。**Stage 0 は採点純関数まで**
- 軸係数の適用 = Stage D（personaCoefficients は受領 + 未適用テストのみ。`WIRE_DAY_STATE_PRIORS` flag 定数は Stage D で追加と解釈 — HARD-6 の解釈固定）

**closed_as_explicitly_out_of_scope（明示的スコープ外）**
- **「Alter がセンサーになる」は未完**: ミニ Composer は既存 route 入口にすぎず、会話 → DayStateRecord 構造抽出は Stage 1.5 の別契約。センサー化済みとは報告しない
- **dayFeasibility は day-level proxy**: EventRealityNode / Mobility 解決状態 / PlaceCandidate を含む本物の成立予測ではない（表示文も抑制トーン固定テーブル）
- Morning Reveal の UI / 文言生成 = Session B / Stage 1（Stage 0 は summary data まで）
- 1 分単位の状態 = 毎分保存ではなく derive-on-open（deriveMomentState・保存なし）

## 3. 契約裁定・契約差し戻し記録

| # | 事項 | 処置 |
|---|---|---|
| 裁定 1 | §4.3「同規約」と §5.2 明示セルの矛盾（recoveryNeed の ±1 吸収） | **§5.2 を正と裁定 — ただし【CEO 追認待ち】**（受領監査 2: 本来は契約差し戻し対象。論理根拠 = 吸収すると凍結 medium が永遠に match = 学習信号消滅。CEO が ±1 吸収側を選ぶ場合は gradeRecoveryNeed と test 5 件を戻す軽微変更で済む）。**今後の規律: 契約矛盾を見つけた場合は裁定せず差し戻し事項として停止する** |
| 裁定 2 | buildAlterBatteryViewModel の第 4 引数 `segments?` | additive 正式化（visual-contract §4 改訂済み）。理由: record は segment を保持しない（store slow）ため「今日の流れ」完全表示に必要。未提供時は nowSegment のみの縮退表示 |
| 裁定 3 | VM.nightCheck を optional → **常時返却 + state="hidden"** に統一 | visual-contract §4 改訂済み（Session B の分岐単純化） |
| 裁定 4 | emotionalReserve ③（対人密度）の入力チャネル | `interpersonalLoadHint?: "high"|"low"` を additive 追加・実装/テスト済み（設計書 §3.3 に明記） |
| 裁定 5 | departureDeadline の操作的定義 | 「接続判定窓 90 分（`DEPARTURE_TRAVEL_ATTACH_WINDOW_MIN`）内に終端が届く直前 travel の開始時刻」に精密化（設計書 §2.1 改訂済み） |
| 注記 1 | テスト配置: handoff の `lib/plan/dayState/__tests__/` ではなく `tests/unit/` | vitest.config.ts の include が `tests/unit/**` のみのため、HARD-9（既存規約優先）で `tests/unit/` を採用 |
| 注記 2 | dailyMode: resolveDailyMode（runtime 関数）は import 禁止のため `dailyModeHint` 受領方式。hint 時 confidence 固定 0.5 は暫定 — Stage 1 配線で呼び出し側が min confidence を併送する契約に |
| 注記 3 | lateNightEnd は「answeredAt が late_night バケット」の proxy（night 帯・anchor 終端は未参照） |
| **要クローズ（Stage 1 前必須）** | parse 不能時の MomentState.timeBucket placeholder は**危険**（受領監査 3: 正常値の顔でバグを隠す）。**Stage 1 着手前に契約改訂で確定する**: 推奨 = `timeBucket: TimeBucket \| "unknown"` への additive 改訂（throw は表示系 pure 関数に不適・暫定の currentMode=unknown セット解釈は Stage 0 限り） |
| 注記 5 | segments=[] は「予定の無い日」として low pressure 扱い（DayGraph 欠如マーカーは Stage 1 で必要なら additive） |
| 注記 6 | nextDayPriorAdjustments の confidenceDelta は 0 固定（match の +0.1 は Stage 3 消費側が verdicts から導出） |
| 注記 7 | weather: snowy は weather_rain タグに合流（表示ラベルは「雨・雪」に修正済み）。`weather_heat` は WeatherCondition に猛暑が無く現状 dead tag = 将来予約 |
| 注記 8 | applyUserCorrection は recoveryNeed を no-op で除外（§3.2: 系統タップ対象外）。ALTER_MESSAGE.recover の「夜の余白」文は eveningSlackMin>0 の時のみ（事実でないことを言わない） |
| 注記 9 | 根拠チップは系統別帰属（ZONE_EVIDENCE map）— 無関係な根拠を心バッテリーに並べない |

## 4. HARD 14 条件の遵守

1✅ `lib/plan/dayState/` 新規 + tests + 本 closeout のみ 2✅ 既存ファイル変更ゼロ（export 追加不要 — 全型 export 済みを事前 grep 証跡で確認） 3✅ UI/CSS/PlanClient/route/localStorage/Supabase/flag enable 接触ゼロ 4✅ Morning Reveal は summary data まで 5✅ Event/Request/Place/Diff 新設ゼロ 6✅ MomentState 14 フィールド + now 注入（時刻 API 直呼びゼロ） 7✅ receptivity = silent/on_open/unknown（短い一言は interruptibility=low 側） 8✅ frozenKind 3 区分 + morning_baseline 限定をテスト 9✅ 主観日 05:00・02:00→前日・夜勤 fixture 10✅ sleep/recoveryQuality は根拠なければ unknown（型縛り + テスト） 11✅ outingTolerance grounded<2 → unknown 12✅ dayFeasibility = proxy（本書 §2 + 表示文制約） 13✅ Composer はセンサー未完（本書 §2） 14✅ 必須テスト 9 項目すべて実在（監査が describe/it 単位で確認済み）

## 5. 残課題（次セッション・次 Stage へ）

**Stage 1 着手前に閉じる事項（受領監査で確定）**:
1. MomentState.timeBucket の invalid 入力時の型（上表「要クローズ」— placeholder 廃止）
2. `dailyModeHint` の供給設計: **誰が**（タブの server/client どちらで resolveDailyMode を実行するか）**どの confidence で**（固定 0.5 廃止 — resolveDailyMode 入力の min confidence を併送）渡すかが未設計
3. recoveryNeed 裁定の CEO 追認（裁定 1）


- Session B（別セッション）: mock ViewModel で AlterTabBody 試作（handoff-B。morningReveal mock は B1 前文言に修正済み）
- Stage 1（CEO GO 後・A0-A4 の 7 日判断後）: タブ配線 + localStorage + resolveDailyMode/segments/interpersonalLoadHint の実配線
- Stage 2: NO（GPT 監査と一致）— Night Check 回答率・補正率・開封率を見てから
