# 第二の自己 Surfacing — 設計（A1-7-34・**設計のみ・最重要 stop gate**）

状態: **設計提出のみ・実装しない**。これは **実ユーザーに tendency を見せる = PRM model persistence の user-facing 有効化** ＝ CEO 明示の最重要 stop gate。前提: M1 events(live) + M2/M3(staging apply) + review flow(A1-7-33・operator review で M3 entry 稼働)。

---

## 0. なぜ最重要か（Aneurasync 哲学の核）
- 中心問い: 「この機能は、ユーザーの**第二の自己**として必要か？」
- 最高体験: **「自分って、そういう人間だったのか」** とユーザー自身が気づく瞬間。
- 第二の自己 surfacing は、events→review→model で蓄積した tendency を**ユーザー本人に返す**＝Aneurasync の到達点。ゆえに **最も慎重**に・対外影響を持つ。

## 1. 何を surface するか
M3 `prm_model_entries`（**review 済 tendency**・user_visible・非 retracted）。各 tendency:
- `(context_dimension, context_value)` 文脈 + `tendency_direction`（adoption/non_adoption/deferral）。
- `certainty`（≤tentative）/ `counter_count`（反証）/ `still_possible`（代替）/ `decay_weight`（recency）。
- **review_decision_id**（人間が approve した証跡）。

## 2. どう framing するか（**断定しない・尊厳・自己認識**）
- **tendency-not-trait**: 「午後の提案を**見送りやすい傾向**かもしれません」≠「あなたは怠惰」。
- **非断定**: certainty ≤tentative を必ず表示。「まだ確かではありませんが…」。
- **counter-evidence + stillPossible 併記**（誠実）: 「ただし〜の時は違うようです」「他の見方も残しています」。
- **narrative（list でなく）**: 「最近のあなたは、午後の予定に少し慎重になっているようです」— 思慮深い友人の観察のように。
- **correctable（user_correction 導線）**: 「これは合っていますか？ / 違う」→ user が confirm/correct→ M3.user_correction 更新（**ユーザーが第二の自己を所有**）。

## 3. ★革新の方向（co-created living model + Alter 連結）
- 第二の自己は**静的レポートでない**。**ユーザーが共創する生きたモデル**:
  - events → review → model → **user confirm/correct** → model 強化（loop を閉じる）。
  - 「これは合っていますか？」の確認が **directly observed** signal（最強）として model を更新。
- **Alter 連結（Human OS 北極星）**: M3 tendency を Alter 判断エンジン（alterHomeAdapter）に注入し、「あなたは午後の提案を見送りやすいので、この判断は…」と**本人モデルで判断**。= 「未来の自分が先に試す」の実体。
- **timing**: dashboard でなく**意味ある瞬間**（reflection 時・自然な pause）に gentle に出す。

## 4. 実装パイプライン（**設計のみ**）
1. **M3 reader**（server-only・owner-RLS・read-only）: prm_model_entries（user_visible∧retracted_at IS NULL）→ tendency[]。column-restricted（raw/seedRef/personality 非 select）。
2. **tendency framing**（pure）: tendency → user-facing 文（非断定・narrative・certainty/counter/stillPossible 反映）。controlled copy（LLM は任意・断定語禁止）。
3. **user confirm/correct route**（M3 user_correction 更新・owner-RLS・flag-gated）。
4. **user-facing component**: 第二の自己 view（Stargazer 深層観測 / Alter 領域に統合・CEO 配置判断）。
5. **Alter 注入**（任意・後続）: M3 tendency を alterHomeAdapter に context として渡す。

## 5. flag / gating（最も慎重）
- `REALITY_SECOND_SELF_SURFACE`（server・default OFF）+ client UI flag。
- **段階**: operator dogfood（自分の M3 で品質確認）→ 少数 test user（招待）→ broader。**各段 CEO 判断**。
- production hard block（surfacing は user-facing ゆえ production 公開は最重要 gate）。

## 6. 安全契約（全維持）
- read-only（surfacing は M3 を mutate しない・user_correction のみ owner が更新）。
- certainty no high（≤tentative 表示）・counter/stillPossible 併記（過断定防止を**ユーザーにも見せる**）。
- no raw/seedRef/personality・owner-RLS・service_role 禁止・redacted。
- **tendency-not-trait・尊厳・correctable**（哲学の絶対原則）。

## 7. ★CEO 判断（実装前・最重要）
- **(a)** いつ surface するか（dogfood operator → test user → broader の各 gate）。
- **(b)** どこに置くか（Stargazer 深層観測 / Alter 領域 / 専用 view）。
- **(c)** copy の tone（哲学の核・「自分って、そういう人間だったのか」を起こす表現）。
- **(d)** Alter 連結を含めるか（M3 tendency を判断エンジンに注入）。
- **(e)** user confirm/correct loop（共創）を v1 に含めるか。
- **(f)** 実装 GO（= user-facing 公開＝最重要 stop gate を越える判断）。

## 8. 実装最小 slice（CEO 承認後）
M3 reader + tendency framing(pure)+tests → user-facing component(flag-gated・dev/operator 先行)→ confirm/correct route → staging dogfood で operator が自分の第二の自己を見る → CEO 評価 → 段階公開。

## 9. しない（A1-7-34 の境界 = stop gate）
**実装一切しない**（本 slice は設計のみ）。user-facing 公開・production・Alter 本線注入・実ユーザーへの tendency 表示は全て CEO 承認 stop gate。
