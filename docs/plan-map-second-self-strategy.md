# /plan Map「第二の自己化する地図」戦略 & 施策提案

> 作成: 2026-06-03 / Build + Research Unit / **CEO 承認待ち（提案）**
> 起点: CEO 指示「旧来マップが解決できていないユーザー不満を、大規模リサーチで解く」
> 根拠: deep-research（105 agents / 23 sources / 25 claims を 3 票敵対的検証 → 21 confirmed・4 refuted）

---

## 0. エグゼクティブサマリ

旧来地図（Google/Apple Maps）の**核心的欠陥は「最短/最速」を前提に毎回ルートを再計算すること**であり、これは人間の実際の移動行動と**査読論文レベルで矛盾**する。ここに Aneurasync /plan Map が独占すべき gap がある。

- **人は最短を選ばない**: ルーティンの約 53% で常用ルートが推奨1位でなく、約 34% はどの推奨とも一致しない（Lima et al. 2016, *J.R.Soc.Interface*）。
- **各人のルートは少数**: 約 1/3 は単一ルートのみ。地図は**数回の観測で個人のレパートリーを学習できる**（同上 / Xu et al. 2021）。
- **意図は聞かずに推定できる**: MaxEnt 逆強化学習は受動観測のみで将来ルート＋目的地を推定し、かつ**ノイジー・非最適な実選択を原理的に尊重**する（Ziebart et al. 2008, AAAI）。＝「勝手な再ルートが選択を無視する」不満への直接の解。
- **個人化された移動時間は誰もやっていない**: Citymapper が個人歩行速度を調整するという主張は**反証**された（1-2）。これは「競合が既にやっている」ではなく **Aneurasync が独占しうる穴**。

**Aneurasync の勝ち筋**＝この学術知見を、既存基盤（`bayesianAxisUpdater` のベイズ学習・`observationBridge` の観測記録・自前の天候データ）で実装し、**「観測してその人好みに更新され、選択を尊重し、選択理由まで言語化する地図」**を作ること。Wanderlog/Citymapper の機能は**世界観フィルタで取捨**して取り込む（盲目的コピーはしない）。

---

## 1. リサーチ結論：旧来地図の gap（学術根拠つき）

| # | 知見 | 確信度 | 出典 |
|---|---|---|---|
| F1 | 人は最短経路を選ばない（53% が推奨1位でない、34% はどの推奨とも不一致） | high (3-0) | Lima et al. 2016 [1] |
| F2 | 個人のルート・レパートリーは小さく有限（1/3 は単一・対数正規 μ0.71 σ2.22）→ 数回観測で学習可 | high (3-0) | Lima 2016 [1] / Xu 2021 [2] |
| F3 | MaxEnt IRL は受動観測のみで将来ルート＋目的地（意図）を推定（聞かない） | high (3-0) | Ziebart 2008 [3] |
| F4 | MaxEnt は非最適・ノイジーな実選択を原理的に尊重・学習する | high (3-0) | Ziebart 2008 [3] |
| F5 | 単一ユーザーの受動観測のみで個人化・プロアクティブ機能が成立 | high (3-0) | Ziebart 2008 [3] |
| F6 | 歩行者の経路選択は個人特性×建造環境で決まる（個人差を無視するモデルは不完全） | high (3-0) | MEDIRL-IC 2024 [4] / Transport Reviews 2022 [5] |

**反証された主張（＝設計の禁則・好機）:**

| 反証 | 票 | 含意 |
|---|---|---|
| 「20回超でルートをロックイン可能（Gini 0.6 閾値）」 | **0-3** | ❌ ハードロック禁止。**確率的・継続更新**（MaxEnt 的）にすべき |
| 「Citymapper は個人の歩行速度を調整」 | **1-2** | ✅ **競合がやっていない穴** = Aneurasync が独占可能 |
| 「Wanderlog の最適化目的＝移動時間＋燃料（車中心）」 | 1-2 | ⚠️ multimodal 前提で取り込む |
| 「主流ナビは距離/時間のみ最適化し文脈を無視」（一般化しすぎ） | 1-2 | 文脈無視は**部分的に正しい**が断定しない |

---

## 2. 競合解剖の取捨（第二の自己フィルタ）

中心問い「**この機能は、ユーザーの第二の自己として必要か？**」で取捨する。

