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
