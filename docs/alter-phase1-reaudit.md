# Alter Understanding System — Phase 1 再監査レポート

## 監査方針
反証寄り・疑い寄り・監査寄りの姿勢で、Phase 1 の6ステップが「本当に機能しているか」を検証。
単なるコード存在確認ではなく、「目的を達成しているか」「既存資産を壊していないか」を重視。

---

## Step 1: 観測可能性チェック（Observability）

### 目的
Phase 0 で追加した understanding system の各コンポーネントが正しく動作し、analytics で追跡可能であること。

### 監査結果: PASS

| 項目 | 状態 | 根拠 |
|------|------|------|
| userState analytics 記録 | OK | `route.ts` analytics に `user_state` フィールド追加済み（capacity/load/fatigue + estimation_basis） |
| stateAdjustment analytics 記録 | OK | `state_adjustment` フィールド追加済み（4値全て記録） |
| microInsight analytics 記録 | OK | `micro_insight` フィールド追加済み（presentation/prompt/signal_count） |
| SHAPE_STANCE_MAP 完全性 | OK | `trial_then_decide: "go"`, `delegate_or_request: "go"` 追加済み |
| AskHero CTA/DEST 完全性 | OK | 新 ActionShape 2種のエントリ追加済み |
| suggested_prompt サニタイズ | OK | `.replace(/[\n\r]/g, " ").slice(0, 100)` |

### 以前の問題と修正
- `userState.signals` → `userState.estimation_basis`（型修正）
- `stateAdjustment.force_deltas` → 個別フィールド参照（型修正）
- `microInsight.type/description` → 正しいフィールド名（型修正）

---

## Step 2: Clarify 再設計（missing_info vs understanding）

### 目的
従来の clarify（情報不足型のみ）に加え、動機・文脈を掘り下げる understanding 型を追加し、実際に発火すること。

### 監査結果: PASS（C1修正後）

| 項目 | 状態 | 根拠 |
|------|------|------|
| ClarifyType 型定義 | OK | `"missing_info" \| "understanding"` 定義済み |
| getClarifyType() 実装 | OK | ambiguity/information/lens から型を判定 |
| selectResponseModeWithReason 内の understanding 発火 | OK | **C1修正後**: motive型（involves_other + purpose unknown）/ context型（ambiguity≥0.5 + info<0.3） |
| buildClarifyFormatSection の understanding 分岐 | OK | 選択肢型/許可型/軽い仮説型の3フォーマット |
| route.ts での clarifyType 計算・パス | OK | `getClarifyType()` → `buildHomeAlterPromptWithContext` 第12引数 |

### C1 問題と修正
**問題**: understanding clarify の発火条件が `ambiguity_score >= 0.67 AND information.score < 0.2` で、事実上到達不能だった。
**修正**:
- motive型: ambiguity/information ゲートを撤去。`involves_other + target_role !== "unknown" + interaction_purpose === "unknown"` のみで発火
- context型: ambiguity ≥ 0.5、information < 0.3 に緩和

---

## Step 3: State Integration（状態→モード/force/wording）

### 目的
Layer 2（State）の推定結果が、実際の応答モード選択・ForceBalance・文言制約に反映されること。

### 監査結果: PASS（C2修正後）

| 項目 | 状態 | 根拠 |
|------|------|------|
| estimateUserState() 実装 | OK | capacity/load/fatigue をルールベースで推定、clamp(0.15-0.85)適用 |
| prefer_conclude_over_clarify 適用 | OK | `selectResponseModeWithReason` で `preferConclude` として使用 |
| branch→conclude ダウングレード | OK | `route.ts`: fatigue>0.6 or load>0.7 で branch→conclude |
| simplify_response 適用 | OK | `route.ts`: skeleton の options を3個に切り詰め |
| protect/expand_pressure_delta 適用 | OK | **C2修正後**: `rawMeta.force_balance` に delta を加算（reconcile前に適用） |
| State hints in wording | OK | trust gate 付きで「短文優先」「箇条書き禁止」等の制約をプロンプトに注入 |

### C2 問題と修正
**問題**: `computeStateAdjustment()` が返す `protect_pressure_delta` と `expand_pressure_delta` が計算されるだけで、ForceBalance に一切反映されていなかった（デッドコード）。
**修正**: `route.ts` の decisionMetadata 構築ブロック内、`reconcileDecisionMetadata` 呼び出し前に delta を `rawMeta.force_balance` に加算。`Math.min(1, Math.max(0, ...))` でクランプ。

---

## Step 4: Micro Insight 提示設計

### 目的
検知されたシグナルの収束を、自然な関心として（分析の暴露なしに）ユーザーに提示すること。

### 監査結果: PASS（C3修正後）

