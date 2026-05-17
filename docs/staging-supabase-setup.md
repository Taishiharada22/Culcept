# Staging Supabase Setup — CEO 操作手順書（A-0）

> Status: Draft / CEO 承認待ち
> Date: 2026-05-17
> Position: **Plan W1-4 real insert 着手前の前提作業**（A-0 段階）
> Initial use case: Alter Plan W1-4 / migration適用検証
> Future use cases: CoAlter / Alter Morning / Document Import の DB 検証

---

## 0. 本書の位置づけ

W1-4-pre は merged 済み（PR #166, commit `e64b528c`）。Wave 1 残り（W1-4 real insert / W1-6 / W1-8）に進むには、production を汚さず実 Supabase で検証できる環境が必要。

### 段階制（CEO 採用済み: A 案 = staging Supabase project）

| 段階 | 内容 | 状態 |
|---|---|---|
| **A-0** | staging Supabase project 作成・key 保管・運用方針確定（**本書**） | 着手前 |
| A-1 | W1-3 / W1-5 / W1-5b migration を staging にだけ適用し、schema / RLS / CHECK / append-only smoke | A-0 完了後 |
| A-2 | `origin/main` から新 branch を切って W1-4 real insert 実装（Supabase repository + API route） | A-1 完了後 |
| A-3 | Vercel Preview env への staging 接続 | A-2 完了後 |
| A-4 | CI integration test（実 Supabase 接続） | A-3 完了後 |
| 最終 | production migration 適用（CEO 別承認） | A-4 完了後 |

**本書の責務は A-0 のみ。A-1 以降は別タスク**。

---

## 1. 不変原則（destructive 操作禁止）

| 禁止項目 | 理由 |
|---|---|
| 既存 production linked project を触る | `supabase/.temp/linked-project.json` を変更すると CLI が staging を production と取り違える |
| `.env.local` を編集 | 現在 production を指す状態を維持、staging 切替時は別ファイル |
| `supabase unlink` 実行 | 既存運用が壊れる |
| 既存 supabase/.temp/ 配下を変更 | 同上 |
| secret / key を repo にコミット | 漏洩 = 全 user データ漏洩リスク |
| Claude に service_role key を渡す | 後述 §8 で詳細 |
| 一切 production schema を変更 | A-0 範囲外、最終段階で別承認 |

---

## 2. Pre-flight check（CEO 実施）

### 2.1 Supabase 組織状態の確認

