# 意思決定レポート: Candidate Lens を世界トップ製品にする設計勧告

CEO Taishi 宛 / Chief of Staff / 2026-06-21
（多エージェント deep research: 21 agents / 4 map + 5 research + 4 design + 4 judge + 3 refute + 1 synth。research は実 WebSearch + 一次資料検証。出典なしの主張は留保ラベル付き。）

---

## 1. 前提監査 (Premise audit)

現行方向「Google Places Text Search + 設備キーワード後置 + 内部 re-rank」には、研究で確定した**4つの構造欠陥**がある。一部はチューニングで直らない。

**(1) 設備キーワードは間違った抽象である(最重要)。** `focus_work` レンズが見せたい wifi/電源/静か/作業向き というフィールドは、Google Places API の**どの課金ティアにも存在しない**(一次資料で検証済み)。設備属性はサーバサイドで絞り込めず(フィルタ可能なのは `includedType`/`priceLevels`/`rankPreference` のみ)、Atmosphere ティアの属性ですら「取得後に返るデータ」で検索の前提にできない。つまり現行コードの「wifi/power/quiet は常に unconfirmed」は**設計の慎重さではなく、Google にデータが無いことの不可避な帰結**。設備語を検索文字列に混ぜる以上のことが原理的にできない。

**(2) CEO が指摘した都市密度の失敗には明確な機序がある。** `MAX_SECONDARY_QUERIES=1` で primary 文字列に設備語を後置する設計は、都市高密度(渋谷「カフェ」)では (a) primary だけで `maxResultCount=5` が prominent chain で即飽和し、(b) 設備語は店名・住所・Google types にテキストとして載る保証がないためランキングにほぼ寄与せず**no-op かノイズ**になる。逆に地方では候補が薄く**ゼロ件化**する。**最も価値が出るべき都市シーンで最も効かない** — これはチューニングで直らない構造欠陥。

**(3) 固定 vocab が個人差を潰す。** `PURPOSE_QUERY_KEYWORDS` の「電源=集中」は仮説であって fact でなく、**人により符号が逆**(電源カフェ=長居で集中する人 / ノマド密集でむしろ崩れる人)。固定語彙はこの個人差を構造的に潰し、Aneurasync 哲学の「観測の入口」に永遠に到達しない。(演繹・Aneurasync 実データ未検証だが state-dependence 原則から強く支持。)

**(4) retrieval source が moat の天井を機械的に決める。** personalization は retrieval が返した5件の中でしか並べ替えられない。`maxResultCount=5` が prominence で飽和すると、purpose-fit の高いニッチ店は**候補プールに入る前に切り捨てられ、personalization がどれだけ賢くても永遠にゼロ確率**。「Text Search で十分・moat は純粋に personalization」という前提は、この recall クランプで初手から破綻する(adversarial refutation で確定)。

**結論:** 現行案は3つの所与(Google を primary に固定 / 設備を fact 化できない / 固定 vocab)の内側で secondary query を最適化する**典型的 local optimum**。3つともプロダクト要件でなくツール選択の副産物。役割を取り違えている — **外部 API に purpose-fit を解かせようとしているが、外部 POI が解けるのは候補の存在・座標・型まで**。

---

## 2. 核心インサイト / Moat

**単一の最重要アイデア:** purpose-fit は外部ソースでは原理的に解けない latent variable であり、**Aneurasync 内部の観測(Stargazer 判断軸 × revealed-preference × 当日 state)でしか解けない**。だから設計を「外部=候補プール生成 / 内部=fit 推定とランク」へ**役割分離**する。

**Google/Yelp/Foursquare が構造的にできないこと(一次資料で確定):**
- **OS 権限壁**: Maps/Foursquare は OS の permission 分離で**カレンダー=目的の源泉に横断アクセスできない**。Aneurasync は schedule(`anchor.title` → `classifyPurposeLens`)を自アプリ内の正本として保持 = **壁の内側にいる**。API 連携で後発が真似られない。
- **no stored profile**: 最先端の Ask Maps / Foursquare Ask API ですら purpose を**毎クエリ手入力**させ、Foursquare は一次資料で「stored profile・calendar・mood を持たない」と明言。目的×状態の**永続モデルは原理的に空白**。

**北極星として正しい理由(哲学接続):** これは「未来の自分が先に試す」「自分ってそういう人間だったのか」に直結する。category prior は誰でも作れるが、**訪問歴ゼロの店の fit を「あなた自身の判断原理から」推定する**部分(= persona prior 層)は、観測許諾を得た Aneurasync にしか作れない。**moat はデータ量(後追い可能)でなく、本人公認の深層観測モデルが前提 = 購買不能**。防御線はそこに引く。

---