### Wanderlog（旅行計画 OS）
| 機能 | 実態（出典つき） | 判定 |
|---|---|---|
| 1日単位の訪問順最適化（最大15地点・"Optimize route"） | 公式 help/FAQ [6][7] | **転換して取込**: ソロ日常で"自動並べ替え"は不要。**「確定予定が移動込みで成立するか」の成立チェック**に転換（§5 S5） |
| 予約メール自動取込（`trips+NNNNNN@wanderlog.com` 転送 / Gmail 連携は便・ホテルのみ） | 公式 help [8] | **将来取込（要承認）**: 外部連携＝CEO 承認案件。今月はやらない |
| 共同編集 | — | **不要**: ソロの日常＝Aneurasync の世界観に合わない |
| オフライン / 費用管理 | — | **後回し**: 日常移動の核でない |

> 注: Wanderlog の**内部アルゴリズムは非公開**。公開情報から確認できたのは上記まで。"全ロジック精査"の限界として明記し、推定は推定として扱う。

### Citymapper（移動文脈 OS）
| 機能 | 実態（出典つき） | 判定 |
|---|---|---|
| step-free（階段/エスカレーター回避）= 荷物・ベビーカー・杖にも効く一機能多用途 | 公式 news/2577, 2004 [9][10] | **思想を取込・実装は保留**: 日本の駅構内データ未確認。"一機能多用途"の発想だけ採用 |
| 簡潔さ＞速さ（accessible は移動時間でなく簡潔さを最適化） | 公式 news/2262 [11] | **取込**: 「最速が常に正解ではない」＝我々の選択尊重と一致 |
| WALK LESS（屋外徒歩最小化＝雨・暑さ・湿気回避） | 公式 news/2548 [12] | **取込（即実装可）**: 天候は**自前データで出来る**（§5 S4） |
| 障害回避（線区セグメント単位）/ 路線別オプトイン遅延通知 | 公式 news/495, 1454 [13][14] | **思想を取込・実装は保留**: 日本の GTFS-RT カバレッジ未確認 |

### その他
- **Google Ask Maps / Immersive**: 正面から戦わない。ただし「**なぜこの提案か**」の説明 UI は我々の Alter 起点で再発明（§5 M3）。
- **TripIt**: 旅程自動パース＝Wanderlog 取込と同枠（外部連携・要承認）。
- **Komoot/Strava**: 個人移動プロファイル学習＝§5 S3 の発想源。

---

## 3. Aneurasync /plan Map が独占すべき gap

> **「ユーザーの意図・今の文脈・選択理由・1日全体の成立」を扱う地図。**
> 旧来地図は地点を最短で繋ぐ。Aneurasync は **"この人が・今日・どう動くか" を観測して学習し、選択を尊重し、選択理由まで自己理解に返す。**

3 つの独占領域:
1. **個人レパートリー学習**（F1/F2）— 毎回最適再計算をやめ、その人の実際の動き方を覚える。
2. **選択尊重**（F4）— 選んだ手段/ルートを上書きしない。確率的に学習する（ハードロック禁止＝反証）。
3. **選択理由の言語化**（本リサーチの空白領域）— 行動学習に **"なぜ"** を足し、Alter が「あなたはこういう時こう動くタイプ」と返す。**競合が構造的に持てない堀。**

---

## 4. コア・ロジック設計：「第二の自己化する地図」

### 4.1 観測すべき信号（現コードで観測可能なもの）
| 信号 | 取得元（実在） | 状態 |
|---|---|---|
| 選択した移動手段（leg 単位） | `MapTab.selectedModeByLeg`（legKey=`from__to`） | **現在は揮発** → 永続化が S1 |
| OD（出発/到着の地点種別・時間帯） | `ExternalAnchor`（one_off/recurring, confirmedAt, sensitiveCategory）/ baselineCoords | 取得可 |
| 天候 | `lib/shared/location.ts`（JMA office code・PREFECTURE_COORDS）/ `lib/weather/jma.ts` | 取得可・**MapTab 未使用** |
| 時間帯・曜日 | 予定の開始時刻 / now | 取得可 |
| 実移動時間/速度 | 道路 segment 距離（in-memory）× 経過 | 粗くは取得可 |
| 着用・体調の周辺信号 | `lib/shared/wearEvents.ts` | 別ドメイン（将来連携） |