CEO は Supabase Dashboard (https://supabase.com/dashboard) で以下を確認：

- 既存 project 数（aneurasync の production project が 1 件存在しているはず）
- 現在の組織 plan（Free / Pro / Team / Enterprise）
- billing 状況
- staging project 追加で発生する課金条件（**断定不可、Dashboard で実額確認**）

**注意**: 「Free tier 内」と私が事前判断したが、実際の課金条件は組織設定・既存 project 数・使用量により異なる。Dashboard の "Project Settings → Billing" で確認必須。

### 2.2 Dashboard アクセス権限の確認

- CEO アカウントが project 作成権限を持つ organization にログインしているか確認

---

## 3. Step-by-step: staging project 作成（CEO 操作）

### 3.1 Dashboard → "New Project"

入力項目:

| 項目 | 推奨値 | 理由 |
|---|---|---|
| Name | `culcept-staging` | production (`culcept`) と命名で区別、ミス防止 |
| Database Password | **強力な自動生成、CEO が管理** | 後で取得困難なので必ず保管 |
| Region | **production と同じ region** | latency 差を排除、本番同等性確保 |
| Pricing Plan | Free（推奨初期値） | 規模拡大時に Pro 検討 |

### 3.2 作成完了まで待機（数分）

Dashboard 上で "Project is ready" 表示を確認。

### 3.3 完了確認

- Dashboard 上で staging project が一覧表示される
- Project Settings に入れる

---

## 4. 取得すべき値（CEO が安全に控える）

### 4.1 必須 4 項目

| 項目 | 取得場所 | 公開可否 | Claude への渡し方 |
|---|---|---|---|
| **Project URL** | Settings → API → Project URL | 公開可 | env placeholder で扱うのが推奨。chat に貼ってもよい |
| **Project Ref** | URL の subdomain（例: `xxxxx` of `xxxxx.supabase.co`） | 公開可 | 同上 |
| **anon key** | Settings → API → Project API keys → `anon public` | クライアント公開前提（RLS が正しく効いている場合に限る） | **値を chat に貼るより env placeholder 推奨**。staging 用 / production 用を厳格に混同しない。RLS smoke 完了前に不用意な UI/API 接続はしない |
| **service_role key** | Settings → API → Project API keys → `service_role secret` | **機密**（RLS bypass 可能） | ❌ **絶対に Claude に渡さない**（Vercel / GitHub Secrets / local env に CEO のみが登録、Claude は env 変数名のみ参照） |

### 4.2 補助項目

| 項目 | 取得場所 | Claude に渡せるか |
|---|---|---|
| DB Password | 作成時の値（CEO が保管） | ❌ 渡さない |
| JWT Secret | Settings → API → JWT Settings | ❌ 基本渡さない |
| Connection string（直接 postgres 接続用） | Settings → Database → Connection string | ❌ 渡さない |

---

## 5. secret / key の安全な管理

### 5.1 git に**絶対**入れない

- `.gitignore` で `.env*` パターンが含まれていることを確認
- 万が一誤って commit した場合、即 **key rotation**（Dashboard で regenerate）

```bash
# .gitignore に以下があることを確認（CEO 確認）
.env
.env.local
.env.*.local
```

### 5.2 推奨保管先

- **1Password / Bitwarden** などのパスワードマネージャー
- macOS Keychain（個人用、共有不可）
- **絶対に避ける**: Slack / DM / メール本文 / 平文ファイル / Notion

### 5.3 共有ルール

| 役割 | アクセス可能な key |
|---|---|
| CEO | 全 key |
| 開発者（将来複数人になった場合） | anon key + Project URL + Project Ref |
| Claude（私） | anon key + Project URL + Project Ref のみ |
| 外部 | なし |

### 5.4 Vercel env への登録（A-3 で実施）

A-0 では Vercel env を**触らない**。A-3 段階で：
- Preview branch / non-production deployment 用 env として staging key を登録
- Production env と物理的に分離

---

## 6. 既存 linked project を壊さない運用

### 6.1 現状確認

```
supabase/.temp/
├ linked-project.json   ← 既存 production との link 状態
├ project-ref            ← production の project ref
└ ...
```

**これらは A-0 では一切変更しない**。

### 6.2 A-1 staging migration 適用方式の安全順位

`supabase db push` / `db pull` / `db dump` は **linked project を前提とする**コマンド（Supabase CLI docs 参照）。`SUPABASE_PROJECT_REF` を環境変数で渡せば安全に staging 切替できる、という前提は**未検証**であり、production 誤操作リスクがあるため**採用しない**。

A-1 の migration 適用は以下の安全順位で行う（CEO が選択）。

#### 推奨: Option 1 — 別 git worktree で staging 専用 link

```bash
# CEO が CEO の shell で実行（Claude は値を見ない）
git worktree add ../culcept-staging origin/main
cd ../culcept-staging
supabase link --project-ref <staging-ref>   # ← この worktree の supabase/.temp が staging を指す
supabase db push --linked                    # ← staging に対する migration push
```

メリット:
- 元 repo の `supabase/.temp/` を一切変更しない（production link 保護）
- worktree 削除で完全にロールバック可能
- aneurasync 慣習（`.claude/worktrees/` で複数 worktree 運用）と整合

#### 次点: Option 2 — Dashboard SQL Editor で手動適用

CEO が Supabase Dashboard (staging project) → SQL Editor で migration SQL ファイルの中身を貼り付け、Run。
- W1-3 (`20260430100000_external_anchors.sql`) + W1-5 (`20260430110000_plan_drift_events.sql`) を順次実行
- CLI 誤操作リスクゼロ
- ただし migration ファイル ~480 行を手動コピペするオペレーション

#### 代替: Option 3 — CEO の shell 内のみで connection string

CEO のローカル shell で staging DB connection string を環境変数として設定し、`psql` 等で migration 適用。

```bash
# CEO の shell のみ。Claude には connection string / DB password を一切渡さない
export STAGING_DB_URL="postgres://postgres:...@db.<staging-ref>.supabase.co:5432/postgres"
psql "$STAGING_DB_URL" -f supabase/migrations/20260430100000_external_anchors.sql
psql "$STAGING_DB_URL" -f supabase/migrations/20260430110000_plan_drift_events.sql
```

メリット: CLI レベルで `supabase` コマンドの linked project 設定を一切触らない。
デメリット: psql 依存、connection string 管理が必要。

### 6.3 禁止操作（最重要）

| 禁止 | 理由 |
|---|---|
| 既存 repo で `supabase link --project-ref <staging>` を実行 | 既存 production link が上書きされ、誤って production を操作するリスク |
| `supabase unlink` | 既存運用が壊れる |
| `SUPABASE_PROJECT_REF=...` だけを信じて `db push --linked` を打つ | 安全切替として未検証、production にも作用する可能性 |
| production linked state のまま `db push` / `db reset` | **本番 schema / data を即座に変更する**、絶対禁止 |
| `supabase/.temp/*` のファイル編集・削除 | 既存 production との link 状態が壊れる |
| Dashboard で staging project と production project を取り違える | URL / Ref を二度三度確認、project name で物理的に区別 |

---

## 7. Failure Pre-mortem（事故時のロールバック）

### 7.1 project 作成中にミス（誤った region / 誤った plan）

| 影響 | 対処 |
|---|---|
| データなし、料金発生も最小 | Dashboard で project 削除 → 作り直し |
| 所要時間 | 5 分 |

### 7.2 service_role key を誤って漏洩（チャット / commit / Slack 等に貼った）

| 即時対応 | 詳細 |
|---|---|
| 1. Dashboard で key **rotate** | Settings → API → "Generate new service_role key" |
| 2. 旧 key 流出経路を特定 | git history / Slack ログ / チャット履歴を確認 |
| 3. 影響範囲評価 | staging のため production data 影響なし、ただし staging に書き込んだ test data は侵害可能性 |
| 4. 再発防止 | 本手順書 §5 を再確認、保管先を見直し |

### 7.3 production を間違って操作

| 操作 | 影響 | 対処 |
|---|---|---|
| `supabase db push` を production link で実行 | production schema 変更 | 即時 CEO 通知、damage assessment、必要なら DOWN migration |
| `supabase db reset --linked` | **production data 全消失** | バックアップから復旧、CEO 緊急対応 |

**対策**: §6.3 の禁止操作を厳守。CLI 操作時は必ず `supabase status` で対象 project を事前確認。

### 7.4 .env.local を誤って staging URL に書き換えた

| 影響 | 対処 |
|---|---|
| ローカル開発・vercel preview が staging を指す | git でファイルを元に戻す（ただし `.env.local` は git untracked のはずなので backup から復元） |
| 予防 | A-0 では `.env.local` を一切触らない。A-3 段階で別ファイル運用を確立 |

---

## 8. Claude（私）への渡し方と支援範囲

### 8.1 Claude が直接実行しない対象（DB 操作に限定）

**限定対象**: staging / production DB に対する以下の操作を Claude は直接実行しない。すべて CEO が実行する（CEO 環境の secret に触れないため）。

- migration apply（`supabase migration up` / `supabase db push` / Dashboard SQL Editor 適用）
- `psql` 等で staging / production DB に接続して SQL を流す
- `supabase db reset`
- `supabase db pull` / `supabase db dump`

これらの DB 操作について、Claude の役割は以下に閉じる：

- **作る**: SQL ファイル / shell コマンド例 / smoke 確認手順
- **解釈する**: CEO が実行して得た **sanitized output**（テーブル一覧、CHECK 制約一覧、SELECT 結果等）を受け取って検証する

### 8.1.1 対象外（Claude が通常通り実行してよい作業）

本ルールは**DB に触れる操作のみ**を対象とする。以下の通常作業は対象外で、Claude が今まで通り実行する：

- `git status` / `git diff` / `git log` 等の read-only git 操作
- `git add` / `git commit` / `git push` / `git switch -c` 等の git 通常操作
- `docs/` 配下のファイル編集
- `tests/` 配下のファイル編集 + `npx vitest run` 等の test 実行
- TypeScript 型チェック（`npx tsc --noEmit`）
- `lib/` / `app/` 等のコード編集
- pure 関数のローカル実行 / unit test
- `gh pr view` / `gh pr checks` / `gh pr create` 等の GitHub 操作
- ローカル `npm run build` / `npm ci`（DB に触れない範囲）

これらは「DB に対する直接実行」に該当しないため、Claude の通常作業範囲。

### 8.2 Claude が値として持ってよい情報

| 値 | Claude への渡し方 |
|---|---|
| Project URL | env placeholder で扱う。chat に貼ってもよいが、値の文字列を Claude が記憶する必要は薄い |
| Project Ref | 同上 |
| **staging** anon key | env placeholder で十分。chat に貼るのは「実装中の動作確認が必要な場合」に限る。production anon key と**厳格に分離**、Claude が混同しないよう CEO が確認 |

**重要**: anon key の漏洩リスクは RLS 設定の正しさに依存する。RLS smoke（A-1）が完了し RLS が user-scoped で動作確認できるまで、staging anon key を不用意に UI / API テストへ接続しない。

### 8.3 Claude に**絶対**渡してはいけない値

| 値 | 理由 |
|---|---|
| **service_role key** | RLS bypass 可能、全データアクセス権限。Claude がコード出力に含めたら repo / chat 履歴汚染、key rotation 必須 |
| DB password | postgres 直接接続可能、最高権限 |
| Connection string（postgres://...） | DB password が埋め込まれる、最高権限 |
| JWT secret | auth 偽装可能 |

これらは CEO が単独で保管・運用する。

### 8.4 Claude がコードで service_role 等を使う実装の方針

例: server-side で RLS を bypass する admin 操作 / Edge Function。

対応:
1. CEO が `.env.local` / Vercel env / GitHub Secrets に登録（値は CEO のみ知る）
2. Claude のコードは `process.env.SUPABASE_SERVICE_ROLE_KEY` の**変数名のみ**を参照
3. 値そのものは Claude に不可視のまま runtime で注入される
4. Code review 時、生成コードに値が hardcode されていないことを CEO が確認

---

## 9. A-0 完了 checkpoint

CEO が以下すべてを yes と確認できれば A-0 完了：

- [ ] Supabase Dashboard で staging project が作成され、"Project is ready" 状態
- [ ] Project URL を取得・保管した
- [ ] Project Ref を取得・保管した
- [ ] **staging** anon key を取得・パスワードマネージャーに保管した（production anon key と物理的に分離して保管）
- [ ] service_role key を取得・**CEO のみがアクセスできる場所**に保管した（Claude には渡さない）
- [ ] DB password を保管した（Claude には渡さない）
- [ ] 既存 production linked project (`supabase/.temp/`) を一切変更していない
- [ ] `.env.local` を変更していない
- [ ] secret / key を repo にコミットしていない（`.gitignore` 設定確認済み）
- [ ] Claude には「staging が用意できた」事実のみ伝えるか、必要なら URL / Ref を env placeholder として伝えた
- [ ] **service_role / DB password / connection string / JWT secret は Claude に渡していない**

すべて yes なら → **A-1 へ進める**。

---

## 10. A-1 への引き継ぎ（A-0 完了後の次タスク）

### 10.1 A-1 で行うこと

CEO が §6.2 のいずれかの方式で以下 2 migration を **staging に**適用：

- W1-3 migration (`20260430100000_external_anchors.sql`)
- W1-5 migration (`20260430110000_plan_drift_events.sql`)
- W1-5b の修正は W1-5 ファイルに既に統合済み（別 migration ファイルは不要）

適用後、staging で smoke 確認：
- schema（テーブル / カラム / index）
- RLS policy 動作（user-scoped）
- CHECK constraint 動作
- append-only 性質（plan_drift_events UPDATE policy 不在）

### 10.2 A-1 における役割分担

| 役割 | 主体 | 内容 |
|---|---|---|
| migration 適用の**実行** | **CEO** | Option 1 (worktree + link) / Option 2 (Dashboard SQL Editor) / Option 3 (psql) のいずれか |
| smoke 用 SQL / コマンドの**作成** | Claude | テーブル確認 / RLS テスト / CHECK 検証用 SQL を起草 |
| 実行 output の**解釈** | Claude | CEO が貼り付ける sanitized output を受け取り、設計と整合しているか検証 |
| secret / connection string / DB password | **CEO のみ** | Claude には渡さない |

**重要**: Claude は anon key だけでは migration 適用できない（anon key には DDL 権限がない、RLS 配下の通常 SELECT/INSERT/UPDATE/DELETE のみ）。migration 適用には DB password / service_role / linked project / Dashboard アクセス等のより強い権限が必要で、これらは **CEO が単独で行う**。

### 10.3 A-1 着手時に Claude が持つべき情報

| 情報 | 用途 |
|---|---|
| staging Project URL | smoke SQL の参照先として記載するため（値は env placeholder で可） |
| staging Project Ref | 同上 |
| staging anon key | A-1 段階では使わない可能性が高い（migration は anon key を使わない）。A-2 で UI / API 実装時に必要 |

CEO は A-1 着手前に「staging が用意できた」事実だけ Claude に伝えれば十分。値そのものを chat に貼る必要は薄い。

### 10.4 A-1 で**しない**こと

- production への migration 適用（C 案、最終段階）
- Vercel preview env への staging URL 接続（A-3）
- W1-4 real insert 実装（A-2）
- Claude が CLI / psql を直接実行（CEO 環境の secret に触れないため）

---

## 11. 全体スケジュール（参考）

| 段階 | 主体 | 所要 |
|---|---|---|
| A-0 | CEO（本書で操作） | 15-30 分 |
| A-1 | CEO + Claude（migration 適用 + smoke） | 30 分-1 時間 |
| A-2 | Claude（W1-4 real insert 実装） | 数時間-1 日 |
| A-3 | CEO + Claude（Vercel env） | 30 分 |
| A-4 | Claude（CI integration test） | 2-4 時間 |
| 最終 production migration | CEO + Claude（別承認） | 計画次第、メンテナンス窓必要 |

---

## 12. 次に Claude（私）に出すべき指示（CEO 参考）

A-0 完了後、私への指示例（**値そのものを貼る必要はない、最小情報で十分**）:

```
A-0 完了しました。staging project が用意できました。

A-1 に進んでください。
- W1-3 / W1-5 migration を staging に適用する手順と smoke SQL を作成してください
- 適用方式は §6.2 の Option 1 / 2 / 3 から CEO が選びます（推奨は Option 1 worktree）
- 適用そのものは CEO が実行します
- Claude は SQL / コマンド / smoke 手順を起草し、CEO が貼る sanitized output を受け取って検証します

制約:
- production migration はしない（C 案、最終段階）
- .env.local は触らない
- existing linked project は壊さない（supabase/.temp/ 変更禁止）
- service_role / DB password / connection string は Claude に渡さない
- 必要なら staging URL / Ref のみを env placeholder として伝える
```

A-1 で Claude が実際に必要とするのは「staging が動いている」事実と、smoke 後に得られる結果（テーブル一覧、CHECK 一覧、RLS テスト結果等）の **sanitized output** のみ。値そのものはなくても起草できる。

---

## Appendix: A-0 で起こりがちな質問（FAQ）

### Q1. 既存 production project と staging project の違いをコード上どう区別する？

**A**: A-0 では区別の設計はしない。A-2 / A-3 段階で：
- 環境変数 `NEXT_PUBLIC_SUPABASE_URL` の値で staging / production を判別
- A-3 で Vercel preview env と production env を分離設定

### Q2. staging project に既存 production の data を migrate する必要は？

**A**: A-0 では**不要**。staging は schema 検証用、data は test data を新規投入。
production data の staging 同期は別タスクで CEO 判断。

### Q3. staging project は将来 unlink して別 project に切り替えられる？

**A**: 可能。staging は production と異なり破棄しても影響なし。

### Q4. Free plan の制限は何が問題になる？

**A**: 通常 W1-4 検証範囲で問題ない。具体的制限は Dashboard "Billing" で確認。
- 1 organization で最大 2 active free project（既存 production + staging = 2 で上限）
- 1 week 以上アクセスなしで pause
- DB 容量 500 MB
- 月間 5 GB egress

CEO が Dashboard で実額確認推奨。

---

## まとめ

**A-0 = CEO が Dashboard で staging project を作る + key を安全に保管する + Claude に渡す情報を CEO が判別する** だけの軽量タスク。

不変原則を守れば事故ゼロ：
- 既存 production 触らない
- `.env.local` 触らない
- secret を repo に入れない
- service_role key を Claude に渡さない

A-0 完了後、§10 の引き継ぎに従って A-1 を CEO 指示で着手する。
