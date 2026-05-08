# CoAlter Presence Routing Spec (正本候補)

> **status: 正本候補 / CEO 確認待ち (2026-05-08 起草)**
> 由来: Stage 2.4-A1-3 切出し。`coalter-stage24-a1-routing-spec-draft.md` のうち **確定事項のみ** を本書に移す。保留・不整合は Appendix。
> 確認後、Stage 2.4-A2 (selector test) → Stage 2.4-B (UI 到達性 smoke) へ進む。

---

## §0 本書の位置づけ

### 0.1 役割
CoAlter Presence の **routing 正本** (variant 選択ロジック)。本書は確定事項のみを normative 記述する。Stage 1 (existence) / Stage 2 (suppression) / Layer 3 (context priority) の 3 層を確定する。

### 0.2 上位正本
| # | 文書 | 役割 |
|---|------|------|
| 1 | `coalter-presence-state-ui-spec.md` v0.1 §7.12 | Stage 1 existence gate |
| 2 | `coalter-presence-state-ui-spec.md` v0.1 §4.3 | Stage 2 negative override |
| 3 | `coalter-presence-state-ui-spec.md` v0.1 §7.10 / §7.11 | F-1/F-2 共存・非同居規則 |
| 4 | `coalter-speech-template.md` v0.1 §3-§9 | variant 役割 |
| 5 | `coalter-core-ux-layered-presence.md` v1.1 §4 / §8.2 | 発話パターン定義 / state 定義 |

### 0.3 範囲外
- 文面 LLM 合成 (`speechBuilder` / `speechPostValidator` / template) — speech template 正本
- state 遷移条件 (S0→S1, S5→S6 等) — state machine / UI spec §4.3 別 layer
- context flag 設定主体・閾値 — UI spec §9 保留 (Appendix A 参照)
- 承認ゲート UI / interaction layer — UI spec §5/§7 別 layer

### 0.4 現実装は参考扱い
`lib/coalter/presence/constants.ts` `PATTERN_STATE_ALLOWED` / `STATE_PATTERN_PRIORITY` 及び `lib/coalter/presence/patternSelector.ts` は本書の写像実装と扱う。本書を expected として test を組み、現実装出力を expected にしない。

---

## §1 Layer 1 — Stage 1 existence gate

### 1.1 Pattern × State 許可マトリクス (UI spec §7.12 正本)

| State | A | B | C | D | E | F-1 | F-2 |
|---|---|---|---|---|---|---|---|
| **S0 見守り中** | — | — | — | — | — | — | — |
| **S1 介入気配** | — | — | — | — | — | — | — |
| **S2 入口発話** | ✓ | — | ✓ | — | — | — | — |
| **S3 返答待ち** | — | — | — | — | — | — | — |
| **S4 理解更新中** | — | — | — | — | — | — | — |
| **S5 橋渡し中** | — | ✓ | ✓ | ✓ | ✓ | — | — |
| **S6 提案可能** | — | — | — | — | — | — | — |
| **S7 提案表示** | — | — | — | — | — | ✓ | ✓ |
| **S8 クールダウン** | — | — | — | — | — | — | — |

**規則:**
- S0/S1/S3/S4/S6/S8 は発話パターンなし (v1.1 §8.2)
- S2 = A or C 排他 (1 ターン 1 variant)
- S5 = B / C / D / E のいずれか 1 つ (排他)
- S7 = F-1 or F-2 のいずれか 1 つ (合成時は F-2 主 + F-1 副次 = 1 カード、§7.10)

### 1.2 state 内選択優先順 (UI spec §7.12 fallback)

| State | 優先順 |
|---|---|
| **S2** | 1. **A** default<br>2. **C** (`infoMissing=true` 時のみ) |
| **S5** | 1. **C** (`uncertaintyHigh=true`)<br>2. **B** (`needFraming=true`)<br>3. **D** (`oneSidedFatigue=true`)<br>4. **E** (`needTranslation=true`) |
| **S7** | 1. **F-2** (Daily/Travel default)<br>2. **F-1 standalone** (通常モードのみ) |

