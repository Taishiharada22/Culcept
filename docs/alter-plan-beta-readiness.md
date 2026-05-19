# Alter Plan β Readiness — オンボーディング / 観測 / 運用 計画

**作成日**: 2026-05-19
**Status**: 採択待ち（CEO 判断起点）
**関連**:
  - `docs/alter-plan-foundation-design.md`（Plan 機能の全体設計）
  - `docs/alter-plan-a2-atomicity-tradeoff.md` §10（W1-Y staging atomicity 達成）
  - `docs/alter-plan-w1y-rpc-atomicity-mini-design.md`
  - `docs/alter-plan-w1z-production-migration-decision.md`（W1-Z 判断資料、本 PR の対）
  - `docs/alter-plan-w1x5-anchor-detail-mini-design.md`（β scenario step 7-8 の UI）
**branch**: `docs/alter-plan-beta-readiness-pack`
**実装範囲**: **docs only**。コード / migration / production 操作 / env 変更を一切含まない

---

## 1. 目的

Plan / Alter / Stargazer の core flow を**実ユーザー**が体験し、以下を CEO が判断できる状態を作る：

1. **「第二の自己」体験が成立しているか**（Aneurasync philosophy 中心問い）
2. **継続して触れる UX 品質か**（今月の成功条件 #1 #3 #4）
3. **対外公開 / 限定 production β に進めるか**（今月の成功条件 #2 への直結）
4. **W1-Z production migration の apply timing 判断材料**（`docs/alter-plan-w1z-production-migration-decision.md` と連動）

### 非目的（明示）

- 統計的有意性のある A/B / random 実験（N=1〜5 では弱い、構造化観察で十分）
- 大規模 user 獲得 / 広告 / SNS 拡散（今月の「やらないこと」CEO 方針）
- 課金 / マネタイズ検証（CEO 方針）
- 新機能追加 freeze 中の Plan に対する新規実装（observation 専念）
- 新規 dashboard / 観測基盤の構築（既存 Sentry + Supabase Dashboard + A-5 smoke + 手動記録で十分）

---

## 2. Scope

| 項目 | 内容 |
|------|------|
| 人数 | **まず 1〜3 人**（β 立ち上げ）、**最大 5 人**（Stargazer Human OS 戦略 Phase 1 整合: `memory/project_stargazer-human-os-strategy.md`） |
| 期間 | **2 週間 / user**（Stargazer Phase 1 整合） |
| 段階 | **Stage 1: CEO / 内部 staging 確認**（W1-Y RPC 着地済み）→ **Stage 2: 限定 production β**（Stage 1 通過後、§9 遷移基準を満たした時） |
| 環境 | Stage 1: staging Supabase + Vercel preview / Stage 2: production Supabase + Vercel production |
| 招待方式 | CEO 直接（知人招待制、口頭 / LINE 等）、招待 token 新規実装なし、既存 Supabase Auth 経由 |

---

## 3. β user 選定基準（CEO 判断資料）

招待対象を「誰」にすべきかを明文化する。Aneurasync は「第二の自己」を観測するため、**user の言語化能力**と **philosophy 適合**が観測精度を左右する。

### 3 軸選定マトリクス

| 軸 | 評価内容 | 観察方法 |
|------|---------|----------|
| **A. Philosophy 適合** | 「自分の判断軸 / 揺れ方 / 矛盾が見えると嬉しい」と感じるタイプか。アンケート好きではなく内省好きか。 | 過去の対話 / Aneurasync を知った経緯 / 「自己理解 vs 他者比較」どちらに反応するか |
| **B. 言語化能力** | 「なぜそう判断したか」「どこに違和感を感じたか」を発話 / テキストで表現できるか | 普段の発話 / SNS / 文章 |
| **C. 撤退耐性** | β 中の rough edge（UI 未完成 / Alter 応答ブレ / orphan source 等）を許容、CEO に率直に伝えられる関係性か | 既存の信頼関係 / β 期間中の連絡可能性 |

3 軸すべて **中以上**を推奨。1 軸でも欠けると観測の質が落ちる（philosophy 不適合 → "便利アプリ" として fitness 評価される、言語化能力不足 → feedback が浅い、撤退耐性不足 → 不具合に過剰反応 / 離脱）。

### ハード除外（CEO 判断不要、自動）

