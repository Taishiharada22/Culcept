# CoAlter Stage 2.4-A1 Routing Spec 正本候補 Draft

> **status: A1-2 / CEO 裁定反映済 (2026-05-08) / A1-3 切出し待ち**
> A1-2 で CEO が裁定した内容を本書に反映済 (§5 / §6)。
> 確定範囲のみ A1-3 で `docs/coalter-presence-routing-spec.md` 等へ切出し、本書は draft 凍結。
> CEO 厳守: **現実装を正解として固定しない** (現実装は参考扱い、本書は UI spec / speech template / v1.1 を正本基盤とする)。

---

## §0 本書の位置づけ

### 0.1 目的
Stage 2.4-A2 (test 拡張) に進む前に、**routing 正本仕様の確定範囲**を CEO 判断で固定する。test は確定範囲のみを写す (現実装そのままの test 化を避ける)。

### 0.2 構成 (A1 三段階) と現状
- **A1-1 (初版)**: Layer 1-3 期待表 draft + 根拠源整理 + 不整合候補一覧 (I-1〜I-9) — 完了
- **A1-2 (本書、現状)**: CEO 裁定反映 + I-10 追加 + A2 test scope 明示化 — **本更新で完了**
- **A1-3 (次)**: 確定範囲のみを `docs/coalter-presence-routing-spec.md` 等に切出し、本書は draft で凍結 — CEO 着手判断後

### 0.3 上位正本 (本書はその交差点として整理する)
| # | 文書 | 役割 |
|---|------|------|
| 1 | `docs/coalter-presence-state-ui-spec.md` v0.1 §7.12 | **Stage 1 existence gate** (Pattern × State allow matrix) |
| 2 | `docs/coalter-presence-state-ui-spec.md` v0.1 §4.3 | **Stage 2 negative override** (state × mode 別 suppression) |
| 3 | `docs/coalter-presence-state-ui-spec.md` v0.1 §7.10 / §7.11 | **F-1/F-2 共存・非同居規則** |
| 4 | `docs/coalter-speech-template.md` v0.1 §3-§9 | **variant 役割・不変核・誤読防止** |
| 5 | `docs/coalter-core-ux-layered-presence.md` v1.1 §4 / §8.2 | **発話パターン定義 (6 family) / state 定義** |

### 0.4 現実装 (参考のみ、正本扱い禁止)
- `lib/coalter/presence/constants.ts` `PATTERN_STATE_ALLOWED`, `STATE_PATTERN_PRIORITY`
- `lib/coalter/presence/patternSelector.ts` `selectPattern`, `selectSecondaryPattern`, `isSuppressedAtStage2`, `matchesContextPriority`

> 各 Layer の「現実装一致確認」記述は、**正解確認ではなく現状参照**として弱解釈する。本書 §1-§3 は UI spec / speech template が正本。

### 0.5 不可侵境界 (Stage 2.4 全期間共通、CEO 厳守)
- production env 不接触
- ChatClient.tsx / UpperLayerMount.tsx / UrgentLayer 不接触
- speechValidator / speechPostValidator / speechTypes / speechBuilder / llmCall / **model** / **max_tokens** / **length_override** / **timeout** 不変 (Round 7 timeout 8s→10s 単一例外を除く)
- Anthropic 起因と断定しない / 自律 fix-forward 禁止
- 本書 §6 確定前は現実装を「参考」扱い、test 化禁止

---

## §1 Layer 1 — state別 variant 候補 期待表 (Stage 1 existence gate)

### 1.1 期待マトリクス (9 state × 7 variant = 63 セル)

