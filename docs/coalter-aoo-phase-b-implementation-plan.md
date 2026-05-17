# CoAlter AOO Phase B Implementation Plan (B-0)

**ステータス**: 設計計画 docs-only (CEO レビュー待ち、merge 禁止)
**起票日**: 2026-05-17
**正本**: 本書は Phase B Mirror Channel の **micro-PR 設計図と境界の正本**。設計の why は `docs/coalter-aoo-phase-b-mirror-channel-design.md` (PR #164 で main 着地済)。本書は how を扱う
**実装着手**: 本 B-0 が CEO 承認 + main merge 完了するまで **B-1 以降の実装は禁止**
**学術裏付け**: 巻末 §13 References

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
| Trigger | rupture_risk 連続値が上昇 / negative feedback 累積 / user 言語的停止 / emotional spike 検出 |
| 動作 | 段階的に SPEAK_THRESHOLD を引き上げ (本書 §10.3 Anticipatory Withdrawal) |
| 学術根拠 | Bowlby attachment theory secure base (available but not intrusive) + Polyvagal Institute co-regulation literature |
| 測定指標 | withdrawal 発動率 / withdrawal 後の rupture 発生率 (predictive vs reactive) |

### 1.5 誤読を避ける (Avoid Misreading) — epistemic humility

| 項目 | 仕様 |
|------|------|
| 必須機構 | Counterfactual Silence Test (本書 §10.2) / Mirror Diversity Quota / Transparent Reticence (withdrawal 理由ログ) |
| Grammar 補強 | uncertainty が高いほど語尾を柔らかく ("〜みたい" → "〜だろうか" 順に変化させない、観察事実のみ堅持) |
| 学術根拠 | Wen et al. TACL 2025 "Know Your Limits" / verbalized confidence over-claim 研究 |
| 測定指標 | Post-Speak Verification 文体 fail 率 / 同一 Mirror 反復率 (anti-anchoring) |

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

### 4.2 言語的停止導線 (CEO 必須化)

| Trigger 表現 | 検出方法 |
|-------------|----------|
| 「黙ってて」 | 正規表現 + 完全一致リスト |
| 「今は不要」 | 同上 |
| 「Mirror いらない」 | 同上 |
| 「映さなくていい」 | 同上 |
| 「静かにして」 | 同上 |
| 「うるさい」 + Mirror が直前に出ていた場合 | 文脈条件付き検出 |

検出キーワードリストは B-5 で別 const file 化、CEO レビュー後に拡張。

### 4.3 停止検出時の動作

1. `user_override.sleep` を ON 相当として扱う
2. 該当 session 以降 Safe Gate で必ず fail-close
3. 最低 **24 時間有効** (localStorage に expire timestamp 記録)
4. 24 時間後は baseline に戻るが、stop cascading (§10.7) により 7 日間 SPEAK_THRESHOLD を上方寄せ
5. UI に「Mirror を sleep にしました」1 行 toast のみ (Mirror 形式の反射は禁止)

### 4.4 sleep 中の挙動

- 観測蓄積 (Phase A `RelationshipState` 更新) は継続
- Mirror 候補生成は **行わない** (ERV 計算前に Safe Gate fail-close)
- telemetry には `STAY_SILENT (user_sleep)` として記録 (PII firewall 経由)

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

### 5.3 Per-taxonomy soft cap (本書 §10.5 新設 Mirror Diversity Quota)

| Mirror taxonomy | per-session 上限 | 反復防止 |
|----------------|----------------|----------|
| State | 1 | 同一 axis を session 内で繰り返さない |
| Difference | 1 | 同一文脈の差分を 24 時間内に繰り返さない |
| Tempo | 1 | 同 |
| Fairness | 1 | 同一テーマで 7 日内に繰り返さない (最も慎重) |
| Repair | 1 | severity = "mild" のみ、24 時間内反復禁止 |

理由: 同一 axis の繰り返しは self-model anchoring を強化 (Frontiers 2025)。

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

### 6.2 観測ログ

各 unknown trigger を telemetry に `STAY_SILENT (unknown:<axis>)` 形式で記録。canary 期間中の頻度分布を観測し、unknown が頻発するなら upstream 観測を改善する判断材料に。

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
| 1 | per-session SPEAK 率 | telemetry 集計 | 平均 < 5% (圧倒的に STAY_SILENT) | 閾値見直し / 軸計算見直し |
| 2 | PII leak | telemetry 全件 grep + Mirror 文字列スキャン | **0 件** | 即時 rollback (§7.6 rollback 条件) |
| 3 | 誤発話 (false-positive) | CEO + 人間レビュアー 2 名による事後監査 | < 5% (canary 期間中の SPEAK 判断) | threshold 引き上げ / Three-Gate 強化 |
| 4 | negative feedback | UI 「これは要らない」ボタン / 設定 sleep ON 数 | < 5 件 / canary 期間 | rollback |
| 5 | UI 違和感 feedback | 自由記述 / Hotjar 等は使わない (Phase B 範囲外) → CEO 直接ヒアリング | < 3 件 | rollback |
| 6 | sleep control 動作 | toggle ON 時 / 言語停止検出時の STAY_SILENT 率 | 100% | sleep logic bug 修正 |
| 7 | session cap (1/session) | telemetry の SPEAK 回数 / session | 全 session で ≤ 1 | cap logic bug 修正 |
| 8 | Channel Coordination Lock | presence 発話と Mirror 発話の同 turn 内発生件数 | **0 件** | lock logic bug 修正 |
| 9 | Mirror Diversity Quota | 同一 axis 反復率 | 24h 内反復 0 件 | quota logic bug 修正 |
| 10 | NC Index (本書 §10.4) | uncertainty-triggered STAY_SILENT 率 | > 80% (uncertainty 高い時はほぼ silent) | uncertainty 閾値見直し |
| 11 | 既存 presence layer 不可侵 | diff チェック (git) | `lib/coalter/presence/` diff = 0 | revert |
| 12 | 既存 chat layer 不可侵 | diff チェック (git) | `app/components/chat/` 17 files diff = 0 | revert |
| 13 | Production env 不可侵 | `vercel env ls production \| grep mirror` | 0 件 | env 削除 |
| 14 | Question / Proposal auto-fire | Mirror 文の grammar スキャン (正規表現「？」「ほうがいい」「みては」) | 0 件 | post-speak verify 文体検証 強化 |
| 15 | rollback drill | kill switch OFF 操作で Mirror 即時停止 | 1 回 OFF → 即時停止確認 | flag guard 強化 |

### 8.2 観測期間と判定者

- canary 期間: 1-2 週間 (CEO 判断、最低 1 週間)
- 判定者: CEO (主観 + 上記 15 項目の objective evidence)
- 完了 docs: `docs/coalter-aoo-phase-b-completion.md` (B-6 PR で起票)

### 8.3 telemetry 構造

```typescript
type MirrorTelemetryEvent = {
  decision: "SPEAK" | "STAY_SILENT";
  reason_category: "speak_passed" | "uncertainty" | "safety_concern" |
                   "rupture_high" | "unknown_modeContext" | "unknown_bucket" |
                   "frequency_cap" | "user_sleep" | "user_language_sleep" |
                   "channel_lock_held" | "counterfactual_silent" |
                   "diversity_quota" | "anticipatory_withdraw" |
                   "post_speak_verify_fail";
  erv_value: number | null;
  gate_fail: "observe" | "worth" | "safe" | null;
  mirror_kind: "state" | "difference" | "tempo" | "fairness" | "repair" | null;
  modeContext: "normal" | "daily" | "travel" | "unknown";
  matched_bucket: "safety_concern" | "rupture_signal_high" |
                  "rupture_signal_mild" | "unknown_category" | null;
  redacted_relationship_key: string;  // sha256 + salt + base64url (Phase A 同形式)
  timestamp_ms: number;
};
```

**raw PII 含まない**: Phase A の PII firewall パターンを継承。

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

### 9.5 route / API / DB / Sentry / telemetry 禁止 (Phase B 範囲)

- 新規 API route 追加禁止 (`app/api/*` への新規 file 一切)
- 既存 API 経由の DB 書き込み禁止
- Supabase 直接書き込み禁止
- migration ファイル追加禁止
- Sentry SDK 統合一切禁止 (本書 §8.3 の telemetry は **redacted snapshot を console log 形式のみ**で送出。production Sentry 連携は Phase C 候補)
- 新規 telemetry エンドポイント禁止

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

**学術根拠**:
- arXiv 2501.06322 (Multi-Agent Collaboration Survey 2025): multi-agent turn-taking で speaking-token mutex の必要性が指摘
- Frontiers AI 2025 "Who speaks next": adjacency pairs ベースの優先順位 + 単一 speaking-token mutex で衝突解決可能

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

### 10.2 Counterfactual Silence Test — 「黙ったら何が起きるか」の事前評価

**問題**: ERV > threshold ∧ Three-Gate PASS だけでは不十分。「**SPEAK しなかったらユーザーに何が起きるか**」を事前に評価して、損失が許容範囲なら STAY_SILENT を選ぶ。

**学術根拠**:
- Wen et al. TACL 2025 "Know Your Limits": LLM の abstention は損失評価ベースで設計すべき
- 設計書 §0.2 Aneurasync 中心問い「**ユーザーの第二の自己として必要か？**」を algorithmic に embed する手段

**仕様**:

```typescript
// lib/coalter/mirror/counterfactualSilenceTest.ts (B-4 で実装)
type CounterfactualOutcome =
  | "user_misses_small_observation"   // 許容 → STAY_SILENT
  | "user_misses_meaningful_insight"  // 損失あり → SPEAK 候補維持
  | "user_takes_harmful_action"       // Phase B 範囲外 → 常に STAY_SILENT (safety_concern routing)
  | "no_difference";                  // 中立 → STAY_SILENT

function counterfactualSilenceTest(
  ervValue: number,
  bucket: BucketKind,
  modeContext: ModeContext,
): CounterfactualOutcome {
  // (a) bucket = safety_concern → "user_takes_harmful_action" → STAY_SILENT (Phase B 範囲外)
  // (b) ERV < 0.85 → "user_misses_small_observation" → STAY_SILENT (high bar)
  // (c) ERV ≥ 0.85 ∧ bucket = null ∧ modeContext ≠ "travel" → "user_misses_meaningful_insight" → SPEAK 候補
  // (d) other → "no_difference" → STAY_SILENT
}
```

**Phase B の挙動**:
- ほぼ常に STAY_SILENT (high bar 0.85 で SPEAK 機会を絞る)
- Three-Gate を通過した SPEAK 候補に対して、最後の追加チェックとして機能

**実装位置**: B-4 (pure engine)
**測定指標**: Counterfactual test 通過率 (PASS 基準: SPEAK 全件のうち通過 100%、未通過は STAY_SILENT に fail-close)

### 10.3 Anticipatory Withdrawal — rupture を予防する段階的後退

**問題**: 既存設計の `rupture_flag` は **反応的** (rupture 発生後に立つ)。人間以上に関係を壊さない AI には、**rupture 予兆段階での後退**が必要。

**学術根拠**:
- Polyvagal theory (Porges) co-regulation: safety cue の連続性が rupture を防ぐ
- Bowlby attachment "secure base": 不安が高まる時点で intrusive にならず available に
- Anthropic Constitutional AI: 害が発生してから止めるのではなく、害が発生する前に避ける

**仕様**:

```typescript
// lib/coalter/mirror/anticipatoryWithdrawal.ts (B-4 で実装)
type RuptureRisk = number;  // 0.0 - 1.0

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

`ruptureRisk` の計算は B-3 bucket inference の延長で pure function 化:
- 過去 N ターンの negative tone 比率
- ユーザー側の disengagement signal (短文化、return 頻度低下)
- alignment_signal の急落
- silence_budget の急上昇

**実装位置**: B-4 (pure engine)
**測定指標**: Anticipatory Withdrawal 発動率 / withdrawal 後の rupture 発生率 (predictive vs reactive 効果)

### 10.4 Negative Capability Index (NC Index) — 「黙れる AI」の定量指標

**問題**: 「人間以上に関係を壊さない AI」を **測定可能な単一指標**にする必要がある。

**学術根拠**:
- Bion 1962 negative capability: 不確実性を**保持**する能力
- 直接的な NC metric 研究は **未発見** (design-novel territory)
- 隣接研究: AbstentionBench (35,000 query LLM abstention 評価) / Wen et al. TACL 2025 / verbalized confidence over-claim 研究

**仕様** (新規提案):

```
NC Index = (silence_rate_under_uncertainty) × (1 - over_claim_rate) × (resistance_to_premature_closure)

where:
  silence_rate_under_uncertainty = STAY_SILENT(uncertainty > 0.4) / TOTAL(uncertainty > 0.4)
  over_claim_rate = SPEAK(confidence < 0.6) / SPEAK_TOTAL
  resistance_to_premature_closure = STAY_SILENT(N consecutive turns) / N_total_turns
```

**Phase B PASS 基準**: NC Index > 0.80

**実装位置**: B-5 (telemetry 集計、専用 emit イベント)
**測定指標**: NC Index 値 (canary 期間平均、CEO 完了判定の重要根拠)

**design-novel claim**: 本指標は学術論文に存在しない。CoAlter Phase B での運用結果は将来公開する余地あり (但し本書 scope 外)。

### 10.5 Mirror Diversity Quota — 自己モデル汚染防止

**問題**: Frontiers 2025 "algorithmic self" は AI 反射が **closed loop で self-concept を固定化**することを実証。同一 axis の Mirror を反復すると、ユーザーは「自分はそういう人間だ」と過剰一般化する。

**学術根拠**:
- Frontiers Psychology 2025 (PMC12289686): AI と人間の self-expansion theory で「閉ループ強化」が実証
- self-expansion theory: anthropomorphic AI は self-concept の一部に取り込まれる

**仕様**:

```
- 同一 axis (state / tempo / fairness / etc.) の Mirror は最低 3 回の SPEAK 機会 (= 3 Three-Gate PASS 機会) を待つ
- Fairness Mirror は最も慎重: 同一テーマで 7 日間反復禁止
- Repair Mirror: 24 時間内反復禁止
- diversity quota の counter は per-user (redacted key 別) に in-memory store
```

**実装位置**: B-4 (pure engine) / B-5 (in-memory store)
**測定指標**: 24h 内同一 axis 反復率 (PASS 基準: 0%)

### 10.6 Hypothesis-Form Mirror Grammar — declaration 禁止

**問題**: 「**あなたは X です**」型の declaration は self-model 汚染が実証済 (Frontiers 2025)。Mirror grammar を hypothesis 形式 (観察事実 + hedge) に固定する。

**学術根拠**: Frontiers 2025 (algorithmic self) + Nature 2025 (authenticity gap)

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

### 10.7 Stop Cascading — 言語停止の時間減衰伝播

**問題**: ユーザーが 1 度「黙ってて」と言ったら、24 時間で完全 baseline に戻すのは過敏。**段階的減衰** で信頼を取り戻す。

**学術根拠**:
- aversive conditioning 理論: 嫌悪刺激の学習は positive 学習より長期保持
- attachment 修復理論: 一度の rupture 後の repair には複数の secure base interaction が必要

**仕様**:

```
Day 0 (停止検出): user_override.sleep = true, 全 Mirror STAY_SILENT
Day 1: baseline + SPEAK_THRESHOLD +0.20 (= 0.95)
Day 2-3: baseline + SPEAK_THRESHOLD +0.15 (= 0.90)
Day 4-7: baseline + SPEAK_THRESHOLD +0.10 (= 0.85)
Day 8+: baseline (0.75)
```

`user_override.sleep` 完全解除は Day 1 (24 時間後)、ただし SPEAK_THRESHOLD は 7 日間段階的に戻す。

**実装位置**: B-5 (sleep store + threshold modulation)
**測定指標**: sleep 解除後の SPEAK 率 / 再 sleep ON 率

### 10.8 Transparent Reticence — 沈黙の理由を後から開示可能に

**問題**: ユーザーは「**なぜ何も言わないのか**」を疑問に思う場合がある (rare だが現実的)。Black box silence は不安を生む。

**学術根拠**:
- Bowlby attachment "secure base": available marker が必要
- OECD 2026 agentic AI: 透明性 (transparency) は agentic AI のガバナンス要件

**仕様** (Phase B 範囲、UI 拡張は Phase C 候補):

```
- 全 STAY_SILENT 判断を telemetry に reason_category 付きで記録 (本書 §8.3)
- UI 側で「Mirror が静かな理由」を **明示的に問われた場合のみ** redacted 形式で開示
- Phase B では UI 拡張せず、telemetry 記録のみ (UI 拡張は Phase C で別 docs PR)
```

**実装位置**: B-5 telemetry + reason_category enum
**測定指標**: reason_category 分布

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

### 11.3 ユーザーが「監視されている」と感じる

| シナリオ | 防御層 |
|---------|--------|
| Mirror が連続発火 | Per-session cap = 1 / Mirror Diversity Quota |
| 同じ axis を繰り返す | Diversity Quota 24h-7d 反復禁止 |
| 私的領域を反射 | bucket = safety_concern → STAY_SILENT |
| sleep が効かない | localStorage + 言語停止 + 7 日 stop cascading |
| 文面が侵入的 | hypothesis-form grammar 固定 + Post-Speak Verification |

### 11.4 Mirror が user の self-narrative を歪める

| シナリオ | 防御層 |
|---------|--------|
| Declaration 文 ("あなたは X") | Grammar 制約 §10.6 / Post-Speak Verification |
| 同一観察の反復 anchoring | Diversity Quota / 24h-7d 反復禁止 |
| 当てはまり感の心理操作 | uncertainty > 0.4 で STAY_SILENT |
| 自己解釈の代行 | Mirror = reflection-only / Question・Proposal 禁止 |

### 11.5 Rupture cascade scenario

| シナリオ | 防御層 |
|---------|--------|
| 1 回の誤発話 → user 不快 → 再発火 | Anticipatory Withdrawal (rupture_risk 上昇で threshold 引上) |
| 「黙ってて」→ 1 日後通常発火 → 再不快 | Stop Cascading (7 日間 threshold 上方寄せ) |
| Negative feedback 5 件で rollback | Rollback condition (§7.6 設計書) |

---

## 12. Test Plan (Layered)

### 12.1 Unit (B-2 / B-3 / B-4)

| 対象 | テスト範囲 | 期待カバレッジ |
|------|----------|--------------|
| modeContextReader (B-2) | 各 PresenceMode 値 + unknown | 100% |
| observerActivationAdapter (B-2) | active / inactive / undefined | 100% |
| bucket inference (B-3) | 5 種 × 境界値 + unknown | ≥ 95% |
| ERV (B-4) | NaN / Infinity / 各軸の境界 | ≥ 90% |
| Three-Gate (B-4) | AND fail-closed 全パターン | 100% |
| Counterfactual Silence Test (B-4) | 4 outcome 全パターン | 100% |
| Anticipatory Withdrawal (B-4) | rupture_risk 段階 4 区分 | 100% |
| Diversity Quota (B-4) | 反復シナリオ + 時間経過 | ≥ 90% |

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

## 13. Academic Foundations (References)

| # | 出典 | 適用先 |
|---|------|--------|
| 1 | OECD AI Papers No. 56 (Feb 2026) "The Agentic AI Landscape and Its Conceptual Foundations" | autonomy-low 役割定義 / governance |
| 2 | Horvitz, E. (1999). "Principles of Mixed-Initiative User Interfaces". CHI '99 | expected utility 閾値 / default silence |
| 3 | Wang et al. (CHI 2024). "Better to Ask Than Assume". DOI 10.1145/3613904.3642193 | proactive 介入は safety-critical 限定支持 |
| 4 | Wen et al. (TACL 2025). "Know Your Limits: A Survey of Abstention in LLMs" | abstention 設計 / NC Index 設計基盤 |
| 5 | AbstentionBench (2024) | NC Index 設計参考 |
| 6 | Frontiers in Psychology (2025). "The algorithmic self". PMC12289686 | hypothesis-form grammar / Diversity Quota 根拠 |
| 7 | Multi-Agent Collaboration Survey (arXiv 2501.06322, 2025) | Channel Coordination Lock 設計参考 |
| 8 | Frontiers AI (2025). "Who speaks next?" Turn-taking | Channel Lock 優先順位 |
| 9 | Rubin et al. (Nature Human Behaviour 2025). n=6,282 perceived human vs AI empathy | 共感の演技禁止 / 観察事実のみ |
| 10 | JMIR (2025) e82818 — AI Chatbot Communication Training (Rogers stance) | reflective listening AI 化 |
| 11 | Polyvagal Institute literature | secure base / digital co-regulation 近似 |
| 12 | Bion, W.R. (1962). "Learning from Experience" | negative capability 概念 |
| 13 | Bowlby, J. attachment theory + Ainsworth secure base | available but not intrusive |
| 14 | Aneurasync 設計思想 (`memory/aneurasync-philosophy.md`) | 中心問い「第二の自己として必要か」 |
| 15 | Anthropic Constitutional AI principles | fail-closed / safety-first |

---

## 14. Phase C Readiness & Phase B 終了判定

### 14.1 Phase B 成功 → Phase C 候補

Phase B が完了基準 (§10.5 設計書) を全て満たした場合、以下を **Phase C で扱う候補**:

| 候補 | 内容 |
|------|------|
| Production rollout | flag を Production allowlist → 全 Production 段階的展開 |
| safety_concern 応答チャネル | Mirror とは別チャネル設計 (緊急時連絡先 / 専門家紹介等) |
| rupture_signal high 系統 | Mirror 不在時の関係修復チャネル設計 |
| 個別 Bayesian update | ユーザー個別の SPEAK_THRESHOLD 自動キャリブレーション |
| Sleep 持続層 | localStorage → Supabase user_settings 移行 |
| Transparent Reticence UI 拡張 | 「Mirror が静かな理由」を UI で明示開示 |
| Mirror Surface 多様化 | Option A 以外の表示位置検討 (Phase B では Option A 固定) |
| Cross-session learning | per-user negative feedback memory (Phase B では in-memory) |

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
| §3 Feature flag | §7.2 Kill Switch / §10.3 条件 5 |
| §4 Sleep Control | §8.3 Sleep Control |
| §5 頻度上限 | §2.3 / §5 axis table |
| §6 Unknown handling | §5 / §4.3 Safe Gate / §9 |
| §7 Safety handling | §6.5 / §7.6 / §9.3 |
| §8 Evidence Plan | §10.5 完了基準 |
| §9 不変境界 | §8.1 / §10.3 |
| §10 Novel Contributions | (本書で新規追加) |

## Appendix C: B-0 自体の制約

- 本書は **docs-only**。コード変更、env、config、schema、telemetry、feature flag 起票を一切含まない
- CEO 承認 + main merge までは B-1 以降の実装は禁止
- 本書 merge 後も実装着手は CEO 個別判断 (B-1 起票時に「実装着手 GO」確認)
- 本書 §10 の Novel Contributions は **設計提案**。CEO レビューで scope 縮小 / 削減 / 凍結指示があれば対応
- 学術参照 §13 は全て公開文献。social proof のためではなく、設計判断の根拠を明示する目的

## Appendix D: 設計者注

- Phase B 全体を通じて **「黙る・映す・止まる・引く・誤読を避ける」** の 5-Verb を engineering 仕様に翻訳することが本書の主目的
- Negative Capability Index (§10.4) は学術論文に存在しない設計貢献。Phase B 完了時に学びを公開する余地は CEO 判断
- 本書は B-0 として **実装計画の正本**。B-1 以降の各 PR は本書を必ず参照する
- 本書 merge 後の修正は別 docs PR で対応 (本書を amend しない)
