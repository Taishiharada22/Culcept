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