| State | A | B | C | D | E | F-1 | F-2 | 根拠 | 補足 |
|---|---|---|---|---|---|---|---|---|---|
| **S0 見守り中** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | 発話パターンなし (Dormant) |
| **S1 介入気配** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | status chip は介入気配 UI、本マトリクス対象外 |
| **S2 入口発話** | ✓ | — | ✓ | — | — | — | — | UI spec §7.12 / v1.1 §4.1 / §8.2 | A default、C は infoMissing 時のみ。**1 ターンで A or C 排他** |
| **S3 返答待ち** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | 発話パターンなし (Waiting) |
| **S4 理解更新中** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | 発話パターンなし (Updating)、派手さ抑制 |
| **S5 橋渡し中** | — | ✓ | ✓ | ✓ | ✓ | — | — | UI spec §7.12 / v1.1 §4.2/§4.3/§4.4/§4.5/§8.2 | **B / C / D / E のいずれか 1 つ** (排他)。Travel mode では D 既定優先度低下 (§4.3.6) |
| **S6 提案可能** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | 発話パターンなし (UI 導線のみ、Proposal Ready) |
| **S7 提案表示** | — | — | — | — | — | ✓ | ✓ | UI spec §7.12 / v1.1 §4.6 / §8.2 | **F-1 or F-2 のどちらか 1 つ**。合成時は F-2 主 + F-1 副次 = 1 カード (§7.10) |
| **S8 クールダウン** | — | — | — | — | — | — | — | UI spec §7.12 / v1.1 §8.2 | 発話パターンなし (retreat メッセージのみ) |

### 1.2 state 内選択優先順 (§7.12 fallback)

| State | 優先順 | 選択条件 (§7.12) | 根拠 |
|---|---|---|---|
| **S2** | 1. **A** default<br>2. **C** | C は `infoMissing=true` 時のみ | UI spec §7.12 |
| **S5** | 1. **C**<br>2. **B**<br>3. **D**<br>4. **E** | C: `uncertaintyHigh=true` / B: `needFraming=true` / D: `oneSidedFatigue=true` / E: `needTranslation=true` | UI spec §7.12 / v1.1 §11.1 |
| **S7** | 1. **F-2** (Daily/Travel default)<br>2. **F-1 standalone** (通常モード S7 のみ) | F-1 副次は Daily/Travel §7.10 合成規則下のみ | UI spec §7.12 |

### 1.3 v1.1 «6 family» と本マトリクス «7 variant» の整合

| v1.1 §4 family | 本書 variant | 関係 |
|---|---|---|
| §4.1 入口発話 | A | 1:1 |
| §4.2 状況言語化 | B | 1:1 |
| §4.3 確認質問 | C | 1:1 |
| §4.4 片側フォーカス | D | 1:1 |
| §4.5 橋渡し・翻訳 | E | 1:1 |
| §4.6 軽提案 | **F-1 + F-2** | 1:2 split (関係内部向け / 外界向け) |

> 統合契約 §4 既裁定 (UI spec §7.12 が正本)。本書では追記裁定不要。

### 1.4 現実装参照 (参考のみ)
- `PATTERN_STATE_ALLOWED` (constants.ts:50-130) は §1.1 期待マトリクスと一致
- `STATE_PATTERN_PRIORITY` (constants.ts:224-234) は §1.2 期待順序と一致
- 本一致は「実装が UI spec に追従できている可能性」を示すのみ。**A2 では UI spec を expected として test を書く** (現実装出力の写像ではない)

---

## §2 Layer 2 — state × mode 別 suppression 期待表 (Stage 2 negative override)

### 2.1 期待マトリクス (4 active suppression、UI spec §4.3 由来)

| # | state | mode | variant | 動作 | 解除条件 | 根拠 |
|---|-------|------|---------|------|---------|------|
| 1 | S5 | Travel | **D** | **既定優先度低下** (primary 候補から除外) | `relationshipSignalsClear=true` で再昇格 | UI spec §4.3.6 / §7.6 |
| 2 | S7 | Daily | **F-1 standalone** | **primary としては抑制** (F-2 default) | (なし、副次同伴のみ) | UI spec §4.3.8 |
| 3 | S7 | Travel | **F-1 standalone** | **primary としては抑制** (F-2 主) | (なし、Travel は §7.10 で常時 F-1 副次同伴必須) | UI spec §4.3.8 / §7.10 |
| 4 | S7 | Travel | **F-2** | **承認ゲート厳しめ** (確認 1 クッション) | (常時) | UI spec §4.3.8 / §7.9 |