### 1.3 v1.1 6 family と 7 variant の整合 (統合契約 §4 既裁定)

| v1.1 §4 family | variant |
|---|---|
| §4.1 入口発話 | A |
| §4.2 状況言語化 | B |
| §4.3 確認質問 | C |
| §4.4 片側フォーカス | D |
| §4.5 橋渡し・翻訳 | E |
| §4.6 軽提案 | **F-1 + F-2** (関係内部向け / 外界向け) |

---

## §2 Layer 2 — Stage 2 negative override

### 2.1 mode 別 suppression マトリクス (UI spec §4.3 正本)

| # | state | mode | variant | 動作 | 解除条件 |
|---|---|---|---|---|---|
| 1 | S5 | Travel | **D** | 既定優先度低下 (primary 候補から除外) | `relationshipSignalsClear=true` で再昇格 |
| 2 | S7 | Daily | **F-1 standalone** | primary としては抑制 (F-2 default) | (なし、副次同伴のみ) |
| 3 | S7 | Travel | **F-1 standalone** | primary としては抑制 (F-2 主) | (なし、Travel は §7.10 で常時副次同伴必須) |

> S7 Travel F-2 承認ゲート厳しめ (§4.3.8) は **selector scope 外** (UI/interaction layer 論点、Appendix A 参照)。

### 2.2 副次同伴規則 (UI spec §7.10 正本)

| state | mode | primary | 副次同伴 (F-1) |
|---|---|---|---|
| S7 | normal | F-1 standalone | (副次なし) |
| S7 | normal | F-2 | (副次なし) |
| S7 | Daily | F-2 | F-1 副次 (`relationshipNoiseHigh=true` 時のみ) |
| S7 | Travel | F-2 | **F-1 副次必須** (常時) |

副次同伴は提案カード内最終行 1 行として収容。独立カード化禁止 (UI spec §7.10)。

### 2.3 mode 別 cell-level override (UI spec §4.3)

