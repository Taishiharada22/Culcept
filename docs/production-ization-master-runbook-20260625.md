# Production 化 マスター runbook（設計・提案 / 2026-06-25）

> **本書は設計・提案であり実行ではない。** 各フェーズは CEO 承認ゲート付き。production 接続・deploy・DB apply・origin/main push・secret 変更は **CEO 明示 GO + 該当時 DB owner 同席**まで一切実行しない（CLAUDE.md 承認規約）。
> 対象コード: local main `d3595c8d9`（main-reflect・freeze-roundup 統合 + UX-1〜6 + R系 star_maps + parity・最新性検証済）。origin/main は `5a0c0f7ec` で意図的凍結中。

---

## 0. 現実の把握（設計の前提）

| 項目 | 実体 | 含意 |
|---|---|---|
| ホスティング | **Vercel**（本番 `culcept.vercel.app`）。`vercel.json` + `ci.yml`（push/PR→main）。 | **origin/main への push = 本番自動デプロイ**。だから origin/main を凍結してきた。 |
| ビルド | `next build --webpack`・standalone 不使用・Sentry は `NEXT_PUBLIC_SENTRY_DSN` 依存。 | 標準 Vercel ビルド。env で挙動制御。 |
| 本番 cron | `vercel.json` に 6本（stargazer-growth / **rendezvous-notification-dispatch** / student-monitor×3 / ai-auto-eval）。 | デプロイ即時に本番稼働。**rendezvous cron は「rendezvous 分離」方針と矛盾**→ scope 調整要。 |
| 本番 DB | **レガシー fashion 環境（B-7）**：drift・最終記録 `20260502100000`・~32件 behind・**`db push` 非冪等で危険**。 | コード（staging lineage）と**別系統**。push 不可。clean DB が必要。 |
| 期待 schema | local main migrations **201本**（最新 `20260624120000_stargazer_star_maps`）。staging に適用・検証済。 | clean production の正本ベース。 |
| rows | test data・**破棄可**（CEO）。 | データ移行不要＝実質クリーン起動。 |
| fashion/commerce/drops | **archive（復活させない）**。 | 本番 scope から除外。backup 保存のみ。 |
| rendezvous | **別 project へ分離**（削除せず）。 | 本番 cron/route の scope 判断要。 |
| flags | コード既定で全 OFF。smoke 用 `.env.local` FULL-EXPERIENCE block は **gitignore・本番非適用**。 | 本番点火は env で別途・canary 段階。 |

---

## 1. 設計原則（安全規律）

1. **DB-before-code**: clean DB が緑になるまでコードを本番デプロイしない（壊れた DB に向けて deploy しない）。
2. **可逆性優先**: 各フェーズに rollback を明記。不可逆操作（origin/main push・DNS・legacy 削除）は単独ゲート。
3. **canary 先行**: 本番は**全 flag OFF で deploy → 認証 smoke → flag を段階点火**（一括点火しない）。
4. **データ移行ゼロ**: rows は破棄可ゆえ空起動。移行 ETL を作らない（リスク源を持たない）。
5. **legacy 保存**: 本番レガシー（fashion 397table）は backup 保存・削除しない。clean DB は別実体で構築し cutover。
6. **gate-per-phase**: 各フェーズ末で停止・CEO 承認・検証結果提示。
7. **secret は CEO/owner が投入**: Claude は secret 値を表示/入力しない（規約）。手順のみ設計。

---

## 2. 中心的決定（Gate-1: clean production DB の作り方）

本番 DB をどう用意するか。**この選択が P1 を規定する**ため最初に CEO 決裁。

| 案 | 内容 | 長所 | 短所 | 評価 |
|---|---|---|---|---|
| **①repair legacy** | 既存本番にmigration repair+選択apply | 既存 project/設定を流用 | **非冪等 drift で危険・fashion 巻き込み・B-7**。 | ❌ 却下（B-7） |
| **②promote staging** | staging project をそのまま本番昇格 | migration 適用・検証済・auth/storage/OAuth 設定済 | staging の **dummy seed/test user/smoke data/CLI link 履歴が残る**＝not clean。staging 環境を失う。 | 🔺 可（要 cleanup） |
| **③new clean project** ★推奨 | **新規 Supabase project に 201 migration を fresh apply** | 真にクリーン・staging を staging として温存・再現可能・test junk ゼロ | auth provider/storage bucket/OAuth redirect/secret/edge function を**新規設定**する手間 | ✅ 推奨 |

**推奨 = ③ 新クリーンプロジェクト**（staging の検証済 201-migration lineage を正本に fresh 構築）。rows 破棄可・clean 最優先・staging 温存の CEO 方針に最も整合。②は早いが test junk が本番に残る。

> **CEO 決定事項 D-1**: ②promote か ③new-project か。以降の P1 はこの選択で分岐。

---