> #4 は **selector scope 外** (CEO 裁定 I-5)。selector test では検証しない。UI / interaction layer の論点として別 track で扱う。

### 2.2 副次同伴規則 (§7.10、Stage 2 とは別レイヤ)

| state | mode | primary | 副次同伴 (F-1) | 根拠 |
|---|---|---|---|---|
| S7 | normal | F-1 standalone | (副次なし) | §7.10 (合成は Daily/Travel のみ) |
| S7 | normal | F-2 | (副次なし) | §7.10 |
| S7 | Daily | F-2 | F-1 副次 (`relationshipNoiseHigh=true` 時のみ) | UI spec §7.10 / §4.3.8 |
| S7 | Travel | F-2 | **F-1 副次必須** (常時) | UI spec §7.10 / §4.3.8 (複数日疲労・主導権偏り対策) |

### 2.3 mode 別 全体 override (§4.3 cell 単位)

| state | normal | Daily | Travel | 差分の正本 |
|---|---|---|---|---|
| S0/S1/S3/S4/S6/S8 | 基線 | = 通常 | = 通常 | UI spec §4.3.1/2/4/5/7/9 |
| S2 | 基線 | + 追加: Daily スコープ告知 (カード冒頭) | + 追加: Travel スコープ告知 | UI spec §4.3.3 |
| S5 | 基線 | + 追加: Daily 文脈ヒント | + 追加: Travel 文脈ヒント<br>→ override: D 既定優先度低下、関係シグナル明確時は再昇格 | UI spec §4.3.6 |
| S7 | 基線 | → override: F-2 主 / F-1 関係ノイズ低時抑制可 | → override: F-2 主 (複数日 Brief 形式) / F-1 副次同伴必須、承認ゲート厳しめ | UI spec §4.3.8 |

### 2.4 現実装参照 (参考のみ)
`patternSelector.ts:163-182 isSuppressedAtStage2` は §2.1 #1, #2, #3 を実装。#4 は selector scope 外で実装なし (UI/interaction layer 側で扱う想定)。**A2 では UI spec を expected として #1-#3 を mock test 化** (#4 は scope 外)。

---

## §3 Layer 3 — context flag priority 期待表

### 3.1 context flag 一覧 (selectPattern 入力)

| flag | 適用 state | 役割 | 根拠 | A2 での扱い (CEO 裁定) |
|---|---|---|---|---|
| `infoMissing` | S2 | true → A→C fallback | UI spec §7.12 | **mock boolean で test** (閾値・判定主体は §9 保留 = I-2) |
| `uncertaintyHigh` | S5 | true → C 優先 | UI spec §7.12 / v1.1 §11.1 | **mock boolean で test** (I-2) |
| `needFraming` | S5 | true → B 候補 | UI spec §7.12 | **mock boolean で test** (I-2) |
| `oneSidedFatigue` | S5 | true → D 候補 | UI spec §7.12 | **mock boolean で test**、判定基準は §9 保留 (I-3) |
| `needTranslation` | S5 | true → E 候補 | UI spec §7.12 | **mock boolean で test** (I-2) |
| `relationshipSignalsClear` | S5 (Travel) | true → D 既定優先度低下を解除 | UI spec §4.3.6 / §9.3.3 | **mock boolean で test**、Travel D suppression 閾値は §9 保留 (I-4) |
| `relationshipNoiseHigh` | S7 (Daily) | true → F-1 副次同伴 1 行併設 | UI spec §4.3.8 / §7.10 | **mock boolean で test** (I-2) |

### 3.2 期待 priority 動作 (state 別)

#### S2
1. `infoMissing=true` → **C** 採択
2. `infoMissing=false`/未指定 → **A** 採択
3. (両方の条件を満たさない state は不在: S2 で A も C も出ないケースは想定外)