| state | normal | Daily | Travel |
|---|---|---|---|
| S0/S1/S3/S4/S6/S8 | 基線 | = 通常 | = 通常 |
| S2 | 基線 | + Daily スコープ告知 | + Travel スコープ告知 |
| S5 | 基線 | + Daily 文脈ヒント | + Travel 文脈ヒント / D 既定優先度低下 (§2.1 #1) |
| S7 | 基線 | F-2 主 / F-1 関係ノイズ低時抑制可 | F-2 主 / F-1 副次同伴必須 / 承認ゲート厳しめ |

---

## §3 Layer 3 — context flag priority

### 3.1 context flag 一覧

| flag | 適用 state | 役割 |
|---|---|---|
| `infoMissing` | S2 | true → A→C fallback |
| `uncertaintyHigh` | S5 | true → C 優先 |
| `needFraming` | S5 | true → B 候補 |
| `oneSidedFatigue` | S5 | true → D 候補 |
| `needTranslation` | S5 | true → E 候補 |
| `relationshipSignalsClear` | S5 (Travel) | true → §2.1 #1 D 既定優先度低下を解除 |
| `relationshipNoiseHigh` | S7 (Daily) | true → F-1 副次同伴 1 行併設 |

> 設定主体・閾値は UI spec §9 保留 (Appendix A 参照)。**A2 test では mock boolean のみで挙動を検証する。判定ロジックは test 範囲外**。

### 3.2 期待 priority 動作

#### S2
| 入力 | 出力 |
|---|---|
| `infoMissing=true` | C |
| `infoMissing=false` / 未指定 | A |

#### S5
| 優先順 | 条件 | 出力 |
|---|---|---|
| 1 | `uncertaintyHigh=true` | C |
| 2 | `needFraming=true` | B |
| 3 | `oneSidedFatigue=true` (Travel mode は + `relationshipSignalsClear=true` 必要) | D |
| 4 | `needTranslation=true` | E |
| 5 | **どの flag も false** | **defensive null** (発話なし) |

> #5 defensive null 規定: S5 到達時は通常 context flag が立つべき (executor watcher / adapter 責務、上流設計記録)。本 selector は異常系で発話を抑制する。

#### S7
| 条件 | primary | 副次 |
|---|---|---|
| mode=normal | F-1 standalone (default 不在時 F-2) | (なし) |
| mode=Daily | F-2 | `relationshipNoiseHigh=true` で F-1 |
| mode=Travel | F-2 | F-1 (常時) |

---

## §4 Stage 2.4-B / Stage 2.4-D 必須観測項目

### 4.1 actual state での variant 発話品質確認 (I-10 由来、必須)

Stage 2.4-B (UI 到達性 smoke) および Stage 2.4-D (production-ready audit) は、**B / C / F1 を actual routing state で観測すること** を必須とする。

| variant | actual routing state (本書 §1.1 + §3.2) | 観測義務 |
|---|---|---|
| B | **S5** | Stage 2.4-B UI smoke で actual S5 経由の発話本文を必ず確認 |
| C | **S2 / S5** | Stage 2.4-B UI smoke で actual S2 と S5 双方経由の発話本文を必ず確認 |
| F1 | **S7** (normal mode の standalone、または Daily/Travel mode の副次同伴) | Stage 2.4-B UI smoke で actual S7 経由の発話本文を必ず確認 |

### 4.2 観測義務の根拠

Stage 2.3 quality review (`scripts/coalter/stage23-variant-quality-review.ts`) の `VARIANT_FIXTURES` で **B=S3 / C=S4 / F1=S6** と設定されていたが、これらは actual routing 上の到達 state と不整合。Stage 2.3 の LLM 出力品質検証は維持されるが、**正規 state での LLM 挙動は本 review で直接観測されていない**。詳細 Appendix B。

### 4.3 観測結果の扱い

- 正規 state 経由の発話品質が Stage 2.3 PASS と同等 → そのまま継続
- 著しい乖離が観測される → **再 quality review (35-call 等)** を別計画として CEO 個別判断
- 本 routing spec は actual state での観測結果を踏まえ必要に応じ改訂

---

## §5 Stage 2.4-A2 test scope

### 5.1 test 化対象 (本書から expected を引く)

| test 範囲 | 本書 §参照 | expected の正本 |
|---|---|---|
| Stage 1 existence (63 セル) | §1.1 | UI spec §7.12 |
| state 内選択優先順 | §1.2 | UI spec §7.12 |
| Stage 2 suppression #1-#3 | §2.1 | UI spec §4.3 |
| 副次同伴規則 | §2.2 | UI spec §7.10 |
| Layer 3 context priority | §3.2 | UI spec §7.12 + 本書 §3.2 #5 |
| S5 全 flag false → null | §3.2 #5 | 本書 §3.2 #5 (defensive null 規定) |

### 5.2 test 化対象外 (本書 Appendix A の open issues + I-10)

- S7 Travel F-2 承認ゲート厳しめ (selector scope 外)
- context flag 設定主体・閾値 (§9 保留、判定ロジック test なし)
- `oneSidedFatigue` 判定基準 (§9 保留)
- `relationshipSignalsClear` 閾値 (§9 保留)
- S5→S6 整理完了遷移条件 (state machine 側論点)
- 文書表現整合 (runtime/test blocker でない)
- Stage 2.3 fixture 再 quality review (Stage 2.4-D で個別判断)

### 5.3 test 入力 (mock 値)

> **I-10 対策注記 (重要)**: 本表の `state (actual routing)` 列は **actual routing 上の到達 state** (本書 §1.1 / §4.1 と整合) を expected として記述する。
>
> Stage 2.3 quality review fixture (`scripts/coalter/stage23-variant-quality-review.ts` の `VARIANT_FIXTURES`) で設定されていた **B=S3 / C=S4 / F1=S6** は actual routing と不整合 (Appendix B 参照)。本書 A2 test の expected には **Stage 2.3 fixture state を絶対に混ぜない**。actual routing 上の variant 到達 state (B=S5、C=S2/S5、F-1/F-2=S7) を §4.1 の根拠で固定する。

| variant | state (actual routing) | mode | 必要 mock context |
|---|---|---|---|
| A | S2 | any | `infoMissing=false` (未指定で OK) |
| B | **S5** | any | `needFraming=true` |
| C (S2) | **S2** | any | `infoMissing=true` |
| C (S5) | **S5** | any | `uncertaintyHigh=true` |
| D (S5 normal/daily) | S5 | normal/daily | `oneSidedFatigue=true` |
| D (S5 Travel) | S5 | travel | `oneSidedFatigue=true` AND `relationshipSignalsClear=true` |
| E | S5 | any | `needTranslation=true` |
| F-1 standalone | **S7** | normal | (default、副次同伴なし) |
| F-2 | **S7** | any | (default) |
| F-2 + F-1 副次 (Daily) | **S7** | daily | `relationshipNoiseHigh=true` |
| F-2 + F-1 副次 (Travel) | **S7** | travel | (常時自動付与) |
| **S5 全 flag false** | **S5** | **any** | **全 flag 未指定** → null 期待 |

---

## §6 不可侵境界 (Stage 2.4 全期間継続)

### 6.1 Production / UI 不接触
- production env 不接触
- `ChatClient.tsx` / `UpperLayerMount.tsx` / `UrgentLayer` 不接触

### 6.2 Speech 関連 不変
- `speechValidator` / `speechPostValidator` / `speechTypes` / `speechBuilder` / `llmCall` 不変
- **model** / **max_tokens** / **length_override** 不変
- **timeout constant は Stage 2.4-A / Stage 2.4-A2 では変更しない**。Stage 2.3 で観測された latency / timeout 異常値は **Stage 2.4-B / C / D の観測事項** として扱う
- LLM prompt template (`speechPromptBuilder`) は Stage 2.3 確定状態を維持、本書 routing 確定では触らない

### 6.3 運用原則
- Anthropic 起因と断定しない
- 自律 fix-forward 禁止
- 本書 expected を test の正解として使う。**現実装出力を expected にしない**
- A2 test 実装は本書 CEO 確認後

---

## Appendix A — Open Issues (保留・不整合、選別後の test 化対象外)

| ID | 領域 | 内容 | 扱い | 解消想定 |
|---|---|---|---|---|
| **I-2** | Layer 3 | context flag 設定主体・閾値が UI spec §9 保留 | A2 では mock boolean のみで test、判定ロジックは test しない | UI spec §9 確定後 |
| **I-3** | Layer 2 | S5 D `oneSidedFatigue` 判定基準 | A2 では `oneSidedFatigue=true` mock で test | UI spec §9 確定後 |
| **I-4** | Layer 2 | S5 Travel D `relationshipSignalsClear` 閾値 | A2 では mock boolean で扱う | UI spec §9.3.3 確定後 |
| **I-5** | Layer 2 | S7 Travel F-2 承認ゲート厳しめ | selector scope 外 (UI/interaction layer 論点) | UI / interaction layer 別 task |
| **I-6** | 文書整合 | UI spec §4.3.6 「計画の一貫性」と speech template §6 「既定優先度低下」の語感差 | runtime/test blocker でない | Stage 2.4 完了後、統合契約への追記 or 表現統一 (別 task) |
| **I-9** | Layer 4 | S5→S6 整理完了遷移条件 | state machine 側論点、A2 selector test 範囲外 | UI spec §9 確定後 |

> **I-1 / I-8** (S5 全 flag false → defensive null): 本書 §3.2 #5 として **正本化済** (Open Issues から除外)。
> **I-7** (v1.1 6 family vs 7 variant): 統合契約 §4 既裁定 (Open Issues から除外)。
> **I-10** (Stage 2.3 fixture 不整合): 本書 §4 として **必須観測項目に正本化** + 詳細 Appendix B (Open Issues から除外)。

---

## Appendix B — I-10 Stage 2.3 fixture 不整合 詳細分析

### B.1 観測事実

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

### B.2 actual routing との比較 (本書 §1.1)

| variant | fixture state | actual 許可 state | 一致 |
|---|---|---|---|
| A | S2 | S2 | ✅ |
| B | S3 | **S5** (S3 は variant=null) | ❌ |
| C | S4 | **S2 / S5** (S4 は variant=null) | ❌ |
| D | S5 | S5 | ✅ |
| E | S5 | S5 | ✅ |
| F1 | S6 | **S7** (S6 は variant=null) | ❌ |
| F2 | S7 | S7 | ✅ |

### B.3 影響整理

- Stage 2.3 script は `selectPattern` 経由ではなく `buildPresenceSpeech(fixture)` 直接呼び (Stage 1 / Stage 2 gate 両方 bypass)
- LLM prompt (`speechPromptBuilder.ts:114`) には `State: ${input.state}` が文字列で渡る
- B/C/F1 生成時、LLM は「State: S3」「State: S4」「State: S6」を context として受け取って発話を生成していた
- **Stage 2.3 自体は無効化しない**: LLM が指定 variant の template に従って発話を生成できることは検証済
- **限界**: actual production routing で B が出るのは S5、C は S2/S5、F1 は S7 — それら正規 state での LLM 挙動は本 review で直接観測されていない

### B.4 fixture 修正の扱い

`stage23-variant-quality-review.ts` の `VARIANT_FIXTURES` 自体の修正は **本書範囲外**。
- 当 script は Stage 2.3 完了時点で「役目終了」(再実行は CEO 判断後のみ)
- fixture 修正 = Stage 2.3 再実行を意味するため、CEO 個別判断必要
- 将来再実行が必要となった場合は本書 §4.1 (B=S5, C=S2/S5, F1=S7) を根拠に正規 state で再実行

### B.5 Stage 2.4-B / Stage 2.4-D での処理

本書 §4 を参照。Stage 2.4-B UI smoke で actual state 経由の発話本文を必ず確認、Stage 2.4-D で Stage 2.3 PASS との乖離有無を CEO 報告、必要に応じ再 quality review を別計画として CEO 個別判断。

---

## Appendix C — 関連文書 / 改訂履歴

### C.1 関連文書
- `docs/coalter-stage24-a1-routing-spec-draft.md` (A1-1 / A1-2 working draft、本書切出し元)
- `docs/coalter-presence-state-ui-spec.md` v0.1 (UI spec、上位正本)
- `docs/coalter-speech-template.md` v0.1 (speech template、上位正本)
- `docs/coalter-core-ux-layered-presence.md` v1.1 (上位正本)
- `docs/coalter-implementation-plan-layout.md` (Phase 別実装計画)
- `lib/coalter/presence/constants.ts` (`PATTERN_STATE_ALLOWED` / `STATE_PATTERN_PRIORITY`、参考)
- `lib/coalter/presence/patternSelector.ts` (`selectPattern` / `selectSecondaryPattern`、参考)

### C.2 改訂履歴
| 版 | 日付 | 内容 |
|---|---|---|
| 0.1-draft | 2026-05-08 | 初版起草 (A1-3 切出し)。Stage 2.4-A1-2 で CEO 裁定済の確定事項を本書化、保留・I-10 詳細を Appendix 隔離 |
| 0.1-draft.2 | 2026-05-08 | CEO/GPT review #1 反映: §6.2 timeout 表現を「Stage 2.4-A/A2 で変更しない、異常値は B/C/D の観測事項」に明確化 / §5.3 に I-10 対策注記追加 (Stage 2.3 fixture を expected に混ぜない明示) / F25 表記揺れ全体監査 (該当なし、確認のみ) |

---

**End of CoAlter Presence Routing Spec (正本候補) v0.1-draft**
