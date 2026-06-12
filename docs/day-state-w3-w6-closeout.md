# Day State — W3a〜W6 Closeout（pre-production。**production gate 前で停止 — CEO 確認待ち**）

- 日付: 2026-06-12 / 実装: 契約管理セッション（CEO 方針更新「production 前まで進めてください」に基づく自律進行）
- branch: `claude/xenodochial-chatelet-0023b2` / tree clean
- 正本: 設計書 v0.4 / visual-contract v0.1 / `docs/day-state-w3-execution-plan.md` / preflight

## 0. コミット一覧（W 単位）

| W | commit | 内容 |
|---|---|---|
| W3a | `70d34541` | ALTER タブ配線（flag 既定 OFF・adapter・実 VM・in-memory 入力） |
| W3b | `708d039c` | read-only 供給系（hints route・dailyModeHint・walkLevel・weather） |
| W4 | `cba56c00` | localStorage dogfood（3 キー・凍結正本化・Reveal 既読） |
| W5 | `13e20bae` | 入力スリット → 既存 alter route `source:"plan"`（入口のみ） |
| W6 | `38ad79b9` | regression 監査の採用修正 4 件 + 裁定 2 件 |
| **W6-smoke-fix** | `999d6e5d` | **CEO 実機 smoke の 2 FAIL 修正**（下記 §10） |

## 10. W6-smoke-fix（CEO 実機 smoke の 2 FAIL 修正・2026-06-13）

CEO の認証済み実機確認で 2 件の FAIL を検出 → root cause を特定して修正。pre-production closeout は本修正を受けて再提出。

### FAIL 2: 23:17 に Night Check が出ない — **root cause = 時刻ソースの分裂**
- `screenViewModel.jstNowMinutes` は UTC+9 を明示計算して**常に JST**（ResourceTrendChart の now marker = 23:17）。一方 `adapter.toHHMM`/`subjectiveDateFor` は素の `now.getHours()` = **ブラウザ local TZ**。CEO 環境のブラウザ TZ が JST 以外（例: UTC 14:17）だと `deriveMomentState` の timeBucket が afternoon と誤判定し、Night Check 窓が開かない。チャート（JST）と gating（local）が分裂していた。
- 修正: `adapter.toJstWallClock(now)`（jstNowMinutes と同一換算）を追加し、タブ内の「今」を JST 壁時計に一本化。`dayInput`（toHHMM/subjectiveDateFor）・`deriveMomentState`・補正/Night Check の timestamp・チャート now marker が**全て同一 JST ソース**に。
- 実証: `buildAlterScreen` fixture で JST 23:17→main / 21:00→main / 13:00→hidden / 深夜 02:00（前日キー）→main。テストは「raw getHours() なら 14=afternoon になる」バグ値も明示的に assert。

### FAIL 1: 補正しても水位が変わらない — **root cause = 中央メーターにタップ導線なし（UX）**
- pure チェーン（`applyUserCorrection`→`estimates`→band/source）は正しい（fixture で unknown→medium・source 本人・連続補正で high まで実証）。estimatesFrozen 正本化も estimates を遮断しない（CEO 懸念点を fixture で反証）。
- 真因: 補正シートのトリガが**左右の小さい BatteryCallout バッジのみ**で、CEO が直感的にタップする**中央の人体メーター（水位本体・HumanBatteryFigure）にはハンドラが無かった**。「どこを押せば水位を直せるか」が不明瞭。
- 修正: HumanBatteryCard の中央人体上に**透明タップ領域 3 つ**（脳/心/体）を重ね、`onZoneTap` に配線（絵は不変・z はバッジの下）。中央タップ→補正シート→水位即時反映。

### 構造改善（テスタビリティ）
- container ロジック（旧 built useMemo の中身）を `app/(culcept)/plan/tabs/buildAlterScreen.ts`（pure）に抽出。AlterTab は本関数を useMemo で呼ぶだけに。これにより「補正→VM」「Night Check 窓」が node で fixture 検証可能になった（+9 tests）。