#### S5
1. `uncertaintyHigh=true` → **C** 採択
2. `needFraming=true` → **B** 採択 (uncertainty より下位)
3. `oneSidedFatigue=true` (Travel mode のみ追加で `relationshipSignalsClear=true` 必要) → **D** 採択
4. `needTranslation=true` → **E** 採択
5. **どの flag も立たない** → **defensive null** (発話なし、CEO 裁定 I-1/I-8)

> **CEO 裁定 (I-1/I-8)**: S5 で全 flag false → defensive null。E default にはしない。
> **上流設計記録**: S5 到達時は通常 context flag が立つべき。executor watcher / adapter L2-b の責務。
> 全 flag false で S5 に到達するのは異常系であり、本 selector では発話を抑制する (defensive)。

#### S7
1. mode=normal & primary=F-1 → F-1 standalone
2. それ以外 → **F-2** (default)
3. mode=Daily & primary=F-2 & `relationshipNoiseHigh=true` → F-1 副次同伴
4. mode=Travel & primary=F-2 → F-1 副次同伴 (常時)

### 3.3 現実装参照 (参考のみ)
`patternSelector.ts:192-216 matchesContextPriority` は §3.2 の S2/S5/S7 動作を実装。S5 全 flag false → null は本書 §3.2 #5 と一致 (CEO 裁定で正本化)。**A2 では UI spec + 本書 CEO 裁定を expected として mock 入力 test 化**。

---

## §4 Layer 4 — trigger user input draft (Stage 2.4-B 準備、A1-2 範囲外)

> **status**: 本セクションは Stage 2.4-B (variant 到達性 smoke) の入力設計用 draft。A1-2 の正本確定対象外。CEO 確認は不要、参考。

### 4.1 各 state 到達のための前提

| state | 到達トリガ | 前提 |
|---|---|---|
| S0→S1 | signal 検出 (relationship signal kind: implicit/explicit/critical) | adapter L2-b で signal kind 判定 |
| S1→S2 | status chip tap (consent 成立) | UI 上 chip 表示済 |
| S2→S3 | (無入力で経過) | S2 で発話済 |
| S3→S4 | 応答取得 (片方でも OK) | response chip tap 等 |
| S4→S5 | 理解更新完了 | mainstream Bug-1 lexeme 整合 |
| S5→S6 | 整理完了 | (条件 §9 保留 = I-9、A2 selector test 範囲外) |
| S6→S7 | 「提案を聞く」tap | S6 提案導線 1 ボタン目 |
| S7→S8 | 承認/不承認 tap | (両方で S8 退出) |

### 4.2 各 variant 発火のための context 期待入力

| variant | state | mode | 必要 context (mock 値、CEO 裁定 I-2) |
|---|---|---|---|
| A | S2 | any | `infoMissing=false` (未指定で OK) |
| B | S5 | any | `needFraming=true` |
| C (S2) | S2 | any | `infoMissing=true` |
| C (S5) | S5 | any | `uncertaintyHigh=true` |
| D (S5 normal) | S5 | normal | `oneSidedFatigue=true` |
| D (S5 Daily) | S5 | daily | `oneSidedFatigue=true` |
| D (S5 Travel) | S5 | travel | `oneSidedFatigue=true` **AND** `relationshipSignalsClear=true` |
| E | S5 | any | `needTranslation=true` |
| F-1 standalone | S7 | normal | (default、副次同伴なし) |
| F-2 | S7 | any | (default) |
| F-2 + F-1 副次 (Daily) | S7 | daily | `relationshipNoiseHigh=true` |
| F-2 + F-1 副次 (Travel) | S7 | travel | (常時自動付与) |

### 4.3 Stage 2.4-B canary input シナリオ案 (CEO 確認後)

11 シナリオ × 3 mode 程度を Preview env で smoke 予定。詳細は B 着手時に別 PR。

---

## §5 不整合候補一覧 + CEO 裁定 (A1-2 反映済)

