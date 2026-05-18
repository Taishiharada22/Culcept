# CoAlter Always-On Observer — Phase B Mirror Channel 設計

**ステータス**: Phase B **conditional pass で正式 close** (2026-05-18、`docs/coalter-aoo-phase-b-completion.md` 正本) / 本設計書は設計 reference として保持
**起票日**: 2026-05-17
**Phase B 完了日**: 2026-05-18 (CEO 実機 B-5c smoke で core safety 全項目 PASS / visible Mirror full validation は Phase C 持ち越し)
**CEO レビュー反映日**: 2026-05-17（10 決定点を §10.2 RESOLVED 表 / §10.4 / §10.5 に反映）
**前提**: Phase A 正式完了 (`docs/coalter-aoo-phase-a-completion.md`)
**学術基盤**: Mixed-initiative interaction (Horvitz, 1999) / Reflective listening (Rogers) / Expected Value of Information (decision theory) / OECD AI agent definition (2024)

> ## 🏁 Phase B 完了通知 (2026-05-18)
>
> 本設計書 (PR #164) の Phase B 実装 (B-1〜B-5c、PR #171〜#183) は **2026-05-18 に conditional pass で正式 close**。
> 完了正本: `docs/coalter-aoo-phase-b-completion.md`
>
> ### Phase B 達成定義 (CEO 補正の正確な表現、絶対遵守)
> - ✅ **safe default / no-disruption / no-leak / runtime guarded foundation validated**
> - ❌ **NOT "visible Mirror fully validated"** — visible Mirror 経路の実機検証は **Phase C** で行う
>
> ### 未到達項目 (Phase C handoff scope、`coalter-aoo-phase-b-completion.md` §4 / §8)
> - visible Mirror 経路の実機発火 (C-2 read-only presence adapter + C-3 visible canary)
> - close / sleep / cap / verification の実機確認 (C-4)
> - diagnostic global の Preview 表示 (C-1 で `NODE_ENV` guard 緩和、Phase A §3.5 学び反映)
> - `linguisticStopDetector` runtime 接続 (Phase C scope 再判断、別 PR 候補)
> - taxonomy 拡張 Difference / Tempo / Fairness / Repair (C-5 で検討、実装は別)
>
> ### Phase B canon (Phase C 以降不変、`coalter-aoo-phase-b-completion.md` §7.4)
> default-STAY_SILENT 構造保証 / 7-layer postSpeakVerification / 4-gate visible orchestration / PII firewall (型 + runtime) / 4-layer flag gating / hedged grammar template only / retreat affordance / session-local persistence のみ / enum-locked template id / shadow mode pattern
>
> ### 本設計書の今後の扱い
> 設計書本体 (§0〜§10) は **Phase C 設計の reference** として保持。新規実装は本設計書ではなく、`docs/coalter-aoo-phase-b-completion.md` + Phase C C-0 design (起票予定) を正本とする。

---

> ## ✅ CEO レビュー結果反映済 (2026-05-17)
>
> 本設計書は **CEO レビューを通過し、10 決定点が確定**。
>
> - 10 決定点 → §10.2 RESOLVED 表
> - 実装 Micro-PR 分割 (B-0〜B-6) → §10.4
> - Phase B 完了基準 → §10.5
> - 関連 inline 反映: §2.3 (頻度上限 1/session 初期) / §3.3 (SPEAK_THRESHOLD = 0.75) / §5 (time_since_last_speak 必須) / §6.5 (Repair Mirror 軽微限定) / §7.6 (rollback 拡張) / §8.2-8.3 (Option A 確定 + 言語停止導線必須) / §9 (Phase B 前必須項目化)
>
> **実装着手・PR #164 merge・Ready 化は引き続き CEO 判断待ち** (本注記は 2026-05-17 時点、Phase B は 2026-05-18 完了済み)。

---

## 0. Executive Summary

### 0.1 Phase B の位置づけ

Phase A (観測のみ) を完了し、観測結果が `RelationshipState` として静かに蓄積されている。Phase B は **その観測を「鏡 (Mirror)」として返す**チャネルを追加する。

**最上位原則** (Phase A から継承 + Phase B で深化):

1. **Always-On ≠ 自動発話** (Phase A から継承)
2. **Mirror = reflection, not proposal** (Phase B で確立)
3. **Default = STAY_SILENT** (Phase B で確立)
4. **発話判断は Expected Relationship Value (ERV) を基準とする** (Phase B で確立)

### 0.2 Mirror の定義

> **Mirror は、観測したことを「あなたはこう動いている」と静かに返す行為**。提案 (proposal) ではない、誘導 (nudge) でもない、解決 (solution) でもない。

提案・誘導・解決の自動発話は Phase B の scope 外（Phase C 以降、別途明示的設計）。

### 0.3 ゴール

- 観測結果のうち、**ユーザーの関係性理解に貢献するもの**を、**最小限の摩擦で**反射する
- 「CoAlter は何を見ているか」がユーザーに伝わる窓を作る
- ただし、それは **静かな鏡** であり、雄弁な助言者ではない

### 0.4 非ゴール

- Question / Proposal / Suggestion の自動発話（Phase C 以降）
- 既存 presence layer の改修（不可侵境界）
- Chat body への自動挿入（UI policy で明示禁止）
- 多弁な分析の表示（Mirror taxonomy の 5 種以外は禁止）

---

## 1. Mirror = Reflection, Not Proposal

### 1.1 反射と提案の境界

| Type | 例 | Phase B での扱い |
|------|----|----------------|
| **Reflection (反射)** | 「最近、決断のスピードが普段より遅いみたい」 | ✅ 許可 |
| **Description (記述)** | 「3 回連続でこの相手に長文返信している」 | ✅ 許可 |
| **Question (質問)** | 「これって何か理由がある？」 | ❌ Phase B 禁止 |
| **Proposal (提案)** | 「少し休んでみたら？」 | ❌ Phase B 禁止 |
| **Solution (解決)** | 「こう返信してみては？」 | ❌ Phase B 禁止 |
| **Nudge (誘導)** | 「今、声をかけるといい時間かも」 | ❌ Phase B 禁止 |

### 1.2 なぜ reflection 限定か

- 提案・誘導・解決は **「介入 (intervention)」** であり、関係性の自律性を侵食する
- 反射は **「観測のフィードバック」** であり、ユーザー自身が判断する余地を保つ
- Aneurasync 設計思想の中心問い「**この機能は、ユーザーの第二の自己として必要か？**」に照らして、第二の自己 = **観察と内省を補助するもの**であり、決定を代行するものではない

### 1.3 文体規約

- 一人称 (CoAlter) ではなく、観測事実の単純記述を優先
- 「〜だと思う」「〜したほうがいい」禁止
- 「〜している (ように見える)」「〜が続いている」許可
- 1 Mirror = 1 文 (最大 2 文)
- 14-40 文字目安（Alter 声の制約に準拠）

---

## 2. Default STAY_SILENT

### 2.1 デフォルト動作

Mirror Channel の **デフォルトは沈黙 (STAY_SILENT)**。

- Speak Decision Engine が **明示的に SPEAK と判断したときのみ** Mirror を出力
- それ以外はすべて STAY_SILENT（観測蓄積は継続、表示なし）
- ユーザー操作が必要な場合は Mirror Channel を経由しない（既存 Question UI は Phase B 範囲外）

### 2.2 STAY_SILENT を優先する根拠

| 根拠 | 内容 |
|------|------|
| Horvitz mixed-initiative principle | エージェントの介入は **expected value > expected cost** が成立するときのみ |
| Reflective listening 原則 | 沈黙は最も強力な反射手段の一つ |
| CoAlter 既存原則 | Question 系統で「自動発火禁止」が確立済 (Phase A 継承) |
| 観測の信頼性 | Mirror が安易に出るとユーザーは「監視されている」感を強める |

### 2.3 SPEAK 判断の頻度上限 (CEO 確定 2026-05-17)

- **初期 Preview canary 期間**: 1 セッション内で Mirror 出現は **最大 1 回**（hard cap）
- **安定後 (false-positive 率 < 5% 達成後)**: 最大 2 回 / session へ拡張可能（CEO 承認必須）
- 連続 Mirror 禁止（最低 5 ターン間隔）
- `time_since_last_speak` は Worth Gate の **必須入力**（§5 参照）
- ユーザーが Mirror を sleep にしている場合 (§8.3) は **常に STAY_SILENT**
- ユーザーが「黙ってて」「今は不要」と言った場合は `user_override.sleep` を ON 相当として扱い、その session 以降 **必ず STAY_SILENT**

---

## 3. Expected Relationship Value (ERV) Speak Decision Engine

### 3.1 ERV の定義

> **ERV (Expected Relationship Value)** = Mirror を 1 回返すことで、ユーザーの**関係性理解**が改善する期待値。コストは「ユーザーの注意 (attention) 消費」「介入による関係性自律性の侵食」「false-positive 時の信頼毀損」。

$$
\text{ERV} = \mathbb{E}[\Delta \text{Understanding}] - \mathbb{E}[\text{AttentionCost}] - \mathbb{E}[\text{AutonomyCost}] - \mathbb{E}[\text{TrustRisk}]
$$

### 3.2 判定式

```
if ERV > SPEAK_THRESHOLD AND Three-Gate Mirror ALL PASS:
    decision = SPEAK
else:
    decision = STAY_SILENT
```

### 3.3 SPEAK_THRESHOLD のキャリブレーション (CEO 確定 2026-05-17)

- **初期値**: ERV ≥ **0.75** (0.0-1.0 normalized) — 高保守的設定で false-positive を最小化
- **0.65 への緩和** は将来の候補として残す。緩和には以下すべての達成が必要:
  - Preview canary 期間 6 週間以上の安定運用
  - false-positive 率 < 3% 維持
  - UI 違和感 / 邪魔フィードバック 0 件
  - CEO 承認
- ユーザーごとの **silence_preference**（§8）で個別に閾値を上方調整可能（緩和方向の個別調整は不可）
- 緩和実施時は別途 docs PR で「閾値緩和判断」を起票し、CEO 承認後に flag rollout

### 3.4 ERV 計算の入力軸

§5 で詳述する 9 軸を ERV 計算に投入。各軸の重みは Phase B 観測期間中に Bayesian update。

---

## 4. Three-Gate Mirror (Observe / Worth / Safe)

ERV しきい値だけでは不十分。**3 つの独立 Gate を全て通過しないと SPEAK しない**。

### 4.1 Gate 1: Observe Gate（観測の十分性）

**目的**: 反射する根拠となる観測が十分に蓄積されているか。

| 条件 | 説明 |
|------|------|
| `observationCount ≥ MIN_OBS` | 最小観測数（初期値 3） |
| `lastObservationAt` が直近 30 分以内 | 古い観測に基づく反射は禁止 |
| `matchedPatternCategory` が確定している | unknown_category のみでは SPEAK しない |
| 観測の **diversity_score** が一定以上 | 同じ signal の繰り返しだけでは弱い |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。

### 4.2 Gate 2: Worth Gate（反射する価値）

**目的**: その反射がユーザーにとって新規 (novel) かつ意味がある (meaningful) か。

| 条件 | 説明 |
|------|------|
| `observation_novelty ≥ 0.5` | 既知パターンの再表示は禁止 |
| `silence_budget < 0.7` | 既に十分発話している会話では追加しない |
| `conversation_phase` が反射受容可能 | 会話の入口 (greeting) や緊急時は不可 |
| `time_since_last_speak ≥ 5 turn` | 連続 Mirror 防止 |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。

### 4.3 Gate 3: Safe Gate（安全性）

**目的**: 反射がユーザーを傷つけない、関係性を悪化させない、誤解を生まないか。

| 条件 | 説明 |
|------|------|
| `rupture_flag` が立っていない | 関係性断裂兆候時は Mirror 禁止（沈黙が安全） |
| `matchedPatternCategory ≠ safety_concern` | 安全関心 bucket は Mirror 範囲外（別チャネル） |
| `uncertainty ≤ 0.4` | 高不確実性の観測を断定的に反射しない |
| `user_override.sleep` が false | ユーザー sleep 設定遵守 |
| PII firewall PASS | raw pairStateId 等が Mirror 文面に混入しない |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。ログには `gate_fail_reason` を記録。

### 4.4 Three-Gate の論理積

```
SPEAK iff (Observe Gate PASS) AND (Worth Gate PASS) AND (Safe Gate PASS) AND (ERV > SPEAK_THRESHOLD)
```

**いずれか 1 つでも Fail なら STAY_SILENT**。AND 条件で fail-closed.

---

## 5. Input Axes (Speak Decision Engine 入力 9 軸)

Speak Decision Engine と Three-Gate Mirror が共通参照する 9 軸。

| # | 軸 | 範囲 | 由来 | 用途 | 必須/任意 |
|---|----|------|------|------|----------|
| 1 | `silence_budget` | 0.0-1.0 | 会話内発話量比率 | Worth Gate | **必須** |
| 2 | `observation_novelty` | 0.0-1.0 | 既知パターン差分 | Worth Gate, ERV | **必須** |
| 3 | `rupture_flag` | bool | Phase A `RelationshipState` 由来 | Safe Gate | **必須** |
| 4 | `alignment_signal` | 0.0-1.0 | 観測と既知パターンの整合度 | ERV | **必須** |
| 5 | `uncertainty` | 0.0-1.0 | 観測信頼度の補数 | Safe Gate | **必須** |
| 6 | `modeContext` | "normal" \| "daily" \| "travel" \| "unknown" | 既存 PresenceMode | ERV, Worth Gate, Safe Gate | **必須** (unknown は Mirror 禁止) |
| 7 | `conversation_phase` | "greeting" \| "in_progress" \| "closing" \| "emergent" | チャット会話状態 | Worth Gate | **必須** |
| 8 | `time_since_last_speak` | turn 数 | Mirror 履歴 | Worth Gate | **必須** (CEO 確定 2026-05-17) |
| 9 | `user_override.sleep` | bool | ユーザー設定 | Safe Gate（最優先、ON で必ず STAY_SILENT） | **必須** |

**CEO 確定 (2026-05-17)**: 9 軸すべてを **必須入力**化。いずれかが未取得 / unknown の場合は ERV を計算せず STAY_SILENT。特に `modeContext = "unknown"` のとき、および bucket inference が未確定 (§9.3) のときは Mirror 発話禁止。

### 5.1 各軸の供給元

- 1, 2, 4, 5: `RelationshipState` から派生（Phase A 観測由来）
- 3: `recentReasonCodes[]` に rupture-related code が含まれるか
- 6: 既存 `lib/coalter/presence/types.ts` の `PresenceMode`
- 7: チャット session の最新 N ターンから推定
- 8: Mirror 出力履歴（新規 store, §9.1 参照）
- 9: ユーザー設定（新規 UI, §8 参照）

### 5.2 軸の永続化と整合性

- 1〜5, 8 はセッション内 in-memory（既存 `RelationshipState` への追加検討は §9.1）
- 6 は既存 presence layer から read-only 参照（**書き込み禁止**）
- 7 は推定エンジン側で都度算出
- 9 は localStorage + 将来的に Supabase ユーザー設定テーブル（Phase B では localStorage のみ）

---

## 6. Mirror Taxonomy (5 種)

Mirror として返してよい型は **5 種類のみ**。それ以外は出力禁止。

### 6.1 State Mirror（状態の反射）

**定義**: ユーザーの現在の判断モードや状態を反射する

**例**:
- 「最近、決断のスピードが普段より遅いみたい」
- 「いつもより慎重な選び方が続いている」

**Trigger 条件**:
- `observation_novelty ≥ 0.6` （明確な変化）
- `state_drift_score` が閾値超過

### 6.2 Difference Mirror（差分の反射）

**定義**: 普段のパターンとの差分を反射する

**例**:
- 「この相手にだけ、いつもより返信が長い」
- 「今週は normal mode の利用が多い」

**Trigger 条件**:
- 同一文脈内でのベースライン差分が統計的に有意
- 観測サンプル数 ≥ 10

### 6.3 Tempo Mirror（テンポの反射）

**定義**: 会話・行動のテンポの変化を反射する

**例**:
- 「返信間隔が、いつもの 2 倍くらいになっている」
- 「今日は決めるのが早い」

**Trigger 条件**:
- `tempo_delta` 絶対値が一定以上
- 直前 5 ターンの平均と比較

### 6.4 Fairness Mirror（公平性の反射）

**定義**: ユーザーが自分自身に対して公平でない振る舞いをしているときの反射

**例**:
- 「自分の都合は後回しが続いている」
- 「相手の希望を優先する選択が多い」

**Trigger 条件**:
- `self_priority_score` が低い状態が連続
- 関係性データ複数件で同パターン

**注意**: 押し付けがましくならないよう、文体を最も慎重にする

### 6.5 Repair Mirror（修復の反射） (CEO 確定 2026-05-17: 軽微限定)

**定義**: ユーザーが既に修復行動を取っていることへの静かな確認

**CEO 確定 制約**:
- **軽微な温度上昇 (rupture severity = "mild")** のみを対象とする
- **強い対立 / 安全懸念 / 心理診断に見える文言は出力禁止**
- 「修復している」と断定せず、観測事実の単純記述に留める（「〜が伝わる」「〜を取り戻している」程度）

**例 (許可)**:
- 「昨日の続きを取り戻している」
- 「言葉を選び直しているのが伝わる」

**例 (禁止)**:
- 「関係が修復に向かっています」(診断的)
- 「ぶつかりかけたところを乗り越えようとしているね」(対立を断定)
- 「相手は怒っていそうだけど」(他者推論)

**Trigger 条件 (CEO 確定 2026-05-17)**:
- `rupture_flag` から `repair_signal` への遷移を検出
- **severity = "mild" のみ** (高リスク rupture は Safe Gate Fail で STAY_SILENT)
- 内省的応答を妨げないタイミング
- bucket = `rupture_signal` かつ severity 軽微 → Repair Mirror 候補（§9.3 と整合）

### 6.6 5 種以外を出さない理由

| 出さない型 | 理由 |
|------------|------|
| Diagnosis Mirror (診断) | 医療・心理的判定の自動化は scope 外 |
| Prediction Mirror (予測) | 「未来の判断」を断定するのは介入 |
| Comparison Mirror (他者比較) | 他者プライバシー + 競争原理導入は禁止 |
| Praise Mirror (称賛) | 行動強化 (operant conditioning) は介入 |
| Warning Mirror (警告) | 警告は別チャネル（Phase C 以降） |

---

## 7. Safety Provisions

### 7.1 Fail-Closed 原則

- Three-Gate のいずれか 1 つでも Fail → STAY_SILENT
- ERV 計算で NaN / Infinity / undefined → STAY_SILENT
- Mirror 文生成で例外 → STAY_SILENT
- PII firewall 検証で fail → STAY_SILENT + telemetry

### 7.2 Kill Switch

- `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` (default `false`)
- フラグ OFF 時は Speak Decision Engine 自体が初期化されない
- フラグ削除でも残留しないよう module-level guard

### 7.3 Post-Speak Verification

Mirror が SPEAK と判断された直後（出力前）に追加 4 検証:

1. **PII 検証**: 出力文字列に `pairStateId` / `userId` / email / phone 等が含まれないか
2. **文体検証**: 「提案」「疑問」「指示」表現が混入していないか（正規表現 + キーワード）
3. **長さ検証**: 1 文 14-40 文字、最大 2 文
4. **重複検証**: 直近 24 時間で同一 Mirror テンプレートを出していないか

検証 fail → STAY_SILENT + telemetry。

### 7.4 ユーザー操作による即時無効化

- Mirror 出力に「これは要らない」ボタン
- 1 タップで現セッション以降 7 日間 Mirror を完全停止
- ユーザーが設定画面で sleep を有効化すれば即時無効化（§8）

### 7.5 監査ログ

- 全 SPEAK / STAY_SILENT 判断を内部 telemetry に記録
- 記録項目: `decision`, `erv_value`, `gate_fail_reason`, `mirror_kind`, `timestamp`
- PII 含まないよう **redacted snapshot 形式**で記録（Phase A 同様）

### 7.6 ロールバック条件 (CEO 確定 2026-05-17)

以下のいずれかで Mirror Channel を即時 disable:

- **PII leak が 1 件でも観測** （Mirror 文 / debug global / telemetry 経由問わず）
- **false-positive 率 > 10%** (canary 期間中の SPEAK 判断のうち、事後監査で誤判定とされた比率)
- **negative feedback ≥ 5 件** (「監視されている」「不快」等の明示否定)
- **UI 違和感 / 邪魔という明示 feedback ≥ 3 件** (「ここに出ないでほしい」「タイミングが悪い」等)
- Three-Gate を bypass する経路が発見
- Mirror が Question / Proposal / Suggestion 表現を出力した（自動発話禁止違反）

ロールバック実施手順:
1. `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` を即時 OFF（env 削除）
2. 該当事象を `docs/decision-log.md` に記録
3. 原因切り分け完了まで再 enable 禁止

---

## 8. UI Policy

### 8.1 既存 Presence Layer + Chat Layer 不可侵境界（Mirror mount 例外あり）

**Phase A から継承する不変境界**:

| 対象 | 取り扱い | 備考 |
|------|---------|------|
| `lib/coalter/presence/` (30+ files) | **一切 touch しない** | Presence Layer 全体 |
| `app/components/chat/` (17 files) | **一切 touch しない** | Chat Layer 既存ファイル群 |
| 既存 `PresenceState` S0-S8 の遷移 | **改変しない** | Presence 状態機械 |
| 既存 `ModeSwitcher.tsx` | **改変しない** | mode tabs UI |
| `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **mount 1 箇所のみ最小追加可** | §8.2 mount 規約に従う / 既存 logic は touch しない |

**新規実装の置き場所** (Phase B 実装段階で作成):

- すべての Mirror UI コンポーネントは **`components/coalter/mirror/*`** に新規ディレクトリを作って配置する
- `components/coalter/observer/`（Phase A で新設）と並列の sibling として独立
- Speak Decision Engine / ERV / Three-Gate のロジックは **`lib/coalter/mirror/*`** に新規ディレクトリを作って配置する（`lib/coalter/presence/` ではない、`lib/coalter/observer/` ではない）
- `app/components/chat/` 配下に Mirror 用ファイルを **新設しない** （chat layer と物理的に分離）

### 8.2 Mirror の表示位置と mount 規約

**禁止**:
- チャット本文 (user message bubble / assistant message bubble) への自動挿入
- 既存 PresenceState ピル UI への融合
- 既存 `ModeSwitcher` / `CoAlterButton` 内部 DOM への差し込み
- ヘッダー固定表示
- フルスクリーンモーダル
- `app/components/chat/` 既存 17 files のいずれかへの新規 import 追加（`ChatClient.tsx` の mount 例外を除く）

**Mirror UI surface (CEO 確定 2026-05-17)**:
- **Option A 採用確定**: チャット下部に独立した **Mirror surface**（低彩度、低高さ、ユーザー閉鎖可能）
- Option B (CoAlter ボタン近傍サブテキスト) は不採用
- 独立 surface として出力すること（既存 UI と物理的に分離）
- chat 本文には一切挿入しない
- existing presence layer は zero diff を維持
- Mirror UI は新規 `components/coalter/mirror/*` に配置
- `ChatClient.tsx` mount は最小例外として §8.2 mount 規約 5 行以下

**`ChatClient.tsx` mount 規約** (Phase A `ObserverHost` mount 前例に準拠):

1. **追加できるのは mount line のみ**:
   - import: `import MirrorHost from "@/components/coalter/mirror/MirrorHost";` （1 行）
   - JSX: `<MirrorHost />` 相当の null-render wrapper コンポーネント mount（1 〜 2 行 + 任意 comment 行）
2. **既存 logic / hook / state は一切改変しない**
3. **既存 import / JSX 構造を maintain**（既存行の編集禁止、追加のみ）
4. **diff は合計 5 行以下**を目安とする（Phase A `ObserverHost` mount = 5 行 と同等）
5. mount コンポーネント自体（`MirrorHost`）は `components/coalter/mirror/MirrorHost.tsx` に配置し、内部で feature flag を確認、OFF なら null-render
6. 上記以外の `app/components/chat/` 16 files は **diff 0 行**

この規約により、**既存 chat layer の logic は zero diff**、Mirror UI は新規ディレクトリで完結、mount は ChatClient.tsx の最小 1 点に限定される。

### 8.3 Sleep Control (CEO 確定 2026-05-17)

**デフォルト**: 機能 ON 時の sleep default は **OFF** (Mirror 動作中)

**停止導線 (必須)**:
- 設定画面に「**CoAlter Mirror を sleep する**」トグル
- ON にすると Mirror が完全停止（観測継続、出力のみ停止）
- セッション内即時反映
- localStorage persist + 将来 Supabase ユーザー設定テーブル

**ユーザー言語的停止導線 (CEO 必須化 2026-05-17)**:
- ユーザーが「**黙ってて**」「**今は不要**」「**Mirror いらない**」等を発話したら検出し、`user_override.sleep` を ON 相当として扱う
- 検出した session 以降は **必ず STAY_SILENT**（ERV / Three-Gate を bypass せず、Safe Gate で即時 fail-close）
- 言語的停止は最低 24 時間有効、その後設定 UI で off にしない限り継続
- 言語的停止検出時、UI には「Mirror を sleep にしました」の 1 行 toast のみ（Mirror 形式での反射は禁止）

**user_override.sleep が ON のとき**:
- 全ての Mirror 出力は **必ず STAY_SILENT** (§4.3 Safe Gate 最優先条件)
- 観測蓄積 (Phase A RelationshipState 更新) は継続
- telemetry には「STAY_SILENT (user_sleep)」として記録

### 8.4 Mirror Surface のインタラクション

- 自動表示後 30 秒で fade-out（消去ではなく薄くする）
- 「これは要らない」ボタン（§7.4）
- タップで詳細展開 → 「何を見てこう言ったか」を redacted snapshot 形式で開示
- 詳細展開での開示は raw PII を含まない (PII firewall)

### 8.5 Mirror が出ているときの presence UI 状態

- 既存 PresenceState は通常通り遷移（Mirror は presence と独立）
- presence executor は Mirror を knowledge として参照しない（情報漏洩防止）
- 既存 Question / Proposal UI とは完全に独立した surface

---

## 9. A+ Unresolved Points（Phase A から持ち越し → CEO 確定 2026-05-17 で Phase B 前必須化）

Phase A 完了時点で「Phase B 設計時に再評価」と整理した 3 件は、CEO レビュー 2026-05-17 で **Phase B 実装前の必須項目**に格上げ。

### 9.1 observerActivationState semantics (CEO 確定: 軽修正候補)

**論点**: Phase A で導入した `observerActivationState` と既存 `ExecutorAvailability` の関係。

**CEO 確定方針 (2026-05-17)**:
- `observerActivationState` の **active 化は Phase B 実装前の軽修正候補**として処理
- Phase B 着手前に状態遷移の意味論を明文化（短い docs PR で可、構造変更は伴わない）
- Mirror Channel は両方を参照: `observerActivationState = "active"` AND `ExecutorAvailability = "available"` のときのみ Mirror 候補生成
- **構造変更は Phase B 全期間で行わない**（Phase A 完了の不変境界）
- 両者の状態遷移整合性は別途 observability runbook で監視

**実装順序**: B-2 (modeContext read path) と同 PR または直前 PR で active 化の意味論明文化を完了させる。

### 9.2 modeContext を Speak Decision Engine 入力としてどう扱うか (CEO 確定: Speak logic 前必須)

**論点**: `modeContext` (normal / daily / travel) は Speak 判断に影響すべきか。

**CEO 確定方針 (2026-05-17)**:
- `modeContext` 取得は **Speak logic 実装前に必須**（B-2 マイクロ PR で先行実装）
- Mirror Channel は `lib/coalter/presence/types.ts` の `PresenceMode` から **read-only** で取得
- `modeContext = "unknown"` のときは **Mirror 発話禁止** (§5 / §4.3 Safe Gate)
- `modeContext = "travel"`: Mirror 頻度を 0.5x に減衰（旅行中は内省より体験を優先）
- `modeContext = "daily"`: 通常頻度（1.0x）
- `modeContext = "normal"`: 通常頻度（1.0x）
- 重み変更は ERV 計算の coefficient で実施、Three-Gate には影響しない（ただし unknown は Safe Gate Fail）

**未解決 (Phase C 以降)**: ユーザー個別のモード別嗜好（個別 Bayesian update）。

### 9.3 matchedPatternCategory bucket の使い分け (CEO 確定: ERV engine 前に pure logic 設計)

**論点**: bucket (safety_concern / rupture_signal / unknown_category / null) を Mirror taxonomy にどう連結するか。

**CEO 確定方針 (2026-05-17)**:
- bucket 推論 (`alignment` / `uncertainty` / `silence_budget` 含む) は **ERV engine 実装前に pure logic として設計**
- 副作用なし / I/O なし / 入力 → 出力の決定的純関数として `lib/coalter/mirror/buckets/*` に実装
- B-3 マイクロ PR で bucket inference pure logic を独立 PR として着地（B-4 ERV / Three-Gate に先行）
- bucket = `unknown_category` のときは **Mirror 発話禁止** (Observe Gate Fail)
- bucket / modeContext が unknown のままなら Mirror 発話は禁止

**bucket 別 Mirror Channel 動作 (CEO 確定)**:

| bucket | Mirror Channel 動作 |
|--------|---------------------|
| `safety_concern` | **Mirror 発話禁止** (Phase B 全期間)。検知時は STAY_SILENT。応答チャネルは Phase C+ で別途設計 |
| `rupture_signal` (severity = "high") | **Mirror 発話禁止** (Safe Gate Fail)。沈黙が安全 |
| `rupture_signal` (severity = "mild") | **Repair Mirror 候補** のみ (§6.5 軽微限定)。Repair 以外の 4 種は禁止 |
| `unknown_category` | **Mirror 発話禁止** (Observe Gate Fail)。観測不十分とみなす |
| `null` | 通常評価（Three-Gate 全評価へ進む） |

**未解決 (Phase C 以降)**: `safety_concern` / 高リスク `rupture_signal` 系統への適切な応答チャネル。Phase B では「沈黙で安全」を維持。

---

## 10. Implementation Stop Conditions

### 10.1 Phase B 設計確定までの絶対禁止事項

**この設計書がレビュー通過するまで、以下のコード変更を一切行わない**:

- Mirror Channel の実装着手
- Speak Decision Engine の実装着手
- Three-Gate Mirror の実装着手
- ERV 計算ロジックの実装着手
- 新規 UI surface の作成（`components/coalter/mirror/*` の作成含む）
- 新規 logic ディレクトリの作成（`lib/coalter/mirror/*` の作成含む）
- `ChatClient.tsx` への mount 追加（§8.2 mount 規約に従う場合でも、設計確定後に限る）
- 新規 telemetry 経路の追加
- `RelationshipState` schema の変更
- `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` flag の追加
- 既存 presence layer / 既存 chat layer 16 files への一切の touch

### 10.2 設計レビュー Stop Condition — **RESOLVED 表** (CEO 確定 2026-05-17)

CEO レビュー 2026-05-17 で 10 決定点すべて確定。

| # | Stop Condition | CEO 確定内容 | 反映先 |
|---|-----------------|-------------|--------|
| 1 | Mirror UI surface | **Option A 採用**: 独立 surface (chat 本文に挿入しない / existing presence layer zero diff / 新規 `components/coalter/mirror/*` / ChatClient.tsx mount 5 行以下) | §8.2 |
| 2 | SPEAK_THRESHOLD 初期値 | **0.75 初期**, 0.65 は将来緩和候補（緩和には canary 6 週間 + false-positive < 3% + UI 違和感 0 件 + CEO 承認） | §3.3 |
| 3 | Mirror taxonomy 5 種 | **5 種承認** (State / Difference / Tempo / Fairness / Repair)。Repair は **軽微な温度上昇のみ**対象、強い対立 / 安全懸念 / 心理診断に見える文言は禁止 | §6.5 |
| 4 | `safety_concern` / `rupture_signal` | `safety_concern` は **Phase B 全期間 発話禁止** (検知時 STAY_SILENT or Phase C+ 設計へ送る) / `rupture_signal` 高リスクは STAY_SILENT、**軽微のみ Repair Mirror 候補** | §9.3 / §6.5 |
| 5 | sleep control デフォルト | **OFF (Mirror 動作中)**, ただしユーザーが「黙ってて」「今は不要」と言える **言語的停止導線を必須化** / `user_override.sleep` ON で必ず STAY_SILENT | §8.3 |
| 6 | session 内 Mirror 頻度上限 | **初期 Preview: 1/session**, 安定後に 2/session へ拡張可能 (CEO 承認必須) / `time_since_last_speak` を **必須入力**化 | §2.3 / §5 |
| 7 | rollback 条件 | **PII leak 1 件で即停止 / false-positive ≥ 10% / negative feedback ≥ 5 件 / UI 違和感・邪魔という明示 feedback ≥ 3 件** | §7.6 |
| 8 | A+ 3 unresolved points | observerActivationState active 化は Phase B 実装前の **軽修正候補** / modeContext 取得は **Speak logic 前に必須** / bucket 推論 (alignment / uncertainty / silenceBudget) は ERV engine 前に **pure logic として設計** / modeContext または bucket が unknown のままなら **Mirror 発話禁止** | §9 |
| 9 | Phase B 実装スコープ分割 | **B-0 〜 B-6 micro-PR 分割** (§10.4) | §10.4 |
| 10 | Phase B 完了基準 | **§10.5 に確定基準を記載** | §10.5 |

**全 10 決定点 RESOLVED**。実装フェーズに進むための Pre-Implementation Gate は §10.3 で別途規定。

### 10.3 実装段階に進む場合の Pre-Implementation Gate

設計確定後に実装フェーズに進む場合の preflight 条件:

1. 本設計書が main に merge 済
2. CEO 承認の `docs/decision-log.md` entry が追加済
3. Phase B 実装スコープを `docs/coalter-aoo-phase-b-implementation-plan.md` に切り出し
4. 第 1 マイクロ PR の scope は **UI shell のみ** (Speak Decision Engine / ERV / Three-Gate ロジックを含まない):
   - `components/coalter/mirror/MirrorHost.tsx` 新規作成（feature flag OFF なら null-render）
   - `components/coalter/mirror/MirrorSurface.tsx` 新規作成（後続 PR で中身追加、第 1 PR では空 shell でも可）
   - `app/(culcept)/talk/[threadId]/ChatClient.tsx` への mount 追加（§8.2 規約 5 行以下）
5. Kill switch flag `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` が **default `false`** で起票されること
6. 既存 presence layer (`lib/coalter/presence/` 30+ files) に diff が **0 行** であること
7. 既存 chat layer (`app/components/chat/` 17 files) に diff が **0 行** であること
8. 既存 `app/(culcept)/talk/[threadId]/ChatClient.tsx` への diff は **§8.2 mount 規約に従う 5 行以下** であること（既存 logic への改変ゼロ）
9. 新規ディレクトリは `components/coalter/mirror/*` と `lib/coalter/mirror/*` のみ。既存ディレクトリ配下に Mirror 関連の新規ファイルを置かない
10. 第 1 マイクロ PR は **flag OFF preview** で mount 動作確認のみ、Speak は発火しないことを smoke で確認

### 10.4 Phase B Implementation Micro-PR Split (CEO 確定 2026-05-17)

CEO レビューで確定した実装段階の micro-PR 分割。各 PR は独立に着地可能、Speak logic は後段でのみ起動。

| PR | スコープ | 含む変更 | 含まない変更 | 完了基準 |
|----|---------|---------|------------|---------|
| **B-0** | implementation plan docs | `docs/coalter-aoo-phase-b-implementation-plan.md` 新規 (B-1〜B-6 詳細スコープ / 受入基準 / kill switch / rollout 順序) | コード変更ゼロ | docs-only / CEO 承認 / main merge |
| **B-1** | UI shell only, flag default false, no Speak logic | `components/coalter/mirror/MirrorHost.tsx` (null-render wrapper) / `components/coalter/mirror/MirrorSurface.tsx` (空 shell) / `ChatClient.tsx` mount 5 行以下 / kill switch flag 起票 (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` default false) | Speak Decision Engine / ERV / Three-Gate / modeContext read / bucket inference 一切なし | flag OFF preview で mount 動作確認、Speak 発火 0 件、既存 presence layer / chat layer zero diff |
| **B-2** | modeContext read path | `lib/coalter/mirror/modeContextReader.ts` 新規 (presence layer から read-only 取得、書き込み禁止) / 9.1 observerActivationState 軽修正同梱可 | Speak / ERV / bucket / UI 表示一切なし | unit test PASS / presence layer zero diff / modeContext unknown 時の null 返却確認 |
| **B-3** | bucket inference pure logic | `lib/coalter/mirror/buckets/*` 新規 (alignment / uncertainty / silenceBudget / matchedPatternCategory 推論を **pure function** で実装、副作用なし / I/O なし) | ERV 計算 / Three-Gate / Speak / UI 一切なし | unit test PASS / 入力 → 出力の決定性確認 / unknown bucket 検出時の Mirror 発話禁止 logic 確認 |
| **B-4** | ERV / Three-Gate pure engine | `lib/coalter/mirror/erv.ts` 新規 (ERV 計算 pure function) / `lib/coalter/mirror/gates/*` 新規 (Observe / Worth / Safe 各 Gate を pure function 化) / Speak Decision Engine 統合 (まだ UI 発火しない) | UI 表示 / canary 発火 / telemetry 一切なし | unit test PASS / Three-Gate AND 条件 fail-closed 確認 / SPEAK_THRESHOLD = 0.75 確認 |
| **B-5** | Preview canary, flag allowlist only | flag を **allowlist only** で Preview branch-scoped に有効化 (Production 不可) / MirrorSurface 実描画 / Mirror 文生成 + Post-Speak Verification + telemetry 記録 | Production rollout / 全 Preview enable 一切なし | canary 期間中の SPEAK / STAY_SILENT 分布観測 / PII leak 0 / 誤発話 0 / session cap 1/session 動作 / sleep control 動作 |
| **B-6** | docs close / completion evidence | `docs/coalter-aoo-phase-b-completion.md` 新規 (canary 観測根拠 / 完了基準達成証跡 / Phase C 持ち越し論点) / `docs/decision-log.md` Phase B 完了 entry 追加 | コード変更ゼロ | docs-only / CEO 承認 / main merge |

**マイクロ PR 順序の制約**:
- B-0 が main merge されてから B-1 を起票
- B-2 / B-3 は並列起票可、ただし B-4 (ERV / Three-Gate) は両方完了後に起票
- B-5 canary は B-4 main merge 後、CEO 承認で env 投入
- 各 PR は **kill switch flag OFF default** を維持

### 10.5 Phase B Completion Criteria (CEO 確定 2026-05-17)

以下すべて満たした時点で Phase B 正式完了:

| # | 完了条件 | 確認方法 |
|---|---------|---------|
| 1 | **Preview canary で誤発話 0 件** | canary 期間 telemetry 全件監査、false-positive 率 < 5% |
| 2 | **raw text / PII leak 0 件** | Mirror 文 / debug global / telemetry 全件 PII firewall PASS |
| 3 | **default STAY_SILENT 動作確認** | canary 全 session 中の SPEAK 率を測定、STAY_SILENT が圧倒的多数であること |
| 4 | **session cap 動作確認** | 1 session 内で Mirror 出現が hard cap (初期 1) を超えないこと |
| 5 | **sleep control 動作確認** | sleep ON / 言語的停止導線 (「黙ってて」「今は不要」) 検出後の STAY_SILENT 100% |
| 6 | **existing presence layer zero diff** | `lib/coalter/presence/` 全 30+ files の diff = 0 行 / `app/components/chat/` 全 17 files の diff = 0 行 |
| 7 | **Production env untouched** | `vercel env ls production` で Mirror 関連 env 0 件 |
| 8 | **Question / Proposal auto-fire なし** | canary 全 session の Mirror 出力文字列を Post-Speak Verification (§7.3) 4 検証で全件 PASS |
| 9 | bucket / modeContext unknown 時の STAY_SILENT 動作確認 | unknown 検出時に Mirror 発話 0 件であること |
| 10 | rollback ドリル成功 | kill switch OFF 操作で Mirror が即時停止することの実機確認 |

**完了判定者**: CEO（実機 canary 観測 + 上記 10 条件 evidence をもって判定）。
**完了 docs**: `docs/coalter-aoo-phase-b-completion.md` (B-6 で起票)。

---

## Appendix A: 参考文献

- Horvitz, E. (1999). *Principles of Mixed-Initiative User Interfaces*. CHI '99.
- Rogers, C. R. (1957). *The Necessary and Sufficient Conditions of Therapeutic Personality Change*. Journal of Consulting Psychology.
- OECD (2024). *Updated definition of an AI system*.
- Anthropic Claude Code documentation: agentic system design principles.
- Aneurasync 設計思想（`memory/aneurasync-philosophy.md`）

## Appendix B: 関連 Phase A docs

- `docs/coalter-aoo-phase-a-completion.md` — Phase A 完了正本
- `docs/coalter-always-on-observer-design.md` — AOO 設計（Phase A 完了通知 banner あり）
- `docs/coalter-aoo-presence-reconciliation.md` — Presence Layer 並走基準
- `docs/coalter-aoo-a2e-state-observation-preflight.md` — A-2e 観測手順
- `docs/decision-log.md` — Phase A 完了 entry (2026-05-17)

## Appendix C: 設計者注

- 本設計書は **docs-only**。1 行のコード変更も含まない
- CEO レビューを経ない限り **merge 禁止**
- レビューで scope 縮小・型分割の指示が出た場合は実装 PR 起票前に再起票
- 「Always-On ≠ 自動発話」原則を Phase B でも厳格に維持する
- Mirror = reflection 限定。Question / Proposal / Suggestion は Phase B scope 外