### 検証
- 全 20,256 PASS（+9）/ FAIL 2 = 事前存在の reality 静的安全（不変）・tsc 55 不変・build exit 0・route smoke（flag ON: /plan 307 / hints 未認証 401 / 不正 date 400）PASS
- **CEO 実機確認（2026-06-13）**: ①ALTER タブ表示・Night Check タイミング・補正導線とも有効化を確認。続けて §11 の追加指示。

## 11. W6-smoke-fix-2（水位の 0-100% 正確化 + カーソル補正・2026-06-13・commit `f9641f23`）

CEO 実機の追加指摘 3 件 + Morning Reveal 接続。

### ①② 体/頭/心の水位を 0-100% 正確に
- root cause ①: `BAND_FILL.high = 0.8`（AI 見立ての最大が 80%）で満タンに届かない。figure 自体は visualFill=1.0 で頂部まで満ちる設計。
- root cause ②: heart レイヤーは**サイズ + 不透明度を微増させるだけ**で水位（液面）を持たず、% が視覚で分からない。
- 修正: **manualLevels 層**（本人がカーソルで合わせた 0-100% → `visualFill = pct/100` に 1:1 写像。AI 見立ての離散 band/BAND_FILL に縛られず 0-100% を正確描画）。heart を body/brain と同じ**下→上の液面メーター**に作り替え（heart.png mask 内をゴースト + 液体で満たす）。
- AI 見立て（estimates・band・BAND_FILL）は不変。manualLevels は本人入力の別レイヤー（凍結＝採点基準も不変）。

### ③ チップ → カーソル（連続 %）
- 補正シートの 3 チップ（もっと低い/合ってる/もっと高い）を **0-100 スライダー**に置換（ライブ反映＝ドラッグ中に人体メーターが動く・現在 % 数値表示・「完了」ボタン）。スライダーは現在の水位 % で初期化。
- 対象は人体メーター 3 系統（体/頭/心）。外出耐性は水位メーターでないため従来 3 択を維持。
- `manualLevels` を `userInputs` に additive 追加・localStorage 永続/復元（W4 経路）。

### ④ Morning Reveal 接続
- 前日 record（Night Check 回答済み）→ 翌朝 Reveal 表示・1 朝 1 回（既読キー）を fixture で実証（既存実装の接続確認）。

### 契約・検証
- **canonical VM 形状不変**: visualFill は数値（0-1）のまま・% は UI/derived 層（screenViewModel）。「VM 文字列に数値を出さない」規律維持（BANNED regression PASS）。
- DayStateRecord は `userInputs.manualLevels?` を additive（後方互換）。**設計書 §3.2 に manualLevels の契約追補が必要**（CEO 指示で実装済み・docs 追補は CEO 裁定待ち）。
- +7 tests（manual % 5 + Morning Reveal 接続 2）・tsc 55 不変・build exit 0。
- **未検証（CEO 依頼）**: 認証ブラウザで figure 描画の目視 — ①体/頭がスライダー 100% で満タンに届く ②心臓が % で液面が変わる ③スライダーで % を直接動かせる ④翌朝 Morning Reveal。**production gate 未通過で停止**。

## 1. touched / deleted files（全 W 合計）

**新規 7**: `lib/plan/alterTab/{adapter,dayStateHints,dayStateStorage}.ts` / `app/(culcept)/plan/tabs/AlterTab.tsx` / `app/api/plan/day-state-hints/route.ts` / `tests/unit/{alterTabAdapter,dayStateHints,dayStateStorage}.test.ts`
**変更 6**: `app/(culcept)/plan/PlanClient.tsx`（flag 分岐内に閉じる: PlanTab union / TABS_WITH_ALTER / visibleTabs / render 分岐 / TabIcon case / props）・`app/(culcept)/plan/page.tsx`（prop 2 個）・`lib/plan/featureFlags.ts`（flag 2 個 additive）・`lib/stargazer/alterHomeAdapter.ts`（**resolveDailyMode の export 化 1 語のみ** — 契約 C-2 が server 実行を予定・挙動不変）・`app/(culcept)/plan/tabs/AlterTab.tsx`・`.claude/launch.json`（dev-alter-preview に env 2 個 = CEO ワンクリック検証用）
**deleted: 0**