### 4.2 個人化更新の仕組み（既存基盤の再利用）
```
[選択] selectedModeByLeg / 通過 leg
   ↓ 永続化  localStorage `aneurasync.plan.mobilityPref.v1`（versioned 慣行）→ 後で Supabase
   ↓ 観測記録 observationBridge.saveToStargazer({ axis, delta })  ← 既存パターン
   ↓ ベイズ学習 bayesianAxisUpdater.updateAxisBelief(prior, evidence, precision)
        ・新軸 例: mobility_pref_walk_vs_car, weather_sensitivity, detour_tolerance
        ・precision auto-scale → 数回の観測で効く（F2 と整合）
        ・sourceMultiplier で「選択=観測(高精度)」「推奨=推論(低精度)」を区別（観測>推論）
        ・contradiction engine で「晴れは徒歩／雨は車」等の二面性を検出
   ↓ 推論  recommendedMode = f(belief, context{weather,timeOfDay,dayOfWeek,OD})
        ・あくまで「前回/傾向」を控えめ提示。押し付けない（F4 選択尊重）
```
**要点**: 学習エンジンを新規開発しない。`bayesianAxisUpdater`（共役ガウス・precision 設計済）に**移動軸を足すだけ**で、Stargazer の自己観測思想と同じ仕組みに乗る。

### 4.3 選択尊重の原則（最上位・反証由来）
- 推奨と異なる選択を**上書きしない**。次回は**その選択を学習**して提示が寄っていく（MaxEnt 的：非最適でも破棄しない）。
- **ハードロックしない**（"N回で確定" は 0-3 反証）。常に確率分布として継続更新。

### 4.4 選択理由の言語化（Aneurasync 固有・Alter 接続）
- 推奨と違う手段を選んだ時、**まれに・低侵襲**で1タップ理由観測（疲れ/景色/安い/急ぎ/気分）。
- Alter（第二の自己）が後で **「あなたは雨で疲れてる日はタクシー」「金曜夜は遠回りでも歩く」** と返す。
- 行動（§4.2）＋理由（§4.4）＝ Stargazer 性格観測に合流 → 移動が自己理解になる。

---

## 5. 施策提案（優先度付き・両建て）

凡例: 🎯第二の自己 fit（◎◎>◎>○）／⚙工数／📚主根拠

### 【即実装】現スタック内（vanilla Google Maps・新規依存なし・課金なし）

**S1. 移動選択の永続化＋学習基盤の起動**（P0 / 土台）
selectedModeByLeg を揮発→`localStorage v1`（後で Supabase）。OD指紋（地点種別×時間帯）単位でも保持。observationBridge で観測化。
🎯◎（観測の入口）⚙小〜中 📚F2/F3 [1][3]
> これが無いと他すべてが成り立たない最優先土台。

**S2. 「前回はこう動いた」レパートリー想起**（P0）
同/類似 OD が次に出たら「前回: 電車」を**控えめ提示**（推奨を押し付けない）。bayesianAxisUpdater で mode 選好を belief 化、precision auto-scale で数回から効く。
🎯◎ ⚙中 📚F1/F2/F4 [1][3]

**S3. 個人化された移動時間「あなたのペース」**（P1 / 独占の穴）
既定徒歩速度でなく、実移動から個人係数を推定し到着予測へ反映（最初は粗く、観測で精緻化）。
🎯◎（"自分のペース"の自己理解）⚙中 📚競合反証=穴 [9] / MEDIRL-IC [4]

**S4. 生活文脈バッジ（WALK LESS / 天候）**（P1）
自前 JMA 天候で、雨/猛暑日に「屋外徒歩が長い leg」を控えめ警告＋徒歩少なめ手段を控えめ提案。step-free 等は日本データ未確認のため**やらない（正直）**。
🎯○ ⚙小〜中 📚Citymapper WALK LESS [12]

**S5. 「今日は全部回れる？」1日成立チェック**（P1 / Reality Control OS 核）
確定 anchor を**尊重**し、現在の順序＋手段で移動時間込みで**次に間に合うか**を判定、危ない leg を控えめに示す（自動並べ替えはしない＝Wanderlog の転換）。
🎯◎（1日全体の成立）⚙中 📚Wanderlog optimize の転換 [6][7]

**S6. 選択理由の言語化フック（Alter 接続）**（P1 / 堀）
推奨と違う選択時に**まれに**1タップ理由観測 → Alter が「こういう時こう動くタイプ」と返す。
🎯◎◎ ⚙中 📚本リサーチ空白＝独占機会

### 【moonshot】近未来の革新

**M1. 受動的 意図推定**: 日中の anchor＋移動から次の目的地/ルートを聞かずに先回り（クライアント近似の MaxEnt）。🎯◎ 📚Ziebart [3]
**M2. ルート選好の確率モデル**: MaxEnt 近似で「選ばれた非最適も破棄しない」学習を数理保証し、勝手な再ルートを設計レベルで撲滅。🎯◎ 📚Ziebart [3]
**M3. 説明可能な地図**: 「なぜこの提案／なぜ変わった」を Alter が"あなたモデル"起点で言語化（Google Ask Maps と差別化）。🎯◎
**M4. 体調連動ルーティング**: HDM/wearEvents 連携で「今日は歩かせない」。日本の構内 step-free データが揃えば accessibility も。🎯◎ 📚Citymapper step-free [9]
**M5. 移動の自己発見レポート**: 移動パターンから性格を映す（Stargazer 連携）。🎯◎◎

