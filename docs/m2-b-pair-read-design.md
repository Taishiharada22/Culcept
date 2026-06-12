# M2-B ペア read / RLS 設計（design only・実装禁止）

**作成日**: 2026-06-12
**ステータス**: docs-only design。実装・migration・DB write・service_role runtime 配線・route/server action・UI・Travel runtime・T1A・remote apply・production・push すべて**なし**（GPT 指定 strict scope 遵守）。local only。
**目的**: CoAlter が 2 人プランニングセッションで両ユーザーの personalization state に**安全に**アクセスする方式を決める。
**前提資料**: [m2-personalization-port-design.md](m2-personalization-port-design.md)（M2-A 完了 `3380b98d`）/ [coalter-plan-tab-backend-contract-draft.md](coalter-plan-tab-backend-contract-draft.md)（per-viewer payload 原則）

---

## §1 設計分岐点として確定した事実（2026-06-12 監査+一次ソースリサーチ）

| # | 事実 | 根拠 | 帰結 |
|---|---|---|---|
| F1 | **PostgREST の RPC 戻り値は、呼び出した HTTP クライアントの response body に必ず JSON で返る**。SECURITY DEFINER は「関数内部が何を読めるか」を変えるだけで、戻り値の宛先は変えない | PostgREST 公式 docs（Functions as RPC） | user JWT で呼べる RPC に相手の state を返させる設計は、**返した瞬間に呼び出した本人のクライアントに見える** → 「本人にも生 state を見せない」要件と構造的に非互換 |
| F2 | 列レベル権限（CLS）は Supabase 公式が「**most users に非推奨**」と明言。**role 単位の静的設定で per-row / per-user 不可** | Supabase Column Level Security docs | 「相手ごと・行ごとに変わる per-field 可視性」は RLS/CLS では表現できない → **アプリ層フィルタが正道** |
| F3 | Supabase は新キー体系へ移行中: `sb_publishable_`（anon 後継）/ `sb_secret_`（service_role 後継、**BYPASSRLS**、ブラウザからは User-Agent 判定で常に 401）。legacy キー削除は Late 2026（TBC） | Supabase 公式 Discussion #29260 / migration docs | 特権キーは新体系を見据える。**キー発行・移行は CEO 承認事項**（Operating Rules: API キー発行） |
| F4 | **`lib/supabaseAdmin.ts` は既存**（`import "server-only"` + `SUPABASE_SERVICE_ROLE_KEY`）。app/ の server action・route 10+ 箇所で runtime 使用実績あり（sitemap / drops / out / suggest / coalter handoff-events 等）。一方 **coalter invoke route は user-RLS の `supabaseServer()` のみ**を使用 | `lib/supabaseAdmin.ts:1-15` / grep / `app/api/coalter/invoke/route.ts:8,44` | option A は**新規の権限機構ではなく既存 house pattern の狭域適用**。リスクは「新設」ではなく「適用範囲の規律」の問題 |
| F5 | `stargazer_axis_snapshots` / `stargazer_alter_growth` の RLS は **自分の行のみ**（SELECT: `auth.uid() = user_id`）。ペア向け SELECT ポリシーは migration 全量 grep で**不在** | `20260307170000:47-62` / `20260318200000:20-29` | C 案（現状）はペア相手の行を構造的に読めない |

---

## §2 Output 1: 現行 liveCollector リスク評価（C 案の確認）

**結論: C 案（現行 user-RLS client のまま）は不十分。相手の行の silent 欠落が確認された。**

- 経路: `app/api/coalter/invoke/route.ts:44` が `supabaseServer()`（anon キー + cookie = **caller の user-RLS**）を生成し、`liveCollector.ts` の `fetchAxesByUser(supabase, userA, userB)` が `.in("user_id",[userA,userB])` で両者を読もうとする（`liveCollector.ts:252-290`）。
- RLS（F5）により**相手の行はエラーにならず結果から除外される**（PostgREST の RLS はフィルタとして働く）。
- 下流: `buildObservationBundle()` は空をデフォルト値で埋め（`observationBundle.ts:203-213, 231-239`）、invoke route は stage1 欠落を catch して fail-open（`route.ts:346-349`）、UI は失敗を隠す設計。→ **CoAlter Stage 1 は「相手の軸・phase・trust が常に欠けた状態」で動作している可能性が高いが、エラーも警告も出ない**。
- 設計意図（CEO lock 2026-04-20 M1 1b: 両者の軸を読む）と実挙動が乖離している。**これは M2-B が解くべき本丸であると同時に、既存品質問題として owning 文脈での実データ確認を推奨**（本書は設計のみ、修正実装は別 GO）。
- なぜ不十分か（構造論）: user-RLS は「本人が自分の行を読む」しか表現できない。相手の行を user JWT に開放すれば**相手のクライアントからも読める**方向にしか開けない（F1/F2 と同根）。「**サーバ側エンジンだけが両者を読む**」は user-RLS の表現力の外にある。

