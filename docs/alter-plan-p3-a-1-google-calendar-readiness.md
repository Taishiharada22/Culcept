# P3-A-1 Google Calendar OAuth Readiness

**Date**: 2026-05-26
**Branch**: `feat/alter-plan-p3-a-1-google-readiness`
**Status**: 🟡 readiness only (= code 禁止、 各問の CEO 判断確定まで実装着手しない)

---

## 0. 背景 — P3 redefinition (CEO 2026-05-26)

CEO の core message:

> 「世界観に固執しすぎないでください。 最終的に目指すものだけ意識してください。
> **最終的には、 ユーザーが予定を立てなくても勝手に最良の予定が既にできあがってる状態**です。」

この CEO ゴールから、 旧 P3 (= 「.ics import を作る」) を以下に再定義:

### 新 P3 = 「外部予定 import 導線を 3 段構成で作る」

```
P3-A: OAuth 連携 (= 主導線、 「接続するだけ」)
    P3-A-1: Google Calendar OAuth ←━━ 本文書の対象
    P3-A-2: Microsoft Outlook OAuth (= P3-A-1 完了後)

P3-B: .ics file upload (= fallback、 W1-W3 で完成済、 別 branch 保持)
    現状: feat/alter-plan-p3-ics-import-w1 (commit fd6d827a) 完成、 migration apply HOLD

P3-C: ICS URL / subscription (= Apple / iCloud 等 fallback、 P3-A 完了後)
```

### 真の位置付け — P3 は本丸ではない

P3 は **「制約 (= 動かせない予定) の取り込み基盤」**。 ゴール (= 予定が勝手にできあがる) の **前提整備**にすぎない。 本丸は Phase Next (= 末尾参照)。

本 readiness は **P3-A-1 を実装判断できる状態にすること**が目的。 Phase Next の壮大な設計を本文書に流し込まない。

---

## 1. 本体 — 12 問 (= 実装判断書)

各問は CEO が GO / 補正 / 待った を判断する材料。 AI 提案 (= 推奨初手) は最終決定ではない。

### 問 1. 既存 Supabase Auth と Google OAuth の関係

**論点**: Aneurasync は既に Supabase Auth 経由で Google sign-in を持つ (= 確認必要)。 sign-in scope と calendar scope は別物。

**選択肢**:
- (a) 既存 Supabase Google provider に calendar scope を追加 (= 同 OAuth client)
- (b) 別 OAuth client を立てて連携専用 flow を作る (= Aneurasync 認証とは分離)

**推奨初手 (= AI 提案)**: (b)。 理由 = 認証と連携は責務が違う (= 認証 = 「あなたが誰か」、 連携 = 「あなたの calendar を読む許可」)。 連携 disconnect が認証 sign-out を巻き込まない設計が clean。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ 補正

---

### 問 2. 必要 scope の最小化

**論点**: Google Calendar API scope は読み取り専用と書き込み込みで分かれる。

**選択肢**:
- (a) `calendar.readonly` のみ (= 読み取り専用、 安全だが将来書き込みできない)
- (b) `calendar.events.readonly` (= events のみ、 calendar list は読まない、 さらに最小)
- (c) `calendar` フル (= 書き込み込み、 将来 Alter が予定追加できる)

**推奨初手**: (b)。 理由 = 最小権限原則、 Aneurasync は events のみ必要、 calendar list 自体は読まなくて良い。 将来書き込みは別 scope 追加で対応。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 3. refresh_token 保管場所

**論点**: refresh_token は server-side でのみ扱うべき機密情報。

**選択肢**:
- (a) Supabase 専用 column (= 例 `user_oauth_tokens` table) + RLS で user 自身のみ access
- (b) Supabase Vault (= 暗号化 layer)
- (c) 環境変数 / 別 secret store

**推奨初手**: (a) + 暗号化 column (= `pgsodium` or `pgcrypto`)。 理由 = RLS で user 隔離、 server-side 取得時のみ復号、 Supabase native で完結。 Vault は overkill for current scale。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 4. 初回 full sync / 以後差分 sync の分離

**論点**: 初回は全 events 取得、 以後は変更分のみ取得 (= Google `syncToken` 利用)。

**選択肢**:
- (a) 初回: 過去 30 日 + 未来 90 日 fetch、 以後 `syncToken` で incremental
- (b) 初回: 過去 1 年 + 未来 1 年 fetch (= 学習用 data 厚め)、 以後 incremental
- (c) 初回: 未来のみ (= 過去は別途、 「観察データ」 として後追い)

**推奨初手**: (a)。 理由 = Phase Next の rhythm 学習に 30 日あれば pattern 出始める、 初期 fetch コスト最小、 必要なら user 設定で過去拡張可。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 5. connect / disconnect UX

**論点**: ユーザーがどこで接続 / 解除するか。

**選択肢**:
- (a) Plan tab の header に 「Google を接続」 button (= 主導線、 .ics modal の上位)
- (b) マイページ > 設定 > 連携 (= 設定画面の正統な位置)
- (c) 両方 (= Plan header に entry + 設定で詳細管理)

