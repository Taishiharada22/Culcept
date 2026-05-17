# CoAlter Always-On Observer 設計

> ## ✅ Phase A 完了通知（2026-05-17）
>
> **Phase A は CEO 実機 A-2e canary 観測により正式完了**。
>
> 完了根拠: 5 観測目的 (mount / subscribe / signal receive / state update / PII firewall) 全達成。
>
> 完了正本: `docs/coalter-aoo-phase-a-completion.md`
>
> Phase B Mirror Channel 設計は別 docs PR で扱う。本設計書の Layer 1-6 構想は Phase B 設計時に再評価する。
>
> ---

> ## 🔴 訂正通知（2026-05-16）
>
> **本設計書 §1〜§14 は、既存 Stage 4 Presence Layer の存在を見落として書かれました。**
>
> 既存 `lib/coalter/presence/` (30+ files) と `app/components/chat/` (17 files) に、Always-On Observer の core architecture が完全実装済（production deployed、`NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true`）。本設計書の Layer 1-6 の多くは既存実装の**再発明**です。
>
> 訂正正本: `docs/coalter-aoo-presence-reconciliation.md` (PR #154)
>
> 本設計書を新規実装の正本として参照しないでください。reconciliation doc が**正本**です。
>
> 既存 presence layer との関係:
> - Mode Layer (本書 §3 Layer 1) → 既存 `PresenceMode` + `ModeSwitcher.tsx`
> - Observer Loop (本書 §3 Layer 2) → 既存 `signalAdapter.ts` (implicit signal 検出)
> - Relationship State (本書 §3 Layer 3) → 既存 `sharedState.ts` (server 正本)
> - Speak Decision Engine (本書 §3 Layer 4) → 既存 `reducer.ts` (S0-S8 state machine)
> - Generation Layer (本書 §3 Layer 5) → 既存 `UpperLayerMount.tsx` (UrgentLayer + MemorySurface)
> - UI Layer (本書 §3 Layer 6) → 既存 `ModeSwitcher.tsx` + 17 chat components
>
> ---

**ステータス**: 設計確定（docs-only PR、実装未着手）→ **重大訂正済（2026-05-16）**
**作成日**: 2026-05-16
**承認**: CEO（Always-On 方向性 / Phase A から着手 / 自動発話なし維持）
**前提変更**: 本設計は CoAlter を「呼ばれて答える Reactive 型」から「mode ON 中は常時静かに観察する Active 型」へ転換するための正本。
**最上位原則**: **Always-On ≠ 自動発話**。観測の常時化と発話の選択化を厳格に分離する。

---

## 0. 設計判断の歴史的位置

CoAlter は当初、二人の会話に対して「決定支援を呼ばれた時に行う」検索ツールとして実装された。Reactive 型は問題なく動作しており、CoAlter card → 「もう少し聞かせて」→ Q&A → 提案 の経路は smoke 確認済み（2026-05-16）。

しかし Aneurasync の中心問い「**この機能は、ユーザーの第二の自己として必要か？**」に照らすと、Reactive 型は「ツール」であって「第二の自己」ではない。第二の自己は呼ばれない時にも存在し、必要な瞬間に静かに声をかける。

本設計はその転換を、**自動発話の暴走リスク**を抑えながら段階的に実現する。Phase A は観測のみ、UX 変化ゼロから着手する。

---

## 1. 現状整理（Reactive 型）

### 1.1 起動経路（3 つだけ）

| # | 経路 | 発火条件 | 実装 |
|---|---|---|---|
| 1 | **明示ボタン invoke** | CoAlter ボタン押下 / 「もう少し聞かせて」押下 | `createButtonTrigger` (lib/coalter/triggerDetection.ts:203), `useCoAlter.invoke` (hooks/useCoAlter.ts:460) |
| 2 | **Awaiting-Answer 連鎖** | 直前カードが `awaitingAnswer` を立てている時、次の chat 送信が自動再 invoke | `ChatClient.tsx:932-944`（Phase 1.5.3） |
| 3 | **Soft Hint 検知** | 各 message を正規表現評価（膠着 / 助け要求 / 拡散 2 連発） | `detectCoAlterTrigger` (lib/coalter/triggerDetection.ts:88)。**自動 invoke はしない、ヒント表示のみ** |

### 1.2 現状の確認済み正常動作

- CoAlter ボタン押下 → CoAlter card → 「もう少し聞かせて」→ Q&A → 提案（最終的に映画候補表示）
- 2026-05-16 CEO 実機検証で確認済み

### 1.3 現状の構造的境界

「fallback card 表示後、ユーザーが**普通に**追加メッセージを送ると、CoAlter は沈黙する」 — これは bug ではなく **Reactive 型の必然**。経路 1-3 のどれにも該当しないため。

直すべきは個別バグではなく**アーキテクチャ**。

---

## 2. CEO Vision（Active 型）

> 「coalter は、ユーザーが通常 / Daily / Travel ボタンを押している間は**起動状態**だと考えたい。起動状態では、coalter が自立で 2 人の会話を分析、まとめる。その上で質問を投げてユーザーが答え、答えを見つけていく。最終リコメンドは現状通りチャット表示で OK。CoAlter ボタンは現状の画面上固定を維持。」

### 2.1 翻訳

| Vision | 設計用語 |
|---|---|
| 起動状態 | mode ≠ OFF |
| 自立で分析 | Observer Loop（メッセージごと shadow 分析） |
| まとめる | Relationship State（関係状態オブジェクト） |
| 質問を投げる | Question Channel |
| 答えを見つけていく | Awaiting-Answer 連鎖の継続 |
| 最終リコメンド | Proposal Card Channel（現状維持） |
| ボタン固定 | UI Layer 不変（現状の位置） |

### 2.2 Vision に含まれない（明示的に除外）

- 全 mode で同じ振る舞い → mode ごとに tempo / 優先 channel が違う
- 24 時間張り付き観察 → mode OFF 時は完全停止
- 全発話を automatic → Speak Decision Engine で選択

---

## 3. 新アーキテクチャ全景

```
┌────────────────────────────────────────────────────────────┐
│  [Layer 1] Mode Layer                                      │
│   OFF / Normal / Daily / Travel                            │
│   - CEO Vision の「起動状態」の正体                        │
│   - OFF 時は全下流停止（コスト 0、観測 0、ログ 0）         │
└─────────────────────────┬──────────────────────────────────┘
                          │ mode ≠ OFF
                          ▼
┌────────────────────────────────────────────────────────────┐
│  [Layer 2] Observer Loop                                   │
│   - 新 message 到着 → debounced 800ms                      │
│   - 既存 runUnderstanding を再利用                         │
│   - 既存 fan-out 経路で A2 buffer 蓄積（debug 用途）       │
│   - 主出力は Relationship State 更新                      │
└─────────────────────────┬──────────────────────────────────┘
                          │ observation delta
                          ▼
┌────────────────────────────────────────────────────────────┐
│  [Layer 3] Relationship State                              │
│   - 二人が今扱っている「問い」                             │
│   - alignment_signal / rupture_flag /                      │
│     conversation_phase / confidence trajectory             │
│   - mode ごとに reset しない（連続性保持）                │
│   - 永続化候補（Phase D 以降検討、現状 in-memory）         │
└─────────────────────────┬──────────────────────────────────┘
                          │ state snapshot
                          ▼
┌────────────────────────────────────────────────────────────┐
│  [Layer 4] Speak Decision Engine（核心）                   │
│   入力: silence_budget / observation_novelty /             │
│        alignment_signal / rupture_flag /                   │
│        conversation_phase / time_since_last_speak /        │
│        mode_specific_threshold / uncertainty               │
│   出力: STAY_SILENT / SPEAK_MIRROR /                       │
│        SPEAK_QUESTION / SPEAK_PROPOSAL                     │
│   原則: 迷ったら STAY_SILENT (Negative Capability)         │
└─────────────────────────┬──────────────────────────────────┘
                          │ if SPEAK_*
                          ▼
┌────────────────────────────────────────────────────────────┐
│  [Layer 5] Generation Layer                                │
│   - Mirror channel: 短い反射（italic 系統 / 控えめ）       │
│   - Question channel: 一問一答型問いかけ                   │
│   - Proposal channel: 既存カード経路（現状維持）           │
└─────────────────────────┬──────────────────────────────────┘
                          │ post message
                          ▼
┌────────────────────────────────────────────────────────────┐
│  [Layer 6] UI Layer                                        │
│   - CoAlter フローティングボタン: 現状位置固定（CEO 確定） │
│   - mode 切替 UI: 現状維持                                 │
│   - Proposal: 現状カード形式（CEO 確定）                   │
│   - Mirror: Phase B 以降で控えめ追加                       │
│   - 「黙ってて」ボタン: Phase B 以降必須                  │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Layer ごとの実装責務

| Layer | 主責務 | 既存資産 | 新規実装 |
|---|---|---|---|
| 1 Mode | mode 状態管理 / 下流活性化 | UI ボタン（部分実装） | mode state の pair-scope persistence |
| 2 Observer | 観測 trigger / 軽量分析 | `runUnderstanding`, `emitUnderstandingDiagnostics`, A2 buffer, A3 fan-out, A4 retrieval | debounce / batching / Relationship State 注入 |
| 3 State | 関係状態モデル | HDM の Phase State (一部) | 関係状態オブジェクト本体（新規） |
| 4 Decision | 発話判定 | HDM の rupture flag / Negative Capability framework | Speak Decision Engine 本体（新規） |
| 5 Generation | message 生成 | 既存 card pipeline | Mirror / Question generator（新規） |
| 6 UI | 表示 | 既存 chat UI + CoAlter button | Mirror styling / sleep control（Phase B 以降） |

---

## 4. Phase 分割

### Phase A — Observer Loop Only（最初の着手対象）

**目的**: 観測の安定化。UX 変化ゼロから着手。

**含む**:
- mode ON 中の新 message ごとに shadow observation 実行
- Relationship State の更新（in-memory）
- A2 buffer / A4 retrieval は debug 観測用途で継続活用
- 内部 metrics 収集（latency / cost / observation_quality）

**含まない**:
- 自動発話（Mirror / Question / Proposal の auto-speak）
- UI 表示
- Pattern activation
- env 変更
- API route 追加（既存 invoke route 内に統合）

**完了基準（反証可能）**:
| 軸 | 閾値 | 計測方法 |
|---|---|---|
| 観測カバー率 | mode ON 中の全 message のうち observation 走った率 ≥ 95% | A2 buffer event count / mode ON 中の message count |
| 観測遅延（中央値） | invoke 経路の latency 加算 ≤ 50ms | invoke route timing diff (with/without observer) |
| 観測コスト | LLM 呼び出し増加 ≤ 1 call/message | 既存 cost telemetry |
| UX 影響 | UI 上のユーザー観測可能変化 = 0 | smoke + visual inspection |

**Phase A 完了 ≠ Phase B 着手**。Phase A 観測結果（Relationship State の quality）を CEO レビューしてから Phase B 着手判断。

### Phase B — Mirror Channel

**目的**: 控えめな関係反射の導入。「気が利く」存在感の確立。

**含む**:
- Mirror channel 実装（小さい italic 系統 UI）
- silence_budget の本格化（mode ごとに上限）
- ユーザー側 sleep control（「黙ってて」ボタン）必須化
- Mirror 発火頻度: mode 別（Normal: 10 min 1 回、Daily: 5 min、Travel: 15 min）

**含まない**:
- Question auto-speak
- Proposal auto-speak

**完了基準**:
| 軸 | 閾値 |
|---|---|
| Mirror 適切性（CEO 評価） | 10 件中 7 件以上が「気が利く」評価 |
| ユーザー sleep 操作率 | sleep 押下 / mode ON 時間 ≤ 5% |
| 関係状態反映 | Mirror 内容が直前観測の delta に基づく ≥ 90% |

### Phase C — Question Channel

**目的**: CoAlter が能動的に問いを投げる。

**含む**:
- Question channel 実装
- Awaiting-Answer 連鎖を Active 型に統合
- 質問の quality score 化

**完了基準**:
| 軸 | 閾値 |
|---|---|
| 質問への回答率 | ユーザーが質問に答える率 ≥ 60% |
| 不適切質問率 | CEO 評価で 10% 以下 |

### Phase D — Proposal Auto-Speak

**目的**: 条件が揃った時、提案を自発的に出す。既存 explicit invoke は維持（並走）。

**含む**:
- Proposal auto-speak（既存 card pipeline 流用）
- explicit invoke との競合制御

**完了基準**:
| 軸 | 閾値 |
|---|---|
| 適切タイミング率 | 提案 / 「もっと早く」フィードバック比 ≥ 5:1 |

### Phase E — Tuning / Per-User / Rollback

**目的**: 個別調整と rollback 経路。

**含む**:
- per-user frequency 調整
- per-pair sensitivity 調整
- rollback トリガー（mode ごと、全体）
- 暗示的 mode 検出（このフェーズで初導入候補）

### Phase 順序の固守理由

- A (観測のみ) → B (mirror) → C (question) → D (proposal) → E (tuning)
- **理由**: 各 phase は前の phase の観測結果を前提にする。順序逆転は判断材料不足で着手することになる。
- 例: Phase C (question) は Phase A (観測) と Phase B (mirror) の信頼形成があって初めて成立する。

---

## 5. Speak Decision Engine 詳細

### 5.1 必須入力変数

| 変数 | 定義 | データソース |
|---|---|---|
| `silence_budget` | 0-1.0、speak で消費、時間で回復 | 内部 state |
| `observation_novelty` | 0-1.0、直前 observation との差分 | Relationship State diff |
| `alignment_signal` | -1.0〜+1.0、両者の方向一致度 | shadow understanding output |
| `rupture_flag` | bool、関係の崩れ検出 | HDM rupture detector 流用 |
| `conversation_phase` | opening / exploring / converging / closing | phase classifier（新規軽量分類器） |
| `time_since_last_speak` | 秒 | timestamp |
| `mode_specific_threshold` | mode 別の発話閾値 | mode config |
| `uncertainty` | 0-1.0、現在の観測の不確実性 | bayesian confidence 流用 |

### 5.2 出力種別

| 種別 | 条件 | Phase |
|---|---|---|
| `STAY_SILENT` | 不確実、不一致、rupture、silence_budget 不足、time gap 不足 のいずれか | A 以降全て |
| `SPEAK_MIRROR` | novelty 高 + alignment 明確 + silence_budget 残 | B 以降 |
| `SPEAK_QUESTION` | uncertainty 高 + 関係状態に欠落 + 適切 phase | C 以降 |
| `SPEAK_PROPOSAL` | converging phase + confidence 高 + 情報十分 | D 以降 |

### 5.3 中核原則

1. **迷ったら黙る**（Negative Capability First-Class）
2. 不一致時は proposal でなく mirror / question を優先（押し付けない）
3. rupture 時は強い保守化（mirror / question も控える、まず silence）
4. phase opening では発話極小（観察に専念）
5. phase closing では proposal を許可（converging からの自然な流れ）
6. silence_budget が低い時は強制 silence（疲労回避）
7. 同じ趣旨の発話を短期間に重ねない（pre-speak audit）

### 5.4 数学モデル（草案）

```
speak_score = (
    novelty * w_novelty
    + alignment_clarity * w_alignment
    - uncertainty * w_uncertainty
    - (rupture_flag ? penalty_rupture : 0)
    + phase_modifier
)

speak_decision =
    if speak_score < threshold_silent or silence_budget < min_required:
        STAY_SILENT
    elif phase = converging and confidence_high:
        SPEAK_PROPOSAL
    elif uncertainty_high and missing_info:
        SPEAK_QUESTION
    elif novelty_high:
        SPEAK_MIRROR
    else:
        STAY_SILENT
```

各 weight / threshold は Phase A 観測後にキャリブレーション。初期値は保守側に倒す（沈黙寄り）。

---

## 6. Safety / Privacy

### 6.1 データ取扱

| 項目 | 規約 |
|---|---|
| raw message text | observation payload に出さない |
| `userId` / `pairId` / `threadId` | observation payload に出さない |
| `email` / 個人特定情報 | 一切記録しない |
| URL / 外部リンク | observation payload に出さない |
| 観測 metadata | bucket redaction（既存 A2 規約） |
| 関係状態 | in-memory or 暗号化 storage（永続化時） |

### 6.2 環境境界

- Production env: **絶対に触らない**
- Preview env: Phase A 観測の場
- Development env: ローカル検証
- 観測フラグ / token: Production 流出禁止

### 6.3 UX 上の privacy 配慮

- mode ON 中の listening を**明示的に可視化**する（小さなインジケーター）
  - 隠れ surveillance になることを構造的に防止
- 「黙ってて」ボタン: Phase B 以降必須実装（user control の return）
- 「今の会話は記録しない」モード（Phase E 候補）
- 観測内容は**ユーザー要求時に retrievable**（Phase D 以降検討）

### 6.4 UX 文言の方針

- 「監視されている」感を生まない
  - NG: 「CoAlter があなたの会話を分析中」
  - OK: 「CoAlter は静かに聞いています」
- listening は明示するが、analyzing / processing は強調しない
- 沈黙時の存在感を控える（明滅する dot 等は使わない）

---

## 7. Process Isolation 整理

### 7.1 既存 A1+A2+A3+A4 経路の位置づけ

2026-05-16 の dynamic smoke で確認:
- A2 buffer / A4 retrieval は **debug 観測用**として有効
- ただし Vercel serverless の process isolation により、retrieval が常に invoke 側 buffer を読めるとは限らない
- 今回の smoke で `eventCount: 1` を観測できたのは warm path の同一 process 着地という**確率的成功**

### 7.2 Always-On 設計での扱い

- **本体ロジックは同一 request 内で完結させる**（observer → state 更新 → decision → speak を 1 process 内で）
- A4 retrieval は CEO / 開発者が観測の検証に使う用途のみ
- **serverless in-memory buffer に恒常運用を依存しない**

### 7.3 Persistent Storage 検討（Phase D 以降）

- Relationship State の永続化が必要なら:
  - 候補 1: Supabase（CEO 承認必須）
  - 候補 2: 暗号化 Vercel KV
  - 候補 3: メッセージ列から都度再構築（state-less）
- 当面は state-less + in-memory cache で進める

---

## 8. UI 方針（CEO 確定事項に準拠）

### 8.1 不変項目（CEO 明示）

| 項目 | 内容 |
|---|---|
| CoAlter フローティングボタン位置 | 現状画面上の固定位置（左下）を維持 |
| Normal / Daily / Travel mode 表示 | 現状維持 |
| 最終リコメンドの表示形式 | 現状のチャット / カード形式 |

### 8.2 Phase 別 UI 追加

| Phase | UI 追加 |
|---|---|
| A | **追加なし**（UI 変更ゼロ） |
| B | Mirror channel（小さい italic、CoAlter avatar）/ 「黙ってて」ボタン / mode ON listening インジケーター |
| C | Question channel（通常 bubble、Q&A 入力ガイド） |
| D | Proposal card（既存形式、CoAlter avatar 追加検討） |
| E | Settings panel（per-user frequency / sleep schedule） |

### 8.3 Mirror channel の visual specification（Phase B 着手時に詳細化）

- 小さい italic
- 通常 message より控えめ
- CoAlter avatar 付き
- 例: 「*二人とも"近場"を優先にしてそう*」

---

## 9. 実装しないこと（明示的除外）

本 PR、および Phase A 着手段階で**実装しない**もの:

- auto-speak 実装（Mirror / Question / Proposal の自動発話）
- Mirror UI 実装
- Question UI 実装
- Proposal auto 発火
- 新規 route / API 追加（既存 invoke route に統合）
- production env 変更
- telemetry / Sentry 送信
- DB / Supabase / migration
- Step E-1 gate 評価
- bug1 cleanup
- Stargazer pivot
- 暗示的 mode 検出（Phase E 候補）
- Per-user frequency 調整（Phase E）
- 「黙ってて」ボタン（Phase B 必須、Phase A 含めず）

---

## 10. 次の実装候補

### 10.1 docs merge 後の第一候補

**Phase A: Observer Loop Implementation**

- branch: `feat/coalter-aoo-phase-a-observer`
- scope: lib のみ（既存 invoke route 内に observer hook 追加）
- 既存資産: `runUnderstanding` / fan-out / A2 buffer / A4 retrieval を観測パスに統合
- 新規実装: Relationship State module / observer trigger 制御 / metrics 収集
- verify: lib unit tests / integration tests
- runtime: Preview 観測（既存 env 維持）

### 10.2 Phase A 実装は別 PR

- Stop-before-merge lane（route 内挙動変更を含むため）
- docs merge 後に Phase A 実装計画を別提示
- 本 PR では実装に入らない

---

## 11. 自立補強項目（CEO 指示外、私の追加）

### 11.1 最上位設計原則: Always-On ≠ 自動発話

これを設計書冒頭に明示する。Phase A 時点で「常時観測しているけど何も言わない」が正常状態。Phase B 以降で「適切な瞬間だけ」発話する。

「気が利く存在」と「割り込んでくる存在」の境界は**沈黙の選択能力**にある。

### 11.2 アンチパターン集

避けるべき設計:

| アンチパターン | 害 | 対策 |
|---|---|---|
| 全 message に対して LLM 呼び出し | コスト爆発 / 遅延 | hierarchical: 軽量 → shadow → LLM の段階発火 |
| Mirror を頻繁に出す | うざい / 監視感 | silence_budget + 厳しい novelty 閾値 |
| 不一致時に proposal を押し付け | 関係悪化 | rupture 検出時は強制 silence |
| 「分析しています」表示 | 不安喚起 | listening のみ表示、analyzing は隠す |
| 沈黙を埋めようとする | 無理に発話 | 沈黙を Active な選択肢として permit |
| 同一趣旨の反復 | 学習能力疑い | pre-speak audit で重複排除 |
| 全 mode 同一閾値 | mode の意味喪失 | mode-specific threshold |
| state-less reactive 化 | Always-On の本旨喪失 | Relationship State の継続性保持 |
| User A / B どちらかへ偏る | 関係性の歪み | asymmetric attention で補正 |
| listening 不可視化 | surveillance 不安 | 必ず可視化 |

### 11.3 失敗モード × 対策マトリクス

| 失敗モード | 影響 | 検出 | 対策 |
|---|---|---|---|
| observer 実行コスト爆発 | LLM 課金圧迫 | cost telemetry | hierarchical analysis、軽量 trigger 先行 |
| 観測遅延が UX を破壊 | invoke 経路 latency 増 | timing diff | observer は fire-and-forget、主経路非ブロック |
| Relationship State の不整合 | 誤った判断材料 | state validation | state schema versioning + audit logs |
| 発話頻度の暴走 | ユーザー離脱 | speak rate metrics | silence_budget hard cap + per-user override |
| rupture 検出失敗 | 傷つけ発話 | post-hoc feedback | rupture detector の保守側偏向、false negative 許容 |
| Phase boundary 越境 | scope creep | PR review | Phase 定義の docs 化（本書） |
| process isolation で state 喪失 | observation 不連続 | metrics | state-less 設計 + observable 都度再構築 |
| 暗示的 mode 検出の誤検出 | ユーザー混乱 | feedback | Phase E まで導入しない |

### 11.4 反証可能性（Phase A 完了基準の数値化）

§4 Phase A 完了基準を再掲（数値ゲート明示）:

- 観測カバー率 ≥ 95%
- 観測遅延中央値 ≤ 50ms
- 観測コスト増 ≤ 1 LLM call / message
- UI 上のユーザー観測可能変化 = 0

これらが未達なら Phase A の設計を再検討（次 phase に進まない）。

### 11.5 学術基盤

設計判断の根拠となる学術領域:

| 領域 | 著者 / 概念 | 設計への接続 |
|---|---|---|
| Active Inference | Karl Friston | 観測 → 内部モデル更新の継続性 |
| Mentalization | Peter Fonagy | 他者の心を心で考える = Relationship State |
| Negative Capability | John Keats / Wilfred Bion | 不確実性を保持する能力 = STAY_SILENT 原則 |
| Constructed Emotion | Lisa Feldman Barrett | 感情を構築物として観測 |
| Turn-Taking | Sacks, Schegloff, Jefferson | 会話の構造分析 = phase classifier |
| Ambient Awareness | Erickson, Kellogg | peripheral computing = listening UX |
| CASA Paradigm | Reeves & Nass | 人は機械を社会的存在として扱う傾向 = surveillance 不安への配慮 |
| Companion AI Research | Replika / Pi / Character.AI 研究 | parasocial concern, 依存リスク |
| Mirror Neurons / Empathy | Iacoboni 等 | Mirror channel の人間学的根拠 |
| Extended Mind | Andy Clark | CoAlter = 関係の拡張記憶 |

### 11.6 人間超越のための追加アイデア

CEO 指示「人間を超越できるアイデア」への応答。Phase 別に振り分け:

#### Phase A で組み込み可能
- **Conversation Phase Classifier**: 軽量分類器で opening/exploring/converging/closing を判定。Speak Decision Engine に注入。
- **Asymmetric Attention Tracker**: User A / B の発話バランス計測。極端偏りを Relationship State に記録。
- **Observation Cost Budget**: 1 日あたりの分析コスト上限を pair-level で管理。

#### Phase B で導入候補
- **関係状態の可視化**: 「🔵 探している: 今夜の映画」/「🔵 静かに聞いています」を CoAlter ボタン上に表示。観測を**見える化**することで surveillance 不安を信頼に変える。
- **Two-Channel Speak**: Mirror channel（小さい反射）と Card channel（決定的提案）を分離。
- **Negative Capability First-Class**: 「今夜は雑談で大丈夫だよ」のような**未決定を保持する発話**。他社 AI assistant にない設計。

#### Phase C で導入候補
- **Disagreement-Aware Mirror**: 不一致検出時、proposal でなく「A さんは"安心感"、B さんは"新鮮さ"を優先してそう。両方ある案を探す？それともどっちか優先？」のような**問いの再構成**。
- **Question Quality Score**: 投げる質問の「気づきを生む確率」を内部 score 化。
- **Pre-Speak Internal Audit**: 発話前に内部 simulate（「これは A さん向き？両方？」「最近似たこと言った？」）。

#### Phase D で導入候補
- **After-Action 自然 follow-up**: 「前回の竜宮の誘い、観た？どうだった？」（HDM P5 Reality Anchoring の自然な拡張）。
- **Mode 切替を観測対象化**: 「旅行モードにしたね。何かそういう話の流れ？」 mode 切替を**問いかけのきっかけ**に転用。
- **Pre-Mortem Mode**: 提案前に「これがダメだった場合の理由」を内部 simulate。
- **Mirror Confidence Calibration**: mirror 発話の confidence を hedge 表現で出す（「〜っぽい」等）。

#### Phase E で導入候補
- **暗示的 Mode 検出**: ユーザーが mode を切り替えなくても、会話内容から推測。「📍 今夜のことについて考える Mode に切り替える？」 explicit user approval を経由。
- **沈黙への明示的許可**: 長時間沈黙の後「今夜決めなくて大丈夫だよ。考え中なら待つよ。」 沈黙を「処理中」と扱う。
- **Per-User Speak Frequency**: A さん「もっと話してほしい」、B さん「控えめでいい」。両者制約のうち**厳しい方**を採用。
- **「あなたの言葉で言うと」モード**: CoAlter が観測した内容を、**ユーザー自身の過去の言葉遣い**で返す。「前に"安心感が大事"って言ってたよね」 Stargazer の判断原理観測と接続。
- **Disagreement Repair Mode**: rupture / 強い不一致を検出した時、通常モードから「repair mode」へ自動移行。Proposal 完全停止、mirror も最小限、「ちょっと聞きたい。今、A さん何を大事にしてる？」のような 1-1 質問に切替。**衝突時に AI が消える**のが普通だが、Aneurasync は**衝突時に最も丁寧に立ち会う**。

### 11.7 進化シナリオ（1 年後の姿）

| 時期 | 状態 |
|---|---|
| 3 ヶ月後 | Phase A-B 完了。観測安定 + Mirror 控えめ運用 |
| 6 ヶ月後 | Phase C 完了。Question Channel が awaiting-answer と統合 |
| 9 ヶ月後 | Phase D 完了。Proposal auto-speak が explicit invoke と並走 |
| 12 ヶ月後 | Phase E 進行中。per-user tuning が機能、関係状態の長期保持が安定 |

各 phase 完了は CEO 承認制。phase 飛び越え禁止。

---

## 12. 用語集

| 用語 | 定義 |
|---|---|
| Reactive 型 | 呼ばれた時だけ動く現状の CoAlter |
| Active 型 | mode ON 中は常時観察する Always-On CoAlter |
| Observer Loop | 各 message を shadow 分析する継続パイプライン |
| Relationship State | 二人の関係について CoAlter が保持する内部モデル |
| Speak Decision Engine | 発話判定の核心エンジン |
| silence_budget | 発話で消費、時間で回復する仮想予算 |
| Mirror Channel | 短い関係反射を出す UI 経路 |
| Question Channel | CoAlter が問いを投げる UI 経路 |
| Proposal Channel | 既存の提案カード経路 |
| Negative Capability | 不確実性を保持する能力（迷ったら黙る原則） |
| rupture | 関係の崩れ。HDM 由来 |
| conversation_phase | opening / exploring / converging / closing |
| Awaiting-Answer | 質問→回答の連鎖継続フラグ |

---

## 13. 参照ドキュメント

- `docs/heart-dynamics-model-v1.md` — HDM v1 設計（rupture 検出 / Phase Control / Negative Capability の原典）
- `docs/coalter-diagnostics-retrieval-preflight-a4.md` — A4 retrieval API 設計
- `lib/coalter/triggerDetection.ts` — 現状の trigger 検知ロジック
- `lib/coalter/understanding/redactedDiagnosticsBuffer.ts` — A2 buffer 仕様
- `lib/coalter/understanding/diagnosticsFanout.ts` — A3 fan-out 仕様
- `app/api/coalter/diagnostics/preview/route.ts` — A4 retrieval route
- `hooks/useCoAlter.ts` — CoAlter state machine
- `app/(culcept)/talk/[threadId]/ChatClient.tsx` — UI 統合点
- `lib/coalter/engine.ts` — runCoAlterPipeline / runMovieShadowUnderstanding
- `memory/aneurasync-philosophy.md` — 中心問い・最高体験

---

## 14. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-16 | 初版作成（docs-only PR） | CEO（Always-On 方向性 / Phase A 着手 / 自動発話なし維持） |

---

**最終確認**: 本設計は **docs-only**。runtime 実装 / env 変更 / API 変更 / UI 変更を一切含まない。Phase A 実装は別 PR、Stop-before-merge lane で別途提示する。