- 業務利用 / SaaS 評価目的（"自己理解" 文脈と背景前提が違う）
- 課金 / マネタイズ評価期待（CEO 方針「マネタイズ設計しない」と衝突）
- 競合関係者（情報管理）
- 「未来の自分が先に試す」の意味が伝わらない人（philosophy 入口で躓くと scenario 全体が崩れる）

### 招待 priority

1. **CEO 本人**（必須、Stage 1 の初手）
2. **Aneurasync 内部メンバー**（philosophy 適合最大、Stage 1）
3. **CEO 知人 1〜2 名**（外部視点が必要なタイミングで Stage 2 投入）
4. （以降は Stage 2 観察結果次第）

---

## 4. 招待運用

### 招待 token

- 既存 Supabase Auth（email magic link / OAuth）を使う
- 新規 token / invite code 系の実装は行わない
- 招待時に Aneurasync の URL + 利用規約 (§4.3) を共有

### 招待手順

1. CEO が §3 基準で対象 user を選定
2. CEO が事前に対話で β 主旨を共有（「未来の自分が先に試す」「Aneurasync の Plan / Alter / Stargazer の感触を聞かせて欲しい」「2 週間、rough edge あり」）
3. CEO 承認後、Supabase に対象 email を許可リスト化（既存運用、新規実装なし）
4. user に URL + 簡易手順（後述 §6 §7）を共有
5. 初回 onboarding は CEO 同席 or 直後フォロー推奨

### 規約 / 同意事項（口頭 OK、文書化推奨）

- β 期間中の機能不安定性 / 不具合発生可能性
- data 保存範囲（既存 RLS / プライバシー方針継承、β 特例なし）
- 撤退自由（いつでも account 削除 / data 退去可）
- feedback / interview への協力依頼
- 対外公開禁止（β 段階の SNS / 拡散はしない）

---

## 5. 受け入れ環境（Stage 設計）

### Stage 1: CEO / 内部 staging

| 項目 | 内容 |
|------|------|
| URL | Vercel preview / staging deploy（既存 A-5 smoke と同 environment） |
| Supabase | staging project（W1-Y RPC apply 済み） |
| 対象 | CEO, 内部メンバー |
| 目的 | UX / philosophy 体現の初期検証、UI rough edge 発見、§9 production 遷移条件の判定 |
| 期間 | 3〜7 日 |

### Stage 2: 限定 production β

| 項目 | 内容 |
|------|------|
| URL | Aneurasync production URL |
| Supabase | production project（W1-Z 未 apply なら A-2 fallback で運用、§7 観測） |
| 対象 | CEO 知人（§3 priority 3） |
| 目的 | 対外 user の philosophy 体現観察 / 継続率測定 / production 観測 signal 収集 |
| 期間 | 2 週間 / user |

### Stage 2 開始の判定基準（triggered criteria, §9 参照）

Stage 1 で以下すべてを満たした時のみ Stage 2 開始：

1. CEO 自身が 3 日 / 5 セッションで Plan / Alter / Stargazer 通し体験 PASS（rough edge は許容、philosophy 体現を体感できたか）
2. 内部 β 1 名以上が §7 8-step scenario 完走、§8 philosophy embodiment signal が観測される
3. staging A-5 smoke 5 日連続 18/18 PASS（auto-trigger or 手動）
4. Stage 1 で `rpc_fallback` log / `orphan_source` log が 0（staging は W1-Y apply 済みなのでこれが期待値）
5. CEO 判定: 「対外で見せて恥ずかしくない世界観・UI 品質」（CEO 方針「迷ったら整合性と世界観を優先」）

不満たし時は Stage 1 内で改善 wave、Stage 2 へは進まない。

---

## 6. オンボーディング（session 分割）

CEO 指定の 8 step scenario を**1 session で全て実行させない**。認知負荷が過大で philosophy embodiment 観測が「とりあえず完走した」noise に埋もれる。**2 sessions に分割**：

### Session 1 — 「Plan に置く」体験（初日, 約 15 分）

step 1〜3 のみ：
1. ログイン
2. /plan を見る
3. anchor を 1 件登録

**意図**: 「自分のことを Aneurasync が知っている」「自分が予定を置く場所がある」体感の確立。完走後はあえて課題を与えず終了 — "余韻" を作る。

CEO / 内部メンバーは初日に Session 1 → 翌日に短い感想ヒアリング（§10 質問項目）。

### Session 2 — 「育てる / 整える」体験（2〜3 日後, 約 20 分）

