# Second Self Map — Implementation Plan（status 付き backlog + 実装順序）

> 2026-06-05 / `claude/nifty-turing-128e67` / CEO（GPT 判断経由）承認: master design 採用・**v0 直行せず本 Plan を先に**
> 上位設計: `docs/second-self-map-master-design.md`（vision/architecture）。本書は **HOW / WHEN / status / 順序 / 依存**。
> **原則: 全項目に status。漏れたら実装ルートに乗らない。**
> **status 凡例**: `done`（実装+検証済）/ `restored`（FH から復元・main 着地済）/ `planned-v0` / `planned-v1` / `planned-later` / `gated`（CEO 承認要）/ `moonshot`（研究段階）/ `rejected`（やらない・research 反証含む）/ `principle`（横断原則）

---

## 1. 完全 backlog（全項目・status・出自・依存）

### A. 完了・復旧（done / restored）— main d4db3c97 に着地済
| 項目 | status | 出自 |
|---|---|---|
| FH MapTab 画面復旧（mode 色チップ / ガラス質ルート線 / オーラ呼吸・到着鼓動 / 道路沿いルート / flight 弧 / 未対応点線） | restored | FH |
| selectedMode 永続化（S1-A・localStorage） | done | FH |
| 前回想起 recall「前回こう動いた」（S2-A） | done | FH |
| per-mode 所要時間目安（徒歩/車/電車・乗换数・「判断材料」） | restored | FH |
| MobilityLegCard（mode 選択 / readOnly 実績 / sensitive mask） | restored | FH |
| transportMode 正本語彙 = RouteTransportMode | done | CEO 決定 |

### B. FH 計画済・未実装（planned / gated / moonshot）
| 項目 | status | 統合先 |
|---|---|---|
| S2-B レパートリー学習（頻度/recency・OD/時間帯/曜日 一般化） | planned-v1 | L1（belief 本体） |
| S6 選択理由フック / Alter 接続 | planned-v1 | L2（correction 完全形） |
| S4 天候バッジ / 文脈条件付け | planned-v1 | L5（context modifier） |
| S5 1日成立チェック | planned-later | Day Rehearsal |
| S3 個人化移動時間「あなたのペース」 | planned-later | （移動観測） |
| S1-B Supabase 永続化（クロスデバイス） | gated | DB 承認案件 |
| M1 受動的意図推定 / M2 選好確率モデル / M3 説明可能な地図 / M4 体調連動 / M5 移動の自己発見レポート | moonshot | Wave 3 |

### C. research#1 追加（実装設計）
| 項目 | status | 配置 |
|---|---|---|
| preference-not-policy（確率的・locked mode を作らない） | principle | 横断 |
| selected=低精度 / actual=高精度 | planned-v0 | belief 更新 |
| ★actual は GPS でなく **override のみ**（自動 actual なし） | principle | 横断接地 |
| selective forgetting（precision 緩和・**時間 decay でない**・override矛盾/regime-change trigger） | planned-v1 | L3（新規・bayesianAxisUpdater に decay path 追加） |
| cold-start partial-pooling（global marginal seed・階層 fallback） | planned-v1 | L4（新規） |
| context = posterior modifier（**prior を汚さない**） | principle | 横断 |
| scrutability / correction-via-explanation | planned-v0 / planned-v1 | v0-E（最小）→ L2（完全） |

### D. research#2 追加（革命ビジョン）
| 項目 | status | 配置 |
|---|---|---|
| the map of YOU（世界の地図→あなたの地図） | principle(vision) | 横断 |
| 今日のあなたなら（hypothesis surface） | planned-v0 | v0 |
| neediness gate / 沈黙デフォルト | planned-v0 | v0-B |
| Day Rehearsal（1日成立シミュレーション・課金核・**balanced 提示**） | planned-later | Wave 2 |
| energy curve（strain/recovery を"1日"に） | planned-later | Wave 2 |
| counterfactual「もし〜なら」 | planned-later | Wave 2 |
| self-discovery report（マップ=鏡） | moonshot | M5 |
| サブスク価値 = 毎日開く理由（**単機能ロックでない**） | principle(戦略) | 横断 |

### E. ★rejected / 禁止（やらない — research 反証 + CEO 既定）
| 項目 | status | 根拠 |
|---|---|---|
| locked mode（deterministic 確定手段） | rejected | 禁止・確率候補のみ |
| ハードロック（N回で確定） | rejected | research 0-3 反証 |
| 距離 → mode 推定 | rejected | CEO 既定 |
| fake duration（偽の数字） | rejected | CEO 既定・取れねば「—」 |
| 人格診断 / 固定ラベル（「あなたはこういう人」） | rejected | 仮説トーンのみ。★copy-tone 補正(GPT): 単語「あなた」の全面禁止でなく "あなたはこういう人" を禁止し "今日のあなたなら / この区間では / 今日の文脈では" は許可。v0-C test は保守的に「あなた」禁止のまま（将来 tone 調整時に緩和） |
| 自然言語テキスト編集 steering（実装-now として） | rejected → moonshot | research#2 0-3 反証 |
| 常時通知 / 押し付け先回り | rejected | research#2 notification fatigue |
| heavy control UI | rejected | research#2 Goldilocks |
| 生 TSP 順序最適化を売りにする | rejected | research#2 commodity |
| 会話 UI だけを売りにする | rejected | research#2 table-stakes |
| Google API の無断追加 / DB・Supabase / push・PR・GitHub | gated | CEO 承認案件 |