**推奨初手**: (c)。 理由 = 初回接続は Plan header (= 文脈に近い)、 disconnect / 再連携 / 過去取得範囲変更は設定画面で管理。 主導線と管理画面の分離。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 6. sync failure 時の degrade

**論点**: refresh_token 期限切れ / API rate limit / network 失敗時の挙動。

**選択肢**:
- (a) sync 失敗時、 既存取り込み済 data はそのまま表示、 次回 sync 試行は cron 任せ (= silent degrade)
- (b) UI に 「カレンダー同期が止まっています、 再接続が必要です」 等の警告 banner 表示
- (c) 重大エラー時は自動で .ics fallback UI を案内 (= P3-B への逃がし)

**推奨初手**: (a) + (b) の併用。 理由 = silent degrade で UX 守りつつ、 user が状況を把握できるよう banner で透明性確保。 (c) は当面 over-engineering、 接続復帰が現実的。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (a)+(b) / ⬜ (a)+(c) / ⬜ 補正

---

### 問 7. `.ics` fallback への逃がし方

**論点**: Google 連携が使えない / 失敗するユーザーをどう .ics 経路に誘導するか。

**選択肢**:
- (a) 「Google を接続」 button の直下に 「うまくいかない場合は .ics ファイルから」 link を常設
- (b) 失敗時のみ 「.ics ファイルから取り込む」 alternative を提示
- (c) 初回 onboarding でユーザーに provider 選ばせる (= 「Google / Outlook / .ics / 後で」)

**推奨初手**: (a)。 理由 = 常に並列で見えていれば user が自由に選べる、 fallback の存在が初手から透明。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 8. 取り込んだ予定は constraint か proposal 材料か

**論点**: Google から取り込んだ予定の Alter 内での扱い。

**選択肢**:
- (a) constraint のみ (= 動かせない外部固定予定、 ExternalAnchor の本来定義通り)
- (b) constraint + proposal 材料 (= 「ずらしてよい予定」 も含めて Alter が再提案する余地を持つ)
- (c) source 毎に user が選ぶ (= 「この calendar は固定 / こちらは柔軟」)

**推奨初手**: (a) を default、 ただし Aneurasync 内で user が 「動かせる」 と override 可能 (= 既存 ImportedLockEscape 機構を流用)。 (b)(c) は Phase Next で扱う。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 9. 真実源 — 他カレンダーか Aneurasync か

**論点**: 同じ event の編集が Google 側でも Aneurasync 側でも可能になった時、 どちらを真実とするか。

**選択肢**:
- (a) Google 側が真実 (= Aneurasync は read-only mirror、 編集は Google 側に書き戻し or 編集禁止)
- (b) Aneurasync 側が真実 (= 取り込み後は Aneurasync で完結、 Google 側変更は次 sync で上書き)
- (c) 編集系統で分岐 (= 時刻 / 場所変更は Google 側真実、 alterNote / category 等の Aneurasync 独自属性は Aneurasync 真実)

**推奨初手**: (c)。 理由 = Aneurasync の独自観測 (= alterNote / category / 編集履歴) は失われない、 Google 側の真実性も守る。 既存 sourceProvenance.ts (= origin / authority 2 軸) と整合。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 10. ユーザー編集をどう学習信号化するか

**論点**: 取り込んだ予定を user が消した / 動かした行為は Alter 学習の入力になるか。

**選択肢**:
- (a) 単に DB 反映のみ、 学習信号化しない (= 純粋 mirror)
- (b) 編集 / 削除を `plan_edit_event` テーブルに蓄積 (= 後で Phase Next で学習信号化可能な状態を作る)
- (c) その場で Alter に対話を投げる (= 「これ消しましたね、 なぜですか？」)

**推奨初手**: (b)。 理由 = P3-A-1 では蓄積のみ、 (c) は Phase Next 範疇、 (a) は将来の学習路を絶つ。 P3 で必ず**観測点を残す**。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 11. disconnect 後データをどう扱うか

**論点**: user が連携を解除した時、 取り込み済 data をどうするか。

**選択肢**:
- (a) 全削除 (= GDPR-friendly、 user の意思尊重)
- (b) 「観察記録」 として保持、 ただし新規 sync は停止 (= 過去学習 data は残す)
- (c) user に選ばせる (= 「過去データを残しますか？」 modal)

**推奨初手**: (c)。 理由 = user 意思尊重 + Phase Next 学習継続の両立、 default (= modal 内 推奨) は (b) にして 「Alter があなたを忘れない」 姿勢を見せる。 GDPR は明示的な user 選択で満たす。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ 補正

---

### 問 12. 初回接続直後の体験 (= 4 択 skeleton)

**論点**: 接続完了瞬間に user は何を見るか。

