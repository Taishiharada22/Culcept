# PRM ⇄ Alter Bridge 設計（A1-7-36）— 設計のみ・実装は stop gate

> **Status: 設計のみ（docs-only）。実装一切なし。**
> Alter 連結の実装 / Home・Stargazer 本線接続 / 本格 user-facing 公開 / production は **CEO 承認 stop gate**。
> 本書は「どう繋ぐべきか」を、既存 Alter 判断エンジンの**実在する seam** に基づいて設計する。コードは書かない。

関連:
- PRM 本体: `docs/aneurasync-reality-control-os-connection-design.md`（events→review→model→surface→feedback）
- 第二の自己 surfacing: `docs/prm-second-self-surfacing-design.md`（A1-7-34）
- Confirm/Correct Loop: `docs/prm-confirm-correct-loop-design.md`（A1-7-35・実装済 operator-only）
- Human OS 北極星: `memory/project_stargazer-human-os-strategy.md`（5層 / Decision Engine★）
- Alter 声の制約: `memory/feedback_alter-voice-constraints.md`

---

## 1. 全体設計の中の位置

PRM（Personal Reality Model）はここまで **5 層** を積んだ:

```
M1 events（観測の生データ・applied）
  → M2 review（人間 review 決定・operator/user・applied）
    → M3 model（review 済 tendency = PRM 本体・applied）
      → A1-7-34 surface（第二の自己 read-only 表示・operator-only）
        → A1-7-35 feedback（confirm/correct/reject で本人が co-create・operator-only）
```

A1-7-36 は **6 層目 = PRM を Alter の判断に返す**。Human OS 5 層で言えば:

```
Observation → Personal Model → 【Decision Engine★ ← ここに PRM を注入】 → Early Warning → Human API
```

外向けの核「**未来の自分が先に試す**」の実体は、ここで初めて立ち上がる。Alter が一般論でなく**本人の tendency を内側に持って**判断したとき、ユーザーは「これは自分のための判断だ」と感じる。逆に言えば、PRM が surface（見せる）と feedback（直す）で止まっている限り、PRM はまだ「観測の鏡」であって「判断する第二の自己」ではない。本層がそれを越える。

---

## 2. 目的

M3 の review 済 tendency（`{contextDimension, contextValue, tendencyDirection, favoredHypothesis, stillPossible[], evidenceCount, counterCount, certainty}`）を、Home Alter の判断生成に**文脈一致したぶんだけ**「内部参照」として渡し、Alter の判断を**本人の傾向に整合**させる。ただし **tendency を断定にしない・本人の現在入力を上書きしない・声の制約を一切緩めない**。

---

## 3. 中心原則（哲学・絶対に曲げない）

1. **tendency は trait でない**。注入するのは「夜の予定では見送りやすい傾向が（反証 N 件つきで）見えている」であって「あなたは怠惰」ではない。文脈束縛のまま渡す。
2. **断定しない**。M3 の certainty は構造的に `≤tentative`。注入は Alter の確信を上げてはならない（confirm 済でも上げない＝A1-7-35 の原則の継承）。
3. **本人の現在入力 > 過去の tendency**。今ユーザーが言っていることが最優先。tendency は背景の重み付けであって、現在の発話を否定する根拠にしない（directly-observed-now > inferred-history）。
4. **counter / stillPossible を Alter にも見せる**。過断定防止を prompt 内部にも持ち込む。「ただし反証 N 件・別の見方も残っている」を tendency と一緒に渡す。
5. **user_correction を尊重**。`rejected` の tendency は注入しない。`direction_adjusted` / `context_refined` は補正を反映（A1-7-35 で本人が直した結果を Alter が無視しない）。
6. **verbatim 引用しない**。tendency は「内部参照のみ」。Alter が「あなたの M3 によると…」と機械露出しない（既存「判断傾向（内部参照のみ）」注入と同じ作法）。
7. **fail-open / 既存挙動不変**。flag OFF・tendency 0 件・解決不能 → 注入なしで**今の Alter と完全に同一**。

---

## 4. 接続アーキテクチャ（既存 seam に乗せる）

> 設計の肝は「**新しい注入機構を作らない**」こと。Alter route には既に「行動傾向を内部参照 hint として trust-gated で注入する」前例が 3 つある。PRM 注入はそれらに**並置**する。

### 4.1 既存の前例（実在・本書はこれを踏襲）

| 既存注入 | 場所（`app/api/stargazer/alter/route.ts`） | 作法 |
|---|---|---|
| heart state block | `5334–5365`（`buildUnifiedHeartState` → `homeSystemPrompt += "\n\n"+heartBlock`） | trust-gated append |
| session diff block | `5367–5382` | append |
| **判断傾向（内部参照のみ）** | `5402–5436`（`stargazer_alter_patterns` を `observation_count≥5 ∧ confidence≥0.3` で読み「# 判断傾向（内部参照のみ）」を append） | **最も近い前例**: 行動傾向を hint として閾値 gate して内部参照注入 |
| counterfactual live | `STARGAZER_FLAGS.counterfactualLive`（`6591`） | kill switch・default OFF |