## 3. 推奨設計 (Recommended design)

4案を統合。**バックボーン = EFP(Evidence-Fusion Pipeline)の役割分離と honesty 不変条件**(honesty=5・feasibility=4・最も正直)。**北極星と段階育成 = Simulator(「未来の自分が先に選ぶ」)**(worldTopPotential=5)。**UX の核 = 観測ループ**(secondSelfFit=5・honesty firewall コード実証済み)。**SSPFE は戦略コンパスとして採用、その実装機構(persona を co-equal driver 化)は棄却**(§7)。

### 3.1 データフロー(役割分離)
```
schedule.title → classifyPurposeLens() → PurposeLens(5分類・常駐 prior)
  ↓
[候補プール] Google Nearby Search(New) を includedTypes で型ベース広め取得
            (purpose を検索文字列に混ぜない・Text Search primary 飽和を回避)
  ↓
[事実 enrich・任意] 候補座標で OSM/Overpass を 1回バッチ逆引き
            internet_access/service:electricity がタグ実在する店だけ [OSM] fact tier 昇格
            無ければ unconfirmed のまま(捏造しない)
  ↓
[fit 推定] buildPurposeFit() pure helper = {score, contributions[], sourceTags[]}
  ↓
[ランク] affinity nudge(既存 clamp 不可侵) → calibration(shadow first) → outlier 強制枠
  ↓
[UX] 既存 CandidateLensPanel ①②③ を consumer に
```

### 3.2 シグナルとスコアリング
- **一次シグナル = 内部観測(affinity engine)**。ただし**現状を正直に**: live engine がランクするのは history/distance/type/frequency で、persona 項は `PERSONA_EPSILON=0.05` の**非逆転タイブレーカー**。timeband/weather skew や判断軸リッチネスは **aspirational・未構築**。
- **persona prior 層(MOAT 中核・最初に集中投資・最も未構築)**: Stargazer 判断軸 → 重みベクトルを「曲げて」未訪問店の fit を推定。段階育成前提、cold-start では薄い。
- **shrinkage**: `λ=n/(n+k)` の発想は健全だが、SSPFE が引用した `minTotalForReady`(k≈8)は**実在しない hook**(判定で確認)。架空定数に紐付けず実在する readiness gate を読んで設計する。

### 3.3 retrieval source
Text Search を primary から外し **Nearby Search(New) + includedTypes** へ。**同じ Google source 内**で recall を広げ prominence 飽和を回避(source 交換不要・日本カバレッジは Google が最厚)。

### 3.4 honesty firewall(3ルール)
1. **未確認は null のまま**: `EvidenceType=unconfirmed → value=null` 契約を不変式として維持。Google に無いデータを推測で実値化しない。
2. **出典タグ必須**: 全 fit 根拠属性に `[公式]/[Places]/[OSM]/[自分の選択履歴]/[未確認]`。source-tag 無し属性はランキング根拠に使わない。OSM タグ実在時のみ fact 昇格 = honesty を「諦め」から「出典付き事実」へ。
3. **検索ヒット ≠ 設備存在**: secondary query keyword は OSM enrich のクエリ生成補助に**降格**し、ranking 根拠や UI 実値に昇格させない。

### 3.5 革新の核(明示)
- **再入力ゼロの purpose×state lens**: incumbent の最先端「打てば返す」を超え、許諾済み常駐モデルで再入力ゼロ。UX 差でなく**情報構造の差**で API では原理的に埋まらない。
- **exploration を ranking でなく reflection 層へ**: SOTA の bandit 探索は「精度のため未確認を賭けで上位化」して honesty と衝突。これを『この場所、あなたっぽくない気がしますが、どうでした?』という**反証収集の問いかけ**に転換 = 学術文献に無い転用で honesty 制約と両立。
- **calibration を反フィルターバブルの中核に**: Steck calibrated re-ranking で「目的最適化」と「多様性保証」を同一目的に統合(small-N では shadow-first・段階導入)。

**正直に SOTA/human 超えと言える範囲:** persona prior 層が**成熟した時のみ**「未訪問店を判断原理から外挿」が human アドバイザー(状態を毎回聞き直す)を超える。**今この瞬間は超えていない** — 現状は誠実な「候補プール+出典付き事実」表示に着地する。

---

## 4. なぜ世界トップを狙えるか

competitor 解剖で、世界水準は3型(汎用ランカー / 対話型=毎クエリ手入力 / 1軸行動学習)に分かれ、**どれも WHO×WHY×STATE の永続モデルを持たない**ことが構造的に確定。

