# CoAlter AOO Phase B Implementation Plan (B-0)

**ステータス**: 設計計画 docs-only (CEO 補正 2026-05-17 反映済 / 再レビュー待ち / merge 禁止)
**起票日**: 2026-05-17
**CEO 補正反映日**: 2026-05-17 (14 補正項目を反映、§13 Evidence Tier 化 + persistence boundary 明確化)
**正本**: 本書は Phase B Mirror Channel の **micro-PR 設計図と境界の正本**。設計の why は `docs/coalter-aoo-phase-b-mirror-channel-design.md` (PR #164 で main 着地済)。本書は how を扱う
**実装着手**: 本 B-0 が CEO 承認 + main merge 完了するまで **B-1 以降の実装は禁止**
**学術裏付け**: 巻末 §13 References (Evidence Tier 化、CEO 補正反映)

> ## ⚠️ Phase B Persistence Boundary 明確化 (CEO 補正反映 2026-05-17)
>
> **Phase B は session-only 実装。cross-session persistence は禁止。**
>
> - sleep / Stop Cascading / Diversity Quota / NC Index 集計 / rupture_risk history など、すべて **session 内 in-memory のみ**
> - localStorage / sessionStorage / cookie / IndexedDB / file write / Supabase / DB / API 一切なし
> - **remote telemetry / Sentry / fetch 送信 一切なし** (旧 "telemetry" 表現を §10.8 / §8.3 で **"local in-memory diagnostic reason snapshot"** に改名)
> - 7-day / 24h-7d / cross-session に必要なものはすべて **Phase E 候補** (persistence-approved phase)
>
> **理由**: Phase B は関係に影響する AI 行動の初期段階。permanence 設計は consent / privacy / storage policy 設計が先決。Phase B 完了後に別途 Phase E plan を起票する。

---

## 0. Executive Summary

### 0.1 本書の位置づけ

CEO レビュー (2026-05-17) で Phase B Mirror Channel **設計 docs は承認済 / 実装はまだ未承認**。実装に進む前に micro-PR スコープ、境界、受入基準、ロールバック条件、エビデンス計画を本書で確定させる。

**B-0 自体は docs-only**。コード変更、env、config、schema、telemetry、feature flag 起票を一切含まない。

### 0.2 最上位原則（Phase A → Phase B 継承 + B-0 で更に深化）

| # | 原則 | 由来 |
|---|------|------|
| 1 | **Always-On ≠ 自動発話** | Phase A 確立 |
| 2 | **Mirror = reflection, not proposal** | Phase B 設計 §1 |
| 3 | **Default = STAY_SILENT** | Phase B 設計 §2 / CHI 2024 Wang et al. 実証支持 |
| 4 | **Speak は ERV + Three-Gate 通過のみ** | Phase B 設計 §3-4 |
| 5 | **不確実性下では沈黙する (Negative Capability)** | Bion 1962 / Phase B 設計 + 本書 §10.4 新設指標 |
| 6 | **AI の "共感の演技" は逆効果なので、観察事実のみ返す** | Nature 2025 (Rubin et al., n=6,282) 実証 |
| 7 | **Mirror は self-model を汚染しない grammar に固定する** | Frontiers 2025 "algorithmic self" 実証 |
| 8 | **Mirror と既存 Presence は同時に喋らない (channel coordination lock)** | 本書 §10.1 新設 |
| 9 | **既存 presence layer / chat layer は zero diff** | Phase A 不変境界の継承 |

### 0.3 北極星 (CEO 2026-05-17)

> Phase B で目指すべき本質は、CoAlter を「**話す AI**」にすることではない。
> **黙る・映す・止まる・引く・誤読を避ける**まで含めて、人間以上に関係の流れを壊さない AI にすること。

この 5 動詞を **5-Verb Framework** と呼び、本書 §1 で各 verb を engineering 仕様に落とす。

### 0.4 B-0 から B-6 までの全体像

| PR | 種別 | scope | merge 基準 |
|----|------|-------|-----------|
| **B-0** (本書) | docs-only | implementation plan 確定 | CEO 承認 |
| **B-1** | code (UI shell) | MirrorHost / MirrorSurface 空 shell + ChatClient.tsx mount + flag 起票 (default false) | flag OFF preview で mount 動作確認、Speak 発火 0、既存 zero diff |
| **B-2** | code (read path) | modeContext reader (read-only) + observerActivationState 軽修正 | unit test PASS / presence layer zero diff |
| **B-3** | code (pure logic) | bucket inference pure functions (alignment / uncertainty / silenceBudget / matchedPatternCategory) | unit test PASS / 入出力決定性 / 副作用ゼロ |
| **B-4** | code (pure engine) | ERV 計算 + Three-Gate (Observe/Worth/Safe) pure / Counterfactual Silence Test / Anticipatory Withdrawal | unit test PASS / Three-Gate fail-closed AND / SPEAK_THRESHOLD=0.75 |
| **B-5** | code (canary) | flag allowlist only / Mirror 文生成 + Post-Speak Verification + telemetry / Channel Coordination Lock | canary 期間中の SPEAK / STAY_SILENT 分布 / PII leak 0 / 誤発話 0 / session cap 1 / sleep 動作 |
| **B-6** | docs-only | Phase B completion docs + decision-log entry | canary evidence 全項目 PASS / CEO 完了判定 |

---

## 1. 5-Verb Framework — 設計の根幹

CEO 北極星「黙る・映す・止まる・引く・誤読を避ける」を engineering 仕様に翻訳する。

### 1.1 黙る (Stay Silent) — primary action

| 項目 | 仕様 |
|------|------|
| Default 動作 | Speak Decision Engine 未通過 → STAY_SILENT |
| 学術根拠 | Horvitz 1999 mixed-initiative + CHI 2024 Wang et al. (proactive 介入は safety-critical 限定が選好) |
| 必要条件 | ERV > 0.75 ∧ Three-Gate ALL PASS ∧ Counterfactual Silence Test 通過 ∧ Channel Lock 取得 |
| 測定指標 | per-session SPEAK 率 / 全 session 平均 STAY_SILENT 率 |
| 失敗時動作 | 任意の条件が不成立 → fail-closed STAY_SILENT |

### 1.2 映す (Mirror) — reflect, not propose

| 項目 | 仕様 |
|------|------|
| 出力可能 5 種 | State / Difference / Tempo / Fairness / Repair (Mirror taxonomy §6 設計書) |
| Grammar 制約 | 観察事実 + hedge (「〜ように見える」「〜が続いている」)。Question 形式禁止。Declaration 形式 (「あなたは X です」) 禁止 |
| 学術根拠 | Rogers 1957 reflective listening + Frontiers 2025 "algorithmic self" (declaration は self-model 汚染) + Nature 2025 (empathy 演技は authenticity gap で逆効果) |
| 文体検証 | Post-Speak Verification §7.3 で正規表現ベース文体チェック |
| 測定指標 | Mirror 出力の grammar 適合率 |

### 1.3 止まる (Stop) — fail-closed on uncertainty

| 項目 | 仕様 |
|------|------|
| Trigger | uncertainty > 0.4 / modeContext = "unknown" / bucket = "unknown_category" / rupture_flag true / safety_concern bucket |
| 動作 | ERV 計算自体スキップ + 該当 telemetry 「STAY_SILENT (uncertainty)」記録 |
| 学術根拠 | Bion 1962 negative capability + TACL 2025 abstention survey |
| 測定指標 | uncertainty-triggered STAY_SILENT 比率 (本書 §10.4 NC Index の入力) |

### 1.4 引く (Withdraw) — anticipatory back-off

| 項目 | 仕様 |
|------|------|
| Trigger | rupture_risk 連続値が上昇 / negative feedback 累積 (session-only) / user 言語的停止 / emotional spike 検出 |
| 動作 | 段階的に SPEAK_THRESHOLD を引き上げ (本書 §10.3 Anticipatory Withdrawal) |
| 学術根拠 | 一般的 conflict de-escalation + 安全マージン思想 (Anthropic Constitutional AI) + Bowlby attachment theory (secure base = available but not intrusive) [全 AS tier、§13 参照]。Polyvagal は **metaphor only**、2026 critique paper により hard dependency から除外 |
| 測定指標 | withdrawal 発動率 / withdrawal 後の rupture 発生率 (predictive vs reactive、いずれも session-only 集計) |

### 1.5 誤読を避ける (Avoid Misreading) — epistemic humility

| 項目 | 仕様 |
|------|------|
| 必須機構 | Counterfactual Silence Test (本書 §10.2) / Mirror Diversity Quota (Phase B: session-only) / Transparent Reticence = **Local In-Memory Diagnostic Reason Snapshot** (本書 §10.8、remote telemetry 禁止) |
| Grammar 補強 | uncertainty が高いほど語尾を柔らかく ("〜みたい" → "〜だろうか" 順に変化させない、観察事実のみ堅持) |
| 学術根拠 | Wen et al. TACL 2025 "Know Your Limits" [DS] / AbstentionBench (arXiv 2506.09038, Kirichenko et al. 2025) [DS] — 詳細 §13 |
| 測定指標 | Post-Speak Verification 文体 fail 率 / 同一 Mirror 反復率 (anti-anchoring、session-only 集計) |

---

## 2. Micro-PR Plan (B-1 〜 B-6) 詳細

各 PR は **独立に着地可能**、後段 PR は前段の main merge 後に起票。Speak ロジックは B-4 まで起動しない。

### 2.1 B-1 — UI shell only

| 項目 | 内容 |
|------|------|
| **PR 種別** | code (UI shell + flag 起票) |
| **scope** | 物理的な UI mount + kill switch flag 起票のみ。Speak / ERV / Three-Gate / modeContext / bucket 一切なし |
| **新規 files** | `components/coalter/mirror/MirrorHost.tsx` (null-render wrapper, flag OFF → return null) / `components/coalter/mirror/MirrorSurface.tsx` (空 shell, props は最小、内部 logic ゼロ) / `lib/coalter/flags.ts` への `presenceMirrorChannelEnabled` getter 追加 |
| **修正 files** | `app/(culcept)/talk/[threadId]/ChatClient.tsx` (mount line 5 行以下) |
| **touched files 上限** | 新規 2-3 + 修正 1-2 = **計 4-5 files** |
| **forbidden files** | `lib/coalter/presence/*` 全 30+ files (zero diff) / `app/components/chat/*` 全 17 files (zero diff) / `lib/coalter/observer/*` (Phase A 領域、touch しない) |
| **feature flag** | `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` 新規。default `false` (env 未設定で `false`)。Production 投入禁止 |
| **acceptance criteria** | (a) flag OFF preview build 成功 / (b) MirrorHost mount 確認 (DOM 上 null) / (c) MirrorSurface 描画 0 (flag OFF) / (d) Speak 発火 0 / (e) `lib/coalter/presence/` diff = 0 / (f) `app/components/chat/` diff = 0 / (g) `ChatClient.tsx` diff ≤ 5 行 / (h) unit test: MirrorHost flag OFF → null-render |
| **rollback condition** | flag 削除で完全停止することを smoke で確認できない場合は revert |
| **LOC budget** | ≤ 150 (含む test) |
| **smoke 手順** | preview branch 上で flag 未設定 → ChatClient render → MirrorHost mount 確認 (React DevTools or `data-testid`) → DOM 上空、Speak 関連 console log 0 |
| **CEO 承認点** | flag 命名 / mount テストの方法 |

### 2.2 B-2 — modeContext read path + observerActivationState 軽修正

| 項目 | 内容 |
|------|------|
| **PR 種別** | code (read-only adapter) |
| **scope** | modeContext (PresenceMode) を Mirror 側から read-only で取得する adapter / observerActivationState の active 化意味論明文化 (Phase A の §9.1 軽修正) |
| **新規 files** | `lib/coalter/mirror/modeContextReader.ts` (presence layer から read-only 取得、書き込み禁止) / `lib/coalter/mirror/observerActivationAdapter.ts` (Phase A `ObserverActivationState` を Mirror 側で参照する型 alias + read 関数) |
| **修正 files** | なし (Phase A docs に軽修正がある場合は同 PR で `docs/coalter-aoo-phase-a-completion.md` に補記) |
| **touched files 上限** | 新規 2-3 + 修正 0-1 = **計 2-4 files** |
| **forbidden files** | `lib/coalter/presence/*` 全 30+ files (read-only 参照のみ、import OK / 書き込み禁止) / `app/components/chat/*` 全 17 files / `lib/coalter/observer/*` 既存 (新規 adapter のみ追加可) |
| **acceptance criteria** | (a) `modeContextReader.read()` が `"normal" \| "daily" \| "travel" \| "unknown"` を返す / (b) `observerActivationAdapter.isActive()` が `boolean` を返す / (c) presence layer に書き込みなし (test で監視) / (d) unit test: 各 PresenceMode 値の正しい mapping / (e) unknown 検出時 `null` 返却 |
| **rollback condition** | presence layer に意図せず書き込みが発生 / unknown handling が誤動作 |
| **LOC budget** | ≤ 100 (含む test) |
| **CEO 承認点** | observerActivationState active の semantics (Phase A 軽修正 docs を含む) |

### 2.3 B-3 — bucket inference pure logic

| 項目 | 内容 |
|------|------|
| **PR 種別** | code (pure functions) |
| **scope** | alignment_signal / uncertainty / silence_budget / matchedPatternCategory bucket を **副作用なし pure function** として実装。I/O・DB・API 一切なし |
| **新規 files** | `lib/coalter/mirror/buckets/alignmentBucket.ts` / `lib/coalter/mirror/buckets/uncertaintyBucket.ts` / `lib/coalter/mirror/buckets/silenceBudgetBucket.ts` / `lib/coalter/mirror/buckets/patternCategoryBucket.ts` / `lib/coalter/mirror/buckets/index.ts` (barrel) |
| **修正 files** | なし |
| **touched files 上限** | **計 5-7 files** (含む test) |
| **forbidden files** | presence layer / chat layer 一切 / `lib/coalter/observer/*` (Phase A) 一切 / UI ファイル一切 |
| **acceptance criteria** | (a) 全 bucket 関数が **pure**: 入力同一 → 出力同一 / 副作用なし / I/O なし / (b) unknown 入力で確定的に `"unknown_category"` 返却 / (c) `safety_concern` / `rupture_signal (high)` / `rupture_signal (mild)` / `unknown_category` / `null` の 5 値 enum 確定 / (d) unit test: 各 bucket × 各入力パターンの境界値テスト / (e) test カバレッジ ≥ 95% (pure logic だけなので達成可能) |
| **rollback condition** | pure 性が崩れた / 入出力決定性が壊れた / unknown 検出が誤動作 |
| **LOC budget** | ≤ 300 (含む test) |
| **CEO 承認点** | bucket 推論ロジックの境界値 |

### 2.4 B-4 — ERV + Three-Gate pure engine + 本書 §10 新設機構

| 項目 | 内容 |
|------|------|
| **PR 種別** | code (pure engine) |
| **scope** | ERV 計算 / Three-Gate (Observe / Worth / Safe) / Speak Decision Engine 統合 / Counterfactual Silence Test (§10.2) / Anticipatory Withdrawal logic (§10.3) / Mirror Diversity Quota (§10.5)。**UI 発火しない** (B-5 で初めて発火) |
| **新規 files** | `lib/coalter/mirror/erv.ts` / `lib/coalter/mirror/gates/observeGate.ts` / `lib/coalter/mirror/gates/worthGate.ts` / `lib/coalter/mirror/gates/safeGate.ts` / `lib/coalter/mirror/decisionEngine.ts` / `lib/coalter/mirror/counterfactualSilenceTest.ts` / `lib/coalter/mirror/anticipatoryWithdrawal.ts` / `lib/coalter/mirror/diversityQuota.ts` |
| **修正 files** | なし |
| **touched files 上限** | **計 8-12 files** (含む test) |
| **forbidden files** | presence layer / chat layer / `lib/coalter/observer/*` / UI ファイル / telemetry 経路 |
| **acceptance criteria** | (a) 全関数 pure / (b) Three-Gate AND fail-closed (1 つでも Fail → STAY_SILENT) / (c) SPEAK_THRESHOLD = 0.75 (constants 定義) / (d) Counterfactual Silence Test が「沈黙の worst case = ユーザーが小さな観察を逃す」と判定したら STAY_SILENT / (e) Anticipatory Withdrawal: rupture_risk 0.3 / 0.5 / 0.7 で threshold 引き上げ 0.10 / 0.20 / +∞ (= 強制 STAY_SILENT) / (f) Mirror Diversity Quota: 同一 axis の Mirror は最低 3 回の SPEAK 機会を待つ / (g) ERV 計算 NaN / Infinity / undefined → STAY_SILENT / (h) unit test カバレッジ ≥ 90% |
| **rollback condition** | Three-Gate が単一 fail で STAY_SILENT にならない / threshold 値が constants から外れる / Counterfactual Silence Test がバイパスされる |
| **LOC budget** | ≤ 400 (含む test) |
| **CEO 承認点** | ERV 計算式の coefficient / Anticipatory Withdrawal の段階 / Counterfactual Silence Test の判定基準 |

### 2.5 B-5 — Preview canary, flag allowlist only

| 項目 | 内容 |
|------|------|
| **PR 種別** | code (canary + integration) |
| **scope** | flag を **allowlist only** で Preview branch-scoped に有効化。Production 投入禁止。MirrorSurface 実描画 / Mirror 文生成 / Post-Speak Verification / Channel Coordination Lock (§10.1) / Sleep Control 言語検出 / telemetry 記録 |
| **新規 files** | `lib/coalter/mirror/text/templates.ts` (Mirror 5 taxonomy × hedge grammar テンプレート) / `lib/coalter/mirror/text/generator.ts` / `lib/coalter/mirror/postSpeakVerify.ts` (4 検証: PII / 文体 / 長さ / 重複) / `lib/coalter/mirror/channelLock.ts` (§10.1 lock) / `lib/coalter/mirror/sleepDetector.ts` (§10.6 言語停止) / `lib/coalter/mirror/telemetry.ts` (redacted snapshot 形式 emit) |
| **修正 files** | `components/coalter/mirror/MirrorSurface.tsx` (実描画 logic 追加) / `components/coalter/mirror/MirrorHost.tsx` (flag ON で MirrorSurface mount 切替) |
| **touched files 上限** | **計 10-14 files** (含む test) |
| **forbidden files** | presence layer / chat layer / `lib/coalter/observer/*` / Production env / route/API/DB/Sentry/Sentry SDK |
| **feature flag** | `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` を **branch-scoped Preview only** で `true` に。Production / 全 Preview enable 禁止。CEO 承認後に env 投入 |
| **acceptance criteria** | (a) canary 期間 1-2 週間 / (b) PII leak 0 件 / (c) 誤発話 0 件 (Post-Speak Verification 全件 PASS) / (d) session cap = 1 動作 / (e) sleep 動作 (toggle / 言語停止「黙ってて」「今は不要」) / (f) Channel Coordination Lock: presence 発話中に Mirror SPEAK 試行 0 件 / (g) `lib/coalter/presence/` diff = 0 / (h) `app/components/chat/` diff = 0 / (i) Production env 不可侵 / (j) telemetry に raw PII 0 件 |
| **rollback condition** | rollback 条件 §7.6 設計書のいずれか (PII 1 / FP ≥ 10% / negative feedback ≥ 5 / UI 違和感 ≥ 3) → flag env 削除 |
| **LOC budget** | ≤ 250 (含む test) |
| **CEO 承認点** | canary allowlist / canary 期間 / Mirror 文テンプレート文体 / 言語停止検出キーワード |

### 2.6 B-6 — Phase B completion docs

| 項目 | 内容 |
|------|------|
| **PR 種別** | docs-only |
| **scope** | `docs/coalter-aoo-phase-b-completion.md` 新規 (canary 観測根拠 / 完了基準達成証跡 / Phase C 持ち越し論点 / Phase B 通じての学び) / `docs/decision-log.md` Phase B 完了 entry 追加 / Phase B design 冒頭に完了通知 banner 追加 |
| **新規 files** | `docs/coalter-aoo-phase-b-completion.md` |
| **修正 files** | `docs/coalter-aoo-phase-b-mirror-channel-design.md` (完了 banner) / `docs/decision-log.md` (完了 entry) |
| **touched files 上限** | **計 3 files、全て docs** |
| **forbidden files** | コード 一切 |
| **acceptance criteria** | (a) docs-only diff / (b) canary evidence 全項目 PASS の根拠記載 / (c) CEO 完了判定 (人間判断) |
| **rollback condition** | (実装 PR ではないので revert は通常不要) |
| **LOC budget** | docs のみ (目安 200-400 行) |
| **CEO 承認点** | Phase B 完了宣言の文面 / Phase C 持ち越し論点の整理 |

### 2.7 Micro-PR 順序制約

```
B-0 (本書) ──merge──> B-1 起票
                         │
                         ▼
                       B-1 ──merge──> B-2 起票 (並列)
                                      B-3 起票 (並列)
                                       │       │
                                       ▼       ▼
                                       B-2 + B-3 両方 merge ──> B-4 起票
                                                                  │
                                                                  ▼
                                                                B-4 merge ──> B-5 起票 (CEO env 投入承認後)
                                                                                 │
                                                                                 ▼
                                                                              B-5 canary PASS ──> B-6 起票
```

各 PR 間で **kill switch flag は常に OFF default** を維持。B-5 のみ branch-scoped Preview で限定 ON。

#### 2.7.1 並列化条件 (B-2 / B-3) — CEO 補正反映

**原則**: micro-PR は **sequential** (B-1 → B-2 → B-3 → B-4 → B-5 → B-6)。

**並列化可能条件** (B-2 と B-3 のみ、すべて満たした場合のみ並列許容):
1. 両 PR が **完全 pure function** で実装される (B-3 は元から pure / B-2 は read-only adapter)
2. **shared type / shared schema / shared file に一切 touch しない**
3. 並列起票前に `lib/coalter/mirror/types.ts` 等の共通型定義を **どちらか先行 PR (例: B-1) で確定済み**
4. CEO 個別承認を取得 (デフォルトは sequential)

**並列化不可となるケース**:
- 両 PR が `lib/coalter/mirror/types.ts` 等の共通型定義に追記する
- B-2 の adapter 型が B-3 の bucket 入力型と相互依存する
- merge order 競合のリスクがある

**結論**: Phase B 全期間で **デフォルトは sequential**。並列起票は「明示的承認 + 4 条件すべて成立」のときのみ例外的に許容。

---

## 3. Feature Flag 戦略

### 3.1 命名と default

```
NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED
```

- **default: `false`**
- env 未設定 → `false`
- 空文字 `""` → `false` (Phase A で「`normalizeBool("") → true`」既存挙動を運用回避した経緯 → 本フラグでは `normalizeBool` の挙動を再検証し、空文字を `false` 扱いするか専用ヘルパーを用意)
- ON 値は明示的に `"true"` のみ (`"1"` `"on"` 等は受け付けない、運用混乱防止)

### 3.2 scope 戦略

| Phase | scope | 状態 |
|-------|-------|------|
| B-1 起票時 | 起票なし (flag 名だけ doc 内で予告) | OFF |
| B-1 merge | 起票はするが env 投入なし | OFF |
| B-2, B-3, B-4 merge | env 投入なし | OFF |
| B-5 起票時 | env 起票準備 (CEO 承認待ち) | OFF |
| B-5 merge + CEO env 投入承認 | `Preview (chore/coalter-aoo-b5-canary)` branch-scoped ON | branch-only ON |
| B-5 canary 完了 + B-6 merge | env 削除 → Production allowlist (もし CEO 判断するなら別 docs PR) | OFF |
| Production rollout (Phase B の範囲外、Phase C 候補) | 別 docs PR で計画 | -- |

### 3.3 kill switch 手順

```bash
# 即時停止 (CEO 操作)
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview
# branch-scoped の場合
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview --git-branch chore/coalter-aoo-b5-canary
```

- 削除後の preview deploy で flag undefined → `false` → MirrorHost = null-render
- module-level guard で再投入されない限り Mirror は一切動作しない
- 削除事象を `docs/decision-log.md` に記録

### 3.4 Production 投入禁止 (Phase B 全期間)

Phase B 全期間で Production env への投入は禁止。Production rollout は Phase B 完了後に別 docs PR で計画 (Phase C 候補)。

---

## 4. User Sleep Control 詳細

### 4.1 設定 UI トグル

- 設置場所: 設定画面に「**CoAlter Mirror を sleep する**」トグル (Mirror Channel 専用、既存 CoAlter 全体 mute とは別)
- default: **OFF** (Mirror 動作中)
- 永続化: localStorage キー `coalter:mirror:sleep:v1` (string `"true"` / `"false"`)
- 将来: Supabase ユーザー設定テーブルへ移行 (Phase C 候補)

### 4.2 言語的停止導線 (CEO 必須化、CEO 補正反映)

| Trigger 表現 | 検出方法 |
|-------------|----------|
| 「黙ってて」 | 正規表現 + 完全一致リスト |
| 「今は不要」 | 同上 |
| 「Mirror いらない」 | 同上 |
| 「映さなくていい」 | 同上 |
| 「静かにして」 | 同上 |
| 「うるさい」 + Mirror が直前に出ていた場合 | 文脈条件付き検出 |

検出キーワードリストは B-5 で別 const file 化、CEO レビュー後に拡張。

**境界 (CEO 補正反映、重要)**:
- **明示コマンドのみ**で検出する。sentiment 推測 / 感情語の含意推論 / 文脈解釈で sleep を有効化しない (false-positive 防止)
- **raw utterance を保存しない**。判定後に保持するのは `user_override.sleep = true` (boolean) と `reason_enum = "explicit_user_stop"` の 2 値のみ
- PII / raw text / message id / 検出元 sentence の保存禁止 (PII firewall 拡張)
- 判定 logic は pure function (B-5 `sleepDetector.ts`)、副作用なし、入力 = 短文字列 / 出力 = boolean + enum
- LLM / ML 判定を使わない (determinism 保証のため pattern 一致のみ)

### 4.3 停止検出時の動作 (CEO 補正反映)

1. `user_override.sleep` を ON 相当として扱う
2. **当該 session の終端まで** Safe Gate で必ず fail-close (Phase B では cross-session 永続化は scope 外)
3. session 内有効 (Phase B では cross-session 永続化なし、§4.4 / §10.7 参照)
4. session 終了後は baseline に戻る。複数 session を跨ぐ stop persistence は **future / persistence-approved phase** (§14.1)
5. UI に「Mirror を sleep にしました」1 行 toast のみ (Mirror 形式の反射は禁止)

**Phase B 範囲**: session-only sleep。`localStorage` / `Supabase user_settings` / cookie 等の永続化は **Phase B では実装しない**。

### 4.4 sleep 中の挙動 (CEO 補正反映)

- 観測蓄積 (Phase A `RelationshipState` 更新) は継続
- Mirror 候補生成は **行わない** (ERV 計算前に Safe Gate fail-close)
- **Local in-memory diagnostic reason snapshot** に `STAY_SILENT (user_sleep)` として記録 (§10.8、remote telemetry / Sentry / DB / API 一切送信なし、PII firewall 経由)
- session 終了時に in-memory snapshot は破棄

**Phase B persistence boundary (重要)**:
- Phase B 全期間で **cross-session persistence は禁止**
- sleep / Diversity Quota / Stop Cascading の **長期保存は Phase E 以降の persistence-approved phase 候補** (§14.1)

---

## 5. 頻度上限 (per-session + per-taxonomy)

### 5.1 Per-session hard cap

| Phase | cap |
|-------|-----|
| 初期 Preview canary | **1 / session** |
| canary 安定後 (false-positive < 5% 維持) | 2 / session (CEO 承認必須) |

### 5.2 連続防止

- 同一 session 内で最低 **5 ターン間隔**
- `time_since_last_speak` は **Worth Gate 必須入力** (CEO 確定)

### 5.3 Per-taxonomy soft cap (本書 §10.5 Mirror Diversity Quota、CEO 補正反映)

**Phase B 実装範囲 — session-only anti-repeat のみ**:

| Mirror taxonomy | per-session 上限 | 反復防止 (Phase B = session-only) |
|----------------|----------------|----------|
| State | 1 | 同一 axis を session 内で繰り返さない |
| Difference | 1 | 同一文脈の差分を **session 内で**繰り返さない |
| Tempo | 1 | 同 (session-only) |
| Fairness | 1 | 同一テーマを **session 内で**繰り返さない (最も慎重、本 session 内のみ) |
| Repair | 1 | severity = "mild" のみ、**session 内反復禁止** |

**Phase B 不実装 (future / persistence-approved phase 候補、§14.1)**:
- 24 時間 / 7 日の cross-session quota
- session を跨ぐ axis 反復回避
- 7 日 Fairness テーマ凍結
- persistent diversity history

理由: 同一 axis の繰り返しは self-model anchoring を強化 (Frontiers 2025 PMC12289686 [DS])。但し、cross-session quota 実装には persistence layer が必要であり、Phase B 境界 (route/API/DB/Sentry/telemetry 禁止 §9.5) を侵すため、Phase B では session-only に絞る。

---

## 6. Unknown Handling 統一ポリシー

### 6.1 統一原則: unknown は STAY_SILENT (fail-closed)

| 入力 | unknown 値 | 動作 |
|------|-----------|------|
| `modeContext` | `"unknown"` | Safe Gate fail / STAY_SILENT |
| `matchedPatternCategory` bucket | `"unknown_category"` | Observe Gate fail / STAY_SILENT |
| `alignment_signal` | NaN / undefined | Observe Gate fail / STAY_SILENT |
| `uncertainty` | NaN / undefined / > 0.4 | Safe Gate fail / STAY_SILENT |
| `silence_budget` | NaN / undefined / ≥ 0.7 | Worth Gate fail / STAY_SILENT |
| `rupture_flag` | undefined | Safe Gate fail / STAY_SILENT (precautionary) |
| `conversation_phase` | unknown / undefined | Worth Gate fail / STAY_SILENT |
| `time_since_last_speak` | < 5 turn | Worth Gate fail / STAY_SILENT |
| `user_override.sleep` | true | Safe Gate fail / STAY_SILENT |

### 6.2 観測ログ (CEO 補正反映)

各 unknown trigger を **local in-memory diagnostic reason snapshot** に `STAY_SILENT (unknown:<axis>)` 形式で記録 (§10.8)。session 内集計のみ、remote telemetry / Sentry / DB / API 送信なし。canary 期間中の頻度分布は CEO による in-session 観測で判断材料に。永続化必要な集計は future phase。

---

## 7. Safety Handling

### 7.1 safety_concern は Phase B 全期間で発話禁止

| Trigger | 動作 |
|---------|------|
| bucket = `safety_concern` | Safe Gate fail / STAY_SILENT |
| 検出時の routing | telemetry に `STAY_SILENT (safety_concern)` 記録のみ。Phase C+ で別チャネル設計 |

理由: safety_concern は治療的介入 / 専門家紹介の領域。Mirror reflection は不適切。

### 7.2 rupture_signal は severity 二分

| severity | 動作 |
|---------|------|
| `high` | Safe Gate fail / STAY_SILENT |
| `mild` | Repair Mirror 候補のみ (§6.5 設計書、本書 §1.2 grammar 制約遵守) |

severity 判定は B-3 bucket inference pure logic で実装。判定が confidence < 0.7 なら `high` 寄りに丸める (precautionary)。

### 7.3 強い対立検出時

ユーザー側 / 他者側いずれかに **強い対立表現 / 攻撃表現 / 怒気** を検出した場合、Mirror taxonomy 全種 STAY_SILENT (Repair も含む)。

検出: 既存 presence layer signal を read-only で利用、Mirror 側で独自 NLP 解析しない (presence layer 不可侵 + telemetry 増加防止)。

---

## 8. Evidence Plan (Canary 観測 Matrix)

### 8.1 Phase B PASS 判定の根拠となる観測項目

| # | 観測項目 | 計測方法 | PASS 基準 | NG なら |
|---|---------|---------|----------|---------|
| 1 | per-session SPEAK 率 | local in-memory diagnostic snapshot 集計 (session 単位、CEO 直接観測) | 平均 < 5% (圧倒的に STAY_SILENT) | 閾値見直し / 軸計算見直し |
| 2 | PII leak | snapshot 全件 grep + Mirror 文字列スキャン (in-session) | **0 件** | 即時 rollback (§7.6 rollback 条件) |
| 3 | 誤発話 (false-positive) | CEO + 人間レビュアー 2 名による事後監査 | < 5% (canary 期間中の SPEAK 判断) | threshold 引き上げ / Three-Gate 強化 |
| 4 | negative feedback | UI 「これは要らない」ボタン / 設定 sleep ON 数 (in-session カウント、CEO ヒアリング) | < 5 件 / canary 期間 | rollback |
| 5 | UI 違和感 feedback | 自由記述 / Hotjar 等は使わない (Phase B 範囲外) → CEO 直接ヒアリング | < 3 件 | rollback |
| 6 | sleep control 動作 | toggle ON 時 / 言語停止検出時の STAY_SILENT 率 (in-session) | 100% | sleep logic bug 修正 |
| 7 | session cap (1/session) | snapshot の SPEAK 回数 / session | 全 session で ≤ 1 | cap logic bug 修正 |
| 8 | Channel Coordination Lock | presence 発話と Mirror 発話の同 turn 内発生件数 | **0 件** | lock logic bug 修正 |
| 9 | Mirror Diversity Quota (Phase B = session-only) | session 内同一 axis 反復率 | **session 内反復 0 件** (cross-session quota は Phase B 不実装、§5.3) | quota logic bug 修正 |
| 10 | NC Index (本書 §10.4) — **diagnostic metric only** | uncertainty-triggered STAY_SILENT 率 (in-session 集計) | **tentative**: > 0.80 (PASS hard gate ではない、CEO calibration required) | uncertainty 閾値見直し / NC Index 計算式調整 / CEO 判断で目標値変更 |
| 11 | 既存 presence layer 不可侵 | diff チェック (git) | `lib/coalter/presence/` diff = 0 | revert |
| 12 | 既存 chat layer 不可侵 | diff チェック (git) | `app/components/chat/` 17 files diff = 0 | revert |
| 13 | Production env 不可侵 | `vercel env ls production \| grep mirror` | 0 件 | env 削除 |
| 14 | Question / Proposal auto-fire | Mirror 文の grammar スキャン (正規表現「？」「ほうがいい」「みては」) | 0 件 | post-speak verify 文体検証 強化 |
| 15 | rollback drill | kill switch OFF 操作で Mirror 即時停止 | 1 回 OFF → 即時停止確認 | flag guard 強化 |

**重要 (CEO 補正反映)**:
- 全観測は **local in-memory diagnostic snapshot** (§10.8) ベース。remote telemetry / Sentry / DB / API 一切なし
- NC Index PASS bar 0.80 は **tentative**。Phase B canary 結果で CEO 個別判定 (hard gate でない)
- 全観測値は session 終了で破棄。永続化集計は future phase

### 8.2 観測期間と判定者

- canary 期間: 1-2 週間 (CEO 判断、最低 1 週間)
- 判定者: CEO (主観 + 上記 15 項目の objective evidence)
- 完了 docs: `docs/coalter-aoo-phase-b-completion.md` (B-6 PR で起票)

### 8.3 Local In-Memory Diagnostic Snapshot 構造 (CEO 補正反映、旧 "telemetry" 改名)

**重要**: 本構造は **Phase B では local in-memory のみ**。remote telemetry / Sentry / DB / API / file 永続化 一切なし。session 終了時に破棄。

```typescript
// lib/coalter/mirror/diagnosticSnapshot.ts (B-5 で実装)
type MirrorDiagnosticSnapshot = {
  decision: "SPEAK" | "STAY_SILENT";
  reason_category: "speak_passed" | "uncertainty" | "safety_concern" |
                   "rupture_high" | "unknown_modeContext" | "unknown_bucket" |
                   "frequency_cap" | "user_sleep" | "user_language_sleep" |
                   "channel_lock_held" | "counterfactual_silent" |
                   "diversity_quota_session" | "anticipatory_withdraw" |
                   "post_speak_verify_fail";
  erv_value: number | null;
  gate_fail: "observe" | "worth" | "safe" | null;
  mirror_kind: "state" | "difference" | "tempo" | "fairness" | "repair" | null;
  modeContext: "normal" | "daily" | "travel" | "unknown";
  matched_bucket: "safety_concern" | "rupture_signal_high" |
                  "rupture_signal_mild" | "unknown_category" | null;
  redacted_relationship_key: string;  // sha256 + salt + base64url (Phase A 同形式)
  timestamp_ms: number;  // session-local 相対時刻
};

// 蓄積は session 内 in-memory 配列のみ
const sessionSnapshots: MirrorDiagnosticSnapshot[] = [];
// session 終了時に sessionSnapshots = [] でクリア
// 外部送信なし (Sentry / DB / API / fetch / log emission 一切なし)
```

**Phase B での扱い**:
- session 内 CEO 観測 / canary 確認用途のみ
- 外部送信は **Phase C 以降の persistence-approved phase 候補** (§14.1)
- PII firewall 維持 (raw text / raw pairStateId 含まない、Phase A 同形式)
- 全 snapshot は session 終了で消える
- console.log での dev-only 出力は許可 (production NODE_ENV 時は no-op になる guard 必須)

---

## 9. 不変境界 (CEO mandatory 11-15)

Phase A から継承 + Phase B で追加された不変境界の一覧。**全 PR で違反したら即 revert**。

### 9.1 既存 Presence Layer zero diff

- `lib/coalter/presence/` 全 30+ files は B-1 〜 B-6 全期間で diff = 0
- read-only 参照は許可 (B-2 modeContextReader 内で import OK)
- 書き込み / mutation / 型変更 一切禁止

### 9.2 既存 Chat Layer 17 files zero diff

- `app/components/chat/` 全 17 files は B-1 〜 B-6 全期間で diff = 0
- 新規 import の追加も禁止
- Mirror 関連ファイルを `app/components/chat/` 配下に新設しない

### 9.3 ChatClient.tsx mount は B-1 で 5 行以下

- `app/(culcept)/talk/[threadId]/ChatClient.tsx` への diff は **§8.2 設計書 mount 規約に従う 5 行以下** (B-1 のみ)
- 既存 logic への改変ゼロ
- 後続 B-2 〜 B-5 では追加 diff なし

### 9.4 Question / Proposal auto-fire 禁止

- Mirror 出力に「？」「ほうがいい」「みては」「したら？」等の表現が混入しないよう Post-Speak Verification §7.3 文体検証で全件チェック
- 違反検出時は STAY_SILENT に fail-close + telemetry 記録

### 9.5 route / API / DB / Sentry / remote telemetry 禁止 (Phase B 範囲、CEO 補正反映)

- 新規 API route 追加禁止 (`app/api/*` への新規 file 一切)
- 既存 API 経由の DB 書き込み禁止
- Supabase 直接書き込み禁止
- migration ファイル追加禁止
- Sentry SDK 統合一切禁止 (本書 §8.3 は **local in-memory diagnostic snapshot のみ**、外部送信なし)
- remote telemetry エンドポイント / fetch 送信 一切禁止
- 永続化 (localStorage / sessionStorage / cookie / IndexedDB / file write) 禁止 (Phase B = session-only)
- console.log は dev-only / NODE_ENV production で no-op となる guard を介してのみ許可

### 9.6 Production env 不可侵

- B-1 〜 B-6 全期間で Production env に `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` を投入しない
- B-5 canary は Preview branch-scoped のみ

### 9.7 既存 PresenceState S0-S8 遷移 不可侵

- Phase A 不変境界の継承
- Mirror Channel は Presence の状態機械を改変しない
- Channel Coordination Lock (§10.1) は Presence への影響を最小化 (Mirror が後退する設計)

---

## 10. Novel Design Contributions (autonomous reasoning)

CEO mandatory 15 項目に加え、本書で **新規提案** する設計貢献。CHI 2024 / Nature 2025 / Frontiers 2025 / OECD 2026 / Bion 1962 の研究を踏まえた engineering 提案。

### 10.1 Channel Coordination Lock — Mirror と Presence の発話衝突防止

**問題**: 既存 Presence Layer (S0-S8) と新規 Mirror Channel は独立に動作する。両者が同 turn に発話すると、ユーザーは「**喋り過ぎ AI**」と感じ、信頼が即座に毀損する。

**Evidence Tier**: **Analogical Support [AS]** (multi-agent / game setting からの類推。Mirror=relationship channel への直接実証はなし — design extension)

**学術根拠**:
- arXiv 2501.06322 (Multi-Agent Collaboration Survey 2025) [AS]: multi-agent turn-taking で speaking-token mutex の必要性が指摘 (multi-agent collaboration 設定 → relationship Mirror への類推)
- Frontiers AI 2025 "Who speaks next?" Murder Mystery games [AS]: adjacency pairs ベース次話者選択 + 単一 speaking-token mutex で衝突解決 (game setting → relationship Mirror への類推)

**仕様**:

```typescript
// lib/coalter/mirror/channelLock.ts (B-5 で実装)
type SpeakingChannel = "presence" | "mirror" | null;

interface ChannelLock {
  current: SpeakingChannel;
  acquiredAtMs: number | null;
  releaseAfterMs: number;  // 30000 (30 sec default)
}

function tryAcquire(channel: SpeakingChannel): boolean {
  // (a) lock が解放されている → acquire 成功
  // (b) 既に同 channel が hold → 成功 (idempotent)
  // (c) 異 channel が hold + 30 sec 経過 → 強制 release + acquire
  // (d) 異 channel が hold + 30 sec 未経過 → 失敗、Mirror は STAY_SILENT
}
```

**優先順位 (衝突時)**:
- Mirror が後退する (presence 優先)
- 理由: presence は ActionShape / Conclude / Branch 等で**明示的に呼ばれた発話**、Mirror は**観測由来の自発反射**。明示的呼び出しを優先

**例外 (Phase B では発生しない)**:
- Mirror が rupture severity = mild の Repair Mirror を出そうとしている時で、presence が単なる daily flow → 本来 Mirror 優先だが、Phase B では一律 Mirror 後退 (safety-first)

**実装位置**: B-5 (canary PR)
**測定指標**: presence + Mirror 同 turn 発話件数 (PASS 基準: 0 件)

### 10.2 Counterfactual Silence Test — 「黙ったら何が起きるか」の事前評価 (CEO 補正反映)

**問題**: ERV > threshold ∧ Three-Gate PASS だけでは不十分。「**SPEAK しなかったらユーザーに何が起きるか**」を事前に評価して、損失が許容範囲なら STAY_SILENT を選ぶ。

**Evidence Tier**: **Direct Support [DS]** (LLM abstention 研究の直接適用)

**学術根拠**:
- Wen et al. TACL 2025 "Know Your Limits: A Survey of Abstention in LLMs" (Vol. 13, pp. 529-556, DOI 10.1162/tacl_a_00754) [DS]: LLM abstention は query / model / human values の 3 視点で設計、損失評価ベースで abstain 判断が必要
- AbstentionBench (arXiv 2506.09038, Kirichenko et al. 2025) [DS]: reasoning-tuned LLM の abstention が 24% 低下する実証 → Mirror Channel は **LLM ではなく deterministic engine** で abstain 判断する根拠
- 設計書 §0.2 Aneurasync 中心問い「**ユーザーの第二の自己として必要か？**」を algorithmic に embed する手段

**実装制約 (CEO 補正反映、重要)**:
- **pure deterministic engine**。LLM 呼び出し / API call / 外部 dependency 一切なし
- 入力は **redacted bucket / enum / counters のみ** (raw text 入力禁止、PII 含まない)
- 副作用なし / I/O なし / 入出力決定性 100%
- ERV 0.85 bar は **tentative**、canary 期間中の CEO calibration で調整 (hard gate でなく、CEO 個別判断で見直し可)

**仕様**:

```typescript
// lib/coalter/mirror/counterfactualSilenceTest.ts (B-4 で実装、pure)
type CounterfactualOutcome =
  | "user_misses_small_observation"   // 許容 → STAY_SILENT
  | "user_misses_meaningful_insight"  // 損失あり → SPEAK 候補維持
  | "user_takes_harmful_action"       // Phase B 範囲外 → 常に STAY_SILENT (safety_concern routing)
  | "no_difference";                  // 中立 → STAY_SILENT

// CEO 補正: 入力は redacted bucket / enum / counters のみ。raw text 禁止
function counterfactualSilenceTest(
  ervValue: number,             // 0.0 - 1.0 numeric
  bucket: BucketKind,           // enum (redacted)
  modeContext: ModeContext,     // enum (redacted)
  // raw text / message body / user input string 入力禁止
): CounterfactualOutcome {
  // (a) bucket = safety_concern → "user_takes_harmful_action" → STAY_SILENT
  // (b) ERV < 0.85 → "user_misses_small_observation" → STAY_SILENT (tentative bar)
  // (c) ERV ≥ 0.85 ∧ bucket = null ∧ modeContext ≠ "travel" → "user_misses_meaningful_insight" → SPEAK 候補
  // (d) other → "no_difference" → STAY_SILENT
}
```

**Phase B の挙動**:
- ほぼ常に STAY_SILENT (high bar 0.85 で SPEAK 機会を絞る)
- Three-Gate を通過した SPEAK 候補に対して、最後の追加チェックとして機能
- 0.85 bar は **canary calibration required**: CEO が canary 結果を見て上下調整 (hard gate ではない)

**実装位置**: B-4 (pure engine)
**測定指標**: Counterfactual test 通過率 (PASS 基準: SPEAK 全件のうち通過 100%、未通過は STAY_SILENT に fail-close)

### 10.3 Anticipatory Withdrawal — rupture を予防する段階的後退 (CEO 補正反映)

**問題**: 既存設計の `rupture_flag` は **反応的** (rupture 発生後に立つ)。人間以上に関係を壊さない AI には、**rupture 予兆段階での後退**が必要。

**Evidence Tier**: **Analogical Support [AS]** + **Design Hypothesis [DH]** (一般的 conflict de-escalation + attachment 思想からの類推、Mirror Channel への直接適用は novel)

**学術根拠 (CEO 補正反映: Polyvagal hard dependency 削除)**:
- **一般的 conflict de-escalation 思想** [AS]: 緊張上昇時の段階的な後退は対人 communication 全般で確立 (specific paper を hard dependency にしない)
- **Bowlby attachment theory "secure base"** [AS]: 不安が高まる時点で intrusive にならず available に (attachment 文献の AI 応用は AS)
- **Anthropic Constitutional AI principles** [AS]: 害が発生してから止めるのではなく、害が発生する前に避ける (general safety-margin 設計思想)
- **Polyvagal theory** ~~(Porges) co-regulation~~ → **metaphor / inspiration only** に格下げ (Clinical Neuropsychiatry 2026 critique paper により hard dependency から除外、§13 参照)
- **Bion 1962 negative capability** [DH inspiration]: 不確実性を保持する能力 (concept inspiration)

**仕様**:

```typescript
// lib/coalter/mirror/anticipatoryWithdrawal.ts (B-4 で実装、pure function)
type RuptureRisk = number;  // 0.0 - 1.0 (B-3 bucket inference の出力)

function adjustSpeakThreshold(
  baseThreshold: number,   // 0.75
  ruptureRisk: RuptureRisk,
): number {
  if (ruptureRisk < 0.3) return baseThreshold;          // 通常
  if (ruptureRisk < 0.5) return baseThreshold + 0.10;   // 0.85
  if (ruptureRisk < 0.7) return baseThreshold + 0.20;   // 0.95
  return Infinity;                                       // 強制 STAY_SILENT
}
```

`ruptureRisk` の計算は B-3 bucket inference の延長で pure function 化 (**session-only history**、cross-session persistence なし):
- **当該 session 内** 過去 N ターン (N ≤ 10) の negative tone 比率
- **当該 session 内** ユーザー側の disengagement signal (短文化、return 頻度低下)
- **当該 session 内** alignment_signal の急落
- **当該 session 内** silence_budget の急上昇

**Phase B 範囲**: rupture_risk 計算は **session-only**。cross-session 学習 (rupture risk の persistent baseline 等) は future / persistence-approved phase。

**閾値値の status**: 0.3 / 0.5 / 0.7 は **tentative**、canary 期間の rupture 観測で CEO が calibration (hard gate でない)。

**実装位置**: B-4 (pure engine、session-only context)
**測定指標**: Anticipatory Withdrawal 発動率 / withdrawal 後の rupture 発生率 (predictive vs reactive 効果、session 内集計のみ)

### 10.4 Negative Capability Index (NC Index) — 「黙れる AI」の定量指標 (CEO 補正反映)

**問題**: 「人間以上に関係を壊さない AI」を **測定可能な単一指標**にする必要がある。

**Evidence Tier**: **Design Hypothesis [DH]** (design-novel metric、学術前例なし) + 隣接 [DS] 研究を参照

**学術根拠**:
- Bion 1962 "Learning from Experience" [DH inspiration]: 不確実性を**保持**する能力 (concept inspiration)
- Wen et al. TACL 2025 "Know Your Limits" (DOI 10.1162/tacl_a_00754) [DS 隣接]: LLM abstention framework
- AbstentionBench (arXiv 2506.09038, Kirichenko et al. 2025) [DS 隣接]: 20 dataset / unanswerable question 評価、reasoning-tuned model の abstention 24% 低下を実証
- **直接的な NC metric 研究は未発見** → 本書は design-novel として明示提案

**仕様** (新規提案):

```
NC Index = (silence_rate_under_uncertainty) × (1 - over_claim_rate) × (resistance_to_premature_closure)

where:
  silence_rate_under_uncertainty = STAY_SILENT(uncertainty > 0.4) / TOTAL(uncertainty > 0.4)
  over_claim_rate = SPEAK(confidence < 0.6) / SPEAK_TOTAL
  resistance_to_premature_closure = STAY_SILENT(N consecutive turns) / N_total_turns

すべて session-only 集計
```

**Phase B の扱い (CEO 補正反映、重要)**:
- **diagnostic metric only**。Phase B PASS の **hard gate ではない**
- 目標値 **> 0.80 は tentative** (CEO calibration required)
- Phase B canary 期間中の CEO 観察で値を見て **個別判断**、達成不能なら目標値見直し
- B-5 で local in-memory diagnostic snapshot (§10.8) に記録、session 終了時に破棄
- 永続化 / cross-session 平均は **Phase E 以降 (persistence-approved phase) 候補**

**実装位置**: B-5 (local in-memory diagnostic snapshot 集計、専用 emit なし)
**測定指標**: NC Index 値 (session-only 集計、CEO 完了判定の **参考根拠** — hard PASS gate ではない)

**design-novel claim**: 本指標は学術論文に存在しない。Phase B での運用結果を将来公開する余地は CEO 判断 (本書 scope 外)。Phase B では実証 metric の **検証段階**、Phase C+ で hard gate 候補。

### 10.5 Mirror Diversity Quota — 自己モデル汚染防止 (CEO 補正反映: Phase B = session-only)

**問題**: Frontiers 2025 "algorithmic self" は AI 反射が **closed loop で self-concept を固定化**することを実証。同一 axis の Mirror を反復すると、ユーザーは「自分はそういう人間だ」と過剰一般化する。

**Evidence Tier**: **Direct Support [DS]** (Frontiers 2025 が AI 反射の self-model contamination を実証)

**学術根拠**:
- Frontiers Psychology 2025 (PMC12289686) "The algorithmic self" [DS]: AI と人間の self-expansion theory で「閉ループ強化」が実証、emotional conformity 現象観測
- self-expansion theory: anthropomorphic AI は self-concept の一部に取り込まれる

**Phase B 実装範囲 (CEO 補正反映、重要)**:

```
Phase B 実装 — session-only anti-repeat:
- 同一 axis (state / tempo / fairness / etc.) の Mirror は **当該 session 内** 反復禁止
- 1 session 内で per-taxonomy 上限 1 (§5.3 参照)
- in-memory counter のみ (session 終了で破棄)
- 永続化なし、cross-session なし

Phase B 不実装 (future / persistence-approved phase 候補):
- 24 時間 / 7 日の cross-session quota
- Fairness テーマの 7 日間凍結
- Repair Mirror の 24 時間内反復禁止 (cross-session 観点)
- persistent per-user diversity history
```

**Phase B での挙動**: session 内で同一 axis を反復しないことに絞る。cross-session の長期 anchoring 防止は persistence layer が必要なので future。

**実装位置**: B-4 (pure session-only quota function) / B-5 (in-memory session store)
**測定指標**: **session 内**同一 axis 反復率 (PASS 基準: 0%、cross-session 指標は Phase B 対象外)

### 10.6 Hypothesis-Form Mirror Grammar — declaration 禁止

**問題**: 「**あなたは X です**」型の declaration は self-model 汚染が実証済 (Frontiers 2025)。Mirror grammar を hypothesis 形式 (観察事実 + hedge) に固定する。

**Evidence Tier**: **Direct Support [DS]** (Frontiers 2025 + Rubin et al. Nature 2025 が直接実証)

**学術根拠**:
- Frontiers Psychology 2025 (PMC12289686) "The algorithmic self" [DS]: AI declaration による self-model 汚染を実証
- Rubin et al. Nature Human Behaviour 2025 (n=6,282, PubMed 40588597, DOI 10.1038/s41562-025-02247-w) [DS]: 同一の共感文でも AI-labeled は human-labeled より共感的評価が低い → **AI の共感演技は authenticity gap で逆効果**、Mirror は観察事実のみ返すべき根拠

**仕様**:

```
Allowed grammar pattern (B-5 templates):
  [OBSERVATION] + [HEDGE]
    例: 「決断のスピードが遅いみたい」
        「3回言い直しているように見える」
        「いつもより慎重な選び方が続いている」

Forbidden grammar pattern (Post-Speak Verification で reject):
  Declaration: 「あなたは X です」「X な人だね」
  Question:    「〜なの？」「〜だから？」
  Advice:      「〜したほうがいい」「〜してみては」
  Praise:      「素晴らしい」「いい判断」
  Empathy performance: 「わかります」「気持ちわかる」「辛いね」
```

**実装位置**: B-5 templates + Post-Speak Verification
**測定指標**: grammar 適合率 (PASS 基準: 100%)

### 10.7 Stop Cascading — 言語停止後の段階的後退 (CEO 補正反映: Phase B = session-only)

**問題**: ユーザーが「黙ってて」と言ったら、即座に baseline に戻すのは過敏。stop 後は **段階的に SPEAK_THRESHOLD を上方寄せ** して信頼を取り戻す。

**Evidence Tier**: **Analogical Support [AS]** (aversive conditioning / attachment repair 文献からの類推)

**学術根拠**:
- aversive conditioning 理論 [AS]: 嫌悪刺激の学習は positive 学習より長期保持
- attachment 修復理論 (Bowlby) [AS]: 一度の rupture 後の repair には複数の secure base interaction が必要

**Phase B 実装範囲 (CEO 補正反映、重要)**:

```
Phase B 実装 — session-only single-session escalation:
- 言語停止 (「黙ってて」「今は不要」等) を検出した時点で当該 session の SPEAK_THRESHOLD を Infinity 設定 (強制 STAY_SILENT)
- 当該 session が終了するまで Mirror は一切発火しない
- session 終了で in-memory state は破棄

Phase B 不実装 (future / persistence-approved phase 候補):
- 7 日減衰 (Day 0 → Day 1 → Day 2-3 → Day 4-7 → Day 8+) — 永続化必要
- cross-session sleep persistence (localStorage / Supabase) — 永続化必要
- session を跨ぐ SPEAK_THRESHOLD 上方寄せ — 永続化必要
- 再 sleep ON 率の長期観測 — 永続化必要
```

**Phase B での挙動**: 言語停止 → 当該 session 終端まで STAY_SILENT。次 session 開始時には baseline に戻る (Phase B では session-only)。

**実装位置**: B-5 (in-memory session sleep state、永続化なし)
**測定指標**: 言語停止検出後の session 内 SPEAK 率 (PASS 基準: 0%)

### 10.8 Local In-Memory Diagnostic Reason Snapshot (CEO 補正反映: 旧 "Transparent Reticence" telemetry を改名)

**問題**: ユーザーは「**なぜ何も言わないのか**」を疑問に思う場合がある (rare だが現実的)。Black box silence は不安を生む。一方で、Phase B 境界 (route/API/DB/Sentry/remote telemetry 禁止 §9.5) を侵さずに沈黙根拠を保持する必要がある。

**Evidence Tier**: **Analogical Support [AS]** (OECD 2026 transparency 要件 + Bowlby attachment available marker からの類推)

**学術根拠**:
- Bowlby attachment "secure base" [AS]: available marker が必要
- OECD AI Papers No. 56 (Feb 2026) [AS]: 透明性 (transparency) は agentic AI ガバナンス要件

**Phase B 仕様 (CEO 補正反映、重要)**:

```
Phase B 実装 — local in-memory diagnostic reason snapshot のみ:
- 全 SPEAK / STAY_SILENT 判断を `MirrorDiagnosticSnapshot[]` (§8.3) に session 内 in-memory 配列で蓄積
- 配列は session 終了時にクリア (永続化なし)
- console.log は dev-only / NODE_ENV production で no-op (production runtime に副作用ゼロ)
- 同一 session 内の canary 確認 / CEO debug 用途のみ
- PII firewall: raw text / raw pairStateId 含まない

Phase B 不実装 — 以下はすべて Phase C+ persistence-approved phase 候補:
- remote telemetry / Sentry / DB / API 送信
- localStorage / sessionStorage / cookie / IndexedDB / file write
- cross-session reason aggregation
- UI 拡張による「Mirror が静かな理由」表示 (Phase C で別 docs PR)
- 長期 reticence audit / 月次集計
```

**Phase B での挙動**:
- 全 SPEAK / STAY_SILENT 判断に reason_category を付して in-memory 配列に push
- session 内で CEO / canary 確認のため、developer console から `window.__coalterMirrorDiagnostics` (B-5 で 15min expire debug global、Phase A pattern 継承) 経由で参照可能
- session 終了 / page reload / tab close で全消失

**実装位置**: B-5 (`lib/coalter/mirror/diagnosticSnapshot.ts` + 15min expire debug global)
**測定指標**: session 内 reason_category 分布 (CEO 直接観測)

---

## 11. Failure Mode Analysis

### 11.1 Mirror が出るべきでない時に出る (false-positive)

| シナリオ | 防御層 |
|---------|--------|
| ERV 計算 bug で 0.75 を超える | Three-Gate fail-close / Counterfactual Silence Test |
| bucket 推論 bug で safety_concern を null と誤判定 | Safe Gate に bucket フォールバック検証 |
| user_override.sleep が反映されない | Safe Gate 最優先条件、ON で即 fail-close |
| Channel Lock 取得失敗を検知できない | Lock 取得失敗 = STAY_SILENT (fail-closed) |
| Post-Speak Verification すり抜け | 文体検証の正規表現を CEO レビューで強化 |

### 11.2 Mirror が出るべきな時に出ない (false-negative)

Phase B は **false-negative を許容**。「言うべきだったが言わなかった」は失敗ではなく、5-Verb Framework の「黙る・止まる・引く」の正しい動作。

### 11.3 ユーザーが「監視されている」と感じる (CEO 補正反映)

| シナリオ | 防御層 |
|---------|--------|
| Mirror が連続発火 | Per-session cap = 1 / Mirror Diversity Quota (Phase B = session-only) |
| 同じ axis を繰り返す | Diversity Quota **session-only 反復禁止** (cross-session quota は future) |
| 私的領域を反射 | bucket = safety_concern → STAY_SILENT |
| sleep が効かない | session-only sleep state + 言語停止 + Stop Cascading (Phase B = session-only) |
| 文面が侵入的 | hypothesis-form grammar 固定 + Post-Speak Verification |

### 11.4 Mirror が user の self-narrative を歪める (CEO 補正反映)

| シナリオ | 防御層 |
|---------|--------|
| Declaration 文 ("あなたは X") | Grammar 制約 §10.6 / Post-Speak Verification |
| 同一観察の反復 anchoring | Diversity Quota **session-only** 反復禁止 (cross-session anchoring 防止は future) |
| 当てはまり感の心理操作 | uncertainty > 0.4 で STAY_SILENT |
| 自己解釈の代行 | Mirror = reflection-only / Question・Proposal 禁止 |

### 11.5 Rupture cascade scenario (CEO 補正反映)

| シナリオ | 防御層 |
|---------|--------|
| 1 回の誤発話 → user 不快 → 再発火 | Anticipatory Withdrawal (rupture_risk 上昇で threshold 引上、session 内) |
| 「黙ってて」→ 同 session 内再発火 | Stop Cascading **session-only** (当該 session 終端まで強制 STAY_SILENT) |
| 「黙ってて」→ 次 session で再発火 | Phase B = session-only sleep のため次 session は baseline → CEO 主観で「次 session 反応」を観察。cross-session sleep persistence は future |
| Negative feedback 5 件で rollback | Rollback condition (§7.6 設計書) |

---

## 12. Test Plan (Layered)

### 12.1 Unit (B-2 / B-3 / B-4)

| 対象 | テスト範囲 | 期待カバレッジ |
|------|----------|--------------|
| modeContextReader (B-2) | 各 PresenceMode 値 + unknown / read-only 確認 (write 試行は test で監視) | 100% |
| observerActivationAdapter (B-2) | active / inactive / undefined | 100% |
| bucket inference (B-3) | 5 種 × 境界値 + unknown / pure function 確認 (副作用ゼロ test) | ≥ 95% |
| ERV (B-4) | NaN / Infinity / 各軸の境界 | ≥ 90% |
| Three-Gate (B-4) | AND fail-closed 全パターン | 100% |
| Counterfactual Silence Test (B-4) | 4 outcome 全パターン / **redacted 入力のみ確認 (raw text 入力で test fail を確認)** | 100% |
| Anticipatory Withdrawal (B-4) | rupture_risk 段階 4 区分 / session-only history 確認 | 100% |
| Diversity Quota (B-4) | session 内反復シナリオ (cross-session quota は Phase B 対象外、テストしない) | ≥ 90% |
| sleepDetector (B-5) | 明示コマンド検出 / sentiment 推測しないこと / raw utterance 保存禁止 | 100% |

### 12.2 Integration (B-4 + B-5)

| 対象 | テスト範囲 |
|------|----------|
| Decision Engine 統合 | mock input → SPEAK / STAY_SILENT 分岐 全パターン |
| Channel Lock (B-5) | presence 発話 + Mirror SPEAK 試行の衝突 |
| sleep detector (B-5) | キーワード検出 + localStorage 永続 |
| Post-Speak Verification (B-5) | 4 検証全パターン (PII / 文体 / 長さ / 重複) |

### 12.3 Canary (B-5)

| 対象 | 観測方法 |
|------|---------|
| 全 15 evidence 項目 (§8.1) | telemetry 集計 + CEO 主観 |
| canary 期間 | 1-2 週間 |
| rollback drill | kill switch 操作 1 回 |

### 12.4 CEO 最終判定 (B-6 前提)

- 上記 12.1-12.3 evidence + CEO 主観 (「**人間以上に関係を壊さない**」原則の達成感)
- 完了判定: §10.5 設計書 10 条件 全 PASS

---

## 13. Academic Foundations (References) — CEO 補正反映: Evidence Tier 化

### 13.0 Evidence Tier 定義 (CEO 補正反映)

各学術参照を以下 4 段階に分類:

| Tier | 略号 | 定義 |
|------|------|------|
| **Direct Support** | DS | 設計判断を直接支える一次研究。同じ問題設定で実証 |
| **Analogical Support** | AS | 類似領域からの類推。設定が異なるが原理が適用できる |
| **Design Hypothesis** | DH | 学術前例なし、本書独自の設計仮説 (Phase B での実証段階) |
| **Inspiration / Metaphor Only** | IO | 設計の比喩 / inspiration のみ。hard dependency にしない |

**Phase B 不採用**: Unverified (検証不能) → 削除または verified 引用に置換

### 13.1 References with Tier Classification

| # | 出典 (完全な書誌情報) | Tier | 適用先 |
|---|---------------------|------|--------|
| 1 | OECD AI Papers No. 56 (Feb 2026) "The Agentic AI Landscape and Its Conceptual Foundations". https://www.oecd.org/content/dam/oecd/en/publications/reports/2026/02/the-agentic-ai-landscape-and-its-conceptual-foundations_a9d4b451/396cf758-en.pdf | **DS** | autonomy-low role 定義 / governance / transparency 要件 (§10.8) |
| 2 | Horvitz, E. (1999). "Principles of Mixed-Initiative User Interfaces". CHI '99. http://erichorvitz.com/chi99horvitz.pdf | **DS** | expected utility 閾値 (ERV §3) / STAY_SILENT (§2) / sleep control (§4) / termination (§4.2) を直接支持 |
| 3 | Wang et al. (CHI 2024). "Better to Ask Than Assume — Proactive VA Communication Strategies". DOI 10.1145/3613904.3642193 | **AS** | proactive 介入研究 (voice assistant 設定、relationship Mirror への類推) |
| 4 | Wen, B., Yao, J., Feng, S., Xu, C., Tsvetkov, Y., Howe, B., Wang, L.L. (2025). "Know Your Limits: A Survey of Abstention in Large Language Models". TACL Volume 13, pp. 529-556. DOI 10.1162/tacl_a_00754. https://aclanthology.org/2025.tacl-1.26/ | **DS** (Counterfactual §10.2 / NC Index §10.4 隣接) | LLM abstention framework: query / model / human values 3 視点。CSI/NCI 設計基盤 |
| 5 | Kirichenko, P., Ibrahim, M., Chaudhuri, K., Bell, S.J. (2025). "AbstentionBench: Reasoning LLMs Fail on Unanswerable Questions". arXiv 2506.09038. https://arxiv.org/abs/2506.09038 | **DS** (NC Index §10.4 隣接) | 20 dataset abstention benchmark。reasoning-tuned LLM の abstention が 24% 低下 → Mirror は LLM ではなく deterministic engine という設計判断を支持 |
| 6 | Frontiers in Psychology (2025). "The algorithmic self". PMC12289686 | **DS** | AI 反射の self-model 汚染 / closed loop 強化 を実証 → hypothesis-form grammar §10.6 / Diversity Quota §10.5 の根拠 |
| 7 | Multi-Agent Collaboration Survey (arXiv 2501.06322, 2025) | **AS** | multi-agent turn-taking で speaking-token mutex (multi-agent → relationship Mirror への類推) |
| 8 | Frontiers AI (2025). "Who speaks next? Multi-party AI discussion (Murder Mystery games)". https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1582287/full | **AS** | adjacency pairs / 次話者選択 (game setting → relationship Mirror への類推、Channel Lock §10.1 補助根拠) |
| 9 | Rubin et al. (Nature Human Behaviour 2025). n=6,282, perceived human vs AI empathy. DOI 10.1038/s41562-025-02247-w / PubMed 40588597. https://www.nature.com/articles/s41562-025-02247-w | **DS** | AI-labeled empathy の受け取り低下を実証 → empathy 演技禁止 §10.6 + 観察事実のみ grammar §1.2 を直接支持 |
| 10 | JMIR (2025) e82818 — AI Chatbot for Communication Training (Rogers stance) | **AS** | reflective listening の AI 訓練文脈 (chat 文脈ではない、AS) |
| 11 | ~~Polyvagal Institute literature~~ → **格下げ** | **IO** (Metaphor Only) | secure base / co-regulation は **inspiration / metaphor** のみ。hard dependency にしない (理由: §13.2 の critique paper) |
| 12 | Bion, W.R. (1962). "Learning from Experience" | **DH / IO** | negative capability **概念 inspiration**。NC Index §10.4 の design-novel metric の着想元。AI 操作化研究は未発見 |
| 13 | Bowlby, J. attachment theory + Ainsworth secure base | **AS** | "available but not intrusive" の対人行動原理 (developmental psychology → AI 応用は AS) |
| 14 | Aneurasync 設計思想 (`memory/aneurasync-philosophy.md`) | **DS** (内部) | 中心問い「第二の自己として必要か」を Counterfactual Silence Test §10.2 に embed |
| 15 | Anthropic Constitutional AI principles (公開ドキュメント) | **AS** | fail-closed / safety-first 設計原則 (general principle) |

### 13.2 重要な critique paper (Polyvagal 格下げ根拠)

| # | critique 文献 | 適用 |
|---|--------------|------|
| 16 | Clinical Neuropsychiatry (2026). "Why the polyvagal theory is untenable. An international expert evaluation". 39 名の専門家による批判論文。https://www.clinicalneuropsychiatry.org/download/why-the-polyvagal-theory-is-untenable-... | Polyvagal theory の主要前提が現在の神経生理 / 進化学的知見と整合しない結論 → 本書 §1.4 / §10.3 の Polyvagal 引用を **IO (Metaphor Only)** に格下げ |

### 13.3 引用 hygiene 規則 (Phase B 全期間)

新規参照を追加する場合:
1. **完全な書誌情報** (著者・出版年・タイトル・venue・DOI/arXiv/URL) を明記
2. Tier 分類 (DS / AS / DH / IO) を明記
3. critique / contradiction 文献があれば併記
4. Unverified citation は実装前に削除または verified 引用に置換

---

## 14. Phase C Readiness & Phase B 終了判定

### 14.1 Phase B 成功 → 後続 Phase 候補 (CEO 補正反映)

Phase B が完了基準 (§10.5 設計書) を全て満たした場合、以下を **後続 Phase で扱う候補**:

#### Phase C 候補 (実装拡張)

| 候補 | 内容 |
|------|------|
| Production rollout | flag を Production allowlist → 全 Production 段階的展開 |
| safety_concern 応答チャネル | Mirror とは別チャネル設計 (緊急時連絡先 / 専門家紹介等) |
| rupture_signal high 系統 | Mirror 不在時の関係修復チャネル設計 |
| 個別 Bayesian update | ユーザー個別の SPEAK_THRESHOLD 自動キャリブレーション |
| Mirror Surface 多様化 | Option A 以外の表示位置検討 (Phase B では Option A 固定) |
| UI Transparent Reticence | 「Mirror が静かな理由」を UI で明示開示 (Phase B では in-memory snapshot のみ) |

#### Phase E 候補 (persistence-approved phase 必須、CEO 補正反映で明確化)

以下は **persistence layer (localStorage / Supabase user_settings / DB) が承認された Phase で初めて実装可能**。Phase B では一切実装しない:

| 候補 | 内容 | Phase B での扱い |
|------|------|----------------|
| Sleep cross-session persistence | localStorage / Supabase user_settings に sleep state を永続化 | Phase B = session-only sleep のみ |
| Stop Cascading 7-day decay | Day 0 → Day 1 → Day 2-3 → Day 4-7 → Day 8+ の段階的 threshold 減衰 | Phase B = session 終端まで強制 STAY_SILENT のみ |
| Mirror Diversity Quota 24h-7d | cross-session で同一 axis 反復回避、Fairness 7 日凍結 | Phase B = session-only anti-repeat のみ |
| Cross-session learning | per-user negative feedback memory (60 日 half-life decay) | Phase B = in-memory session-only |
| NC Index 長期 trend | canary 期間 / 全 session 平均 NC Index 計算 | Phase B = session-only diagnostic |
| Remote telemetry / Sentry | snapshot を Sentry / DB に送信、長期 audit log | Phase B = local in-memory のみ |
| Rupture risk persistent baseline | per-user の rupture_risk 履歴を保存、anomaly 検出 | Phase B = session-only history |
| Reticence audit log | 月次の reason_category 分布 / pattern 分析 | Phase B = session 内 CEO 観測のみ |

**重要**: Phase E は **persistence layer 設計 + privacy / consent 設計 + storage scope の CEO 承認**が前提。Phase B 完了後に別 docs PR で Phase E plan を起票する。

### 14.2 Phase B 不成功 → 撤退判定

以下のいずれかで Phase B 全体を撤退:

- canary 期間中に rollback 条件発動 (§7.6 設計書) で再起動できない
- CEO 完了判定で「Mirror は不要」と判定
- ユーザー継続意思が確認できない

撤退時:
- B-1 〜 B-5 を順次 revert
- `docs/coalter-aoo-phase-b-completion.md` を「Phase B 撤退」記録として起票
- 既存 presence layer / chat layer は無影響 (zero diff 維持)
- Phase A AOO 基盤は維持

### 14.3 部分成功 (Phase B 凍結)

完了基準の一部 PASS / 一部 NG の場合、CEO 判断で:
- 凍結 (Mirror Channel コードは残すが flag OFF 維持) → 学びを Phase C 設計に反映
- 部分 rollback (一部 Mirror taxonomy のみ無効化、残り運用継続)

---

## 15. Stop Conditions (実装中の halt trigger)

実装中に以下が観測されたら **当該 PR を halt + CEO に報告**。

| Phase | Halt trigger |
|-------|------------|
| B-1 | flag OFF で MirrorHost が null-render しない / `lib/coalter/presence/` に意図せず diff / mount line が 5 行超え |
| B-2 | presence layer に write が発生 / unknown handling が誤動作 |
| B-3 | bucket function に副作用 / 入出力非決定性 / unknown 検出誤り |
| B-4 | Three-Gate fail-closed AND が崩れる / SPEAK_THRESHOLD が constants から外れる / Counterfactual Silence Test bypass |
| B-5 | PII leak 1 件 / Channel Lock 取得失敗を検知できない / sleep が反映されない / Production env への投入未然 |
| B-6 | docs に code diff が混入 / Phase B 完了基準未達のまま完了宣言 |

各 halt は `docs/decision-log.md` に記録、PR を draft に戻して CEO 判断待ち。

---

## Appendix A: LOC Budget Summary

| PR | LOC budget (含む test) | 実装期間目安 |
|----|----------------------|------------|
| B-1 | ≤ 150 | 1-2 日 |
| B-2 | ≤ 100 | 0.5-1 日 |
| B-3 | ≤ 300 | 1-2 日 |
| B-4 | ≤ 400 | 2-3 日 |
| B-5 | ≤ 250 + canary 期間 | 1 週間 + canary 1-2 週間 |
| B-6 | docs のみ (≤ 400 行) | 1 日 |
| **合計** | ≤ 1200 LOC + canary 1-2 週間 | 約 3-4 週間 |

## Appendix B: Cross-Reference

| 本書 § | Phase B Design 設計書 § |
|-------|----------------------|
| §1 5-Verb Framework | §0.3 (CEO 北極星) |
| §2.1-2.6 micro-PR | §10.4 Implementation Micro-PR Split |
| §2.7.1 sequential 原則 (本書 CEO 補正) | (本書追加、Phase B Design §10.4 を更新する候補) |
| §3 Feature flag | §7.2 Kill Switch / §10.3 条件 5 |
| §4 Sleep Control (Phase B = session-only) | §8.3 Sleep Control |
| §5 頻度上限 (Phase B = session-only quota) | §2.3 / §5 axis table |
| §6 Unknown handling | §5 / §4.3 Safe Gate / §9 |
| §7 Safety handling | §6.5 / §7.6 / §9.3 |
| §8 Evidence Plan (in-memory snapshot) | §10.5 完了基準 |
| §9 不変境界 | §8.1 / §10.3 |
| §10 Novel Contributions (CEO 補正 Tier 分類済) | (本書で新規追加) |
| §13 Evidence Tier | (本書で新規追加、CEO 補正) |
| §14 Phase E 候補 (persistence-approved phase) | (本書で新規明確化、CEO 補正) |

## Appendix C: B-0 自体の制約

- 本書は **docs-only**。コード変更、env、config、schema、telemetry、remote telemetry、feature flag 起票を一切含まない
- CEO 承認 + main merge までは B-1 以降の実装は禁止
- 本書 merge 後も実装着手は CEO 個別判断 (B-1 起票時に「実装着手 GO」確認)
- 本書 §10 の Novel Contributions は **設計提案**。CEO レビューで scope 縮小 / 削減 / 凍結指示があれば対応
- 学術参照 §13 は全て公開文献。social proof のためではなく、設計判断の根拠を明示する目的
- **Phase B = session-only**。cross-session persistence は禁止。長期化は Phase E 候補 (§14.1)
- **CEO 補正反映済** (2026-05-17、14 項目、Appendix E 参照)

## Appendix D: 設計者注

- Phase B 全体を通じて **「黙る・映す・止まる・引く・誤読を避ける」** の 5-Verb を engineering 仕様に翻訳することが本書の主目的
- Negative Capability Index (§10.4) は学術論文に存在しない設計貢献。Phase B 完了時に学びを公開する余地は CEO 判断
- 本書は B-0 として **実装計画の正本**。B-1 以降の各 PR は本書を必ず参照する
- 本書 merge 後の修正は別 docs PR で対応 (本書を amend しない)

## Appendix E: CEO 補正反映記録 (2026-05-17)

CEO レビュー (PR #165 1st review) の 14 補正項目を本書に反映。

### E.1 補正項目一覧と反映先

| # | CEO 補正項目 | 反映 § |
|---|------------|--------|
| 1 | Academic Evidence Tier section 追加 | §13.0 / §13.1 |
| 2 | Horvitz 1999 → Direct Support | §13.1 row 2 |
| 3 | AbstentionBench → Direct Support (NC Index 隣接、関係 Mirror の直接根拠ではない) | §13.1 row 5 |
| 4 | Frontiers AI 2025 turn-taking → Analogical Support (game setting) | §13.1 row 8 / §10.1 |
| 5 | Rubin et al. Nature 2025 → Direct Support | §13.1 row 9 / §10.6 |
| 6 | Polyvagal → Direct Support 削除、metaphor only、Anticipatory Withdrawal の根拠を general conflict de-escalation / attachment / safety margin に置換 | §1.4 / §10.3 / §13.1 row 11 / §13.2 critique 追加 |
| 7 | Wen et al. TACL 2025 正式出典確認 → DOI 10.1162/tacl_a_00754 / TACL Vol.13 pp.529-556 / 著者全員記載 (検証済、削除せず保持) | §13.1 row 4 / §10.2 |
| 8 | Transparent Reticence "telemetry" を "local in-memory diagnostic reason snapshot" に改名、remote/persistent 一切なし | §10.8 / §8.3 / §9.5 |
| 9 | Stop Cascading 7-day decay を Phase B 不実装 (session-only) | §10.7 / §14.1 Phase E |
| 10 | Mirror Diversity Quota 24h-7d を Phase B 不実装 (session-only) | §10.5 / §5.3 / §14.1 Phase E |
| 11 | linguistic stop detection 境界明記 (明示コマンドのみ / raw utterance 保存禁止 / sentiment 推測しない / 判定後は boolean+enum のみ) | §4.2 / §12.1 |
| 12 | B-2 / B-3 並列禁止または条件付き (sequential 原則、4 条件成立時のみ並列許容) | §2.7.1 |
| 13 | NC Index は diagnostic metric のみ、Phase B PASS hard gate ではない、>0.80 tentative | §10.4 / §8.1 row 10 |
| 14 | Counterfactual Silence Test: pure deterministic engine、LLM 呼び出し禁止、入力 redacted bucket/enum/counters のみ、raw text 入力禁止、0.85 bar tentative | §10.2 |

### E.2 補正で維持された境界

- docs-only (no code / env / config / schema / telemetry / feature flag changes)
- `lib/coalter/presence/` zero diff (継承)
- `app/components/chat/` 17 files zero diff (継承)
- Production env 不可侵 (継承)
- Mirror = reflection only / Question Proposal Suggestion auto-fire 禁止 (継承)
- Always-On ≠ auto-speak (継承)
- PR #165 draft / merge-prohibited (継承)
- B-1 以降の実装着手禁止 (継承)

### E.3 補正で **追加** された境界 (Phase B 全期間)

- **cross-session persistence 一切禁止** (sleep / Stop Cascading / Diversity Quota / NC Index / rupture_risk 等すべて session-only)
- **remote telemetry / Sentry / fetch 送信 一切禁止** (旧 telemetry 表現を改名、in-memory snapshot のみ)
- **linguistic stop detection は明示コマンドのみ** (sentiment 推測禁止 / raw utterance 保存禁止)
- **micro-PR は sequential 原則** (B-2 / B-3 並列は 4 条件成立時のみ例外)
- **Counterfactual Silence Test は pure deterministic** (LLM 呼び出し禁止)
- **NC Index は diagnostic only** (PASS hard gate でなく、CEO calibration required)

### E.4 補正で **削除** された主張

- ~~Polyvagal Direct Support 引用~~ → metaphor only に格下げ
- ~~Transparent Reticence telemetry / remote disclosure~~ → local in-memory diagnostic snapshot に改名
- ~~Stop Cascading 7-day decay 実装~~ → Phase B = session-only、7-day decay は Phase E 候補
- ~~Mirror Diversity Quota 24h-7d 実装~~ → Phase B = session-only、cross-session quota は Phase E 候補
- ~~NC Index PASS hard gate >0.80~~ → diagnostic metric only、tentative
- ~~Counterfactual Silence Test での raw text 入力可能性~~ → redacted bucket/enum/counters のみ
