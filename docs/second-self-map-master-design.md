# 第二の自己マップ — マスター設計（完全統合・漏れなし）

> 2026-06-05 / セッション `claude/nifty-turing-128e67` / CEO 承認: vision 4核 受領・順序 **1(doc化)→3(v0 mini design)**
> **統合元（4つ・漏れ防止）**: ①FH 戦略 `docs/plan-map-second-self-strategy.md`（S1-S6/M1-M5）②research#1（実装設計・preference学習）③research#2（ビジョン/革新）④私の思考（the map of YOU 他）
> **原則**: すべての planned 項目を §1 インベントリで status 付き捕捉。実装は §4 v0 から。**断定でなく仮説**を全 surface の鉄則とする。

---

## 0. ビジョン（確定した4核 — CEO 受領）

1. **Map はルーターでなく「あなたの1日を先に走る第二の自己 / the map of YOU」**（世界の地図→あなたの地図）
2. **会話AIそのものは差別化でない**（Google Ask Maps が 2026-03 主流化＝table-stakes）
3. **差別化 = 本人モデル × 文脈 × 先回り × 訂正可能性**
4. **課金価値 = 単機能ロックでなく、毎日開きたくなる習慣 + 知覚価値**（Citymapper 機能壁は fire sale で失敗）

> **核の一文**: 「あなたの1日を先に走り、なぜを本人モデルで答え、文脈を自動で汲み、沈黙をデフォルトに、毎日開きたくなる第二の自己。」会話でも、機能壁でも、TSP でもない。

---

## 1. 完全インベントリ（★漏れ防止・全 planned 項目を status 付きで）

| ID | 項目 | 出自 | status | 統合先 |
|---|---|---|---|---|
| S1-A | 移動選択の localStorage 永続化 | FH | ✅ DONE | （v0 が利用） |
| S2-A | 「前回こう動いた」想起(recall) | FH | ✅ DONE | v0 が拡張 |
| **v0** | **Mobility Hypothesis Surface**（今日のあなたなら+なぜ+訂正+必要時のみ） | CEO 指示 | **▶ 次に実装** | §4 |
| S2-B | レパートリー学習（頻度/recency・OD/時間帯/曜日 一般化） | FH | 未 | **L1**（belief 本体） |
| S6 | 選択理由の言語化フック（Alter 接続） | FH | 未 | **L2**（correction-via-explanation） |
| — | 選択的忘却（precision 緩和・override/regime-change trigger） | research#1 | 未 | **L3**（新規・bayesianAxisUpdater に decay 追加） |
| — | cold-start partial-pooling（global marginal seed・階層 fallback） | research#1 | 未 | **L4**（新規） |
| S4 | 生活文脈バッジ（天候 WALK LESS）/ 文脈条件付け | FH+research | 未 | **L5**（context modifier・自動推定） |
| S5 | 1日成立チェック（次に間に合うか） | FH | 未 | **次: Day Rehearsal** |
| — | Day Rehearsal（1日成立シミュレーション・課金核・balanced 提示） | 私+research#2 | 未 | **次** |
| — | 1日のエネルギー曲線（strain/recovery を"1日"に） | 私(Whoop) | 未 | **次** |
| — | Counterfactual「もし〜なら」（本人モデルで・時間でなく1日の質） | 私 | 未 | **次** |
| S3 | 個人化移動時間「あなたのペース」（独占の穴） | FH | 未 | **次**（移動観測） |
| S1-B | Supabase 永続化（クロスデバイス） | FH | 🔒 gated(DB) | 別 Phase |
| M1 | 受動的意図推定（MaxEnt クライアント近似） | FH | 未 | **moonshot**（信頼性 ~43% 天井） |
| M2 | ルート選好確率モデル（選択尊重を数理保証） | FH | 未 | moonshot |
| M3 | 説明可能な地図（なぜ変わったか・Alter 起点） | FH | 未 | moonshot |
| M4 | 体調連動ルーティング（HDM/wearEvents 連携） | FH | 未 | moonshot |
| M5 | 移動の自己発見レポート（マップ=鏡・Stargazer 連携） | FH+私 | 未 | moonshot |
| — | Ambient 第二の自己（全自動先回り・必要性ゲート） | 私+research#2 | 未 | moonshot（研究段階） |
| — | 1日を交渉するマップ（agentic 再構成） | 私 | 未 | moonshot |
| 参考 | 「よく行く/よく使う場所」候補（nifty deferred） | FH handoff §3 | 別スレッド | Place Affinity 系（mobility 外） |