---

## 2. v0 in / out
- **in**: Mobility Hypothesis Surface（= 今日のあなたなら + なぜ + 訂正 + 必要時のみ・**仮説**）= v0-A〜v0-F
- **out（後続に回す）**: Day Rehearsal 本体 / energy curve / counterfactual / self-discovery report
- **軽く扱う（断定しない）**: weather は v0 で軽く（雨→電車寄り 程度）。baggage / fatigue / urgency は **v0 に入れない**（L5/後続。観測プロキシ未確定）

---

## 3. v0 分解（v0-A〜v0-F）+ 依存（dependency map）
| slice | 内容 | 依存 | 種別 |
|---|---|---|---|
| **v0-A** | pure hypothesis builder（belief + context → hypothesis オブジェクト） | （mock belief で独立開発可） | pure |
| **v0-B** | necessity gate（belief signal 量 / context shift → 出す?） | v0-A の型 | pure |
| **v0-C** | explanation copy generator（hypothesis → 仮説トーンの文言） | v0-A | pure |
| **v0-F-lite** | belief read adapter（selectedModeStore/S1-A 履歴 → 実 ModeBelief・★GPT 補正で v0-D 前に挿入） | S1-A 永続化 | read |
| **v0-D** | MobilityLegCard に**非侵襲**表示（★実 belief を使う・mock 禁止） | v0-A, v0-C, v0-B, **v0-F-lite** | UI |
| **v0-E** ✅ | correction writeback（仮説への応答のみ記録: confirmation / explicitCorrection・別 store・★全選択を override にしない） | S1-A + 自前 hypothesisFeedbackStore | wiring |
| **v0-F** ✅ | belief update（precision 加重: selectedModeStore × hypothesisFeedback を JOIN・新 store なし・selected1/confirmation1/correction2） | S1-A + v0-E | read |

> belief の **READ** は S1-A 履歴 + v0-E hypothesisFeedback から on-the-fly 加重集計（新 store 不要）。**precision 区別**（selected 1.0 / confirmation 1.0 / correction 2.0・filter-bubble 上限）が v0-F の本体。詳細: `docs/second-self-map-v0f-mini-design.md`。

---

## 4. 実装順序（全体・各 slice は tight-slice：tsc 0 / unit test / 実機 smoke / CEO 承認 / 個別 commit）
```
v0-A ✅ → v0-B ✅ → v0-C ✅ → split修正✅ → v0-F-lite ✅ → v0-D ✅ → v0-E ✅（feedback writeback） → **v0-F ✅（precision 加重 belief・2026-06-05・mobility 84 test PASS）** → 🔁 loop 閉（仮説→選択→feedback→belief 反映）   … **Wave 0 完・v0 smoke 完全 PASS + main 着地済**（A〜I logic[84 test] + CEO 手動 live[A〜D+視覚] + ローカル main squash[`5f05391f`・zero-loss/tsc footprint 0] 2026-06-05・`docs/second-self-map-v0-closeout.md`）
 → L1(full belief / S2-B) → L2(correction+理由 / S6)
 → L3(selective forgetting) → L4(cold-start) → L5(context modifier / S4)   … Wave 1
 → Day Rehearsal(S5) → energy curve → counterfactual → S3(あなたのペース)    … Wave 2
 → M1/M2/M3/M4/M5(self-discovery=鏡) / Ambient / 1日交渉                    … Wave 3 moonshot
```

---

## 5. gated / 未実行（記録）
- **option 2 deep research（堀仮説）= 未実行**（#18・最終段で必要時：サブスク成功例 / 自己理解=堀の立証 / notification 許容閾値）
- S1-B DB 永続化 / 外部連携（予約メール）/ push・PR・deploy = 承認案件

