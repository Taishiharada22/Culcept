# L-0 liveCollector silent 欠落 zero-code 検証結果（2026-06-12）

**スコープ遵守**: read-only 検証のみ。コード変更 0（プローブはリポジトリ外 `/tmp/l0probe{,2}.mjs`）・DB write 0（プローブ内に insert/update/delete/upsert/rpc/createUser 等が無いことを実行前 grep で証明）・migration 0・route 変更 0・配線 0・UI 0・production 操作 0・push 0。
**対象環境**: `.env.local` の単一 Supabase プロジェクト（`STAGING_SUPABASE_PROJECT_REF` と同一 = staging 扱い。値・キーは一切出力していない。途中、service key が「クォート込みで読まれて Invalid API key」になる手元パーサ問題があり修正して再実行——env ファイル自体は無変更）。
**設計準拠**: [m2-b-closeout-and-livecollector-owning-task.md](m2-b-closeout-and-livecollector-owning-task.md) §2.2-§2.3 の L-0 手順。

---

## 使用したプローブ（すべて read-only・counts only）

| # | プローブ | 視点（client） |
|---|---|---|
| P1 | `coalter_pair_states` のメタ列 select（id/state/accepted_at/onboarded_at、≤20行） | admin（service key・RLS bypass） |
| P2 | ペア毎の `stargazer_axis_snapshots`(context IS NULL / 全体)・`stargazer_alter_growth`・`talk_messages`・`coalter_fairness_ledger` の **count head:true**（行データ非転送） | admin |
| P3 | 上記テーブル + `coalter_sessions`/`coalter_messages`/`stargazer_daily_states` 等の総数 count | admin |
| P4 | **同一クエリの admin vs anon 比較**（silent filtering 実証） | admin / anon（未認証 user-RLS） |
| P5 | auth ユーザー数（`auth.admin.listUsers` page1・数のみ） | admin（auth read） |

出力規律: counts・boolean・truncated UUID のみ。性格スコア・メッセージ内容・キー値は一切取得/出力していない（count head:true は行データ自体を転送しない）。

## 6 つの検証質問への回答

| Q | 回答 | 証拠 |
|---|---|---|
| 1. パートナーに `context IS NULL` の axis 行は実在するか | **存在しない（この環境には）**。`stargazer_axis_snapshots` 総数 **0**（テーブルは実在: error null）。そもそも `coalter_pair_states` **0 行**＝ペアが 1 組も存在しない | P1/P3 |
| 2. caller の user-RLS 経路は相手行を silent に落とすか | **メカニズムとして確定**。実データでのライブ実証: `external_anchors`（111 行実在）への同一 count クエリが admin=111 / anon=**0・error:null**＝RLS はエラーを出さず行を黙って消す。これに RLS ポリシー文（`auth.uid() = user_id`、`20260307170000:47-62`）+ invoke route が user-RLS client を注入している事実（`route.ts:8,44`）を合わせると、**ペアと axis データが存在した瞬間に相手行は無音で欠落する**ことが構造的に確定。ただし「実ペアの実データ」での直接観測は対象データ不在のため不可能だった | P4 + 静的根拠 |
| 3. admin/self-read 経路で相手行の実在を確認できるか | admin 経路は動作確認済み（error null で count が返る）。確認対象の相手行が **0 件**のため「実在の確認」は対象なし | P2/P3 |
| 4. 欠落は axes/growth に限られ、talk/ledger は pair RLS で読めるか | **ポリシー文上は Yes**（talk=thread RLS / ledger=`auth.uid() IN (user_a,user_b)`、`20260415100000:140-160`）。ただし talk_messages・ledger とも **0 行**のためライブ差分実証は不可。静的確認のみ | P2/P3 + migration |
| 5. observationBundle は欠落 partner state をデフォルト埋めするか | **Yes（コード直読で確認）**: `composeStargazerObservation(null)` → decisionAxes [] 等（[observationBundle.ts:203-214](../lib/coalter/understanding/observationBundle.ts)）、`composeAlterObservation(null)` → trustLevel {level:0}・phaseState null（同 231-240） | 静的 |
| 6. route は fail-open / UI から隠すか | **Yes（コード直読で確認）**: stage1 例外は catch → `console.error` + `return undefined`（[route.ts:346-349](../app/api/coalter/invoke/route.ts)）。outcome "failed" も最小オブジェクトで返り、narration は失敗を表示しない | 静的 |

## 判定

**「メカニズムとして confirmed・現環境の実害ゼロ」**:
- 疑われたバグは**コード+RLS 構造として実在する**（user-RLS client × own-rows-only ポリシー × PostgREST の無音フィルタ、ライブ実証済み）。ペアと axis 観測データが生まれた瞬間に必ず発現する。
- ただし検証可能な環境には **CoAlter ペア 0・coalter_sessions 0・axis snapshots 0**（auth ユーザー 1 名・external_anchors 111 行＝plan 系は実使用あり）。**現時点で劣化しているセッションは存在しない**。
- production 相当の別プロジェクト（`SHIFT_SMOKE_PROD_URL_DENY` の存在から別 URL があると推測）は**スコープ外のため未プローブ**＝そこでの実データ有無は inconclusive。

## 副次的発見（報告のみ・対応は別判断）

1. **この環境では Stargazer 連続観測の書き込みが一度も起きていない**（axis_snapshots 0・daily_states 0）。M2-A/M2-B-1 の port はこの環境では全ユーザーに空 axes を返す＝personalization パイプラインのデータ源が未充填。Travel/plan のパーソナライズ検証には観測データの発生（または seed 方針の決定）が前提になる。
2. `.env.local` 内のキー値がダブルクォート付き・`NEXT_PUBLIC_SUPABASE_ANON_KEY` の重複定義あり（パーサによっては事故の元）。env 整理は別タスク候補（本検証では無変更）。

## M2-B-2 の扱い / 次の推奨

- **M2-B-2 は HOLD 維持**（むしろ補強: 受益する実ペアがまだ 1 組も存在しない。緊急性なし）。
- **修正（L-1〜L-3）は「緊急パッチ」ではなく「CoAlter ペア機能を実稼働させる前の前提条件」として位置づけ直す**ことを推奨。実ペアの初回オンボード前に L-2 shadow → L-3 flip が完了している状態が理想（最初のペアから正しい Stage 1 を提供できる）。
- 次のアクション候補（いずれも別 GO）: (a) L-1/L-2 は CoAlter ペア稼働計画と同期して着手 (b) production 相当環境の counts-only プローブは GitHub/production アクセス回復後に CEO 判断 (c) 副次的発見 1（観測データ未充填）の扱いを personalization トラックの前提として CEO へ提起。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