PRM tendency 注入は ④「判断傾向（内部参照のみ）」の**隣に置く新しい block**として設計する（同じ append 形・同じ trust gate・同じ「内部参照のみ」見出し作法）。

### 4.2 データフロー（server 側・owner-RLS・fail-open）

```
alter route（既に auth 済 userId）
  └─(flag ON ∧ hasMinTrust ∧ responseMode≠clarify)
      ├─ M3 reader.readSecondSelfTendencies()         // A1-7-34 で実装済・owner-RLS・user_visible∧非retracted・fail-open[]
      ├─ resolvePrmContext(queryContext, tendencies)   // 【新・pure】現在の判断文脈に一致する tendency だけ選ぶ
      └─ buildPrmTendencyBlock(relevant)               // 【新・pure・非断定】「内部参照のみ」block を生成
          → homeSystemPrompt += "\n\n" + block         // heartBlock と同じ append
```

- **reader は新規実装しない**: A1-7-34 の `createSupabasePrmModelEntryReader(...).readSecondSelfTendencies()` をそのまま再利用（`SecondSelfTendency[]`・owner-RLS・fail-open）。
- **新規は 2 つの pure 関数のみ**: `resolvePrmContext`（relevance gating）と `buildPrmTendencyBlock`（prompt 生成）。どちらも DB 非接触・テスト容易。

### 4.3 Context Resolver（relevance gating）— ここが品質の要

tendency を全部ぶちまけてはいけない。M3 tendency は `contextDimension ∈ {band, durationBucket, confidence, source}` で文脈束縛されている。現在の判断の文脈（`queryContext`：時間帯・所要時間・stake 等）と**一致するものだけ**を選ぶ。

選別規則（v1・保守的）:
1. **context 一致**: 現在の判断から導ける `band`（朝/午後/夜）/ `durationBucket` 等に `contextDimension:contextValue` が一致する tendency のみ。一致を導けないときは**注入しない**（relevance は fail-closed）。
2. **証拠の厚み**: `evidenceCount ≥ E_MIN`（例 4）かつ `counterCount` が evidence に対して支配的でない（例 `counterCount < evidenceCount`）。薄い/割れている tendency は注入しない。
3. **user_correction**: `rejected` は除外。`direction_adjusted` / `context_refined` は補正後の解釈を使う。
4. **件数上限**: 上位 `K`（例 2）まで。判断を 1〜2 本の「背景の重み」に留め、Alter を tendency で埋めない。
5. **矛盾時**: 同一文脈で逆向き tendency が並んだら、**断定せず両方を「揺れ」として**渡す（または evidence 上位を主・他を stillPossible 扱い）。潰さない。

> 注: 現在の判断文脈 → `band`/`durationBucket` への写像は、既に Alter route が持つ `queryContext` / morning session context から導ける（新しい観測経路は作らない）。導けない次元はスキップ（過剰一致を避ける）。

### 4.4 Prompt block design（非断定・内部参照）

`buildPrmTendencyBlock` が生成する block の**意味**（文面は実装時に確定。ここは contract）:

```
# 本人の傾向（内部参照のみ・断定しない・そのまま引用しない）
- 〔夜の予定〕では これまで「見送りやすい」傾向が見えている（手がかり中・反証あり）。
  ただし決めつけない。別の見方も残っている。今この人が言っていることを優先する。
- （本人が一度「向きを調整」した観測。その調整を尊重する。）
内部参照だけに使い、判断の確信を上げる根拠にはしない。
```

- **counter/stillPossible を必ず同梱**（原則 4）。
- 「**今この人の発話を優先**」を block 内に明示（原則 3）。
- 「**確信を上げる根拠にしない**」を block 内に明示（原則 2）。
- verbatim 引用禁止の指示を同梱（原則 6）。

### 4.5 声の制約は「再利用」する（新規 hedge を作らない）

Alter の over-assert 防止は既に実装済:
- `validateResponseQuality`（`alterHomeAdapter.ts:7699–7800`）が `skeleton.confidence_level` に応じて `STRONG_ASSERT`/`MODERATE_ASSERT` を弾く（`7741–7752`）。
- prompt 側 hedge 規則（`2603–2620`）・`sanitizeTraitInversions`（`7811–7892`）。

**設計判断**: PRM tendency の `certainty(≤tentative)` を `skeleton.confidence_level` の `low/medium` 側へ寄せる（＝tentative を high 確信に化けさせない）。これにより**既存の hedge enforcement がそのまま PRM 注入後の文章にも効く**。新しい検証層を足さず、既存ゲートを通す。これが最重要の安全再利用。

### 4.6 ForceBalance への数値上書きは v1 で「しない」

`computeForceBalance`（`456–599`）/ `reconcileDecisionMetadata`（`605–670`）に tendency 由来の数値補正を入れる案はあり得る（例: `non_adoption` 文脈一致で `protect_pressure` を +0.1）。**v1 は採らない**。理由:
- 数値上書きは判断を**静かに歪める**（prompt hint と違い、ユーザにも開発者にも見えにくい）。
- 既存の decision-pattern 注入も「hint」であって ForceBalance override ではない（前例に倣う）。
- まず prompt-hint で効果と安全を観測し、ForceBalance 連動は**将来 sub-phase**で慎重に。