**観測信号（FH §4.1・実在）**: selectedMode(✅永続化) / OD(`ExternalAnchor`) / 天候(`lib/weather/jma.ts`・MapTab 未使用) / 時間帯・曜日 / 実移動時間・速度(粗く) / 着用・体調(`wearEvents`・将来) 。
**更新機構（FH §4.2 + research#1 補正）**: `observationBridge` 観測化 → `bayesianAxisUpdater`（共役ガウス・precision auto-scale・`MAX_PRECISION=50` 硬直化防止）。**★research#1 補正: 現状 precision 単調増加で decay path なし＝L3（選択的忘却）が必須**。

---

## 2. 統合アーキテクチャ（レイヤ）

```
観測   : selectedMode(低精度) ─┐
         override/訂正(高精度) ─┴→ [L1] mode選好belief（slow personal prior・localStorage）
                                          ↑[L3] 選択的忘却（override矛盾/regime-change で precision緩和・時間decayでない）
                                          ↑[L4] cold-start（global marginal seed・階層 fallback）
決定時 : belief →候補分布→ [L5] context modifier（天候/proxy で posterior をその瞬間だけ再重み付け・保存しない）
         → [必要性ゲート] 必要性≥閾値のみ surface（沈黙デフォルト）
         → surface「今日のあなたなら Y / なぜ / 違うなら…」（**断定でなく仮説**・locked でない候補）
訂正   : surface した仮説のトグル → override(高精度=actual相当) → belief更新 + L3起動
```

**★research#1 の重要接地**: 我々は GPS 追跡がない＝**actual mode を自動観測できない**。研究の selected↔actual は fleet-GPS 前提。**我々の "actual" = ユーザーの override（訂正）のみ**＝L2 が actual シグナルを供給。よって belief は当面 selected（低精度）+ override（高精度）で回す。

**preference-not-policy（research#1 F1）**: 実現経路を記憶せず mode 選好分布を学習。`TransportModeCandidate`{mode, `MovementConfidence`(low/medium/high/very_high・reason に `user_explicit`)} が既に確率分布を表現可能。**deterministic な locked mode フィールドを作らない。**

**二層（research#1 F2 / MEDIRL-IC）**: slow personal prior（belief）と fast context（L5 modifier）を分離。雨の日の逸脱が個人 prior を汚さない。

---

## 3. 横断原則（禁則・アンチパターン・正直な天井）

### 禁則（FH §6 + research 由来・絶対）
- ❌ ルートの**ハードロック**（0-3 反証）→ 確率的・継続更新のみ
- ❌ **距離からの mode 推定** / **偽の数字**（実 duration のみ・取れねば「—」）
- ❌ **勝手な再ルート/選択の上書き**（選択尊重が最上位）
- ❌ **deterministic locked mode** フィールド（候補分布のみ）
- ❌ **人格診断・固定ラベル**（「あなたはこういう人」と言わない→「今日の文脈ではこう見ています」）
- ❌ **時間一律の recency decay**（選択的忘却のみ）
- ❌ **自然言語テキスト編集 steering を実装-now**（research#2 で 0-3 反証・moonshot のみ）
- ⚠️ Citymapper step-free/障害回避を**日本でそのまま謳わない**（駅構内・GTFS-RT 未確認）。天候は自前可
- ⚠️ 外部連携（予約メール・Gmail）= **CEO 承認案件**
- ⚠️ sensitive leg は `MovementPrivacyClass` で duration も mode も blackout（既存ガードに合成）

### アンチパターン（やると陳腐化・research#2 確証）
会話UIだけを売る（table-stakes・即陳腐化）/ 生TSP順序最適化を売る（commodity）/ 単機能の有料壁（Citymapper の失敗）/ 常時通知・押し付け先回り（notification fatigue・Clippy）/ 最適解の押し付け（single-sided persuasion）。

### 正直な天井（research が自ら flag）
- 先回りの信頼性は**研究段階**（~43% しか当てられない・ProAct 効果値は反証）→ 全自動 Ambient は急がない
- Day Rehearsal の simulate は**最適を押し付けず balanced に**（Digital Twin RCT: single-sided=persuasion）

---

## 4. ★第一スライス: Mobility Hypothesis Surface v0（CEO 指定）

**狙い**: 「1日全体を先に走る」は大きすぎる。その**前段**として、MapTab/MobilityLegCard 上で `今日のあなたなら / なぜ / 訂正できる / 必要な時だけ` を最小で実装。**断定でなく仮説**。

**例（CEO 提示）**:
> いつもは電車を選びがちです。
> 今日は雨なので、歩きより電車寄りに見ています。
> 違うなら「今日は歩く」を選べます。

