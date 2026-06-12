# Day State — W3 実行計画（配線。**GO 前の計画書 — 実装はまだ行わない**）

- 日付: 2026-06-12 / 作成: 契約管理セッション（W2 完了後の計画提示 — GPT 指示「W3 GO はまだ。詳細実行計画の提示まで」）
- 前提: W0（契約追従 `17c9af2e`）/ W1（merge + 衛生 `68f7ccc9`+`28335804`）/ W2（pure 追補 `706fcc76`・103 tests）受領済み
- gate: **D-3 = A0-A4 dogfood 7 日判断（6/16 頃）後に CEO GO**。tab bar ピル = 共有表面の変化（N-3 監査対象）
- 正本: 設計書 v0.4 / visual-contract v0.1 / preflight。配線点の棚卸しは本書 §4（2026-06-12 Explore 精査・file:line 確認済み）

---

## 1. 結論 — W3 は 2 段に分割する

精査の結果、W3 の入力には「PlanClient が既に持っているもの」と「新規取得が必要なもの」が混在しており、後者は **dogfood stop gate の「DB・Supabase read」境界（CEO 承認 4 条件）に抵触**する。一括 GO ではなく分割を提案する:

| 段 | 内容 | 新規 read | gate |
|---|---|---|---|
| **W3a** | タブ配線 + adapter + 実 VM 表示（既存 fetch 済みデータのみ） | **ゼロ** | 「UI 追加」解錠のみ（D-3 後の CEO GO 1 つ） |
| **W3b** | server 供給系: dailyModeHint+confidence / weather / morning plan history（estimatedWalkLevel・withWhom→interpersonalLoadHint） | **あり**（3 種） | 各 read を個別に CEO 承認（dogfood stop gate 準拠） |

W3a だけでも「実予定から人体水位・周辺カード・流れレールが動く」状態になり、CEO のテスト密度要求に応えられる。W3b は精度の上積み。

## 2. W3a 詳細（新規 Supabase read ゼロ）

### 2.1 触るファイル（4 + 新規 2）

| ファイル | 変更 |
|---|---|
| `lib/plan/featureFlags.ts` | `ALTER_TAB_ENABLED = false` を const 追加（**2026-05-24 CEO 規律: const boolean・env 不使用**。dev では true に書き換え → 検証 → false に戻してコミット。本番は const false で構造的不可視） |
| `app/(culcept)/plan/PlanClient.tsx` | ①`PlanTab` union に `"alter"`（:144）②`TABS` 配列に `{ key: "alter", label: "ALTER" }` を flag 条件付きで（:149-156）③render 分岐に `{activeTab === "alter" && <AlterTab …/>}`（:974-1009 パターン）④import 1 行。**変更は計 4 箇所・他タブのコード不変**（月ビュー C3 と同パターン） |
| `app/(culcept)/plan/tabs/AlterTab.tsx`（新規） | thin container: adapter → `buildDayStateRecord` → `deriveMomentState` → `buildAlterBatteryViewModel` → `buildScreenViewModel` → `AlterTabBody`。in-memory 補正（系統タップ → `applyUserCorrection` → local state 再構築）+ Night Check の in-memory 回答（チップ → `gradeNightCheck` → verdicts/followup を画面反映。**保存なし — 永続化は W4**） |
| `lib/plan/alterTab/adapter.ts`（新規・pure） | 下記 §2.2。fixture テスト付き（`tests/unit/alterTabAdapter.test.ts`） |

### 2.2 adapter（pure）の写像 — 全て既存計算の再利用・再実装ゼロ

入力（PlanClient が既に保持 — `FetchState`:158-167 / `dayGraphByDate`:454-476 で計算済み）:
`anchors` / `dayIndicators` / `dayGraphByDate[iso]`（= `computeDayGraphMapForAnchors` 出力。eventNodes・gapNodes・movementTransitions・latencyTolerance・timeBucket・density 全て計算済み）/ `now`（クライアント mount 後の `new Date()` — PlanClient:299 と同パターン。**pure 関数へは HH:MM 注入のみ** = handoff 規律維持）

| DayStateBuildInput | 写像元 |
|---|---|
| `segments: DaySegmentLite[]` | dayGraphByDate[iso] の eventNodes/gapNodes/movementTransitions → kind/startHHMM/endHHMM/durationMin/timeBucket/latencyTolerance/label の素直な写像 |
| `density` | DayGraphAttributes.density（再計算しない） |
| `hasUnresolvedTravel` | movement unresolved 状態から |
| `shift` | dayIndicators（off/off_request）+ shift_image source の work anchor 時刻 |
| `weather` | **null（W3a は正直に欠測扱い）** — outingTolerance は grounded signal 2 未満の日が増え「—」が多くなるが、これは §0.1 の仕様通りの保守動作 |
| `moodCode / sleepQuality / bodyEchoChest …` | タブ内チップ入力（in-memory） |
| `dailyModeHint / interpersonalLoadHint / estimatedWalkLevel / heartHint / personaCoefficients` | **undefined（W3b へ）** — fallback は W2 実装済み |

