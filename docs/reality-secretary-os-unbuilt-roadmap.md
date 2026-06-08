# Reality Secretary OS — 未構築フェーズ ロードマップ（このセッション担当・forward）

> 2026-06-09 / Build Unit / CEO 指示「未構築部を最高品質で構築。大フェーズ＋細スコープ＋順序で提出。旅行/複数人は担当外」。
> 前提: ギャップ監査 `docs/reality-secretary-os-vision-vs-impl-gap-audit.md`。北極星 = 「毎日の最適プランを先に組み、ズレを先に検知し、最適案で起動・誘導する最高知能の秘書 OS」。
> 担当軸 = **判断・行動・記憶・プラン構築軸**（Reality/PRM）。**担当外** = 旅行モード/複数人モード（別アイデア）・場所/移動軸（第二の自己マップ session）。

---

## 0. 完了済（基盤・このセッション）
- **R0 PRM パイプライン + Alter Bridge**: events→review→model→surface→feedback（A1-7-33〜35・operator-dev）+ **A1-7-36 PRM⇄Alter Bridge（flag OFF dormant）**。＝「本人の判断傾向」を観測・co-create・Alter に内部参照注入する土台。

## 1. 順序の原則（ゴールから逆算）
1. **記憶が全ての土台**: empty-day も神経系も deeper Alter も「その人の記憶」を消費する。→ **記憶先行**。
2. **本丸 = 毎日の最適プランを先に組む（empty-day）**: 最高ユーザー価値。記憶の上に立つ。
3. **pure-first / production-last**: 各 slice は pure→test→（dev preview）→着地。配送/native/介入/本番は stop gate。
4. **Alter 先行は非推奨**（後述 §Alter）: A1-7-36 は完了済。さらなる Alter 深化は「記憶層」が要るので記憶先行が Alter も unblock する。

---

## R1 — 記憶基盤（4 種 + Correction）★最優先・now-able（pure）
**目的**: 「その人専用の秘書」の核。**新規データ収集はしない**（既存 PRM/calendar/wear/dialogue/repair を read）。捏造しない（無ければ「—」）。

| scope | 中身 | 状態 |
|---|---|---|
| **R1-0** | memory-assets 監査（episodic/semantic/procedural/preference/correction の **既存 source 棚卸し**） | ★次・read-only |
| **R1-1** | memory taxonomy + 型モデル（pure・5 種の意味と source 契約） | pure |
| **R1-2** | Semantic adapter（PRM M3 tendency → semantic memory として束ねる） | pure・既存 reader 再利用 |
| **R1-3** | Correction memory 統一（PRM feedback + 移動 correction を統一 read・本人訂正の最強 signal） | pure |
| **R1-4** | Episodic reader（既存 calendar/wear/dialogue から・redacted・sensitive 除外） | pure |
| **R1-5** | Procedural reader（採用された修復手順＝repair candidate 採用履歴から） | pure |
| **R1-6** | Preference/Value reader（PRM + correction から価値・回復傾向の仮説） | pure |
| **R1-7** | Memory synthesis/retrieval（文脈→関連記憶 上位 K・非断定・確信上げない） | pure |
| (gate) | dev preview（operator-only で「記憶」を見る）・Alter への記憶注入 | R1 完了後 |

## R2 — Empty-day Plan Builder（本丸）★priority 2・now-able（pure→dev）
**目的**: 予定ゼロの日に Aneurasync が 1 日を**先に組む**。記憶 R1 を消費。3 案＋おすすめ前面。

| scope | 中身 |
|---|---|
| **R2-0** | empty-day 監査（既存 plan density / dayGraph / proposal 資産） |
| **R2-1** | empty-day 検出（pure・予定密度から空日判定） |
| **R2-2** | day skeleton builder（pure・memory + context から骨格 time-block） |
| **R2-3** | block proposer（pure・R1 記憶反映＝「午後外出が満足度高い」等） |
| **R2-4** | 3 案（守る/楽/攻める）day proposal（pure） |
| **R2-5** | recommended-first 提示契約（pure・「おすすめはこれ」+理由+別案サブ） |
| **R2-6** | dev preview（operator-only・empty-day plan 表示） |

## R3 — World State 統合 + Proposal 統合（pure→dev）
| scope | 中身 |
|---|---|
| **R3-1** | World State aggregator（pure・現在時刻/予定/状態/天気/権限 を既存から統合） |
| **R3-2** | Specialist → Proposal Generator 束ね（3 案生成の統一経路） |
| **R3-3** | Verifier 統合（invariant を proposal 経路に通す） |
| **R3-4** | dev preview |

## R4 — 神経系（Event Triggers・内容生成まで・pure→dev）
**目的**: Preflight/Departure/Linger/Off-route/Empty-day の**起動条件判定**と**通知内容**を作る。配送(native/push)は stop gate。

| scope | 中身 |
|---|---|
| **R4-1** | trigger condition engine（pure・各 trigger の発火条件評価） |
| **R4-2** | trigger → message builder（pure・非断定・最適案前面・1 タップ案） |
| **R4-3** | dev preview（起動条件の判定可視化・配送しない） |

## R5 — Permission/Authority 稼働 + 自動介入（★production gate）
Level 0–5 稼働・auto-action・ChangeSet→apply。**HELD（production）**。CEO 承認・GitHub 復帰後。

## R6 — 本接続/配送/production（★stop gate）
PlanClient surfacing・native location（背景）・notification 配送・GTFS realtime・canary・rollout。**全て stop gate**。

---

## 実装順（確定）
**R1 → R2 → R3 → R4 → [R5, R6 = stop gate]**。R1〜R4 は pure/dev で**自律実装可**。各 slice: audit→pure→test→tsc footprint 0→（必要なら dev preview）→着地→closeout。

## ★Alter 先行についての助言（CEO 問いへの回答）
**記憶先行を推奨。Alter 深化を先にしない。** 理由:
- A1-7-36（PRM→Alter）は**完了済（flag OFF）**。さらなる Alter 深化＝episodic/preference 記憶を Alter に注入＝**R1 記憶層が前提**。記憶を先に作る方が Alter も unblock。
- empty-day（本丸・最高価値）も記憶を消費。記憶が共通土台。
- Alter の flag ON（staging canary/shadow）は**検証/rollout step**で、記憶構築より限界価値が低く、かつ gate。
→ よって **R1 記憶 → R2 empty-day** を先に。Alter enable は R1 後に「記憶も載せた状態」でまとめて canary する方が強い。

## stop gate（自律実装はここで必ず停止し CEO 判断）
- **R5 自動介入・permission live**（ChangeSet→apply の実適用）
- **R6 production / native / notification 配送 / PlanClient 本線 surfacing**
- **REALITY_ALTER_BRIDGE_LIVE を staging/production で enable**（A1-7-36 の有効化）
- 旅行/複数人モード（担当外）

## 運用カデンツ
最小 scope 提示 → 細かい計画 → 実装 → 次の最小 scope …を **stop gate まで自律**。各 scope で audit/自己監査/tests・tsc/不接触/次設計を報告。