## §3 Output 2: ペア read 脅威モデル

対象資産: 性格軸スナップショット（53軸）・HDM phase/trust・（将来）動的状態。これらは Aneurasync で最も機微な「深層観測」データ。

| # | 脅威 | 行為者 | 経路 | 対策（推奨案での） |
|---|---|---|---|---|
| T1 | 好奇心のあるパートナーが相手の生 state を見る | 正規ユーザー | client API（テーブル直読・RPC 直叩き） | user JWT に相手行への経路を**一切作らない**（テーブル RLS 現状維持・state 返却 RPC を作らない[F1]）。出力は per-viewer フィルタ済みのみ |
| T2 | チャット経由の引き出し（「Bの正確なスコアを教えて」等のプロンプト注入） | 正規ユーザー | CoAlter LLM | **最小開示**: LLM には生スコアでなく band 化・派生値のみ渡す。M5 post-check（出力の private 言及検出）。system 規範 |
| T3 | アプリのバグで engine 用 state が API response に混入 | 開発者ミス | serialization | engine-grade 型に**ブランド付与**（`EngineOnly`）+ 出口での payload assertion テスト + serializer が brand を拒否 |
| T4 | 特権キー漏洩 | 攻撃者 | env / bundle 混入 | 単一モジュール隔離（既存 `supabaseAdmin.ts`）・`import "server-only"`（client import はビルド失敗）・`NEXT_PUBLIC_` 禁止・新 `sb_secret_` はブラウザ 401 ガードあり・ローテーション手順（CEO 承認下） |
| T5 | 非メンバーが pairStateId を推測して他人ペアを読む | 攻撃者/正規ユーザー | wrapper 呼び出し | **consent 前置検査を user-RLS で実行**: caller の JWT で `coalter_pair_states` を読み（pair RLS）、見えなければ即 null。**特権 read は検査合格後のみ** |
| T6 | 同意撤回後の継続アクセス（disabled への遷移レース） | 正規ユーザー | セッション継続 | 呼び出し**毎回** consent を再検査（キャッシュしない）。将来: セッション TTL + 失効通知 |
| T7 | 特権 read の監査不在（誰が・いつ・どのペアを読んだか不明） | 運用 | — | 第1スライスは構造化サーバログ（DB write なし）。後続で app 層 audit テーブル + pgAudit の二層（§8） |
| T8 | **推論攻撃**: プラン出力から相手の private 特性を逆算 | 正規ユーザー | 正規出力 | 完全防御は不可能（残余リスクとして明記）。M5 の説明一般化・非帰属化で攻撃面を縮小。leak-check ヒューリスティクスで監視 |

## §4 Output 3: プライバシーモデル（3 層）

| 層 | 定義 | 例 | 保存・経路 |
|---|---|---|---|
| **shared** | 両者が見てよい、要約・合意済みの事実 | 共有コンディション chips（「移動は軽め」「20:00まで」）、確定プラン、fairness ledger | pair RLS テーブル（既存 ledger / 将来 session テーブル）。client 可視 |
| **private** | **プランの形に影響してよいが、相手には一切露出しない** state | 生の 53 軸スコア・HDM phase/trust・疲労感受性・（将来）動的状態 | user-RLS（本人のみ）+ **エンジン特権 read のみ**。相手 client への経路ゼロ |
| **viewer-only rationale** | private を根拠に含む説明。**本人にのみ**表示 | 「あなたは朝が弱い傾向があるので 2 日目は遅め出発にしました」 | 出力層で per-viewer 分岐（`ViewerScopedText`、UI 契約 §3）。相手向けには一般化版のみ |

横断原則:
1. **最小開示**: 各コンポーネント（LLM 含む）には目的に必要な最小粒度のみ渡す（生スコアではなく派生・band 値）。
2. **per-field 可視性はアプリ層**（F2 により DB では表現不能）。可視性タグ（`visibility: "shared" | "private"`）は M2-A/UI 契約の型に既に定義済み。
3. **private→shared の昇格はユーザーの明示行為のみ**（チャットで自分が言う・chips 共有に同意する）。システムが勝手に昇格しない。
4. 推論攻撃（T8)は残余リスクとして受容し、説明の非帰属化で縮小。

## §5 方式比較