## 3. 段階 runbook（各フェーズ: 前提 → 操作 → 検証 → rollback → ゲート）

### P0 — Preflight / Freeze（read-only 主体・低リスク）
- **前提**: local main `d3595c8d9`・origin/main 凍結中。
- **操作**:
  1. local main の最終 freeze（追加変更を止める）+ backup branch 確認（`backup/local-main-after-freeze-roundup-20260624`）。
  2. **migration 棚卸し reconcile**: local main 201本 と staging 適用済みを 1:1 照合（過去メモに 201 と 274 の数値揺れ＝**要確定**。`supabase migration list --linked`（staging・read-only）で実数確認）。
  3. **env/secret 棚卸し**（値は出さない・キー名のみ）: 本番に要る env を列挙（`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`/LLM 各キー/`SENTRY_DSN`/OAuth client id/secret/各 PLAN_/STARGAZER_/REALITY_/LIFEOPS_ flag）。
  4. **非 migration 設定の棚卸し**: auth providers(Google/Microsoft/email)・storage buckets・RLS・OAuth redirect URL・edge functions・cron（Vercel 側）。clean DB で再現が要るもの一覧化。
  5. **scope 確定**: 本番に出す route/機能の確定（rendezvous 分離・fashion archive を踏まえ）。`FeatureGateGuard`/notFound の網羅確認。
- **検証**: migration 実数確定・env/設定チェックリスト完成・scope 表完成。
- **rollback**: 不要（read-only/docs）。
- **ゲート G0**: チェックリスト一式を CEO レビュー。

### P1 — Clean production DB 構築（**最重要・DB owner 同席・不可逆度中**）
- **前提**: G0 通過・D-1 決定済。**staging/legacy prod を壊さない**。
- **操作（③new-project の場合）**:
  1. 新 Supabase project 作成（CEO/owner）。region/plan 決定。
  2. 201 migration を fresh apply（**新 project に対してのみ**・`supabase db push`）。staging で検証済の冪等性を前提。
  3. RLS/policy/FK CASCADE/storage/auth provider/OAuth redirect を P0 チェックリストで再現。
  4. **空起動検証**（rows ゼロ）: schema 健全・star_maps/profiles 等 must-keep 在・personality_*/curated_cards/swipe 不在でも 42P01/42703 を投げない（R3-VERIFY の graceful degrade を実 DB で確認）。
- **操作（②promote の場合）**: staging を本番昇格 + dummy seed/test user/smoke data の cleanup + 新 staging 用意。
- **検証**: schema 緑・RLS 緑・空起動で login/baseline/observation upsert→star_maps row 生成が成功する構造・**read-only smoke**（authed は P6）。
- **rollback**: 新 project は破棄で原状復帰（legacy prod 不変・staging 不変）。
- **ゲート G1**: clean DB schema 検証結果を CEO レビュー。**legacy prod backup 取得確認**。

### P2 — Vercel production env 構成（secret は CEO/owner 投入）
- **前提**: G1 通過（clean DB ready）。
- **操作**:
  1. Vercel production env に **clean DB の URL/anon/service_role** を設定（Claude は値を扱わない・手順提示のみ）。
  2. LLM/Maps/Sentry/OAuth secret を本番値で設定。**Gemini「Budget 0 invalid」**（smoke で観測）= provider 設定不備→本番前に修正 or 該当 flag OFF。
  3. **flag は全 OFF で開始**（canary 前提）。`PLAN_ROUTE_LIVE`/`HOME_SWIPE`/`alterTab`/`coalterTab`/reality/lifeops write 等は P3 で段階点火。
  4. preview/production env の分離確認（preview は staging or clean-DB、production は clean-DB）。
- **検証**: env キー網羅（P0 リスト）・値は owner 確認・flag 既定 OFF。
- **rollback**: env を元に戻す（未 deploy なら影響なし）。
- **ゲート G2**: env 構成を CEO/owner レビュー。

### P3 — Flag rollout 戦略（canary 設計・コードは未 deploy）
- **設計**:
  - **段階1（最小本線）**: `PLAN_ROUTE_LIVE` + auth/baseline/stargazer 観測のみ。`HOME_SWIPE`/`alterTab`/`coalterTab` は OFF。
  - **段階2（/plan フル）**: `HOME_SWIPE` + `alterTab` + `coalterTab` + travel/calendar 表示。read 系のみ。
  - **段階3（write/intelligence）**: lifeops write・reality capture/learning write・coalter live。**DB write が増える＝clean DB に該当 table 在を P1 で担保した範囲のみ**。
  - **rendezvous**: 分離方針ゆえ本番 OFF。**`vercel.json` の rendezvous-notification cron を本番から除外 or 無効化**（cron は flag でなく path 定義＝要 vercel.json 編集 or 該当 route を notFound）。
  - canary 対象: `PLAN_CANARY_USER_IDS` 等で CEO 自身 →少数 →全体。
