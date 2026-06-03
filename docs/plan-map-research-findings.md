# /plan Map — deep-research findings（2回分・保全 + 可読索引）

> 作成: 2026-06-04 / セッション `claude/frosty-hellman-b3305e`
> **本書の目的**: deep-research 2 回の結果を**揮発（/tmp）から救出し commit で永続化**する。
> **生出力（verbatim・無損失・authoritative）**:
> - 第1回: `docs/research/plan-map-deep-research-1-strategy-raw.json`
> - 第2回: `docs/research/plan-map-deep-research-2-foundation-raw.json`
> 各 finding の完全な evidence 逐語引用・vote・全 source は raw JSON を参照。本書は可読索引。
> 方式: deep-research harness（5 角度に分解 → 並列 WebSearch → 出典取得 → **3票敵対的検証**(2/3 で棄却) → 統合）。

---

## 第1回（戦略）— task `wav2s6iq3`
105 agents / 23 sources / 93 claims 抽出 → 25 検証 → **21 confirmed / 4 killed**。
結論の戦略化: `docs/plan-map-second-self-strategy.md`。

### 確定 finding（confirmed・vote つき）
| # | finding | vote | 主出典 |
|---|---|---|---|
| F1 | 人は最短を選ばない（ルーティンの53%で常用ルートが推奨1位でない、34%はどの推奨とも不一致） | 3-0 | Lima et al. 2016, J.R.Soc.Interface 13:20160021 |
| F2 | 個人のルート・レパートリーは小（1/3 は単一・対数正規 μ0.71 σ2.22）→ 数回観測で学習可 | 3-0 | Lima 2016 / Xu 2021 arXiv:2312.13505 |
| F3 | MaxEnt IRL は受動観測のみで将来ルート＋目的地(意図)を推定（目的地/経路を尋ねない） | 3-0 | Ziebart et al. 2008, AAAI |
| F4 | MaxEnt は非最適・ノイジーな実選択を原理的に尊重・学習する | 3-0 | Ziebart 2008 |
| F5 | 単一ユーザーの受動観測のみで個人化・プロアクティブ機能が成立 | 3-0 | Ziebart 2008 |
| F6 | 歩行者の経路選択は個人特性×建造環境で決まる（個人差無視は不完全） | 3-0 | MEDIRL-IC 2024, IEEE T-ITS / Transport Reviews 2022 |
| F7 | MEDIRL-IC は個人特徴と環境特徴を別 NN で処理後統合し非線形報酬を捉える | 3-0 | IEEE T-ITS 2024 (doc 10689250) |
| F8 | Wanderlog の最適化は1日単位の訪問順並べ替え（最大15地点） | 3-0 | help.wanderlog Optimize-route / FAQ |
| F9 | Wanderlog は旅程固有アドレス転送で予約メール自動取込 | 3-0 | help.wanderlog 4625693334811 |
| F10 | Wanderlog の Gmail 連携パースは便・ホテルのみ | 3-0 | Wanderlog FAQ |
| F11 | Citymapper step-free=階段/エスカレーター回避、荷物/ベビーカー/杖にも効く一機能多用途 | 3-0 | content.citymapper news/2577, /2004 |
| F12 | Citymapper のアクセシブルは移動時間でなく「簡潔さ」を最適化 | 3-0 | citymapper news/2262 |
| F13 | Citymapper WALK LESS=屋外徒歩最小化（雨・暑さ・湿気回避） | 3-0 | citymapper news/2548 |
| F14 | Citymapper の障害回避は線区セグメント単位 | 3-0 | citymapper news/495 |
| F15 | Citymapper は路線別オプトインの遅延通知 | 3-0 | citymapper news/1454 |

### 棄却 finding（refuted・設計の禁則/好機）
| 主張 | vote | 含意 |
|---|---|---|
| Wanderlog の最適化目的=移動時間+燃料(車中心) | 1-2 | multimodal 前提で取り込む |
| Citymapper は個人の歩行速度を調整(個人化) | **1-2** | **競合未実装=Aneurasync が独占しうる穴** |
| 20回超でルートをロックイン可能(Gini 0.6 閾値) | **0-3** | **ハードロック禁止 → 確率的・継続学習** |
| 主流ナビは距離/時間のみで文脈を無視（一般化） | 1-2 | 文脈無視は部分的に正しいが断定しない |

### caveats / open questions（第1回）
- 出典は Wanderlog/Citymapper 自社 doc 中心（記述には妥当だが精度ベンチではない）。**Citymapper の日本カバレッジは未確認**。学術根拠(Lima/Ziebart)は**車GPS基盤**で徒歩/公共交通/日本への外挿は理論的妥当だが実証限定。
- open: 日本データ実現性 / 観測信号の具体設計 / 行動→理由の橋渡し / 説明可能性 UI 手法。

---

## 第2回（方針再検証 + 土台設計）— task `wc47vjng2`
105 agents / 23 sources / 105 claims → 25 検証 → **18 confirmed / 7 killed**。
**注意: 第2回の結論は専用戦略 doc に未統合**（戦略 doc は第1回時点）。本書 + handoff §8 + S1-A commit が保管先。