| 観点 | **A. consent-gated 特権 read** | B. 共有スナップショットテーブル | C. 現行 user-RLS | (D. SECURITY DEFINER RPC) |
|---|---|---|---|---|
| 「サーバだけが両者を読む」 | ✅ 表現できる唯一の形（F1/F2） | ❌ pair RLS 可読 = **相手 client からテーブル直読可能** | ❌ 相手行が silent 欠落（§2） | ❌ user JWT 呼び出しでは戻り値が本人 client に返る（F1）。特権 server から呼ぶなら実質 A の内部実装 |
| private 層の秘匿 | ✅ client への経路ゼロ | ❌ shared にした field は client 露出（構造上不可避） | —（読めない） | ❌ 同上 |
| migration | **不要**（既存 RLS 不変・BYPASSRLS） | **必要**（テーブル + pair RLS + export 書込み） | 不要 | 必要（関数 + REVOKE/GRANT + search_path 固定） |
| 鮮度 | ✅ 常に最新（live read） | ❌ export 時点で stale。同期・lifecycle（更新契機・失効・削除連鎖）の運用負債 | — | ✅ live |
| blast radius | ⚠️ 特権キー = DB 全権。**ただし既存リスク**（F4: supabaseAdmin は稼働済み）であり、新設ではなく適用規律の問題。緩和は §6 | ✅ 小（user 権限のみ） | ✅ 小 | ⚠️ DEFINER の search_path / 実行権限管理 |
| 監査 | ⚠️ RLS が守らない分、app 層 audit 必須（§3 T7） | ✅ RLS が効く | — | ⚠️ 関数内 audit |
| local-only での実装可否 | ✅ **schema 不変・server コードのみ**（remote apply HOLD と両立） | ❌ migration が remote apply ゲートに衝突 | — | ❌ 同左 |
| 将来の役割 | **private 層の正道**として恒久 | **shared 層の transparency 機能**として将来価値あり（「相手に見えている私」を本人が確認・編集できる画面）。生 state を載せる用途では不採用 | 退役（修正対象） | A の内部実装の選択肢として保留 |

## §6 Output 4+5: 推奨パスとその根拠

**推奨: A. consent-gated 特権 read（engine 内部・狭域 wrapper・per-viewer 出力フィルタとセット）。B は「shared 層の transparency 機能」として将来フェーズに再定義。C は退役（修正は別 GO）。D は不採用（F1）。**

A の具体形（設計のみ・実装は GO 後）:

```
lib/shared/personalization/pairEngineReader.server.ts（新規・単一ファイル隔離）
  getPairSnapshotsForEngine(userClient, adminReadClient, pairStateId, asOf)
    1. consent 前置検査を userClient（caller の user-RLS）で実行:
       coalter_pair_states を読み、行が見える（=メンバー）∧ state==='enabled'
       ∧ onboarded_at ≠ null ∧ accepted_at ≠ null を確認。不合格 → null
       （特権クエリは 1 本も発行しない — テストで保証）
    2. 合格時のみ adminReadClient（注入・structural select-only 型 = write は型レベル不可）で
       両 user の axis snapshots / growth を read（M2-A reader と同じ集約規則を再利用）
    3. 戻り値: { self, partner }: EngineOnlyPairSnapshots
       — 型ブランド（EngineOnly）付与。client 向け serializer はブランドを拒否
    4. error / 不可視 / 欠落 → null（no-throw・M2-A house style）
    5. 構造化サーバログ 1 行（pairStateId・目的・時刻。DB write なし）
```

**なぜ local-only の今、最も安全か**:
- migration ゼロ（F5 の RLS 現状維持・schema 不変）→ remote apply HOLD・GitHub 停止と完全に両立。
- 依存はすべて既存資産: `supabaseAdmin.ts`（F4・server-only 済み）+ M2-A reader の集約規則 + DI テスト流儀。新規概念は「consent 前置検査」と「型ブランド」のみ＝レビュー面積が小さい。
- テストは fake client で完結（特権キー不要でロジック検証可能）。

**なぜ production でも最も安全か**:
- 「本人にも相手にも生 state を見せない」を満たす構造は A だけ（F1/F2 — これは実装品質ではなく**表現力の問題**）。
- consent 検査を caller の RLS で行うため、「メンバーであること」の証明は DB の RLS が担保（app 層の単独判断ではない）。
- 新キー体系（F3）への移行で特権キーはブラウザ 401 ガード付き `sb_secret_` になり、用途別キー分離（personalization 専用 secret key の発行）で blast radius をさらに縮小可能（**発行は CEO 承認**）。
- 監査は二層化路線（app 層 audit テーブル + pgAudit）を §8 のとおり段階導入。