**主観日境界の吸収（要 fixture）**: DayStateRecord の date は主観日（05:00 境界）、dayGraphByDate のキーは暦日。深夜 00:00-04:59 に開いた場合、adapter が **前日の暦日キー**で DayGraph を引く（`toSubjectiveMin` 既存ヘルパー利用）。

### 2.3 W3a の意味論の明示（過大主張しない）

- **estimatesFrozen はマウント毎に再凍結**（永続化なし）— 表示検証専用。match 率の蓄積・Morning Reveal の実データ表示は **W4（localStorage）から**
- Night Check 回答・補正は in-memory（リロードで消える）— 動線とロジックの検証が目的
- screenViewModel の mock_reference（睡眠 h・体質スタミナ・消耗予測・推移カーブ動態）は W3a でも参考値のまま

### 2.4 検証計画（W3a 完了条件）

1. 既存 103 tests 維持 + adapter fixture（写像・主観日跨ぎ・shift 写像・unresolved travel）≈ +8-12 tests
2. tsc 55 不変
3. **flag OFF で全タブの描画・挙動が現状と bit 同一**（A0-A4 dogfood 不汚染の機械確認: PlanClient の diff が flag 分岐内に閉じること）
4. dev（flag ON）目視: 実予定の日に人体水位・周辺カード・流れレール・Night Check 窓が実データで駆動されること。unknown の「—」表示
5. N-3 regression（禁止 9 語・断定形）— 既存テストが VM 文字列を担保

## 3. W3b 詳細（新規 read — 各々個別 CEO 承認）

| # | 供給 | 必要な read / 計算 | 備考 |
|---|---|---|---|
| b-1 | `dailyModeHint` + `dailyModeHintConfidence` | server（page.tsx data 層）で personality fetch（supabase）+ facts から DailyGuidanceFrame を合成 → `resolveDailyMode(frame, personality)` | 契約 §3.3 v0.4。**frame 合成は新ロジック**（会話 message 由来の extract ではなく facts 由来）— 小設計を W3b 着手時に提示 |
| b-2 | `weather` | plan 文脈に天気の取得経路が**存在しない**（精査確認済み）。my-style の `weatherService`（Open-Meteo・localStorage キャッシュ）を lib/shared 化 or 流用 | 外部 API は既存利用の範囲（新規連携ではない）が、plan への導線新設なので CEO 確認 |
| b-3 | `estimatedWalkLevel` / `withWhom`→`interpersonalLoadHint` | `alter_morning_plan_history` の当日 read（plan 文脈では未読 — 精査確認済み） | bounded read（当日 1 行・RLS 内）として承認を取る |

W3b の各項は独立して入れられる（adapter の optional input に挿すだけ）。**推奨順序: b-1 → b-3 → b-2**（見立ての質への寄与順）。

## 4. 精査結果の根拠（2026-06-12 Explore・主要 file:line）

- FetchState: `PlanClient.tsx:158-167` / fetch 経路 `:687-700` → `/api/plan/anchors` → `lib/plan/anchor-fetch.ts:82-100`
- dayGraphByDate: `PlanClient.tsx:454-476`（useMemo）→ `lib/plan/dayGraph/planClientDayGraphHelpers.ts:209-240`（`computeDayGraphMapForAnchors`）→ `buildDayGraph.ts:131-200`
- タブ前例: `PlanClient.tsx:144-156`（PlanTab/TABS）/ `:223`（state）/ `:974-1009`（分岐）
- weather: lib/plan 配下に経路なし（Origin の weatherLoop / alter-morning の weatherAnnotator は別スコープ）
- morning plan history: plan 文脈の read なし（DayConditions は alter-morning の在メモリ抽出のみ）
- `resolveDailyMode(frame, personality, recentModes?)`: `lib/stargazer/alterHomeAdapter.ts:8322-8326`
- now: PlanClient は client mount 後 `new Date()`（`:299`）。pure 関数へは注入のみ

## 5. リスクと手当て

| リスク | 手当て |
|---|---|
| tab bar ピル = 共有表面（N-3 監査対象） | flag 既定 OFF・ON は 7 日判断後の CEO 指示で。OFF 時 bit 同一を完了条件に |
| 深夜帯の主観日とDayGraph 暦日キーのずれ | adapter で吸収 + 専用 fixture（§2.2） |
| W3a の outingTolerance がほぼ「—」（weather 欠測） | 仕様通り（unknown 正直表示）。W3b b-2 で改善 |
| 毎分の moment 再導出 | 開いた時 + 1 分 tick で `deriveMomentState` 再実行（pure・軽量）。保存なし = derive fast 哲学どおり |
| screenViewModel の睡眠/スタミナ mock が実データ画面に混在 | 参考値バッジ済み（W1）。本番 activation 前の D-2 再裁定リストに含まれている |

## 6. CEO 判断点（W3 GO 時に確認）

1. **W3a GO**（「UI 追加」stop gate 解錠。A0-A4 の 7 日判断後を推奨 — D-3）
2. タブ label（案: `ALTER` — N-3 契約語彙「ALTER で見る」と同系）と TABS 内の位置（案: 先頭 or カレンダーの次）
3. W3b の read 3 種（b-1 personality / b-3 morning history / b-2 weather 導線）の個別承認とその順序
4. flag ON（dev dogfood 開始）のタイミング