### v0 構成要素
1. **MinimalBelief**（L1 の種）: S1-A 永続化済 selectedMode を leg ごとに集計し頻度/modal を出す（「いつもは X」）。pure module `lib/plan/mobility/repertoireBelief.ts`（localStorage `plan-mobility:belief:v1:${legKey}`・DB 不要）。※当面は頻度。L1 で Bayesian belief（Dirichlet-multinomial 推奨）へ昇格。
2. **ContextBias（天候・L5 の種）**: `lib/weather/jma.ts` で当日天候→**決定時のみ**の軽い再重み付け（雨→徒歩 down/transit up）。**保存しない**。「今日は雨なので Y 寄り」。
3. **NecessityGate**: surface 可否判定。(a) belief signal ≥ N（数回の選択履歴）**または** (b) context が意味ある shift（雨等）。cold-start/無 signal/sensitive では**出さない**（沈黙デフォルト）。
4. **HypothesisSurface（UI・MobilityLegCard）**: `今日のあなたなら [Y]。いつもは [X]。今日は[文脈]なので[Y]寄りに見ています。違うなら[other]を選べます。` を**仮説トーン**（「こう見ています」）で。**「あなたはこういう人」と言わない。**
5. **CorrectionWriteback**: mode chip 選択（既存）= override → 高精度観測として MinimalBelief 更新（= actual シグナル）。可逆。

### v0 が守る禁則（再掲）
仮説であって断定でない / 人格ラベルなし / 偽数字なし（天候バイアスは定性・確率の偽装をしない）/ 距離→mode なし / sensitive blackout / 必要時のみ（沈黙デフォルト）/ 訂正は可逆。

### v0 受け入れ条件（案）
- 数回 mode 選択した leg で「いつもは X」が出る・別 leg/別日に漏れない
- 雨日に「電車寄り」の文脈理由が出る（晴れでは context 行なし）
- 違う mode を選ぶと次回 surface がその選択に寄る（override が belief を動かす）
- 履歴/signal が無い leg・sensitive leg では surface が**出ない**
- 断定文言ゼロ（全て仮説トーン）・tsc 0・unit test・実機 smoke

### v0 実装ファイル（予定）
新規 `lib/plan/mobility/repertoireBelief.ts`（belief・pure）/ `lib/plan/mobility/hypothesisGate.ts`（必要性ゲート・pure）/ `lib/plan/mobility/contextBias.ts`（天候バイアス・pure）。改変 `components/plan/map/MobilityLegCard.tsx`（仮説行）/ `app/(culcept)/plan/tabs/MapTab.tsx`（配線）/ `lib/plan/map/selectedModeStore.ts`（override writeback）。

---

## 5. ロードマップ（順序）

| Wave | 内容 | tier |
|---|---|---|
| **Wave 0（次）** | **v0 Mobility Hypothesis Surface**（§4） | 現スタック内 |
| Wave 1 | L1 belief 本体(S2-B) → L2 correction(S6) → L3 選択的忘却 → L4 cold-start → L5 context(S4) 自動推定 | 現スタック内 |
| Wave 2（次） | **Day Rehearsal(S5・課金核)** + 1日エネルギー曲線 + Counterfactual + S3 あなたのペース | 要・軽い新基盤 |
| Wave 3（moonshot） | M1 意図推定/Ambient + M2 選好確率 + M3/M5 説明可能・自己発見(鏡) + M4 体調連動 + 1日交渉 | 研究段階 |

各 Wave は **tight-slice**（一層ずつ・各層 tsc/test/実機 smoke・CEO 承認）。localStorage 完結で **DB 承認不要**（S1-B/外部連携は別 gated）。

---

## 6. 未実行・gated（記録）

- **option 2 deep research（堀仮説を埋める）= 未実行**（CEO 指示「最終段で必要時に投入」）。対象: ①サブスク課金成功パターンの一次事例 ②「自己理解=堀」をイノベーションのジレンマで立証 ③notification 許容閾値の定量（Reality Control OS DELIVER ゲート）
- S1-B Supabase 永続化 = DB 承認案件 / 外部連携（予約メール）= CEO 承認案件 / push・PR・deploy = 承認案件

---

## 7. オープン論点（要 Phase-1 実測キャリブレーション）

- 「今日のあなたなら」が accurate と感じる最小観測数（→cold-start seed 強度・5-user 検証）
- baggage/fatigue/urgency の privacy-safe proxy と false-positive 率（urgency=予定間の詰まり / fatigue=遅い時間・連続leg / baggage=ほぼ観測不能→toggle）
- 選択的忘却の trigger と precision 緩和係数（保守的開始→user 訂正で tune）
- filter-bubble 計測（override が訂正か同調か）
- 日本データ実現性（駅構内 step-free・GTFS-RT）/ MaxEnt クライアント近似 PoC / 説明可能性 UI / 行動→理由の Stargazer 合流