## §7 Output 6: migration は必要か

**推奨パス A: 不要。** 既存 RLS を一切変更しない（特権キーは BYPASSRLS のためポリシー追加も不要。`stargazer_alter_growth` には service_role ALL policy の先行例すらある: `20260318200000:27-29`）。
**後続で必要になり得る migration（すべて別 GO・remote apply 解禁後）**: ①app 層 audit テーブル（T7 恒久対応）②B 再定義版（shared transparency テーブル）③consent スキーマ強化（per-domain consent 等）。

## §8 Output 7+8: GitHub 復旧前にできること / 待つべきこと

| 今できる（local only） | 待つ |
|---|---|
| M2-B-1 実装スライス（§9。schema 不変・新規ファイルのみ） | 本番特権キーの新体系移行・personalization 専用 `sb_secret_` 発行（**CEO 承認 + production アクセス**） |
| fake client による consent-gate / leak / null-safe テスト一式 | pgAudit 有効化（production 操作） |
| 型ブランド + payload assertion ガードの整備 | app 層 audit テーブル migration（remote apply HOLD） |
| liveCollector 欠落の実データ確認手順書（実行は owning GO 後） | liveCollector の修正実装（CoAlter owning・別 GO） |
| `.env.example` への SERVICE key 項目追記（値なし・ドキュメンテーションのみ） | CoAlter tab / Travel runtime / T1A との統合（明示 GO 待ち） |

## §9 Output 9: 設計承認後の最小安全スライス（M2-B-1）

**additive only・migration 0・route 配線 0・UI 0**:
1. `lib/shared/personalization/pairEngineReader.server.ts` — §6 の wrapper（新規 1 ファイル。`import "server-only"`。client は両方とも**注入**: userClient / adminReadClient。adminReadClient は structural select-only 型 = M2-A reader と同型）
2. `lib/shared/personalization/engineOnly.ts` — `EngineOnly` 型ブランド + `assertNoEngineOnlyLeak(payload)` pure ガード（新規 1 ファイル）
3. unit tests 2 ファイル — §10 の検証項目
4. **配線しない**: invoke route / CoAlter / plan からの呼び出しは次スライス（別 GO）。M2-A 同様「未消費の純ライブラリ + テスト」で着地

## §10 Output 10: 検証計画

| 検証 | 方法 |
|---|---|
| private 漏洩ゼロ | leak fixture テスト: partner 軸スコアにカナリア値を仕込み、per-viewer serialize 後の全 payload 文字列にカナリアが**不在**であることを assert。`assertNoEngineOnlyLeak` がブランド付き object を検出して reject |
| enabled ペアなしに partner read が起きない | fake client の**呼び出しログ assertion**: pair 行不可視 / state≠enabled / onboarded_at null / accepted_at null の各ケースで、admin 側 fake への `from()` 呼び出しが **0 回**であること + 戻り値 null |
| client への service key / 特権 client 露出なし | ①`import "server-only"`（client import = ビルド失敗）②grep ガード: 特権 client 生成は `lib/supabaseAdmin.ts` のみ・`NEXT_PUBLIC_*SERVICE*`/`NEXT_PUBLIC_*SECRET*` ヒット 0 ③wrapper は client を**注入**のみ（createClient 不使用） |
| RLS / 特権ガードのテスト | unit: fake で §2 の RLS フィルタ挙動（相手行欠落）を再現し C 案の不足を回帰として固定。integration（後続・local supabase）: 実 RLS で非メンバー不可視・本人可視を検証 |
| partner 不可用時の null-safe fallback | partner の axes/growth が空でも throw せず `partner: { axes: {}, hdm: null, ... }` を返す（snapshot 自体は成立）。pair 不可視は null。M2-A と同じ null 流儀の回帰テスト |
| 既存基盤の不変 | tsc 55 baseline 不変・full suite GREEN・diff scope = 新規ファイルのみ・write grep 0 |

---

## §11 CEO 判断請求

1. **推奨パス A の承認**（B=将来の shared transparency 機能・C=退役・D=不採用、の再定義込み）
2. M2-B-1 最小スライス（§9）の**実装 GO**（承認後も配線はせず、純ライブラリ + テストで停止）
3. liveCollector silent 欠落（§2）の実データ確認と修正を **CoAlter owning の別タスク**として起票することの承認
4. 将来事項の予約（今は実行しない）: personalization 専用 `sb_secret_` キー発行 / pgAudit / audit テーブル migration — いずれも CEO 承認 + production アクセス回復後

🤖 Generated with [Claude Code](https://claude.com/claude-code)