### 5.1 裁定状況 一覧

| 識別子 | severity | 領域 | 内容 | **CEO 裁定** | A2 影響 |
|---|---|---|---|---|---|
| **I-1 / I-8** | 中 (連動) | Layer 3 | S5 全 context flag false 時の振る舞い | **defensive null。E default にしない。S5 到達時は通常 flag が立つべき (上流設計記録)** | A2 mock test 可 (S5 全 flag false → null 期待) |
| **I-2** | 中 | Layer 3 | context flag 設定主体・閾値が UI spec §9 保留 (7 flag 全て) | **§9 保留継続。A2 では mock boolean で test** | A2 selector test scope 内 (mock 入力のみ) |
| **I-3** | 中 | Layer 2 | S5 D `oneSidedFatigue` 判定基準 | **§9 保留継続。A2 では `oneSidedFatigue=true` mock で test** | A2 selector test scope 内 |
| **I-4** | 中 | Layer 2 | S5 Travel D `relationshipSignalsClear` 閾値 | **§9 保留継続。A2 では `relationshipSignalsClear` boolean で扱う** | A2 selector test scope 内 |
| **I-5** | 軽微 | Layer 2 | S7 Travel F-2 承認ゲート厳しめが selector scope 外 | **selector scope 外。UI/interaction layer の論点** | A2 selector test 対象外 |
| **I-6** | 中 | 文書間整合 | UI spec §4.3.6 「計画の一貫性」と speech template §6 の語感差 | **文書表現の整合問題。runtime/test blocker ではない。routing spec に注記** | A2 selector test 対象外 |
| **I-7** | 軽微 | 文書間整合 | v1.1 「6 family」 vs UI spec §7.12 「7 variant」 | **統合契約 §4 既裁定** | A2 対象外 |
| **I-8** | (I-1 と連動) | Layer 1 | S5 で B/C/D/E flag 全 false で素通り | **I-1 と一括裁定: defensive null** | I-1 と同じ |
| **I-9** | 軽微 | Layer 4 | S5→S6 「整理完了」遷移条件 | **§9 保留継続。state machine 側の論点。A2 selector test 範囲外** | A2 対象外 |
| **I-10** | **中 (新規)** | Stage 2.3 fixture | Stage 2.3 quality review fixture と actual routing state の不整合 | **Stage 2.3 自体を無効化しない。actual routing 上の到達 state とは別 fixture で発話品質を見ていた事実を記録、A1-2 で routing spec に明示。再 review 必要性は §5.2 で個別判断** | A2/B 設計に直接影響 |

### 5.2 I-10 詳細分析 (新規追加、CEO 指摘事項)

#### 5.2.1 観測事実
`scripts/coalter/stage23-variant-quality-review.ts:112-119` の `VARIANT_FIXTURES`:

```typescript
const VARIANT_FIXTURES: Record<PatternVariant, BuildPresenceSpeechInput> = {
  A:  { variant: "A",  state: "S2", mode: "normal", context: {} },
  B:  { variant: "B",  state: "S3", mode: "normal", context: {} },  // ← 不整合
  C:  { variant: "C",  state: "S4", mode: "normal", context: {} },  // ← 不整合
  D:  { variant: "D",  state: "S5", mode: "normal", context: {} },
  E:  { variant: "E",  state: "S5", mode: "normal", context: {} },
  F1: { variant: "F1", state: "S6", mode: "normal", context: {} },  // ← 不整合
  F2: { variant: "F2", state: "S7", mode: "daily",  context: {} },
};
```

#### 5.2.2 actual routing との比較 (本書 §1.1 期待マトリクス + Stage 2.4-A0 調査)

| variant | fixture state | actual routing で許可される state (本書 §1.1) | 一致 |
|---|---|---|---|
| A | S2 | S2 | ✅ |
| B | S3 | **S5** (S3 は variant=null) | ❌ |
| C | S4 | **S2 / S5** (S4 は variant=null) | ❌ |
| D | S5 | S5 | ✅ |
| E | S5 | S5 | ✅ |
| F1 | S6 | **S7** (S6 は variant=null) | ❌ |
| F2 | S7 | S7 | ✅ |

