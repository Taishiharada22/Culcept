# Reality Control OS — A-4-c3 Operator Dogfood / Preview Quality Protocol（**docs-only**）

> 2026-06-10 / Build Unit / CEO 指示「operator preview を『ただ見える画面』で終わらせず、本線接続前に提案品質・安全性・運用判断を評価する dogfood protocol を固定する」。
> **docs-only**。code / route / client / real read 追加 / staging render 追加 / DB write / seed / apply / PlanClient / Plan 本線 / migration / notification / production / enable には進まない。
> 前提: Display-apply / Reflection Preview surface 完結（P-A〜P-E + A-4-a/b/b2 + A-4-c/c2・`851d0649` まで全 green）。

---

## 1. Dogfood 対象

- **面**: 既存 operator-only preview `/plan/dev-reality-pipeline` のみ（envelope + meta + Reflection Preview DTO）。
- **環境**: staging/dev host のみ（triple-guard: `REALITY_CANDIDATE_ACTIONS_DEV_HOST=true` ∧ staging `hjcrvndumgiovyfdacwc` ∧ production deny）。**production は構造的に対象外**（flag ON でも notFound）。
- **flag 運用**: `REALITY_PIPELINE_PREVIEW=true` を **dev/staging の env にのみ**設定（`.env` への恒久設定は CEO 判断・本 protocol は session 単位の ON を既定とする）。NEXT_PUBLIC なし・production env は触らない。
- **観測者**: operator（=CEO/Build・owner-RLS で自分のデータのみ）。
- **頻度の目安**: 朝 1 回（empty-day 判断が最も意味を持つ時間帯）+ 予定追加/変更があった日はその後にもう 1 回。**1 回の閲覧 = 1 record**。
- **memory influence の観測**: 現状 staging M1/M3 は 0 行のため、memory あり挙動の観測には **controlled seed session が必要 → 別 GO**（既存 4-E-b パターン: seed→観測→cleanup→count 0）。本 protocol 自体は seed を行わない。

## 2. 観測項目（毎 record で読むもの）

| 層 | 項目 |
|---|---|
| envelope | readiness（ready/partial/insufficient）/ recommended tier（protect/easy/push・null=組めない）/ trigger（kind+headline or silent）/ permission verdict（propose 基準）/ stopReasons |
| meta | hardConstraints / availableWindows / usableContexts / memoryItem counts |
| Reflection Preview | stage（prepare/precondition/reflect/done）/ preconditionVerdict（can_apply 等）/ reflectedItemCount / blockersCount / warningsCount / items（HH:MM＋label）/ redaction 表示 |
| 質的観測 | HH 配置の自然さ / label allowlist の妥当性（§3 Q6）/ hardConstraints・windows との整合（重なり・余白）/ memory influence がある場合の挙動変化（confidence low→tentative・tier の変化）/ **silent・「組めない」の妥当性**（出さない判断が正しかったか） |

## 3. 品質評価 rubric（各 record で OK / WATCH / NG）

| # | 軸 | OK の基準 | NG の例 |
|---|---|---|---|
| Q1 | 時間配置が自然か | 自分がその時刻に実際やれると感じる配置・ブロック間に呼吸がある | 早朝/深夜への機械的配置・連続詰め込み |
| Q2 | 既存予定を邪魔していないか | anchor と重ならず（A-1 保証）、**前後に移動・準備の余白**がある | hard anchor の直前まで focus_work が密着 |
| Q3 | 空き時間を過剰に埋めていないか | protect は特に**余白が残る**・全窓を埋めない | 全 window がブロックで充填される |
| Q4 | protect/easy/push の選択が妥当か | その日の密度・(fixture)energy/weather に照らして納得できる tier | 過密日に push・空白日に何も出ない |
| Q5 | 「提案しない」判断が妥当か | insufficient/組めない日・silent が**正しい沈黙**である | 出すべき日に沈黙・出すべきでない日に提案 |
| Q6 | label の抽象度 | 5 語 allowlist が「何をするか」を**縛らず**「どう過ごすか」を示す | 抽象すぎて無意味に感じる・逆に具体行動を指図して感じる |
| Q7 | ユーザーに誤解を与えないか | 「まだ書き込んでいない」ことが**読み違えようがない** | 保存された/確定したと一瞬でも誤読する表示 |