## 2. 検証結果

| 項目 | 結果 |
|---|---|
| tests | **20,247 PASS / 2 FAIL / 1 skip**。FAIL 2 件は**事前存在**（reality 静的安全テスト: A1-6-5d `17826f16` で追加された consumed-seed-repository-supabase / plan-seed-status-executor が期待リスト未更新。本 W 群の diff 不接触・件数不変）。day-state 系は 140 tests（W3a+12 / W3b+15 / W4+10 追加）全 PASS |
| tsc | **55 = baseline 不変**（8GB 指定） |
| build | `next build` exit 0（全 W 後に都度実行・`/api/plan/day-state-hints` 生成確認） |
| route smoke | flag 全 OFF: `/plan` 307(auth)・hints **404（inert）** / flag 全 ON: `/plan` 307(auth)・hints 未認証 **401 + 全 null**・不正 date 拒否 |
| flag OFF UI 不変 | PlanClient diff が flag 分岐内に閉じることを diff 精査で確認（OFF 時 `visibleTabs === TABS` 参照同一・`activeTab==="alter"` は到達不能 dead branch） |
| N-3 regression | 既存 BANNED テスト（禁止 9 語 + % + 開始残量）PASS 維持。新規 UI 文字列はコメントのみ |

## 3. read / write の全量

**read（新規は W3b の bounded read 3 のみ・全て RLS・user 自身の行）**: `stargazer_profiles` 1 行 / `stargazer_resolved_types` 1 行 / `alter_morning_plan_history` 当日 1 行（**既存 reader `fetchPreviousDayPlan` を再利用 — このテーブルの読み手を増やしていない**）。weather は Open-Meteo（キー不要・my-style 既存利用の流用・新規課金/認証なし）
**write**: **DB / Supabase write ゼロ**。localStorage のみ（W4・flag gate）: `plan_day_state_v0` / `plan_night_check_v0` / `plan_morning_reveal_v0`（versioned・safeSetItem・30 日 purge・防御 parse）。※W5 送信先の既存 alter route が dialogue を保存するのは**当該 route の既存挙動**（新規 write 経路の追加ではない）
**やっていないこと**: production deploy / Vercel / push / PR / migration / env 変更 / 通知・外部送信・予約・実世界 apply / destructive git / canonical VM 拡張 / A3・N-3 契約緩和 — **全てゼロ**

## 4. flag 構成（全て既定 OFF・server-side env・props 渡し）

| flag | 効果 | OFF 時 |
|---|---|---|
| `PLAN_ALTER_TAB_ENABLED` | ALTER タブ + hints route 解放 | タブ列 bit 同一・route 404 |
| `PLAN_DAY_STATE_STORAGE` | localStorage 3 キー保存 | 保存ゼロ（in-memory のみ） |

dev 検証: launch 構成 **dev-alter-preview** に両 env 設定済み（CEO はこれde起動 → `/plan` → ALTER タブ）。
契約 §6.2 の「const boolean」は 2026-06-04 CEO 規律（env 制御化 = 手動 flip footgun 解消）に従い env 駆動で実装 — D-2 再裁定時に契約文言の追従が必要（docs は実装セッションから変更しない規律のため未修正）。

## 5. W3b 供給系の取得元・fallback・失敗時表示（CEO 要求様式）