#### 5.2.3 影響分析

**Stage 2.3 で起きていたこと**:
- Stage 2.3 script は `selectPattern` を経由せず、直接 `buildPresenceSpeech(fixture)` を呼ぶ経路
- Stage 1 (existence gate) / Stage 2 (suppression gate) は両方 bypass されている
- LLM prompt (`speechPromptBuilder.ts:114`) には `State: ${input.state}` が文字列として入る
- LLM は B 生成時に「State: S3」、C 生成時に「State: S4」、F1 生成時に「State: S6」を context として受け取っていた

**Stage 2.3 結論への影響**:
- ✅ **無効化しない**: LLM が指定 variant の発話を template に従って生成できることは検証されている
- ⚠️ **限界**: actual production routing で B が出るのは S5、C は S2/S5、F1 は S7。Stage 2.3 ではそれら正規 state での LLM 挙動を直接観測していない
- ⚠️ **prompt context 影響**: 「State: S3」「State: S4」「State: S6」が prompt に入った状態で LLM が生成した text の品質を見ていた。State 文字列が LLM 出力に微妙な影響を与えた可能性は否定できない

**A2/B/C/D への影響**:
- **A2 (selector test)**: 影響なし。selector test は本書 §1-§3 の期待表を expected とする (Stage 2.3 fixture を流用しない)
- **B (variant 到達性 smoke)**: 影響あり。Preview env で actual routing 経由で B/C/F1 が S5/S5/S7 で発火するシナリオを組む必要がある
- **C (UI timeout/fallback)**: 直接影響なし
- **D (production-ready audit)**: 影響あり。production routing 上での variant 発話品質の最終確認が必要

#### 5.2.4 再 review 必要性 (CEO 個別判断要)

**B/C/F1 の再 quality review 必要性** (Stage 2.3 と同様の方式で正規 state で再実行):

| variant | 正規 state | 再 review 必要性 | 推奨 |
|---|---|---|---|
| B | S5 | **要検討** | Stage 2.4-D で正規 state での発話を観測 → 著しい品質差があれば再 review |
| C | S2 + S5 | **要検討** (C は S2 と S5 で意味合いが異なる) | 同上、正規 state 別に観測 |
| F1 | S7 | **要検討** | Stage 2.4-D で正規 state での発話を観測 |

> **CEO 確認事項 (A2 着手前ではなく、Stage 2.4-D 段階で判断要)**:
> - Stage 2.4-D で actual routing 経由 (S5 で B、S2/S5 で C、S7 で F1) の発話品質を観測
> - Stage 2.3 PASS と乖離があれば、再 quality review (35-call 等) を別計画として CEO 判断
> - 本 A1-2 段階では「事実を記録、A2 着手判断には影響しない」と整理

### 5.3 fixture 修正の扱い

`stage23-variant-quality-review.ts` の `VARIANT_FIXTURES` 自体の **修正は本書範囲外**。
- 当 script は Stage 2.3 完了時点で「役目終了」(再実行は CEO 判断後のみ)
- fixture 修正 = Stage 2.3 再実行を意味するため、CEO 個別判断必要 (本 A1-2 では修正提案しない)
- 将来 Stage 2.3 を再走させる必要性が出た場合は、本書 §5.2.4 を根拠として fixture を **正規 state** に揃えて再実行する

---

## §6 CEO 判断 checklist (A1-2 確定状況)

### 6.1 Layer 1 (state × variant existence)
- [x] §1.1 期待マトリクス 63 セル — UI spec §7.12 一致、**確定**
- [x] §1.2 state 内選択優先順 — UI spec §7.12 一致、**確定**
- [x] §1.3 v1.1 6 family vs 7 variant — 統合契約 §4 既裁定、**確定**