- 判定は operator の主観でよい（dogfood の目的は主観の蓄積）。**WATCH=気になるが許容 / NG=このままでは本線に出せない**。

## 4. 安全評価 rubric（各 record で PASS / FAIL・**1 つでも FAIL なら dogfood 中断→修正**）

| # | 軸 | 確認 |
|---|---|---|
| S1 | write/apply 導線がない | button/保存/確定/apply 表示が一切ない |
| S2 | raw/PII が出ない | 発話・人物・連絡先・長桁数字が画面に出ない |
| S3 | item id が出ない | `display:`/UUID/draft id が出ない |
| S4 | full payload が出ない | ChangeSet ops/DraftPlanItem 実体/sourceTrace が出ない |
| S5 | location/title が出ない | anchor の中身（タイトル・場所）が一切出ない（counts と HH のみ） |
| S6 | high risk が auto にならない | permission/precondition に high-risk の自動 allowed/can_apply が無い |
| S7 | insufficient context で捏造しない | 組めない日に recommended/items を出さず stopReasons が出る |
| S8 | blockers/warnings が正しく出る | counts が状況（duplicate 再閲覧等）と矛盾しない |

## 5. Dogfood 記録フォーマット（`docs/reality-preview-dogfood-log.md` に追記・**redacted**）

```markdown
### [YYYY-MM-DD HH:mm] record N
- counts: anchors=__ windows=__ memory=__ usableContexts=__
- envelope: readiness=__ tier=__ trigger=__ permission=__
- reflection: stage=__ verdict=__ items=__ blockers=__ warnings=__
- 品質: Q1 _ / Q2 _ / Q3 _ / Q4 _ / Q5 _ / Q6 _ / Q7 _（OK/WATCH/NG）
- 安全: S1-S8 = PASS / FAIL（FAIL 時は番号と現象）
- 気になった配置: （**anchor の中身は書かない**・提案ブロックの HH:MM と感想のみ）
- 修正すべき heuristic: （なし / R2 配置 / A-1 判定 / 表示 / 文言 …）
- 本線接続判断: go / hold（理由 1 行）
```
- **log の redaction 規則**: anchor のタイトル・場所・人物は**書かない**。書いてよいのは counts・enum・提案ブロックの HH:MM・抽象的な感想のみ。

## 6. Go / No-go criteria

### Plan 本線接続（design 着手）へ進んでよい条件（**全て満たす**）
1. **記録 ≥ 10 record・≥ 7 日**にわたる（うち **空白日 ≥ 2・予定密集日 ≥ 2**・可能なら memory-present 日 ≥ 1〔seeded session・別 GO〕）。
2. **S1–S8 が全 record で PASS（100%）**。
3. 直近 5 record に **Q の NG が 0**・全期間で **OK 率 ≥ 80%**。
4. 「修正すべき heuristic」に **blocking 残件が 0**。
5. CEO が log を確認して go 判定。

### 追加 pure 調整が必要な条件
- 同じ Q 軸で **WATCH/NG が 2 回以上反復** → 該当層の pure 修正を dogfood より優先（修正→lock test→dogfood 再開）。

### R2 generator を修正すべき条件
- Q1/Q2/Q3 系の NG（例: hard anchor 直前への密着・protect での過剰充填・不自然な時間帯）→ `empty-day-generator` の配置 heuristic（buffer・充填率・時間帯重み）を pure 修正。

### A-1 precondition を修正すべき条件
- **false can_apply**（実は窓が埋まっていた等・conflict 見逃し）または **false block**（出るべきものが blocked）を 1 回でも観測 → **即 blocking**。修正 + 再現 lock test を追加してから dogfood 再開。

### DTO / preview 表示を修正すべき条件
- operator が状態を誤読（S 系は PASS だが Q7 で NG）・判断に必要な情報の不足。修正は **A-4-c0 allowlist の範囲内**で additive に行い、allowlist を超える場合は **c0 改訂（CEO gate）**。

## 7. 次 gate の整理（**全て独立・順序つき**）