## 6. 参照
- 上位設計（vision/architecture）: `docs/second-self-map-master-design.md`
- v0-F mini design（precision 加重 belief・実装済）: `docs/second-self-map-v0f-mini-design.md`
- v0 smoke 手順: `docs/second-self-map-v0-smoke-plan.md`
- **v0 closeout（smoke 結果・A〜I PASS 記録）: `docs/second-self-map-v0-closeout.md`**
- **Wave 1 / L1 mini design（移動レパートリー学習・S2-B）: `docs/second-self-map-wave1-l1-mini-design.md`** — L1-a + L1-b 実装済・**ローカル main 着地済（3d3d24a8）**・closeout: `docs/second-self-map-wave1-l1-closeout.md`
- **Wave 1 / L1-b mini design（OD 条件付きレパートリー belief・実装済 live）: `docs/second-self-map-wave1-l1b-mini-design.md`**
- **L4 mini design（cold-start partial-pooling・階層 shrinkage）: `docs/second-self-map-l4-mini-design.md`** — L4-a(2-level)実装済（branch・`0b4f404e`・未配線）
- **L4-b mini design（multi-level + global marginal）: `docs/second-self-map-l4b-mini-design.md`** — L4-a + L4-b 実装・配線済・**main 着地 live（pure `93aa5653` + 配線 `44633d16`）**
- **L4 closeout（pure + 配線 着地・smoke 7項目 PASS）: `docs/second-self-map-l4-closeout.md`** / L4-c 較正方針: `docs/second-self-map-l4b-closeout.md`
- **L3 mini design（selective forgetting・regime-change 緩和）: `docs/second-self-map-l3-mini-design.md`** — L3-a 実装・配線・**main 着地 live（pure `77104e1a` + 配線 `7c394a40`）**
- **L3-a closeout / L3-b mini design: `docs/second-self-map-l3a-closeout.md` / `docs/second-self-map-l3b-mini-design.md`**
- **L3-b-1（OD 単位 regime-change）実装・配線・main 着地 live（`0cc5217b`・mobility 213 test）** — closeout: `docs/second-self-map-l3b1-closeout.md`。場所のパターン変化を OD 全 leg に波及（同一 OD の別 leg に伝播）。
- **L3-b-2（selected-only 持続シフト）pure main 着地（`846c3a2e`・未配線=production 不変・mobility 233 test）** — closeout: `docs/second-self-map-l3b2-closeout.md`。**配線は実データ後 / 明示 GO まで保留**（最弱信号・誤検出=「忘れる地図」リスク）。leg>OD>silent・λ_silent=0.8・退行ゼロ
- **較正 backlog: `docs/second-self-map-calibration-backlog.md`** — κ/λ/K/threshold は固定値運用 → 実データ後に L3-c/L4-c で較正。現時点 tuning 実装しない。
- **Wave 2 Day Rehearsal**（1日を先に試す forward simulation・最適化でない）。mini design(step1-3) `…-day-rehearsal-mini-design.md` + **pure simulation layer main 着地（step4・main `f1e87f39`・未配線・20 test・tsc footprint 0・新規ファイルのみ=production 不変）: closeout `…-day-rehearsal-step4-closeout.md`**。`rehearseDay`(前方積分・6 計算=成立/friction/buffer/strain/recovery/convergence・全て仮説 estimate + evidence trace) + `buildRehearsalInput`(既存 DayGraph/feasibility(slack)/TransportSegment join)。読み取り専用診断層。**配線 mini design 済: `…-day-rehearsal-wiring-mini-design.md`。**配線 main 着地（`d9354db4`・Option D status-only・CalendarTab 選択日 day-level outlook バナー・READ-only・closeout `…-day-rehearsal-wire-closeout.md`）・実機 smoke PASS（2026-06-06・CEO/GPT）**。W-1 監査で PlanClient 全日 feasibility は unsafe → 選択日 displayMap status を honest degrade で再利用（既存 hook 非改修）。**timeline point marker: WPM-1 詰まり(convergence) marker main 着地 live（`1414bf38`・smoke PASS・closeout `…-day-rehearsal-wpm1-closeout.md`・選択日 timeline・read-only・仮説トーン・sensitiveProximity redaction）。**WPM-2 Option A 解禁: raw feasibility 公開 + recovery marker main 着地 live（`59e97dc4`・smoke PASS・closeout `…-wpm2-closeout.md`）**。WPM-2a=feasibility pipeline/hook 戻りに raw `DayFeasibilityResult`(真の slack)を additive 公開(display byte 不変)。WPM-2b=recovery marker「ここは一息つけそうです」(真の slack=gap−travel ≥60min・gapMin でない=honest・strain decouple で WPM-1/banner 不変・convergence と排他・sensitiveProximity redaction)。audit: `…-wpm2-audit.md`。**次=Evidence「なぜ?」UI(mini design 済 `…-evidence-ui-mini-design.md`・placement=banner「なぜ?」toggle 推奨・known/unknown/inferred を自然日本語・read-only・実装 GO 待ち)** / transport 統合 / convergence の magnitude 化 は別 slice**。
- FH 戦略原典: `docs/plan-map-second-self-strategy.md`（main）
- FH 着地 closeout: `docs/fh-maptab-squash-landing-closeout.md`
