# Phase Next-1 Rhythm Baseline 学習 Readiness

**Date**: 2026-05-26
**Status**: 🟡 readiness のみ (= code 禁止、 docs-only)
**Scope**: **「ユーザーの自然な rhythm を観察して言語化する最小設計」 に厳密限定**

---

## 0. 背景 — Phase Next 全体の中での Next-1 の位置

### 0.1 CEO ゴール (= 再確認)

> 「ユーザーが予定を立てなくても、 勝手に最良の予定ができている状態」

これは **長期 vision**。 一足飛びにそこへ行くと既存設計の繰り返し失敗 (= 大規模 readiness → 進めない) を起こすため、 **本 readiness は最初の 「観察知能」 だけを設計**する。

### 0.2 Phase Next 6 軸との関係 (= 既存 decision-log 2026-05-26 entry 参照)

```
Next-1 (= 本 readiness): Rhythm baseline 学習 ← descriptive 「あなたの rhythm はこう見えます」
Next-2: 1 日構成権限の Alter 委譲 ← prescriptive 「だから今日はこう」 (= 別 readiness)
Next-3: 詩学的予定言語 (= 別 readiness)
Next-4: State-aware multi-rhythm (= HDM v1 連動、 別 readiness)
Next-5: Failure as observation (= 別 readiness)
Next-6: 「今」 が主役 UI 反転 (= 別 readiness)
```

Next-1 は **6 軸の根幹** だが、 Next-2 以降は本 readiness の範囲外。

### 0.3 本 readiness で **やらないこと** (= GPT 5 禁止項目 厳守)

| 禁止 | 本 readiness では扱わない |
|------|---------|
| 自動予定生成 (= prescriptive) | ✅ Next-2 で扱う |
| multi-rhythm (= 平日/休日、 元気/疲れ) | ✅ Next-4 で扱う |
| Failure learning (= 動けなかった事実の学習信号化) | ✅ Next-5 で扱う |
| 詩学的言語 layer の詳細 | ✅ Next-3 で扱う |
| 「今が主役」 UI 反転 | ✅ Next-6 で扱う |
| **code 実装** | 本 readiness は **docs-only** |

### 0.4 本 readiness の core message

**「観察して、 最小の rhythm を言える」 ところまで。**

ユーザーに 「あなたって、 そういうリズムなんだ」 という気付きを 1 回与える最小設計。 予定を作る AI ではなく、 **リズムを言える AI** の設計。

---

## 1. 観察源 inventory (= 5 source、 「今 vs 将来」 分離、 不足分明示)

### 1.1 5 観察源 (= P3 redefinition 時に CEO ゴール逆算で確定)

```
1. 取り込んだ予定 (= external_anchors)
2. ユーザー編集履歴
3. 達成 / 未達
4. Home Alter 会話
5. Stargazer 軸
```

### 1.2 各観察源の現状 + Next-1 優先度

| # | 観察源 | 今 (= 取得可能) | 将来 (= 別 phase) | Next-1 優先度 | 不足分 |
|---|--------|-----------|----------|---------|-------|
| 1 | **取り込んだ予定** | ⚠️ P3-A-1 fetch + transform 完成、 migration apply 前は production で空 | apply 後に fuel 化 | **最高** (= 唯一の客観 data) | migration apply、 sourceType 'google_calendar' 分離 |
| 2 | ユーザー編集履歴 | ❌ 記録機構なし (= G-α toggle は internal state のみ、 永続化なし) | 別 phase で `plan_edit_event` table 設計 | 中 (= 動かしたい / 動かした事実は強い signal) | edit table + 記録 instrumentation |
| 3 | 達成 / 未達 | ❌ 観測機構なし (= Aneurasync は 「予定があった」 までで 「行ったか」 を知らない) | Next-5 範疇 | 低 (= Next-1 では使わない) | passive 観測 logic、 user 自己申告 UI |
| 4 | Home Alter 会話 | ✅ 既存 alter summaries / dialogues に蓄積、 ただし rhythm 抽出 logic 未実装 | 既存 episodic recall (= Phase 1) の拡張で可能 | 中 (= 補助、 個別 anecdote 抽出可能) | 専用 retrieval logic、 ただし Next-1 では optional |
| 5 | Stargazer 軸 | ✅ 既存 personalModel / judgmentMode / timePreference 等取得可 | 即流用可能 | 中 (= rhythm 言語化の文体補正に使用可能) | rhythm 観察への interaction 設計 |

### 1.3 Next-1 で **fuel として使う source** (= 厳密限定)