step 4〜8：
4. 繰り返し予定を登録（recurring）
5. 例外日を追加（exception_dates）
6. 教え直す（edit）
7. 詳細を見る（W1-X5 detail modal）
8. 登録元ごと忘れさせる（W1-X5 source-unit delete）

**意図**: 「Plan は静的なメモではなく、自分の判断軸を反映して育てるもの」を体感させる。step 8 の "忘れさせる" は Aneurasync 中核体験（§8 参照）。

### Session 3 以降（任意, 7 日目以降）

scenario 外、user 自発の利用。CEO 観測対象として最重要 — "自分のために自分が使う" 行動が起きるか。

---

## 7. ユーザー scenario（8 ステップ詳細）

| step | action | UI 経路 | 期待操作時間 | 観測 trigger（成功） | 観測 trigger（失敗） |
|------|--------|---------|---------------|----------------------|----------------------|
| 1 | ログイン | `/login` → Supabase Auth | 30 秒 | session 確立、`/plan` へ自然遷移 | login error 5xx / 手順不明 abandon |
| 2 | `/plan` を見る | nav → /plan | 1 分 | empty state 表示確認、UI 直感的理解 | "ここで何をする" 不明確 |
| 3 | anchor 1 件登録（one_off） | /plan → 新規登録 form | 2-3 分 | INSERT 成功、自分の予定が見える | form 項目不明 / 登録 button 不明 |
| 4 | recurring 登録 | 新規登録 form → recurring 選択 | 3-5 分 | recurrence rule 設定可、INSERT 成功 | rule UI difficulty / "毎週" 表現不明 |
| 5 | exception_dates 追加 | edit form → 例外日 | 2-3 分 | exception_dates 反映、UI で確認可 | 例外 UI 発見できない |
| 6 | 教え直す（edit） | anchor → edit | 2-3 分 | UPDATE 成功、変更が反映 | edit 経路不明 / 変更が見えない |
| 7 | 詳細を見る（W1-X5 detail modal） | anchor click → modal | 1-2 分 | modal 開く、anchor 詳細閲覧 | modal 開かない / 中身が薄い |
| 8 | 登録元ごと忘れさせる | detail modal → 「この登録元ごと忘れさせる」 | 1-2 分 | source-unit DELETE 成功、anchor 群消滅 | 「本当に消えるのか」不安で実行できない |

合計 操作時間: **15-25 分**（Session 1 = 4-5 分、Session 2 = 11-20 分）。

---

## 8. Aneurasync 観測 lens — philosophy embodiment per step

**完走率と philosophy 体現は別物**。UX を完走しても「第二の自己」体験が成立しないなら β は失敗。各 step に **philosophy embodiment signal** を紐付け、UX 完走の noise から分離して観測する。

### Per-step expected signals

| step | UX 完走 signal | **philosophy embodiment signal**（Aneurasync 中核） | failure signal |
|------|----------------|--------------------------------------------------|----------------|
| 1 ログイン | login 成功 | （中立、観測対象外） | error / 経路不明 |
| 2 /plan 到達 | nav 経由到達 | 「自分の予定の場所がある」安堵感 | 「ここで何する？」confusion |
| 3 anchor 1 件 | INSERT 成功 | **「これでいい」「自分の言葉で書ける」自己肯定感** | hesitation / 「何を書けば？」 |
| 4 recurring | recurrence INSERT 成功 | 「日々の繰り返しも置ける」**生活との接続感** | recurrence rule で詰まる |
| 5 exception | exception_dates 利用 | **「例外も自分の意志で扱える」柔軟性体験** | exception UI 不発見 |
| 6 教え直す | edit UPDATE 成功 | 「やり直せる」**安心感、関係修復可能性** | edit 経路不明 / 諦め |
| 7 詳細を見る | detail modal 開く | 「自分が置いたものが見える」**所有感** | modal 開いても "何も無い" |
| 8 **忘れさせる** | source-unit DELETE 成功 | **「自分の判断で忘れさせられる」主体性体験 ← Aneurasync 中核** | 「本当に消える？」不安、実行できない |

### step 8 が最重要観測点

「**第二の自己**が自分の意志で忘れる」体験は Aneurasync の philosophy embodiment の中央。

- 単に DELETE できることではなく、「**自分が判断して、自分の Plan が変わる**」自己効力感
- 「相手 (Alter) は黙って従う」のではなく、「**自分の判断軸を Alter が学んでいる**」関係性の感得
- 削除後の余韻: 「これが自分の判断だった」自覚