1. **白地の正体は「目的×状態を毎回入力させない」**。Ask Maps / Foursquare Ask の最先端は「打てば返す」で UX 負荷かつ state(疲れ/急ぎ)は文章化されにくい。許諾下の常駐モデルなら再入力ゼロで lens を立て state を観測補完できる。
2. **OS 権限壁は競合の弱点であり Aneurasync の前提条件**。schedule を内側に持つ構造は購買不能。
3. **汎用品質と本人×状態は別レイヤーで競合せず重ねられる**。Tabelog/Google hours は fact tag で引用、並べ替えと「なぜここ」は本人モデルが担う。正面衝突を避けつつ差別化する唯一の現実解で、既存 dual-flag + evidence-tier が既に honesty-safe に実装済み。

---

## 5. 段階ロードマップ

| 段階 | 最小の正直な一歩 | flag/cost/rollback | 前提条件 |
|---|---|---|---|
| **P5-a R1**(計画済) | secondary query を **ranking 源に昇格させず** OSM enrich のクエリ生成補助に用途再定義。dormant pure helper のまま。 | 既存 flag OFF + production hard block 維持。cost ゼロ(pure)。rollback=自明。 | なし(現状で着手可) |
| **P5-b** official-source evidence | 候補座標で OSM/Overpass を**1回バッチ逆引き**、internet_access/service:electricity タグ実在店のみ `[OSM]` fact 昇格。無ければ unconfirmed。 | `officialFactEnrichEnabled` default false。cost=Overpass 無料・per-candidate loop 禁止・cache TTL。rollback=flag OFF。**fail-open**。 | **新規外部連携=CEO 承認**。日本カフェ充足率は未確認→PoC で fill rate 実測。 |
| **P5-c** in-app evidence preview | 出典付き「なぜここ?」を **観測の鏡型**(断定禁止)で既存 ②③ に表示。explanation 層 C。 | `PLACE_CANDIDATE_LENS_EXPLANATION_ENABLED`(既存・default false)。cost=pure。rollback=flag OFF。 | P5-b の出典タグ。**ranking 点火のハード前提**。 |
| **P5-d** personal purpose re-rank(MOAT) | fit で並べ替えるのでなく、affinity nudge(clamp 不可侵)を**実ランクに配線**。calibration は shadow-first。 | `purposeFitRankingEnabled` default false・production hard block・server-side。rollback=`maxRankShift>2` で自動 OFF + flag OFF。 | **4段点火ゲート(§8)**。 |
| **beyond** | persona prior 層(判断軸→fit 外挿)+ 反証探索 reflection ループ + 選択観測ループ。**最初に集中投資すべき MOAT 中核**。 | 全 pure・on-device。DB persistence(cross-device)は別 CEO 案件。 | Stargazer 深層観測の成熟 + consent 同期判断。 |

**critical path への正直さ**: 来店後の事後評価(「集中できた?」1問)が**未実装であることが cold-start の最大の急所**。これが無いと purpose-fit の検証が永久にできない。P5-c/P5-d の前に、または並行して**「来店後の1問観測」を最優先で入れる**ことを強く推奨。

---

## 6. 正直さ・安全・プライバシー guardrails(non-negotiables)

- **捏造ゼロ**: 未確認 wifi/電源/静か/混雑/雰囲気 は `value=null`。検索ヒットを evidence tier に昇格させない。これは反 over-assertion ガードそのもの。
- **calibration / 多様性 vs フィルターバブル**: 「フィルターバブルなし」は ranking に効けば**ゼロにできず緩和できるだけ**。P5-d 合格条件に **(a) pool 不変(フィルタでなくリランク) (b) 押しが可視で逆らえる(explanation note + clamp) (c) 履歴横断の多様性下限(calibrated re-ranking)** を必須要件化。outlier 強制枠は5件中1件(下限かつ上限)。Steck の α≈0.01 smoothing を最初から。
- **opt-out / 可逆性**: パターン振り返りは opt-in。ranking 軸は上書き/無効化でき、「これは違う」訂正経路を常設 → over-reliance 回避。
- **local-first**: 生 GPS/座標/住所は保存せず正規化テキストキーのみ。全 on-device localStorage。位置条件は市/地域粒度。
- **log してはいけないもの**: 生座標・住所・anchor.title 原文・notes・sensitiveCategory・選択 placeKey と reason の組。shadow ログは derived-only(KL値/maxRankShift 等)・200件上限・fail-open。

---

## 7. 棄却した道 / リスク