**v1 fuel**:
- ✅ **取り込んだ予定** (= source #1) のみ
  - 過去 30 日 + 未来 90 日 (= 親 Q4 採用案)
  - migration apply 後に動き始める
- ✅ (補助、 optional) **Stargazer 軸** (= source #5)
  - 既存 personalModel.timePreference (= 朝型/夜型 等) で 「観察された pattern」 と 「自己認識」 の対比文を生成可能
  - 不在でも Next-1 は動く

**v1 fuel に含めない**:
- ❌ ユーザー編集履歴 (= #2、 記録機構ない時点で使えない)
- ❌ 達成 / 未達 (= #3、 Next-5 範疇)
- ❌ Home Alter 会話 (= #4、 retrieval logic がない、 別 readiness で扱う)

### 1.4 観察源の reliability ranking

1. **取り込んだ予定** = 最高 (= 客観事実、 Google から取得)
2. Stargazer 軸 = 中 (= user self-report 含む、 観測も含む、 layer 厚い)
3. Home Alter 会話 = 低〜中 (= 文脈依存、 解釈幅広い)
4. ユーザー編集履歴 = 中〜高 (= 行動による意思表示、 ただし 「消した」 「動かした」 解釈は要慎重)
5. 達成 / 未達 = 高 (= 行動結果、 ただし観測機構不在)

→ Next-1 では **reliability 最高の #1 のみ** をベースにする。 #5 (= Stargazer) は 補助文体補正のみ。

---

## 2. v1 出力定義 (= 限定的、 pattern card 1 枚)

### 2.1 親 readiness Q12 採用案 (c) との接続

P3-A-1 親 readiness Q12 (= 「初回接続直後の体験」) で **「pattern card 1 枚」** を採用済。 本 Next-1 はその 「pattern card 1 枚」 の **内容 logic 設計** を担う。

### 2.2 v1 で出力する card 種別 (= 4 種に限定)

| 種別 | 例文 | 抽出 logic 概要 |
|------|------|--------|
| **頻度集中** | 「火曜午前にイベントが集まっているみたい」 | 曜日 × 時間帯 (= 朝/午前/午後/夜) 行列で最頻 cell |
| **時間帯傾向** | 「夜は予定をあまり入れないんですね」 | 24 時間 → 4 時間帯にビン化、 最少 cell |
| **曜日 vs 週末** | 「平日と週末で予定の入れ方が違うみたいですね」 | 月-金 vs 土日の event 数比較 (= 比率 1.5x 以上の差) |
| **連続パターン** | 「火曜は他の曜日より忙しそう」 | 単一曜日の event 数が全体平均の 1.5x 以上 |

### 2.3 不変原則

- **1 user 1 card** (= 接続直後の 1 回のみ提示、 連続表示しない)
- **1 card 1 文** (= 内 1-2 文、 詩的にしすぎない)
- **数字を露出しない** (= 「3 件」 ではなく 「集中している」、 「2 日前」 ではなく 「最近」)
- **hedging 必須** (= 「みたい」 「みたいですね」 「そうです」、 断定回避)
- **個別性が出る言い方** (= 「あなたは」 「みなさん」 ではなく 「あなた」)
- **解釈付加禁止** (= 「だから集中力高い」 等の評価語は NG、 観察のみ)

### 2.4 Aneurasync 文体 既存資産との整合

- 既存 8b CategoryMeaning の 「〜時間」 廃止 / 状態描写型と同方針
- 既存 alterNote 文体 (= 「〜そうです」 hedging) を踏襲
- 親 docs 文体 「行動指示ではなく自己理解からの着地」 と整合

---

## 3. descriptive vs prescriptive の分離 (= 厳格境界)

### 3.1 範囲表

| 軸 | Next-1 (= descriptive) | Next-2+ (= prescriptive) |
|----|---------|---------|
| 目的 | **観察を言語化する** | 行動を促す / 予定を作る |
| 主語 | 「あなたの rhythm は」 「火曜午前は」 | 「だから今日は」 「明日は」 |
| 述語 | 「集まっている」 「違うみたい」 | 「組みましょう」 「これをすべき」 |
| user 反応の期待 | 「そういえばそうだな」 (= 気付き) | 「これやろう」 (= 行動) |
| 失敗時の影響 | 「外したな」 (= 受け流せる) | 「いや違う」 (= 不信感) |

### 3.2 文体規約 (= 禁止された言い方リスト)

| 禁止 | 理由 | OK 表現 |
|------|------|--------|
| 「明日は X するといいですね」 | 行動指示 = Next-2 範囲 | (= 出さない) |
| 「予定を提案します」 | 予定生成 = Next-2 範囲 | (= 出さない) |
| 「3 件あります」 | 数字露出 | 「集まっています」 |
| 「集中力高いですね」 | 評価語、 解釈付加 | 「集中する時間帯みたい」 |
| 「みなさんそうです」 | 個別性消失 | 「あなたは」 |
| 「絶対に〜」 | hedging 不足、 断定 | 「〜みたい」 「〜そうです」 |
| 「すべき」 「べきだ」 | 規範 = Next-2 範囲 | (= 出さない) |

### 3.3 境界が曖昧になりやすい case

- 「夜は予定をあまり入れないんですね」 → ✅ descriptive (= 観察事実)
- 「夜は予定を入れない方がいいですね」 → ❌ prescriptive (= 規範)
- 「火曜午前が集中しているみたい」 → ✅ descriptive
- 「火曜午前を有効活用しましょう」 → ❌ prescriptive (= 行動指示)

→ Next-1 実装時の検証 checklist で本 §3.3 を必須項目化。

---

## 4. P3 接続点 (= fuel inflow の論理)

### 4.1 P3-A-1 完成済 chain (= 2026-05-26 closeout 状態)

```
P3-A-1-1-c connect route ─┐
P3-A-1-1-d callback route ─┤
P3-A-1-1-e refresh helper ─┤── OAuth 接続
P3-A-1-1-f status/disconnect┘
P3-A-1-2 C-α events fetch ─┐
P3-A-1-2 C-α transform ────┤── events 取り込み logic
P3-A-1-2 E-α refresh helper ┘
P3-A-1-2 G-α 設定 UI shell (= subscription toggle internal)
```

すべて **DB 非依存 mock 検証完了** (= 197 unit tests)。 migration apply 後に DB persist 経路が動き始める。

### 4.2 Next-1 が動き始める要件

**前提条件** (= 全部揃って初めて Next-1 v1 が動く):

1. ✅ migration apply 完了 (= D-e 後の別 phase、 CEO 慎重判断)
   - `external_anchors` + `external_anchor_sources` table が production / staging に存在
   - `user_calendar_connections` + `user_calendar_subscriptions` table が存在
2. ✅ sourceType 'google_calendar' 分離 (= migration apply phase の中で実施、 closeout doc §5.2 Step 2)
3. ✅ initial sync DB persist 実装 (= closeout doc §5.2 Step 3)
4. ✅ user が Google 接続した (= 既存 connect → callback → DB write 動作)
5. ✅ 過去 30 日 + 未来 90 日 events が `external_anchors` に蓄積 (= 自然な事実集合)

**minimum data 件数** (= Next-1 が card 出すための data 量):
- 過去 30 日 events ≧ **7 件** (= 1 週 1 件 ペース)
- 未来 7 日 events ≧ **3 件**
- 上記未満 → Next-1 は card 出さない (= fail-safe §5.2)

### 4.3 fuel pipeline (= 実装時の data flow)

```
user_calendar_subscriptions (= is_enabled=true)
    ↓ initial sync
external_anchors (= sourceType='google_calendar' = 将来分離)
    ↓ Next-1 query
過去 30 日 events 集合
    ↓ pattern 抽出 logic
1 card (= 4 種類 candidates から 1 つ選択)
    ↓ proactively 提示
user feedback (= 「ふむふむ」 / 「外れてる」)
```

### 4.4 Next-1 と既存 alterNote / pattern 機構との関係

- 既存 alterNote (= P2 LLM 連携) は **per-event の解釈**
- 既存 CategoryMeaning は **category 1 つの状態描写**
- Next-1 は **時系列 pattern の 1 文要約**
- 重ねて表示しない: alterNote / category / Next-1 は **異なる layer**、 同 user 体験で連続提示しない

---

## 5. 成功条件 + fail-safe

### 5.1 「そういうリズムなんだ」 と感じる 4 最小条件

1. **観察された事実に基づく** (= 数字裏付け、 ただし数字露出しない)
2. **個別性が出る** (= 「みなさん」 ではなく 「あなた」)
3. **反論しにくい** (= 「外している」 と思われない、 hedging で safety)
4. **解釈付加しない** (= 評価 / 規範ではなく観察のみ)

### 5.2 fail-safe 3 種 (= card を出さない 安全 default)

| 失敗 mode | 検出 | 対応 |
|----------|------|------|
| **data 不足** | 過去 30 日 events < 7 件 or 未来 7 日 < 3 件 | card を出さない、 接続完了 toast のみ + 「もう少し見てから話します」 hint (= P3-A-1-1-h banner の partial 系を流用可) |
| **pattern 不明瞭** | 全曜日 / 時間帯がほぼ均一 (= 最頻 cell が平均の 1.2x 未満) | card を出さない、 「リズムが見えてくるまで観察します」 hint |
| **誤判定リスク高** | 1 event のみが特異 cell 占拠 / outlier 影響大 (= median 計算で除外可) | card を出さない、 logic はもう少し data 待ち |

### 5.3 「出さない」 が default 安全

- card 出す と判断するには **複数 fail-safe check 全 PASS** が必要
- check 1 つでも fail → card 出さず、 user に 「もう少しお待ちください」 系の hint のみ
- これは ⑤ ゴール逆算: 「外して不信感を与える」 が最大リスク、 「黙る」 が安全側

### 5.4 user feedback 観測 (= Next-1 自己改善材料、 Next 段で扱う)

本 Next-1 では feedback 機構を **設計しない** (= 別 phase)。 ただし将来用に:
- card 横に 「ふむふむ」 / 「外れてる」 button 候補は **設計余地として残す**
- 実装は Next-1 v2 以降

---

## 6. 着手禁止事項 (= 不変原則)

本 readiness 完了後の Next-1 実装着手にも以下不変原則を適用:

- **code 実装は CEO 個別 GO** (= 本 readiness は docs-only、 起草 commit 着地で停止)
- **自動予定生成詳細を本 readiness に書かない** (= Next-2 別 readiness)
- **multi-rhythm 詳細を本 readiness に書かない** (= Next-4 別 readiness)
- **failure learning 詳細を書かない** (= Next-5 別 readiness)
- **詩学的言語 layer 詳細を書かない** (= Next-3 別 readiness、 ただし文体規約は §2.3 / §3.2 で軽く明示)
- **prescriptive 出力 (= 行動指示 / 予定生成) を本 readiness に書かない** (= Next-2 範疇)
- **scope を 「観察 → 言語化」 1 文 card 1 枚 に厳守**

---

## 7. 関連 docs

- `docs/alter-plan-p3-a-1-closeout.md` (= 本 readiness の前提、 P3-A-1 完成範囲)
- `docs/alter-plan-p3-a-1-google-calendar-readiness.md` (= 親 readiness、 Q12 pattern card 採用)
- `docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md` (= Q12 4 択 skeleton 確定)
- `docs/alter-plan-migration-apply-plan.md` (= Next-1 動作前提の migration apply 計画)
- `docs/decision-log.md` (= 2026-05-26 entry、 Phase Next 6 軸 + 革新案 X/Y/Z 合流先)
- `memory/aneurasync-philosophy.md` (= 文体思想、 「自分って、 そういう人間だったのか」 の本旨)
- `memory/project_heart-dynamics-model-v1.md` (= 将来 Next-4 multi-rhythm の前提)

---

## 8. Next-1 着手段階 (= 本 readiness 確定後)

### 8.1 着手前 必須前提

- ✅ migration apply (= 別 phase、 完了)
- ✅ sourceType 'google_calendar' 分離 (= migration apply phase 内)
- ✅ initial sync DB persist (= P3-A-1 closeout §5.2 Step 3 完了)
- ✅ user が Google 接続済 + 過去 30 日 + 未来 90 日 events 蓄積

### 8.2 着手後の sub-step 案 (= 参考、 別 readiness で確定)

```
Next-1-α: pattern 抽出 logic (= 4 種 card candidates) pure module + unit test
Next-1-β: card 選択 logic (= 4 種から 1 つ、 fail-safe check 統合)
Next-1-γ: card UI component (= 文体 + hedging + 個別性、 既存 banner pattern 流用)
Next-1-δ: P3-A-1-1-h banner との接続 (= callback success → Next-1 card 表示)
Next-1-ε: smoke + 採用判定
```

各 sub-step は別 readiness + CEO 着手 GO 制。

### 8.3 Next-1 完了後の判断 (= 別 phase 着手 GO)

- Next-2 (= 1 日構成権限の Alter 委譲) → 本 readiness の 「prescriptive 範疇」 を別 readiness で扱う
- Next-3 (= 詩学的予定言語) → 文体 layer の本格設計
- 他 Next 軸の優先順位 → 当時の CEO 判断

---

## 9. 不変原則 (= 本 readiness 自身の)

- 本 readiness は **docs-only**、 着地後 code 着手は CEO 個別 GO
- 本 readiness 内で **Next-2 以降の詳細を扱わない** (= 別 readiness)
- 本 readiness 確定後に追加要素を 「Next-1 範囲」 として書き加えない (= scope creep 防止)
- 必要に応じて Next-1 補正 readiness を起草 (= 「v1.1」 等、 後段 phase で)