| 供給 | 取得元 | fallback | 失敗時表示 |
|---|---|---|---|
| dailyModeHint + confidence | facts（mood/sleep/夜勤）→ frame 合成 × `resolveDailyMode`（personality = profiles + resolved_types） | 信号ゼロ ∧ 軸証拠あり → personality prior **0.2** / 証拠なし → **hint なし**（W2 保守 fallback） | モードは inferred 低確信表示 |
| estimatedWalkLevel | 当日 morning plan の dayConditions（JSONB 防御抽出） | union 外・欠落 → null | 影響フィールド unknown 側 |
| interpersonalLoadHint | **供給保留**（withWhom が自由文字列のため推測しない — Stage 1.5 構造抽出後） | undefined | unknown |
| weather | weatherService（Open-Meteo・subscription→geolocation） | 例外 → null | outingTolerance 等「—」 |

## 6. W6 監査（敵対的レビュー）の裁定記録

- **採用 4**: ①主観日跨ぎ（05:00）で本人入力をリセット — 前日入力が新しい日の record に保存される**実害バグ**（タブ開きっぱなし時）②nightCheck 復元の answeredFor 一致防御 ③hints route の暦日 roundtrip 検証（"2026-02-30" 拒否）④W5 sessionId のマウント単位束ね
- **不採用 2（裁定）**: ①「morningReveal null 上書き = canonical VM 契約違反」→ **違反ではない**: null は VM 契約の正規状態で、既読管理は §6.2 が storage/container 層に割り当てた責務（pure builder は storage を知れない）。コメントで明文化 ②「hydration frozen 整合に hydrationLoaded flag を」→ 既存ガード `hydration?.date === date` + 保存側ガードで成立。提案実装は日跨ぎを壊すため不採用

## 7. W3a〜W5 の意味論（過大主張しない）

- 凍結は **W4 から正本化**（保存済み estimatesFrozen を維持。W3a 時点の「マウント毎再凍結」は廃止）→ Night Check 採点・match 率の前提が成立
- Morning Reveal は前日 record + 回答が localStorage にある朝のみ・1 朝 1 回（既読キー）
- 入力スリットは**入口のみ**（送信 → ack。会話展開・返答表示・構造抽出なし = センサー未完のまま）
- screenViewModel の mock_reference（体質スタミナ・推移カーブ動態・睡眠 5.8h 表示系）は参考値バッジのまま = **D-2 本番前再裁定の対象リスト不変**

## 8. 残リスク・既知の注意

1. **未検証 1 点: 認証済みブラウザでの flag ON 目視**（私の環境では auth 不可）。CEO の dev-alter-preview 起動で確認を依頼: 実予定日の水位/カード/レール、睡眠タップ→セル反映、補正タップ→水位変化、夜の Night Check 回答→リロード後も保持、翌朝の Reveal
2. screenViewModel:217 の「睡眠 user_reported → 5.8h（mock）」: 本人タップ後の表示は W1 の SLEEP_DISPLAY が優先するため実害は遮蔽されているが、**D-2 再裁定リストに追加すべき**（h の出自が mock のまま）
3. 事前存在 FAIL 2 件（reality 静的安全テスト）: A1 系 owning session で期待リスト更新 or 配置裁定が必要（本 W 群のスコープ外）
4. 保存は record 再構築の都度（1 分 tick 含む）上書き — 容量・整合とも無害（数 KB・同一キー）だが、計測ノイズにはならない設計（W6 計測は別途）
5. dailyModeHint の facts 合成は energy 信号のみ（desire は常に unknown）— 入力スリットの構造抽出（Stage 1.5）が入るまでモード精度は personality 寄り

## 9. 次へ進む理由と停止点

- W3a→W6 の各完了条件（tests/tsc/build/smoke/flag OFF 不変/read・write 制約）を全て満たし、絶対停止条件への抵触はゼロ
- **ここが production gate 直前の停止点**。以後（production deploy / Vercel / push / PR / 本番 env / Stage 2 DB）は CEO 確認後のみ
- CEO 確認事項: ①dev-alter-preview での flag ON 目視（§8-1 チェックリスト）②W6 計測（開封率/回答率/補正率/match 率 baseline・7-14 日）の開始判断 ③D-2 再裁定（§8-2 追加分含む）④事前存在 FAIL 2 件の扱い