### 6.2 Layer 2 (state × mode 別 suppression)
- [x] §2.1 #1 S5 Travel D 既定優先度低下 — UI spec §4.3.6 一致、**確定**
- [x] §2.1 #2 S7 Daily F-1 standalone 抑制 — UI spec §4.3.8 一致、**確定**
- [x] §2.1 #3 S7 Travel F-1 standalone 抑制 — UI spec §4.3.8 一致、**確定**
- [x] §2.1 #4 S7 Travel F-2 承認ゲート厳しめ — **CEO 裁定 (I-5): selector scope 外**
- [x] §2.2 副次同伴規則 (4 行) — UI spec §7.10 一致、**確定**

### 6.3 Layer 3 (context flag priority)
- [x] §3.1 7 flag — UI spec 由来、**確定** (閾値・判定主体は §9 保留 = I-2)
- [x] §3.2 S2 priority — UI spec §7.12 一致、**確定**
- [x] §3.2 S5 priority — UI spec §7.12 一致、**S5 全 flag false → defensive null (CEO 裁定 I-1/I-8)**
- [x] §3.2 S7 priority — UI spec §7.12 / §7.10 一致、**確定**

### 6.4 不整合候補裁定 (10 件、全 CEO 裁定済)
- [x] **I-1 / I-8**: defensive null、E default にしない。上流設計として S5 flag 立ち想定を記録
- [x] **I-2**: §9 保留継続、A2 mock boolean で test
- [x] **I-3**: §9 保留継続、A2 `oneSidedFatigue=true` mock で test
- [x] **I-4**: §9 保留継続、A2 `relationshipSignalsClear` boolean で扱う
- [x] **I-5**: selector scope 外、UI/interaction layer の論点
- [x] **I-6**: 文書表現の整合問題。runtime/test blocker でない。routing spec に注記
- [x] **I-7**: 統合契約 §4 既裁定 (再裁定不要)
- [x] **I-9**: §9 保留継続、A2 selector test 範囲外
- [x] **I-10 (新規)**: Stage 2.3 自体は無効化しない。fixture 不整合事実を記録、A1-2 で routing spec に明示。再 review 要否は Stage 2.4-D で個別判断

### 6.5 A2 着手判断
- [x] 本書 §6.1-§6.4 全項目 CEO 裁定済
- [x] §9 保留項目 (I-2/I-3/I-4/I-9) は A2 で「mock boolean で test」とする scope を明示
- [x] **A2 着手 GO** (本書 A1-2 完了後、A1-3 切出しと並行可)

> ただし CEO 厳守: **「まだ A2 test 実装には進まない」** (本ターン指示)。
> A1-3 (確定範囲の正本切出し) を先に行うか A2 と並行か、CEO の次回指示で確定する。

---

## §7 A2 test scope (CEO 裁定後の確定範囲)

> A2 着手時に本セクションを参照し、**確定範囲のみを test 化** する。現実装出力の写像にしない (CEO 厳守)。

### 7.1 A2 test 化対象 (本書から expected を引く)

| test 範囲 | 本書 §参照 | expected の正本 | 入力 |
|---|---|---|---|
| Stage 1 existence (63 セル) | §1.1 | UI spec §7.12 | `(variant, state)` 組合せ全列挙 |
| State 内選択優先順 | §1.2 | UI spec §7.12 | `(state, context flag combos)` |
| Stage 2 suppression #1-#3 | §2.1 | UI spec §4.3 | `(state, mode, variant, context)` |
| 副次同伴 §7.10 | §2.2 | UI spec §7.10 | `(state, mode, primary, context)` |
| Layer 3 context priority | §3.2 | UI spec §7.12 + CEO 裁定 (I-1/I-8) | `(state, mode, mock context flag)` |
| S5 全 flag false → null | §3.2 #5 | CEO 裁定 (I-1/I-8) | `(S5, any mode, all flags false)` |

### 7.2 A2 test 化対象外 (CEO 裁定で除外)