| 項目 | 状態 | 根拠 |
|------|------|------|
| detectMicroSignals 偽陽性対策 | OK | 「大丈夫」除外、重い単語2語以上要求、busy閾値250字+相談シグナル共起、助詞パターン必須 |
| checkSignalConvergence 閾値 | OK | 全パターンで `length >= 2` 要求 |
| 単一ターン収束防止 | OK | **C3修正後**: `hasMultipleTurns()` で異なる `detected_at` を要求 |
| presentation_type 4種 | OK | casual_check/observation/gentle_inquiry/connection |
| Trust gate | OK | `required_trust` フィールドで制御、route.ts で trustLevel チェック |
| emotional_load gate | OK | `emotional_load < 0.75` でゲート |
| NG表現フィルタ | OK | 「パターン」「データ」「分析」「推定」「乖離」を含む表現をブロック |
| 1会話1回制限 | OK | `microInsight` 変数は1回のみ設定 |

### C3 問題と修正
**問題**: `energy_action_gap` + `behavior_mismatch` が同一メッセージから同時検出された場合、`stuckSignals.length >= 2` で即座に収束判定されていた。単発メッセージでインサイトが発火するのは設計意図に反する。
**修正**: `hasMultipleTurns()` ヘルパーを追加。`detected_at` の `Set.size >= 2` を全3収束パターンに適用。同一タイムスタンプのシグナルのみでは収束しない。

---

## Step 5: Life Context エピステミック管理

### 目的
Life Context シグナルに4軸タグ（source/temporality/confidence/freshness）を付け、事実・主観・推定の混同を構造的に防ぐこと。

### 監査結果: PASS

| 項目 | 状態 | 根拠 |
|------|------|------|
| extractLifeContextSignals 実装 | OK | 人物・居住・経済の3カテゴリを抽出 |
| source 分類 | OK | `user_stated` / `user_implied` を文脈で使い分け |
| confidence 引き下げ | OK | 単発言及は最大0.6、人物implied=0.5、環境=0.3-0.8 |
| 過去形フィルタ | OK | 「昔」「以前」等検出→temporality "momentary"、confidence 大幅引き下げ |
| 重複排除 | OK | `seenContents` Set で同一content の多重検出を防止 |
| 助詞パターン必須 | OK | `/(?:お?母[親さ]|母)[がにはをと、。]/` 等で「母音」誤マッチ防止 |
| canUseForDecision ルール | OK | confidence≥0.4、alter_inferred は evidence_count≥2 必須 |

---

## Step 6: 受入基準テスト

### テストシナリオ（論理検証）

| シナリオ | 期待動作 | 判定 |
|---------|---------|------|
| 「転職しようか迷ってます」 | conclude or branch（clarify ではない） | PASS: ambiguity 高いが info も十分→conclude |
| 「彼女と別れるべきか」+ 初回 | clarify_understanding_motive（involves_other + purpose unknown） | PASS: C1修正後、発火可能 |
| 深夜 + 「疲れた」+ 判断相談 | capacity低下 → protect_pressure_delta +0.25 → ForceBalance に反映 | PASS: C2修正後、delta がforce_balanceに加算される |
| 「元気だけど動けない」+ 初回 | energy_action_gap 検出、ただし収束なし（単一ターン） | PASS: C3修正後、hasMultipleTurns=false で収束しない |
| 「母音体系の違いについて」 | 人物シグナル不検出（助詞パターン不一致） | PASS: `/母[がにはをと、。]/` にマッチしない |
| 「昔、実家で暮らしてた」 | temporality="momentary", confidence≤0.3 | PASS: 過去形フィルタ適用 |

---

## 総合判定

### Phase 1: PASS

全6ステップが目的を達成していることを確認。C1-C3 の3件の重大問題を修正済み。

| カテゴリ | 結果 |
|---------|------|
| 実装の存在 | 全コンポーネント実装済み |
| 目的の達成 | 各ステップの設計意図が機能レベルで達成されている |
| 既存資産の保全 | ForceBalance/ActionShape/skeleton の主権構造を維持 |
| ギャップ・漏れ | C1-C3 で発見・修正済み。残存する重大問題なし |
| 応答品質への接続 | State→ForceBalance→ActionShape、MicroInsight→プロンプト注入、LifeContext→永続化の各パスが接続済み |

### 修正サマリー

| ID | 問題 | 修正内容 | ファイル |
|----|------|---------|--------|
| C1 | clarify understanding 型が事実上発火不能 | 発火条件を目的別に再設計（motive: ゲート撤去、context: 閾値緩和） | `alterHomeAdapter.ts` |
| C2 | protect/expand_pressure_delta がデッドコード | reconcile前にForceBalanceへdelta加算 | `route.ts` |
| C3 | 単一メッセージでMicro Insight収束 | hasMultipleTurns() で複数タイムスタンプを要求 | `alterUnderstanding.ts` |