**棄却(やってはいけない):**
- **SSPFE の persona 実装機構**。北極星と moat 論証は採用するが、**persona を `(1−λ)` の co-equal primary driver にする機構は棄却**。理由: live `placeAffinity` は persona を `PERSONA_EPSILON=0.05` の非逆転タイブレーカーに**意図的に制限**し、`buildFactReason` は persona を引数に取れない設計(persona 由来理由を型レベルで禁止)。SSPFE はこれを**反転**して未訪問店に fit を断定するが「bounded-nudge を不可侵に維持」と偽の継続性を主張。これは**コードベースが防ぐために設計された失敗(断定 over-assertion)そのもの**。persona prior は育てるが、**ε タイブレーカー→段階的に重みを上げる**経路で、断定でなく λ 較正寄せ + 仮説トーンで正直に表現する。
- **設備キーワードを ranking 源に昇格させること**(§1)。dormant pure helper のまま enrich 補助に降格。
- **GNN/embedding/LLM-POI 路線**。大規模 check-in 前提・動的 item 空間で持てない・privacy on-device と非整合。データが貯まっても不要。明示的に棚上げ。
- **Foursquare Premium 即採用**。wifi/popular-hours は実在するが fill rate 非公開・商用契約・V3 廃止移行リスク → PoC で fill 実測してから。今月スコープ外。

**生き残る未解決リスク:**
- **persona prior が moat とユーザー価値の単一依存点**。Stargazer 深層観測が育たなければ incumbent を超える差別化に到達しない(誠実な fact 表示には着地する)。
- **来店後評価が未実装 = cold-start が永久に検証不能**。前提の生死を分ける急所。
- **OSM 日本カバレッジが疎**(internet_access 充足率未確認)→ enrich が大半 null。fail-open なので害は出ないが実用 enrich は限定的。
- **lens 中核コードが integration branch 在**。実装は lens 統合済み worktree で行い main 着地後に seam 追加。
- **branch 衛生**: 実装着手時は CLAUDE.md §8 の作業前ブランチ確認を厳守。

---

## 8. CEO への意思決定ポイント

**判断1 — 役割分離アーキへの作り直しを承認するか。** 推奨: **承認**。外部=候補プール / 内部=fit+rank の役割分離を製品原則として明文化。Text Search → Nearby Search(同一 Google source 内・cost 据置)。全段の前提。

**判断2 — 来店後「1問評価」観測を最優先で入れるか。** 推奨: **YES・最優先**。cold-start の生死を分ける単一の急所であり、Google が構造的に取れない signal。マネタイズでなくコア完成・初期検証に直結し「今月の成功条件」に合致。

**判断3 — P5-b(OSM 外部連携)に GO するか。** 推奨: **PoC を条件付き承認**。新規外部連携=承認案件。まず日本カフェ fill rate を read-only PoC で実測→実用性確認してから本実装。Foursquare Premium は棚上げ。

**判断4 — P5-d ranking 点火の4段ゲートを固定化するか。** 推奨: **YES**。点火順序 = (1) C explanation 層実装 → (2) calibration shadow ログで P/Q 乖離を dogfood 計測 → (3) clamp/outlier/maxRankShift gate 確認 → (4) CEO 承認。「C 必須」を技術的前提として固定。全 flag default OFF + production hard block。

**判断5 — persona prior 層に集中投資するか、断定リスクをどう統制するか。** 推奨: **投資承認・ただし ε タイブレーカーからの段階昇格に限定**。co-equal driver 化(SSPFE 機構)は棄却。cold-start では仮説トーン + λ 較正寄せで正直に表現し、observed>inferred をコードで強制。「迎合的に言い当てる」のでなく「本人が自分で気づく」を保証する分岐点。

---

**一行サマリ:** 現行案は local optimum。外部=候補プール / 内部=本人モデルへ役割分離し、honesty firewall を ranking 点火のハード前提として機械化すれば、OS 権限壁の内側で「再入力ゼロの第二の自己」という購買不能な moat を狙える。最大の急所は persona prior 層の成熟と来店後1問観測 — 両者が無ければ誠実な fact 表示には着地するが世界トップ差別化には届かない。

---

## 付録: 設計案の判定スコア(1-5)

| 案 | secondSelf | moat | feasibility | honesty | worldTop | keep |
|---|---|---|---|---|---|---|
| SSPFE(Second-Self Purpose-Fit Engine) | 5 | 5 | 2 | 3 | 4 | ✅(戦略コンパスのみ・機構は棄却) |
| EFP(Evidence-Fusion Pipeline) | 4 | 4 | 4 | 5 | 3 | ✅(バックボーン採用) |
| 観測ループ UX | 5 | 5 | 3 | 5 | 4 | ✅(UX 核・今月は✓軸→行順まで) |
| Second-Self Place Simulator | 5 | 5 | 3 | 5 | 5 | ✅(統合中核・北極星) |

> 本レポートは **research/設計勧告のみ**。実装・route 配線・外部 API 呼び出し・production・env・DB・origin/main push はしていない。次は CEO の §8 判断待ち。