- **検証**: 各段階の点火対象 flag リスト + 影響 surface + 必要 table を表に。
- **ゲート G3**: rollout 段階表を CEO 承認。

### P4 — Code deploy（**origin/main push = 不可逆・本番発火**）
- **前提**: G1/G2/G3 通過（DB緑・env済・flag戦略確定）。
- **操作**:
  1. origin/main を `5a0c0f7ec` → `d3595c8d9`（or その時点の local main）へ更新（push）。**この push で Vercel が本番ビルド/デプロイ**。
  2. `vercel.json` の `ignoreCommand`（md-only skip / canary-trigger）を確認（コード変更なので build される）。
  3. Vercel preview で先に検証 → production promote、の Vercel 機能を使えるなら **preview-first**（push せず PR preview）。
- **検証**: Vercel build 成功・本番 URL 200・全 flag OFF（段階1前）で従来同等。
- **rollback**: **Vercel の即時 rollback（前デプロイへ）** + 必要なら origin/main を戻す（force push は最終手段・backup 在）。
- **ゲート G4**: deploy 前に CEO 最終 GO（origin/main push は単独 GO）。

### P5 — Cutover / Domain（不可逆度: ドメイン次第）
- **前提**: G4 後・本番デプロイ稼働。
- **操作**: `culcept.vercel.app` 継続 or custom domain 切替（CEO 判断 D-2）。legacy prod project の扱い（停止/保存）。
- **検証**: ドメイン解決・TLS・redirect。
- **rollback**: DNS 戻し（custom の場合）・Vercel rollback。
- **ゲート G5**: ドメイン方針 CEO 決定。

### P6 — Production 認証 smoke（CEO 実機・Claude 不可）
- **操作**: CEO が本番でログイン→baseline→初回観測（star_maps row 生成）→Home（Alter）→`/plan` 直 URL（5タブ）→Home 横スワイプ pane（5タブ + 取り込み/シフト表）→各機能。**段階1 flag のみ ON で開始**し、段階を上げる毎に再 smoke。
- **検証**: 42P01/42703/500 ゼロ・console error ゼロ・Sentry 緑・各 surface 描画。
- **rollback**: flag を OFF に戻す（kill switch・`REALITY_CAPTURE_KILL` 等）。
- **ゲート G6**: 各段階 smoke 結果で次段階点火を CEO 承認。

### P7 — Monitoring / Rollback 体制
- **操作**: Sentry DSN 本番有効・Vercel analytics・cron 実行ログ監視・DB backup 定期。
- **rollback 早見**: コード=Vercel rollback / DB=backup 復元 / 機能=flag OFF（kill switch）/ ドメイン=DNS 戻し。
- **ゲート G7**: 監視・rollback 手順を CEO 確認で「本番運用開始」宣言。

---

## 4. リスク登録簿

| ID | リスク | 緩和 |
|---|---|---|
| R-DB | 本番レガシーへ誤 `db push`（B-7・過去事故源） | clean DB は**別 project**で構築・legacy 非接触・CLI link 二重確認・staging/prod ref 明示確認 |
| R-MIG | migration 実数の数値揺れ（201 vs 過去メモ 274） | P0 で `migration list --linked` 実数確定してから P1 |
| R-CRON | rendezvous cron が本番で発火（分離方針違反） | P3 で vercel.json から除外 or route notFound |
| R-PUSH | origin/main push の不可逆本番発火 | preview-first / 単独ゲート G4 / Vercel 即 rollback / backup branch |
| R-SECRET | secret 漏洩・誤設定 | Claude は値非扱い・owner 投入・本番/preview env 分離 |
| R-AI | Gemini「Budget 0 invalid」等 provider 不備 | P2 で修正 or 該当 flag OFF・graceful degrade 確認 |
| R-CONFIG | clean DB で auth/OAuth/storage 再現漏れ | P0 非 migration 設定チェックリスト・P1 再現検証 |

---

## 5. CEO 決定事項（ゲート連動）

- **D-1（最重要・Gate-1）**: clean production DB = ②staging promote / ③new clean project（推奨③）。
- **D-2（P5）**: 本番ドメイン = `culcept.vercel.app` 継続 / custom domain。
- **D-3（P3）**: flag rollout の段階区切りと canary 対象。
- **D-4（P3）**: rendezvous cron/route の本番除外方式。
- **D-5（P1）**: DB owner 同席日程（P1 は owner 必須）。
- **D-6（全体）**: legacy prod project の保存/停止方針。

---

## 6. 実行しないことの確認（本書時点）
production 接続・deploy・`db push`・migration apply/repair・SQL/DB write・seed・origin/main push・env/secret 投入・DNS 変更・legacy 削除は**一切未実施**。本書は設計・提案のみ。次アクションは **D-1 の CEO 決裁**。

---
read-only / docs-only。production 非接続・DB write/apply/origin push ゼロ。