step 8 が「機械的な削除」になっていたら philosophy embodiment は失敗。UX は完走でも β は再設計対象。

### 観測のための CEO 行動指示

- 各 step 後に「**今、どう感じた？**」を 1 行ヒアリング（CEO が直接対話可能な β 規模だから可能）
- philosophy embodiment signal の言語化を user に強制しない（観測者の偏見を user に投影しない）
- user 自発の「面白い」「自分っぽい」「これは違う」発言を log する（手動記録 OK）

---

## 9. 観測指標（最小セット、新規実装なし）

CEO 指定の最小指標を、既存 infrastructure で取得する。**新規 dashboard / 観測基盤を作らない**（β 規模 1〜5 人で過剰）。

### 計測項目（10 項目）

| # | 指標 | 取得方法 | 評価軸 |
|---|------|----------|--------|
| 1 | login 成功 | Sentry breadcrumb / Supabase Auth log | 完走率 |
| 2 | `/plan` 到達 | Sentry navigation event / Vercel Analytics | 完走率 |
| 3 | anchor 作成数 | Supabase Dashboard `external_anchors` 行数（user 別） | 利用深度 |
| 4 | anchor 編集数（edit） | structured log（既存 logger + Sentry） | 育てる行為の発生 |
| 5 | exception_dates 利用 | `external_anchors.exception_dates IS NOT NULL` 行数 | 柔軟性体験の発生 |
| 6 | delete 実行 | structured log（既存 logger） | step 8 完走 |
| 7 | **`rpc_fallback` 発火** | structured log（`SupabaseRepoLogEvent.rpc_fallback`） | production W1-Y 判定材料 |
| 8 | **`orphan_source` 発火** | structured log（`SupabaseRepoLogEvent.orphan_source`） | 緊急判断材料 |
| 9 | runtime error | Sentry default | 機能健全性 |
| 10 | **1 日後 / 3 日後 / 7 日後の再訪** | Sentry / Vercel Analytics session | 継続シグナル |

### 観測フロー（運用）

| 頻度 | 行動 | 担当 |
|------|------|------|
| daily | Sentry release health 確認、CEO ヒアリング 1 件 | CEO |
| daily | A-5 staging smoke 結果確認 (production migration 未 apply の場合、production には A-2 fallback log が出る可能性、Sentry 監視) | Build |
| daily | `rpc_fallback` / `orphan_source` log 件数集計 | Build |
| weekly | β user 各人の指標 1〜10 を 1 枚にまとめる（手動、新規 dashboard 不要） | Ops |
| weekly | philosophy embodiment signal の質的振り返り | CEO + Product |
| ad-hoc | hard-stop 事象発生時、§11 playbook 実行 | Build / Ops |

### 既存 infrastructure で取得不可な項目（手動記録 OK）

- §8 philosophy embodiment signal（質的 → CEO の手動 note）
- 「面白い」「自分っぽい」「違う」発言（質的 → CEO の手動 note）
- Session 1 / Session 2 / Session 3 以降の "余韻" 体感（質的）

これらを記録するための**専用 dashboard / form を新規実装しない**。CEO がテキストファイル 1 個（例: `notes/beta-observations.md`）に append すれば足りる規模。

---

## 10. フィードバック構造（3 層 — Stargazer Phase 1 継承）

`memory/project_stargazer-human-os-strategy.md` の「精度 + 納得感 + 行動変容」3 軸を Plan β に翻訳。

### 3 層

| 層 | 内容 | 観測方法 | β での質問例 |
|----|------|----------|---------------|
| **行動観測** | 何が起きたか（事実） | §9 観測指標、Sentry log | （user に直接聞かない、log のみ） |
| **自己発見** | user が「自分」をどう感じたか | CEO ヒアリング（Session 1 翌日 / Session 2 翌日 / Week 2） | 「これは自分っぽい？」「Alter は誰？」「自分の判断軸が見えた瞬間あった？」 |
| **相互** | 他 β user とコメント可能（option, Day 7+） | discord / 1on1 等で gather | 「他の user の判断軸を見て、自分の特徴が見えた？」 |

### Stargazer 3 軸を Plan β に翻訳