| 除外項目 | 根拠 |
|---|---|
| S7 Travel F-2 承認ゲート厳しめ | I-5: selector scope 外 |
| context flag 設定主体・閾値 | I-2: §9 保留 (mock boolean のみで test、判定ロジックは test しない) |
| `oneSidedFatigue` 判定基準 | I-3: §9 保留 |
| `relationshipSignalsClear` 閾値 | I-4: §9 保留 |
| S5→S6 整理完了遷移条件 | I-9: state machine 側の論点 |
| 文書表現の整合 (I-6) | runtime/test blocker でない |
| Stage 2.3 fixture 再 quality review | I-10: Stage 2.4-D で個別判断 |

### 7.3 A2 test ファイル候補 (実装は CEO 別 GO 後)

> 本セクションは案。CEO の A2 着手指示後に確定。

- `lib/coalter/presence/__tests__/patternSelector.routing.test.ts` (新規想定)
  - §1.1 / §2.1 #1-#3 / §2.2 / §3.2 全動作の mock 入力テスト
  - 既存 `patternSelector.test.ts` (もしあれば) との重複は確認後

### 7.4 不可侵 (A2 でも継続)
- production env / ChatClient.tsx / UpperLayerMount.tsx / UrgentLayer 不接触
- speechValidator / speechPostValidator / speechTypes / speechBuilder / llmCall / model / max_tokens / length_override / timeout 不変
- Anthropic 起因と断定しない
- 自律 fix-forward 禁止
- **現実装出力を expected にしない** (本書 §1-§3 を expected とする)

---

## §8 補遺

### 8.1 本書の凍結予定
A1-3 で確定範囲を `docs/coalter-presence-routing-spec.md` に切出した時点で、本書は draft 凍結。以降は履歴目的のみ。

### 8.2 Stage 2.4 連動
| Stage | 着手条件 | 本書との関係 |
|---|---|---|
| **A1-3** (正本切出し) | 本書 §6 全 CEO 裁定済 → 着手可 | 本書 §1-§3 を抜粋し新ファイル化 |
| **A2** (test 拡張) | A1-3 着手 (or 並行)、本書 §6 全項目裁定済 → 着手可 | 本書 §7 を scope 規定として参照 |
| **B** (variant 到達性 smoke) | A2 後、本書 §4 trigger draft を実入力に展開 | I-10 を踏まえ正規 state でシナリオを組む |
| **C** (UI timeout/fallback) | B 後、期待挙動表先固定 | 本書 §0.5 不可侵境界を継承 |
| **D** (production-ready audit) | A/B/C 全 PASS 後 | I-10 関連: 正規 state での variant 発話品質を観測 → Stage 2.3 PASS との乖離有無を CEO 報告 |

### 8.3 文書表現整合性 注記 (CEO 裁定 I-6)

UI spec §4.3.6 「Travel では計画の一貫性を前面化」 と speech template §6 「Travel mode では既定優先度低下」 は同義として扱う。runtime/test 上の差異は生まない。将来 Stage 2.4 完了後に統合契約への追記または UI spec / speech template の表現統一を別 task で実施する (Stage 2.4 期間中は触らない)。

### 8.4 Stage 2.3 fixture 不整合 注記 (CEO 裁定 I-10)

`scripts/coalter/stage23-variant-quality-review.ts` の `VARIANT_FIXTURES` で B=S3 / C=S4 / F1=S6 と設定されていたが、これらは actual routing 上の到達 state (B=S5, C=S2/S5, F1=S7) と不整合である。Stage 2.3 quality review は LLM が variant template に従って発話を生成できることを検証したが、正規 state での LLM 挙動は本 review で直接観測されていない。Stage 2.4-D で正規 state での発話品質を観測し、Stage 2.3 PASS との乖離有無を CEO 報告する。fixture 修正および再 review は本 A1-2 範囲外、Stage 2.4-D で CEO 個別判断する。

---

**End of Stage 2.4-A1-2 Routing Spec 正本候補 (CEO 裁定反映済)**