---

## 6. 設計の禁則（反証・CEO 既定から）
- ❌ ルートの**ハードロック**（0-3 反証）→ 確率的・継続更新のみ。
- ❌ **距離からの手段推定**（CEO 既定＋F1 が最短前提を否定）。
- ❌ **勝手な再ルート/選択の上書き**（選択尊重を最上位に）。
- ❌ 車中心の移動時間＋燃料最適化（split）→ multimodal 前提。
- ⚠️ Citymapper の step-free/障害回避を**日本でそのまま謳わない**（駅構内・GTFS-RT データ未確認）。天候は自前で可。
- ⚠️ 外部連携（予約メール取込・Gmail）＝**CEO 承認案件**。今月はやらない。

---

## 7. 段階ロードマップ（提案）
1. **Wave A（今月・即実装）**: S1（永続化・土台）→ S2（レパートリー想起）。"地図が覚える"を最小で体感。
2. **Wave B**: S5（1日成立チェック）＋ S4（天候バッジ）。Reality Control OS の核を強化。
3. **Wave C**: S3（あなたのペース）＋ S6（理由言語化・Alter 接続）。独占領域へ。
4. **Wave D（moonshot）**: M1/M2（受動意図推定・選好確率モデル）→ M3/M4/M5。

---

## 8. オープン論点 & 次の検証（要追加調査）
- **日本データ実現性**: 駅構内 step-free・GTFS-RT が JR/私鉄/地下鉄でどこまで取得可能か（→ 外部依存/課金の線引き）。
- **MaxEnt のクライアント近似**: 完全な逆強化学習は重い。localStorage＋bayesianAxisUpdater でどこまで"選択尊重"を近似できるか PoC が必要。
- **説明可能性 UI**: 「なぜ変わった」を非侵襲に出すパターン（Google Ask Maps の実挙動精査含む）。
- **行動→理由の橋渡し**: §4.4 の理由観測を Stargazer/HDM にどう合流させるか。

---

## 出典
- [1] Lima et al. 2016, *Understanding individual routing behaviour*, J.R.Soc.Interface 13:20160021 — https://royalsocietypublishing.org/doi/10.1098/rsif.2016.0021
- [2] Xu et al. 2021, arXiv:2312.13505（単一ルート 51.35%・対数正規 追試）
- [3] Ziebart et al. 2008, *Maximum Entropy Inverse Reinforcement Learning*, AAAI — https://www.ri.cmu.edu/pub_files/2008/7/AAAI2008-bziebart.pdf
- [4] MEDIRL-IC 2024, IEEE T-ITS（doc 10689250）— https://ieeexplore.ieee.org/document/10689250/
- [5] Pedestrian route choice systematic review 2022, Transport Reviews 10.1080/01441647.2021.2000064
- [6] Wanderlog Optimize route（help）— https://help.wanderlog.com/hc/en-us/articles/13545624787867-Optimize-route
- [7] Wanderlog FAQ — https://wanderlog.com/blog/faq/
- [8] Wanderlog 予約メール取込（help 4625693334811）— https://help.wanderlog.com/hc/en-us/articles/4625693334811-Add-flight-hotel-and-rental-car-details-by-forwarding-an-email
- [9] Citymapper step-free（news/2577）— https://content.citymapper.com/news/2577/find-the-best-accessible-journey-with-step-free-routes
- [10] Citymapper wheelchair routing（news/2004）— https://citymapper.com/news/2004/wheelchair-accessible-routing
- [11] Citymapper inclusive navigation（news/2262）— https://citymapper.com/news/2262/inclusive-navigation-citymappers-step-free-routes
- [12] Citymapper WALK LESS（news/2548）— https://citymapper.com/news/2548/routing-power-walk-less
- [13] Citymapper route around disruptions（news/495）— https://citymapper.com/news/495/route-around-disruptions
- [14] Citymapper line disruption alerts（news/1454）— https://citymapper.com/news/1454/get-notified-when-your-line-is-disrupted

> 定性シグナル（一次統計でない・参考扱い）: 迂回時の勝手な再ルート/選択を尊重しない/検索が遠方に飛ぶ/UI がごちゃつく 等のユーザー投稿（Google Maps support thread, androidpolice, slashdot）。根因仮説「意図・文脈・選択理由を Map が扱えていない」と整合。