| 軸 | Plan β での観測 |
|----|---|
| **精度** | anchor 記述（title / location）が user 想定と一致するか。Alter が判断材料にできるか。 |
| **納得感** | 「自分らしい / 違和感ない」と user が言うか。step 8 で迷わず削除できるか。 |
| **行動変容** | 7 日後の再訪率、anchor 追加 / 編集 / 削除の自発性、Session 3 以降の使い方。 |

### 「観測者の偏見を user に投影しない」原則

- 質問は open-ended（「どう感じた？」「面白かったこと？」「違和感あった？」）
- 「Aneurasync で自己理解できた？」のような誘導質問は禁止
- user の沈黙 / 「特に何も」も valid な観測 signal

---

## 11. Pre-committed Response Playbook

β 期間中の予期事象に対し、**事前に action を決めておく**。CEO 判断 latency を削減し、β 期間の reaction speed を最大化。

### 事象 → 即時 action マトリクス

| 事象 | severity | 即時 action | CEO 通知 | 担当 |
|------|----------|-------------|----------|------|
| user login break (5xx) | **hard-stop** | Plan 機能 disable（kill switch 検討、対応中は β 一時停止） | 即時 | Build |
| `orphan_source` 発火（production） | **hard-warning** | 当該 source を手動 verify、user UI に "空 source" 表示なら β 一時停止 | 即時 | Build |
| anchor INSERT 失敗率 > 10% | **hard-warning** | A-5 smoke 再走、cause 特定、root cause まで対象 user の利用一時停止 | 即時 | Build |
| `rpc_fallback` 発火（production） | **observation** | log のみ。production 未 apply 環境では fallback path 動作の証拠、運用継続 | daily digest | Build |
| user churn（3 日無 login） | **soft** | CEO ヒアリング招待（強制しない、断られても fail と扱う） | daily | Ops |
| user 否定的 feedback | **soft** | feedback 受領、原因分類（UX / philosophy / 個人嗜好）、CEO 報告 | 当日 | Ops / CEO |
| Alter 応答 incoherent | **observation** | 該当 dialogue log を保全、HDM Phase 制御の signal 確認 | weekly | Build |
| user privacy 懸念表明 | **hard-warning** | 即時対応、必要なら data 退去（既存 delete flow） | 即時 | CEO |
| 招待 user 拒絶（参加辞退） | **observation** | 理由ヒアリング、§3 選定基準にフィードバック | weekly | CEO |
| philosophy embodiment signal が 0（Session 1 終了後） | **soft** | UX / scenario / 選定基準のどれが原因か CEO 判断 | weekly | CEO + Product |

### kill switch 検討

Plan 機能の env flag による即時 disable は**新規実装しない**（β 期間中の事故 risk 評価で必要なら別 PR で議論）。代替: hard-stop 時は β user 個別に「一時的に β を停止します、フィードバックお願いします」連絡 + Supabase 側の手動許可リスト除外。

---

## 12. β 停止条件

**「停止」を最初から想定する**ことで、β を出すこと自体の心理的コストを下げる。

### Hard-stop（即時、CEO 判断不要）

以下のいずれかが観測されたら β 即時停止：

- data corruption（anchor / source 不整合、cross-user data 混在）
- login / auth 完全 break（β 全 user 影響）
- private data 露出（RLS bypass の疑い）
- legal / privacy 違反疑い
- CEO が「対外に出すべきでない」と判断した世界観・品質後退

### Soft-stop（CEO 判断）

以下が観測されたら CEO が β 継続 / 改善 / 停止を判断：

- 3 user 連続 churn（3 日無 login）
- philosophy embodiment signal が**全 user で 0 件**（UX は完走しているが「第二の自己」体験が成立していない）
- Build / Ops capacity が β 維持で他 wave（Counselor / Origin / etc.）を block

### Stop ≠ Failure

β stop は「失敗」ではなく「次の改善 wave への信号」。stop した時点で観測 raw data + CEO note を bundle して次 wave の backlog に転換する。

---

## 13. β 完了条件

以下すべてを満たしたら β 完了と判定：

1. **1〜5 user × 2 週間** 体験完走（少なくとも 1 user が Week 2 まで到達）
2. **CEO interview 全 user 実施**（Session 1 翌日 / Session 2 翌日 / Week 2 の 3 回 / user）
3. **観測指標 1〜10 raw data 取得**（手動 export OK、形式自由）
4. **§8 philosophy embodiment signal** 各 user × 各 step で記録
5. **「次に何を改善 / 何を増やすか」backlog 作成**（new wave の起点）
6. **W1-Z apply 判断材料が出揃う**（`docs/alter-plan-w1z-production-migration-decision.md` §6 trigger criteria に raw data を流し込める状態）