**選択肢 (= 枠組みのみ、 詳細 logic は Phase Next-1 で確定)**:
- (a) 何もしない (= 「接続できました」 のみ、 user が自分で Plan tab に行く)
- (b) 予定 list を表示 (= 取り込んだ events を Plan tab に流すだけ)
- (c) pattern card 1 枚 提示 (= 「あなたの calendar から、 こんな pattern が見えました」 — 軽量 1 行)
- (d) 明日の提案 1 件 提示 (= 「明日はこんな 1 日になりそうですね」 — 軽量 1 件)

**推奨初手**: (c)。 理由 = (a)(b) は Motion ですらやる、 Aneurasync 差別化にならない。 (d) は Phase Next-1 (= rhythm 学習) が必要で重い。 (c) は 「軽い驚き」 を生む最小手 (= 「自分って、そういう人間だったのか」 思想直結)。

**注意**: 文言 / 生成条件 / pattern 抽出 logic の **詳細は Phase Next-1 readiness で確定**する。 P3-A-1 では 「(c) の枠で行く」 のみ決定。

**CEO 判断**: ⬜ (a) / ⬜ (b) / ⬜ (c) / ⬜ (d) / ⬜ 補正

---

## 2. Appendix — Phase Next 接続点 (= 思想メモ、 着手条件ではない)

以下 3 項目は **重要だが P3-A-1 着手条件ではない**。 Phase Next で扱う:

### A1. sleep / wake / meals 等 calendar 外要素

外部 calendar には睡眠 / 食事 / 通勤等は入っていない。 でも 「最良の 1 日」 を作るならこれらは必須。 Aneurasync が calendar 外の rhythm 要素を勝手に補完するかは Phase Next-1 (= Rhythm baseline 学習) で扱う。

### A2. failure を学習信号化する観測軸

「歩く予定だったけど雨で行けなかった」 等の failure は他 calendar app に無い Aneurasync 独自観測軸。 詳細設計は Phase Next-5 (= Failure as observation) で扱う。

### A3. state-aware multi-rhythm (= HDM v1 連動)

平日 / 休日 / 元気 / 疲れ で別 rhythm 切替。 Stargazer state 観測 + HDM v1 「複数自分の可視化」 と直結。 詳細設計は Phase Next-4 (= State-aware multi-rhythm) で扱う。

---

## 3. Phase Next 全体像 (= 参照、 詳細は decision-log)

P3 完了後の本丸 (= CEO ゴール 「予定が勝手にできあがる」 直結):

```
Next-1: Rhythm baseline 学習
Next-2: 1 日構成権限の Alter 委譲
Next-3: 詩学的予定言語
Next-4: State-aware multi-rhythm
Next-5: Failure as observation
Next-6: 「今」 が主役 UI 反転
```

詳細は `docs/decision-log.md` 2026-05-26 entry 参照。

革新案の合流先:
- X (= Calendar gap noticing): Next-1 / Next-2 に合流
- Y (= Pattern Inference 先行): Next-1 / Next-2 に合流
- Z (= Soft connect): **主導線にせず、 内部 rollout / 安全設計に降格保持** (= GPT 案採用)

---

## 4. 着手条件 — readiness 確定後の次 step

### 4.1 CEO 判断必要事項

1. 本体 12 問それぞれに CEO 判断 (= GO / 補正 / 待った)
2. Appendix 3 項目を Phase Next 範疇として確認
3. 実装着手 GO (= P3-A-1-1 から)

### 4.2 着手後の sub-phase 案 (= 参考、 readiness 確定後に詳細化)

```
P3-A-1-1: OAuth flow scaffold (= scope 確認 + redirect + token 取得試行)
P3-A-1-2: token 暗号化保管 + RLS column 設計
P3-A-1-3: 初回 full sync (= events fetch + ExternalAnchor 変換 + DB persist)
P3-A-1-4: 差分 sync (= syncToken + cron 接続)
P3-A-1-5: connect / disconnect UX (= Plan header + 設定画面)
P3-A-1-6: failure degrade UI + .ics fallback link
P3-A-1-7: 初回体験 (= 問 12 採用案の skeleton 実装)
P3-A-1-8: smoke + atomic commit + W4 / P3-A-2 着手判断
```

各 sub-phase は **atomic commit**、 段階的に積む (= P2 / .ics と同 pattern)。

### 4.3 着手禁止事項 (= 不変原則)

- readiness 12 問の全 CEO 判断確定 **前** の code 着手禁止
- 「画期的・超越的」 思想を本 readiness に追加流し込み禁止 (= Phase Next で扱う)
- migration apply (= supabase db push) は CEO 個別承認制

---

## 5. 参照

- 旧 .ics readiness: `docs/alter-plan-p3-ics-import-readiness.md` (= P3-B 用、 保持)
- decision-log: P3 redefinition + Phase Next 6 軸 記録 (= 2026-05-26 entry)
- CEO Operating Rules: `CLAUDE.md` (= 承認制 / 自律実行 / State Safety Rule)
- Aneurasync 思想: `memory/aneurasync-philosophy.md`
- HDM v1: `memory/project_heart-dynamics-model-v1.md` (= Next-4 連動)