---

## 5. gating（trust / phase / flag）

- **trust**: 既存 `hasMinTrust = discreteTrustLevel ≥ 1`（`5334`/`5402`）を踏襲。信頼の薄い段階で本人モデルを判断に効かせない。
- **mode**: `responseMode ≠ clarify`（聞き返し時は注入しない）。
- **flag**: 新 env `REALITY_ALTER_BRIDGE_LIVE`（default OFF・kill switch）。`counterfactualLive` と同じ作法。読み出し先（`STARGAZER_FLAGS` に足すか `PLAN_FLAGS` を alter route に import するか）は CEO/実装判断（§8-b）。
- **flag OFF / 0 件 / 解決不能** → `homeSystemPrompt` を一切変えない＝**現行 Alter と bit 同一**。

---

## 6. 失敗シナリオ・副作用・rollback

| # | 失敗 | 予防（設計内） |
|---|---|---|
| F1 | tendency が判断を歪める | hint のみ（数値上書きしない・§4.6）＋「現在発話優先」明示（§4.4）＋本人入力 > history（原則 3） |
| F2 | 過断定（tentative を断定化） | certainty→confidence_level low/medium 写像で**既存 hedge enforcement**を通す（§4.5）。新規 assert を作らない |
| F3 | stale/誤った tendency | `retracted_at` 除外（reader 既存）＋`user_correction=rejected` 除外＋evidence/counter 同梱で「決めつけない」 |
| F4 | 相反 tendency の衝突 | 潰さず「揺れ」として提示 or evidence 上位を主・他を still_possible（§4.3-5） |
| F5 | context 誤マッチ（無関係 tendency 注入） | relevance を **fail-closed**（一致を導けねば注入しない・§4.3-1）＋件数上限 K |
| F6 | privacy / 機械露出 | 「内部参照のみ・verbatim 禁止」を block 内明示（原則 6）。raw/seedRef は元々 M3 に無い（structured-only） |
| F7 | user の訂正を無視 | `direction_adjusted`/`context_refined` を resolver で反映（原則 5・A1-7-35 の co-create を活かす） |
| F8 | 本線汚染・回帰 | flag OFF で完全 no-op。alter route の**他経路に触れない**追加 append のみ |
| **rollback** | 何かおかしい | **`REALITY_ALTER_BRIDGE_LIVE=false`** で即時・完全に元の Alter 挙動へ（データ変更なし＝read のみ） |

> 本層は **read-only**（M3 を読むだけ・書かない）。判断への副作用はすべて prompt 経由・flag 1 本で巻き戻せる。これが「実装は怖くない」根拠。

---

## 7. 実装最小 slice（CEO 承認後・本書では実装しない）

1. flag `REALITY_ALTER_BRIDGE_LIVE`（default OFF）。
2. `resolvePrmContext`（pure・relevance gating・unit test：一致/不一致/薄い/相反/rejected 除外/上限 K）。
3. `buildPrmTendencyBlock`（pure・非断定 block・unit test：断定語なし/trait 語なし/counter・stillPossible 同梱/「現在発話優先」「確信上げない」明記/verbatim なし）。
4. alter route 注入（flag-gated・`readSecondSelfTendencies` 再利用・heartBlock 隣に append・fail-open・**他経路不接触**）。
5. **shadow 監査**（注入 ON/OFF で over-assert 率・判断の歪み・hedge 違反を比較。`validateResponseQuality` 違反が増えないこと）。
6. staging canary（operator dogfood で「自分の Alter が自分の傾向で判断する」体感・段階）。

各 slice は tests/tsc/reality green を確認して commit。実装は A1-7-35 と同じ「tiny slice + 自己監査 + green→commit」。

---

## 8. CEO 判断（実装前）

- **(a) 注入の強さ**: prompt-hint のみ（推奨・§4.6）か、ForceBalance override まで含めるか。
- **(b) flag の置き場**: `STARGAZER_FLAGS.realityAlterBridge` を新設 か、`PLAN_FLAGS.reality*` を alter route に import か。
- **(c) どの trust/phase から**: `discreteTrustLevel ≥ 1` 踏襲でよいか、より高い trust から始めるか。
- **(d) 件数上限 K / evidence 閾値 E_MIN**: 判断を埋めない保守値（K=2, E_MIN=4 提案）の妥当性。
- **(e) 実装 GO**: operator-only dev-preview/staging canary までか、それ以前に設計を再検討するか。

---

## 9. stop gate（本書の境界）

- 本書は **設計のみ**。コード変更・flag 追加・route 注入・実装は**一切しない**。
- **Alter 連結の実装** / **Home・Stargazer 本線接続** / **broader user-facing 公開** / **production** は **CEO 承認 stop gate**。
- 設計提出をもって**停止**する。