---

## 14. やらないこと（明示）

CEO 方針 / GPT 補正の制約を re-state：

- ❌ コード実装（本 PR は docs only）
- ❌ migration 追加 / production migration apply
- ❌ Home / nav / W1-6 / W1-8 / DraftPlan 改修
- ❌ production 操作（kill switch / env flag 等の新規実装）
- ❌ env 変更
- ❌ service_role / DB password / connection string 使用
- ❌ 統計実験 / random A/B design（N=1〜5 では弱い）
- ❌ 新規 dashboard / 観測基盤の実装（既存 Sentry + 手動記録で十分）
- ❌ マネタイズ設計 / 課金 flow
- ❌ 大規模 marketing / SNS 拡散 / プレスリリース
- ❌ 「やればやるほど技術完成度が上がる」誘惑（β は完成のためではなく観測のため）

---

## 15. Roles / 責務

| Unit | 責務 |
|------|------|
| **CEO** | β user 選定（§3）/ 招待発行（§4）/ Session 1, 2, Week 2 ヒアリング / philosophy embodiment signal 記録 / hard-stop / soft-stop 判断 / W1-Z apply 判断（§9 完了基準で trigger） |
| **Build** | hard-stop / hard-warning 事象への即時 response / 不具合 fix / observation log 整備 / Sentry / A-5 smoke 確認 / `rpc_fallback` / `orphan_source` 集計 / β 期間中の Plan 機能 freeze 遵守 |
| **Ops** | soft-stop 事象 response / β user 連絡 / feedback 整理 / weekly 観測指標まとめ / CEO ヒアリング段取り |
| **Product** | β 期間中の Plan 機能仕様 freeze 遵守 / 次 wave backlog 構築（β 完了時） / philosophy embodiment signal 質的分析 |
| **Research** | β 観測の質的分析（CEO note の構造化）/ 競合β 設計研究（不要なら省略） |
| **Growth** | β 期間中は休眠 / 観測のみ（CEO 方針「大規模 marketing しない」継承） |
| **Chief of Staff** | 全 unit の β 期間中 freeze 範囲調整 / 優先順位整理 |

---

## 16. 次の CEO 判断点

本 PR (docs/alter-plan-beta-readiness-pack) merge 後、CEO が判断すべき 3 点：

### 判断 1: β を開始する？

| 選択 | 帰結 |
|------|------|
| Yes | §3 で 1 人目の user 選定 → §4 招待 → §6 Session 1 開始 |
| No | β は保留、別 wave（W1-Z / Counselor / Origin / etc.）を先行 |
| 後で | docs を保留、現状の wave 完了後に再評価 |

### 判断 2: Stage 1 から開始 or Stage 2 直行？

| 選択 | 帰結 |
|------|------|
| Stage 1（**推奨**） | CEO / 内部 staging 開始、§5 遷移条件で Stage 2 へ |
| Stage 2 直行 | production β 直接、W1-Z apply 推奨（`docs/alter-plan-w1z-production-migration-decision.md` 参照） |

### 判断 3: W1-Z production migration の apply timing

`docs/alter-plan-w1z-production-migration-decision.md` 参照。β との関係：

- **β 開始前 apply（A）**: Stage 2 を atomic 環境で開始可、apply タイミング判定の観測 data なし
- **β 期間中 apply（B）**: β data に fallback 計測あり、apply 中 deploy 衝突 risk
- **β 完了後 apply（C）**: β raw data で判断、urgency 中
- **永続 fallback（D）**: A-2 fallback で運用継続、apply なし

§9 完了基準で β 観測 data が揃った後、C or D が現実的候補。

---

## 17. 結論

**β は新機能の検証ではなく、Aneurasync philosophy の体現観測**。

UX 完走率は前提条件、本命は「**自分って、そういう人間だったのか**」体験が user の中に立ち上がるかどうか。step 8（忘れさせる）が機械的削除に終わったら、UX は完走でも β は再設計対象。

CEO が判断すべきは「β を出すか」ではなく「**β が観測する philosophy embodiment signal を Aneurasync 全体の北極星指標として採用するか**」。本 PR の docs はその判断材料を整える。