| gate | 内容 | 前提 |
|---|---|---|
| G1 Plan 本線接続 design（docs） | 実 DraftPlan pipeline への reflect 配線点 + empty-day 用 `DraftPlanItemOrigin` 値の確定（**cross-track 調整**） | §6 go 達成 or CEO 判断 |
| G2 PlanClient integration | 本線 DraftPlan に映った候補の user 向け表示（読み取り） | G1 完了 + CEO |
| G3 **A-4-d DB write** | user accept 時の Commit-apply（plan_seeds status 経路再利用・undo・idempotency） | **閉じたまま**（G2 で accept UX が要るときに CEO write gate） |
| G4 production | flag/host の production 展開・user-facing | G1–G3 + canary + CEO |

---

→ A-4-c3 完了。dogfood は本 protocol に従い operator が実施（記録は `docs/reality-preview-dogfood-log.md`）。**Plan 本線接続 / PlanClient / DB write / production には進まない**。

---

## 8. Life Ops 3VM 観測項目（2026-06-10 追記・CEO/GPT GO）

> 対象: operator preview の **Life Ops Preview section**（fixture 入力・`301807b2`）+ Reflection Preview の併存。
> **範囲限定**: staging/preview のみ・既存 `REALITY_PIPELINE_PREVIEW` flag 内・fixture のみ・実データ源/DB write/通知/PlanClient/R4 本線/UI card 本線/production なし。観測ログはスクショ/手動メモ/decision-log まで。

### 観測軸 L1–L9（各 record で OK / WATCH / NG）

| # | 軸 | OK の基準 | NG の例 |
|---|---|---|---|
| L1 | 3VM の役割が重複しすぎていないか | Reflection=器 / Morning=朝の言語化 / Moment=今の一声、と**読み分けられる** | 同じ情報が同じ言い方で 3 回並ぶだけに見える |
| L2 | Morning 代表が Moment で再表示されすぎないか | 重複制御 row の除外数 ≧1 ∧ Moment が代表と別候補 or 沈黙 | 朝に出した候補を Moment が同文でもう一度出す |
| L3 | Moment が focus/recovery 中に黙れるか | focus/recovery 帯では「沈黙（…focus_block）」表示 | 集中ブロック中に候補が出る |
| L4 | 文言が「やるべき」でなく自然/安心/確認系か | 〜と安心です/〜と自然です/〜そうです のみ | 命令形・完了形（やるべき/必ず/入れました） |
| L5 | fixture であることが明確か | 「実データ源には接続していません（fixture）」が**見落とせない位置**にある | fixture 明示がスクロールしないと見えない |
| L6 | 実データ・通知・予定書き込みに見えないか | 「予定には書き込みません。通知もしません。」が読まれ、導線も無い | 保存/確定された印象を一瞬でも与える |
| L7 | 情報量が多すぎないか | 1 画面で「今日どうするか」が 10 秒で掴める | 読むのに 30 秒以上・スクロール疲れ |
| L8 | protect/easy/push が直感的か | 守る案/楽な案/攻める案の差が件数と代表から伝わる | 3 案の違いが分からない・全部同じに見える |
| L9 | overflow/alsoAvailable が不安を煽らず秘書的か | 「入りきらない/ほかにも◯件」が**情報として静かに**ある | 未消化タスクの督促・罪悪感を生む見え方 |

### operator チェックリスト（1 record の手順）

1. staging dev host で flag ON → `/plan/dev-reality-pipeline` を開く（または guarded render script の HTML）。
2. 上から順に読む: Reality envelope → Reflection Preview → **Life Ops Preview**（headline → 3 案 → 注意 → Moment → 重複制御 row）。
3. L1–L9 を OK/WATCH/NG で判定（迷ったら WATCH）。既存 S1–S8（安全）も併記。
4. 気になった文言・重複・情報量を**そのまま引用**してメモ（fixture 語彙のみゆえ引用可）。
5. `docs/reality-preview-dogfood-log.md` に record 追記（§5 フォーマット + L 行）。**直したくなっても観測中は直さない**（修正は観測後の別 slice 提案）。

### 記録フォーマット追記（dogfood-log の record に追加する行）

```markdown
- LifeOps: L1 _ / L2 _ / L3 _ / L4 _ / L5 _ / L6 _ / L7 _ / L8 _ / L9 _（OK/WATCH/NG）
- LifeOps 引用メモ: （気になった文言を引用・fixture 語彙のみ）
```