### 確定 finding（confirmed・vote つき）
| # | finding | vote | 主出典 |
|---|---|---|---|
| R1 | 既存方針=**支持(修正付き)**。移動手段選択は強く習慣化、ライフ遷移でのみ鋭く変化(習慣不連続仮説) | 3-0 | Verplanken 2008 (ScienceDirect S0272494407000898) / PLOS One 2016 (PMC4847906) |
| R2 | **修正①**: 「理由言語化」を学習の前提にしない。ユーザーは制御UIを使わない(1/4 手間, 1/4 不可逆恐れ, 19% privacy)→低負担・可逆優先 | 2-1 | Jannach/Jugovac/Nunes 2019 (web-ainf.aau.at) / EC-Web 2016 |
| R3 | **修正②**: scrutability(訂正可能性)を一級目標に。200+論文中7本のみ=高レバレッジ空白 | 3-0 | Nunes & Jannach UMUAI 2017 (arXiv:2006.08672) |
| R4 | 行動ログだけでは不十分、明示制御で補完。feedback は明示/意図的暗黙/非意図的暗黙の3分類 | 2-1 | SIGIR2022 (arXiv:2204.13844) / CHI2025 (2502.09869) / denoising (2006.04153) |
| R5 | 保存粒度は個別 item だけでなく「上位抽象(latent intent/OD/文脈)」でも keying すべき | 3-0 | WWW2023 Google (2211.09832) / SIGIR2022 / TOIS2021 |
| R6 | 忘却/減衰(forgetting/decay)を一級の設計関心に(非線形減衰・recency 重み) | 3-0 | MDPI Systems 2025 / Koren 2009 / Ebbinghaus 1885 |
| R7 | [S1キー] iCal の繰り返しインスタンスは UID+RECURRENCE-ID(値=元DTSTART)+SEQUENCE で識別 | 3-0 | RFC 5545 §3.8.4.4 |
| R8 | [S1キー] Google Calendar の `originalStartTime` は移動/再スケジュールでも不変の自然キー | 3-0 | developers.google.com/calendar recurringevents |
| R9 | [永続化] versioned key + 前方 migration(redux-persist パターン) | 3-0 | redux-persist docs / createMigrate.ts |
| R10 | [永続化] 堅牢性: バグ版からの移行も明示処理、書込失敗前提の fail-open(best-effort) | 3-0 | web.dev / MDN Storage quotas / WebKit bug 157010 |
| R11 | 日本 ODPT は JSON/REST 公開(但し新規依存・登録必須)。Google「Ask Maps」は選択肢可視化止まりで**選択理由は説明しない**=差別化健在 | 3-0 | odpt.org / developer.odpt.org / blog.google ask-maps |

### 棄却 finding（refuted・★設計に直結）
| 主張 | vote | 含意 |
|---|---|---|
| (UID, RECURRENCE-ID) は再 fetch をまたいで完全安定 | **0-3** | SEQUENCE 変更で変わりうる → **migration 前提**。実時刻でキーを作らない |
| 行動ログ駆動は必然的にフィルターバブルを生み悪化する | **0-3** | 過剰個人化は**慎重設計で回避可能な失敗モード**(必然でない) |
| 明示フィードバックは暗黙より高コストで非効果的 | **0-3** | 制御の知覚効率は UI 依存(CHI2025) |
| 説明は効率より effectiveness/transparency を最適化すべき(ユーザーは理解に時間投資) | 1-2 | 一般化は支持されず。R2(低負担優先)と整合させる |
| Ask Maps は検索/保存履歴で個人化している | 1-2 | 行動個人化の証拠としては弱い(差別化境界は再確認要) |
| ODPT の GTFS は主にバス用 | 0-3 | 鉄道含む(モードで形式差) |
| ODPT は東京中心 | 1-2 | 起源は東京だがカバレッジは流動的(Open Data Challenge 2025) |

### caveats / open questions（第2回）
- 2-1 票の finding(R2,R4 等)は verifier は high だが票割れ。recsys/intent/forgetting 文献は**大規模コンテンツ推薦が原領域**で /plan の小さな離散選択への外挿は claim 側推論。**decay は保守的に開始**(習慣的経路では aggressive recency が逆効果の可能性)。Ask Maps は 2026-03/04 情報で再確認要。**ODPT は vanilla(新規依存なし)制約と衝突**=当面保留。
- open: leg 安定キーの composite 設計とフォールバック順序 / decay 係数初期値(要実測) / scrutability UI(低負担・可逆と両立) / OD・文脈の集約スキーマ。

---

## 本リサーチが設計に効いた点（トレース）
- F1/F2/F4 → 「最適再計算でなくレパートリー学習・選択尊重」= 戦略の核（strategy doc §1/§3）。
- R7/R8（実時刻でキーを作らない・原始安定キー）→ S1-A は `anchorsForDay` が**元 anchor(id 安定)** を返すことを確認し id ベース legKey 採用（commit `8298642e`）。
- R1（支持・修正付き）/R2/R3 → S2-A は「最新前回値の想起(学習でない)」に留め、scrutability/理由言語化は HOLD（handoff §3/§4）。
- 「個人化歩行速度は競合未実装(1-2 反証)」→ S3 を**独占の穴**として位置づけ（HOLD）。
- 「ハードロック 0-3 反証」→ 将来の学習は**確率的・継続更新**（禁則・handoff §4）。

> Reddit 等は一次統計でない**定性シグナル**（strategy doc 末尾参照）。
