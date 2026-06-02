# Live Plan Controller — Golden Scenario & Invariant Matrix v1

> 起草: Build Unit / 2026-06-02 / **実装未着手・CEO 承認待ち**
> 目的：Phase 0 確定の前に、設計（親 v5 ＋ Adaptive Trigger Matrix v2）が**現実シナリオに耐えるか**を固定する受け入れ仕様。これが将来実装の acceptance / regression test になる。
> 方針：シナリオ例（有限）より **Invariant（全称・全シナリオで成立すべき性質）** が強い。Part A に Invariant、Part B に 20 シナリオ、Part C に被覆。

---

## Part A — Invariants（全シナリオで必ず成立。= property-based test）

| ID | 不変条件 |
|---|---|
| **INV-1 行動可能性** | 有効な行動が残っていない（`b(τ)−S(τ) < Q_T(p_act)`）時、行動要求通知を DELIVER しない。PoNR 後は Communication（相手に連絡）/ 後続 Repair に切替。「もう遅い、X しろ」を X 無しで撃たない。**全 action 通知は 1 タップ行動導線を必ず持つ** |
| **INV-2 DECIDE 常時** | DELIVER=silent でも DECIDE（LSAT・risk・最適行動）は毎窓走り、silent もログする。沈黙は一級の判断 |
| **INV-3 Safety Floor** | catastrophic ティアの buffer percentile は PRM 学習でも下限（≈0.98）を割らない。学習は **より保守的にしか** 動かせない |
| **INV-4 Traceable（No Phantom）** | 通知・提案・変更は **committed anchor / imported anchor / draft proposal / seed / task / change-set** のいずれかに追跡可能。未確定提案（朝の Daily Build 等）は **proposal_id / source_trace / reason** を持つ。目的地を推測して撃たない |
| **INV-5 自動実行の境界** | L5 自動実行は reversible ∧ conf 高 ∧ authority≥Lv2 の時のみ。**他人との予定/予約/支払い/長距離/目的地変更/hard anchor は常に確認必須** |
| **INV-6 ヒステリシス** | flapping 禁止。fire は risk≥X、解除は risk≤Y(<X)、dwell≥1–2 サイクル、min 再通知間隔、deadline 近傍で latch |
| **INV-7 既存予定の尊重** | user の hard anchor を無断で削除/移動しない。Repair/Optimize は soft/flexible を先に触り、partial satisfaction は最低価値項を defer し**必ず通知** |
| **INV-8 confidence 正直** | LSAT は常に confidence＋reason を持つ。低 confidence を false-precise に出さない。仮定移動時間を開示し user が誤りを検知できる |
| **INV-9 監視の経済** | 高頻度監視は `confidence × stakes × actionability × receptivity` が要する時のみ。低stakes/行動不能 → 単発計算 wake。geofence は今日の Day Graph 重要地点だけ動的登録（≤20 iOS/100 Android、近接・高stakes 順に入替） |
| **INV-10 通知予算** | 通知信頼残高を尊重。dismiss で閾値↑、trip 毎 push 上限、live surface 1 枚＋action-only push |
| **INV-11 sanity / fail-safe** | 直線距離で実現不能な ETA/LSAT は出さない。stale データは保守側（早める）に倒し、楽観方向に黙って倒さない |
| **INV-12 学習閉包** | 全 user 反応（採用/編集/拒否/無視/遅延 open）と planned-vs-actual を PRM/Drift に記録。未知失敗も捨てず捕捉→Skill Library |
| **INV-13 権限は獲得制** | 自律レベルはドメイン別の PRM 的中率で上昇。未獲得ドメインで自動実行しない |
| **INV-14 graceful degrade** | GPS/feed 喪失 → σ 拡大（保守）＋時刻フォールバック。重要ノードを信号喪失で silent にしない |
| **INV-15 mode 正当性** | 実条件（empty/gap/risk/state-mismatch）がある時のみ介入。「問題なし → silent」。介入を捏造しない |
| **INV-16 Whole-Part Coherence（最重要）** | 局所（単一予定/移動/空白）で最適に見える案でも、**Day Graph 全体・後続 hard/important anchor・食事/休息（回復核）・翌日影響・通知信頼残高・長期目的** のいずれかを壊すなら却下/修正/警告。「全体」は今日だけでなく **翌日・体力・通知残高・長期目的** を含む多次元・多時間軸 |
| **INV-17 空白の意味づけ** | 空白を「必ず埋める」のではなく **意味づけ** する：作業・回復・移動余白・食事・待機・自由時間に分類。**意図ある自由/回復ブロックとして残すことも有効な Plan 候補**。禁ずるのは「無分類で放置」だけ（作業で埋め尽くすのも悪手） |
| **INV-18 既存予定を土台に** | 予定がある日はゼロから組み直さない。既存（特に hard）を保持し、補完/修復/最適化（Google Maps 類比＝素材として最適化） |
| **INV-19 Recovery Core 保護** | 食事・睡眠・移動余白・精神的余白・**ユーザー固有の回復核（PRM 上の安全下限）** を下限以下に削らない（人により核が違う：昼寝/移動前余白/夜の自由/食事…）。削る場合は **確認必須＋翌日影響表示＋代替回復枠の提示**。multi-day 評価 |
| **INV-20 post-event 再計算** | 予定の超過/早期終了が起きたら後続波及を必ず再計算（INV-16 を再評価） |
| **INV-21 lead-time 単調性** | 起動/通知の lead time は stakes・不確実性に対し単調非減少（重要・遠・不確実ほど早く・厳しく） |
| **INV-22 Daily Plan Quality（Positive）** | Build/Complete の提案は「壊さない」だけでなく **良い 1 日** であること：①今日の目的充足 ②移動が自然 ③食事・休息（回復核）が守られる ④重要予定が守られる ⑤空白が意味づけ済 ⑥量が現実的（充填≤~80%・RCF 補正）⑦状態に適合 ⑧1 タップ確定可。**品質ゲートを通らない案は push せず on-open/確認/部分提案に降格**（凡庸な一日を「最適」と偽らない） |
| **INV-23 Source Traceability（追加）** | 生成/提案する全 plan item は **anchor / seed / task / PRM / environment / user-correction / long-term-goal** のいずれかに根拠（sourceRef＋reason）を持つ。**根拠が薄いものは tentative とし push せず on-open/確認に降格**。「それっぽい予定」を捏造しない。根拠提示は同時に autonomy-supportive な理由（自己理解）になる |
| **INV-24 Reversibility** | 全変更を **change-set** として保存。複数予定の追加/移動/削除は **atomic undo 可能**＋before/after＋影響範囲提示。**5 分 Undo は最低保証**、大規模変更は **当日/セッション中の復元導線** を持つ（既存 `proposalUndo.v1` を一般化）。強い介入ほど戻せる |

---

## Part A-2 — Degradation Mode Table（INV-14 を具体化）

> 原則（重要度ゲート＋best-effort）：**重要ノード・hard・高波及は best-effort で最大限守る**（push 不可かつアプリ閉なら能動通知は不可＝「死守」ではない。on-open 最上位提示・事前権限要請・可能ならローカル通知・時刻表示・手動確認導線で最大限）。**低重要・低行動・低信頼は silent/on-open へ降格**（degradation でも INV-1/INV-9 を破らない）。

| モード | トリガー | 継続する機能 | 落とす機能 |
|---|---|---|---|
| **Normal** | 全データ有 | 全機能 | — |
| **Reduced Location** | 位置精度低/粗い許可 | 時刻トリガー全部＋粗い到着判定 | 精密ジオフェンス |
| **No Location** | 位置なし/拒否 | 時刻 leave-by/Final Check（時刻版）＋user 自己申告 | 到着/滞留/逆方向の自動検知 |
| **No Network** | オフライン | ローカル事前計算（leave-by/Final Check をローカル保存）＋ローカル通知 | API 再計算・遅延検知（再接続で再評価） |
| **No Push** | 通知権限なし | アプリ内表示（開いた時に必ず全提示） | push（→ on-open へ全面移行） |
| **No Transit/Weather API** | 交通/天気なし | スケジュール推定＋σ拡大（保守側） | リアルタイム遅延/天候補正 |
| **Low Battery** | 低電力 | 重要ノードのみ最小監視＋leave-by | 高頻度監視・低stakes→silent |
| **Low Confidence** | データ少/不安定 | 保守 buffer＋conf 明示 | アグレッシブ自動判断 |
| **Manual Mode** | user が自動を切った | 求められれば助言＋容量真実告知 | 自動 push・自動修復 |

## Part A-3 — 予定の権限モデル（Origin / Authority / Flexibility）

INV-7/INV-18 を精密化。既存予定の尊重を hard/soft の 2 値でなく **3 軸**で判定。既存コードに素地（`ExternalAnchor.rigidity`、`DraftPlanItem.origin`）。

| 軸 | 値 | 意味 |
|---|---|---|
| **origin** | user / imported / alter_generated | 誰が作ったか |
| **authority** | user_owned / import_locked / proposed | 確定度（本人確定 / 外部カレンダー / AI 未承認提案） |
| **flexibility** | locked / movable / shortenable / droppable | Repair/Optimize が触ってよい度合い |
| **protectionReason** | hard_external / user_declared / recovery_core / cascade_guard / tentative | **守る理由**（AI 生成でも user 承認・recovery_core 化で守るべき予定へ昇格） |

- **4 軸を分離**：origin=由来 / authority=所有・確定度 / flexibility=可動性 / **protectionReason=守る理由**。
- **動かしてはいけない**：user_owned∧locked、import_locked、他人/予約/支払い絡み（INV-5）、protectionReason∈{hard_external}。
- **Repair/Optimize は flexibility 順**に触る：droppable → shortenable → movable。locked は最後（基本触らない）。
- **alter_generated∧proposed は user 承認まで tentative**（INV-23）。**承認で authority→user_owned、protectionReason→user_declared/recovery_core へ昇格**（origin は履歴として保持）。

## Part B — Golden Scenarios（35）

各シナリオ：**状況 / mode / LSAT・conf / trigger / DECIDE / DELIVER / 文型 / 1tap / PRM / Floor・Perm / DayGraph / INV**。
（mode = Build/Complete/Repair/Optimize/—。文型は §通知 5 階層＋autonomy-supportive 文体）

### S1 遠方の重要予定（面接ではない商談・電車＋乗換2・Cold）
- 状況：14:00 商談、自宅 11:00、電車38分+乗換2、個人移動データ無。 / mode：Repair-monitoring（feasibility 監視）
- LSAT/conf：必要到着 13:50、p*=0.90（重要）、Q_T=Routes pessimistic+乗換不確実≈55分 → **LSAT≈12:50、conf 0.6**（Cold/乗換）
- trigger：朝 long-range / Mid preflight 早め（重要×遠×不確実で ~12:10）/ leave-by 12:50 / Final Check 13:45
- DECIDE：12:50 出発で成立。high-stakes フラグ
- DELIVER：Mid preflight=push L2「準備」/ leave-by=push L3「今出る」
- 文型：状態承認＋理由「商談は遅刻を避けたいので、乗換2回の遅れも見込んで 12:50 出発が安全です」
- 1tap：[出発リマインド] / [ルート確認] / [別ルート]
- PRM：通知反応・実移動時間（Cold→Warm 較正）・prep latency
- Floor/Perm：重要 floor p*≥0.90。自動変更しない（Lv0–1）
- DayGraph：変更なし（成立）。buffer 予約
- INV：1,2,8,9,11

### S2 近場の任意カフェ作業（徒歩5分）
- 状況：15:00 カフェ作業（任意）、現在地近接。 / mode：—（低stakes 監視）
- LSAT/conf：p*=0.60、徒歩5分、**LSAT≈14:53、conf 0.85**
- trigger：単発 wake のみ（高頻度監視しない）
- DECIDE：成立。介入不要
- DELIVER：**silent**（or 任意で L1）
- 文型：—（出すなら「そろそろどうぞ」程度）
- 1tap：—
- PRM：実行有無
- Floor/Perm：—
- DayGraph：変更なし
- INV：2,9,15（過干渉しない）

### S3 予定数分前にまだ未到着
- 状況：14:00 予定、13:56 現在地が会場でない。 / mode：Repair（Final Check）
- LSAT/conf：到着判定。conf=位置の鮮度依存
- trigger：**Final Check（−5/−3分）**：Arrival→未到着、Mismatch→場所違い?、Communication→連絡?
- DECIDE：到着可能性を評価。間に合うなら誘導、無理なら連絡
- DELIVER：間に合う→L2「あと N 分、こちら側です」/ 無理→L3「間に合わない可能性。相手に一報？」
- 文型：「○○まであと約4分。今の場所からなら間に合います」 or 「数分遅れそうです。『5分遅れます』と送りますか？」
- 1tap：[到着した] / [遅れる連絡] / [道案内]
- PRM：到着遅延・Final Check 反応
- Floor/Perm：連絡文送信は確認必須（他人関与）
- DayGraph：必要なら開始を実態に補正
- INV：1,4,5,8

### S4 前予定が長引いた（still-at-previous）
- 状況：13:00 終了予定の前予定にまだ滞在、14:00 次予定、leave-by 13:20。現在 13:07。 / mode：Repair（linger）
- LSAT/conf：次予定 LSAT 13:20、conf 中
- trigger：linger 検知＋leave-by 接近
- DECIDE：まだ間に合う。13:20 までに出発が必要。後続波及を確認
- DELIVER：push L2/L3「まだ間に合います。13:20 までに出れば準備も守れます」
- 文型：選択肢「13:20 まで延長／今出る／準備を短縮」、推奨を前面
- 1tap：[13:20 にリマインド] / [今出る] / [次を15分後ろ倒し]
- PRM：滞在延長傾向・採用案
- Floor/Perm：次が hard なら移動自動化しない
- DayGraph：未確定なら 後続を条件付きシフト案
- INV：1,6,7,2

### S5 雨で徒歩遅延（σ 上昇）
- 状況：屋外徒歩区間あり、雨。 / mode：Repair-monitoring
- LSAT/conf：天候で σ↑ → **LSAT 自動前倒し**、徒歩ペース補正。conf やや低（天候）
- trigger：天気急変（External）で再計算 → 必要なら Mid preflight 前倒し
- DECIDE：buffer 拡大。傘・早出を織り込む
- DELIVER：stakes 次第。重要→push「雨で徒歩が遅くなるので少し早めの X 出発が安全」
- 文型：理由に天候明示
- 1tap：[早めにリマインド] / [タクシー検討]
- PRM：雨時の実ペース
- Floor/Perm：—
- DayGraph：buffer 拡大
- INV：8,11,14,9

### S6 電車遅延（GTFS-RT delay → cascade 確認）
- 状況：乗車予定路線に delay publish、後続に乗換・hard 予定。 / mode：Repair
- LSAT/conf：delay を σ/ETA に反映、乗換成立を再評価
- trigger：遅延 publish（External 割込）→ 即再計算
- DECIDE：乗換が危険なら **re-plan**（代替便/ルート）、後続波及を算出
- DELIVER：push L3「電車遅延で乗換が危険。代替ルートに切替？」
- 文型：影響＋代替＋推奨
- 1tap：[代替ルート] / [次予定を遅らせる連絡] / [そのまま]
- PRM：遅延対応の採否
- Floor/Perm：他人予定の変更連絡は確認必須
- DayGraph：代替 segment、後続シフト
- INV：1,6,7,14

### S7 駅構内移動が長い（不可視セグメント）
- 状況：大型駅で改札→ホーム徒歩＋乗換に実数分。 / mode：Repair（margin）
- LSAT/conf：**不可視マージン（館内移動）を first-class 加算** → LSAT 前倒し。conf：館内データ有無
- trigger：preflight で margin 込み計算
- DECIDE：routing ETA に館内分を足して成立判定
- DELIVER：重要なら push「駅構内の移動分も見て X 出発が安全」
- 文型：理由に館内移動明示
- 1tap：[早めに出る]
- PRM：実館内移動時間
- Floor/Perm：—
- DayGraph：buffer 加算
- INV：8,11,9

### S8 病院予約（reservation・grace）
- 状況：10:30 病院予約。 / mode：Repair-monitoring
- LSAT/conf：p* 高め（予約・医療＝重要〜catastrophic 寄り）。受付/問診の不可視マージン加算
- trigger：早めの Mid preflight＋leave-by＋Final Check（Readiness：保険証等）
- DECIDE：受付締切から逆算
- DELIVER：push L2/L3。Readiness Check「保険証・診察券は？」
- 文型：理由＋持ち物
- 1tap：[出発リマインド] / [持ち物チェック]
- PRM：医療系の遅刻回避強め
- Floor/Perm：Safety Floor 高め
- DayGraph：buffer 予約
- INV：3,8,1

### S9 面接（one-shot・catastrophic 寄り）
- 状況：13:00 面接、一回限り、遠方。 / mode：Repair-monitoring
- LSAT/conf：**catastrophic 扱い p*≈0.98**（取り返しがつかない step コスト）。conf 低めなら更に保守
- trigger：long-range 朝＋複数段 preflight＋密監視＋Final Check 全種
- DECIDE：near-worst で buffer
- DELIVER：push（高stakes）。ただし通知過多にしない（coalesce）
- 文型：落ち着かせる＋理由「一度きりなので、最悪の遅れも見込んで X 出発にしています」
- 1tap：[出発リマインド] / [ルート確認]
- PRM：超重要カテゴリ
- Floor/Perm：**Safety Floor 0.98（学習で割らせない＝INV-3）**
- DayGraph：厚い buffer
- INV：3,1,8,10

### S10 空港 / 新幹線（deadline ≠ 出発時刻）
- 状況：15:00 発の便。 / mode：Repair-monitoring
- LSAT/conf：**真の deadline は出発でなく bag-drop −45分 / gate −15分 / 保安列**。これらを加算して LSAT。p*≈0.99
- trigger：long-range（前日夜含む）＋多段＋密
- DECIDE：保安・荷物・館内を全部織り込み
- DELIVER：push（catastrophic）
- 文型：理由に締切構造を明示「搭乗手続きは 14:15 まで。保安検査も見て 12:30 出発が安全」
- 1tap：[出発リマインド] / [チェックイン手続き]
- PRM：旅行系
- Floor/Perm：Safety Floor 最大
- DayGraph：前段に手続きノードを生成
- INV：3,1,8,11

### S11 食事時間が消える（state mismatch）
- 状況：予定は成立するが昼食の隙間が無い。 / mode：Optimize
- LSAT/conf：—（配置最適化）
- trigger：朝の基準時 or 詰まり検知
- DECIDE：回復/食事は保護対象（PRM の回復核）。どこかに食事枠を確保提案
- DELIVER：on-open or 弱 push「今日は昼食の隙間がありません。13:30 に 20 分作れます」
- 文型：状態承認＋提案
- 1tap：[昼食枠を入れる] / [今日はいい]
- PRM：食事/回復の優先度
- Floor/Perm：—
- DayGraph：食事ノード挿入案
- INV：7,15,2

### S12 休息が消える（recovery protection）
- 状況：終日詰まって回復ゼロ。 / mode：Optimize
- trigger：朝/夜の再評価
- DECIDE：回復核保護。低価値項を defer して余白生成
- DELIVER：on-open/弱 push「休息がありません。○○を明日に回すと夜が楽です」
- 文型：理由＋partial satisfaction（落とすものを明示）
- 1tap：[○○を明日へ] / [このまま]
- PRM：回復不足の許容度
- Floor/Perm：—
- DayGraph：低価値項 defer
- INV：7,15,12

### S13 予定なしの日（Build）
- 状況：当日 empty、許可済、朝。 / mode：**Build**
- LSAT/conf：—（合成）
- trigger：朝 Daily Secretary（受容性ゲート §9.2）
- DECIDE：anchors＋seeds＋rhythm＋天気＋未処理＋回復 で最適な一日を合成
- DELIVER：ゲート全充足→**朝 push**／欠→on-open
- 文型：「今日は予定なし。○→○→○ が崩れにくいです ［この案で組む］［調整］」
- 1tap：[この案で組む] / [調整]
- PRM：採用/編集/拒否、rhythm
- Floor/Perm：確定は user 1tap
- DayGraph：一日を生成
- INV：4,10,12,15

### S14 予定はあるが余白多め（Complete）
- 状況：11:00 歯医者 / 18:00 食事 だけ。 / mode：**Complete**
- trigger：朝 or 空白発生（gap-entry）
- DECIDE：間の空白を分類し意味づけ（作業/移動余白/回復）。次予定の出発逆算込み
- DELIVER：多くは on-open「間に○○はどうですか」
- 文型：提案＋理由
- 1tap：[入れる] / [空けておく]
- PRM：空白の使い方傾向
- Floor/Perm：—
- DayGraph：空白に候補ノード
- INV：15,2,7

### S15 予定はあるが詰まりすぎ（Optimize＋容量真実告知）
- 状況：充填 >80%、RCF 補正で超過。 / mode：**Optimize**
- DECIDE：容量超過を **特定事例で**提示
- DELIVER：弱 push/on-open
- 文型：「"報告書"に 45 分。直近 3 回は 80/95/70 分。今日は約 2.5h 超過です」＋落とす/短縮/翌日
- 1tap：[○○を翌日へ] / [短縮] / [このまま]
- PRM：過密傾向・所要時間モデル
- Floor/Perm：—
- DayGraph：defer/短縮案
- INV：7,8,12,15

### S16 通知を無視した（learning）
- 状況：直近 push を複数 dismiss/無視。 / mode：—（学習）
- DECIDE：通知信頼残高を引く
- DELIVER：**閾値↑** → 以後 push を絞り on-open/silent へ
- 文型：—
- 1tap：—
- PRM：notification_sensitivity↑、無視イベント
- Floor/Perm：—
- DayGraph：—
- INV：10,12,2

### S17 通知を押した（learning）
- 状況：推奨案を採用。 / mode：—（学習）
- DECIDE：信頼残高↑、この型の受容性↑
- DELIVER：—
- PRM：受容イベント・採用案・受容時間帯
- Floor/Perm：的中蓄積で将来 Lv2 解禁の材料
- DayGraph：採用反映
- INV：12,13

### S18 別案を選んだ（preference update）
- 状況：推奨でなく別案を選択。 / mode：—（学習）
- DECIDE：推奨ロジックの重みを補正（この user はこの状況で別案を好む）
- PRM：correction イベント（推奨と乖離）→ スコア重み更新／λ・嗜好更新
- 文型：—
- DayGraph：選択案を反映
- INV：12,7

### S19 LSAT が低 confidence
- 状況：移動データ少・天候不安定・交通情報なし。 / mode：Repair-monitoring
- LSAT/conf：**conf 0.4、reason 明示**
- trigger：監視昇格は **confidence×stakes×actionability×receptivity** で判断
- DECIDE：σ 拡大で保守 buffer
- DELIVER：高stakes→保守的に早め push（不確実を明示）／**低stakes/行動不能/受容性低→内部判断 or silent**（低 conf 単独で撃たない）
- 文型：「移動時間が読みきれないので、余裕をみて X 出発が安全です（確度は高くありません）」
- 1tap：[早めに出る] / [後で再確認]
- PRM：実測で conf を育てる（Cold→Warm）
- Floor/Perm：—
- DayGraph：保守 buffer
- INV：8,9,1,11

### S20 後続予定が連鎖破綻（cascade）
- 状況：今の予定が延び、後続に hard/重要が連鎖。単一遅延で全滅。 / mode：Repair
- LSAT/conf：後続への波及度を算出（cascade_sensitivity）
- trigger：post-event impact ＋ linger
- DECIDE：波及大 → 通知閾値↓・早期化・修復アグレッシブ。partial satisfaction で最低価値項を defer
- DELIVER：push L3「このままだと夕方以降が連鎖で崩れます。○○を動かすと全体が成立します」
- 文型：影響の全体像＋一手で救う案
- 1tap：[この修復で全体を直す] / [個別に見る]
- PRM：cascade 対応・波及実測
- Floor/Perm：他人予定/予約の変更は確認必須
- DayGraph：連鎖を考慮した再配置
- INV：1,6,7,5,12

---

### S21 予定が1つだけある日（疎）
- 状況：15:00 打合せ のみ。 / mode：**Complete**
- trigger：朝
- DECIDE：前後の空白を分類、目的・状態から補完候補（午前集中/午後余白）
- DELIVER：朝 on-open or 弱 push「15:00 の前後、こう使えます」
- 1tap：[組む] / [空けておく] ／ PRM：疎日の使い方 ／ DayGraph：前後に候補
- INV：17,18,15,2

### S22 朝の提案を一部だけ修正
- 状況：朝の一日案の 1 ブロックを user 編集。 / mode：—（学習）
- DECIDE：編集差分を嗜好シグナル化（この時間帯/活動の好み）／ DELIVER：—（確定）
- PRM：correction（部分編集）→ rhythm/嗜好重み更新 ／ DayGraph：編集反映
- INV：12,7,18

### S23 前夜の疲労 → 翌日を軽く（multi-day）
- 状況：当夜の負荷大、PRM が翌日崩れ予測。 / mode：**Optimize**（夜）
- trigger：夜の翌日準備窓
- DECIDE：翌日負荷を下げる再配置（保護・multi-day）／ DELIVER：夜 on-open/弱 push「今日は重め。明日の朝をゆるめました」
- 1tap：[明日を軽く] / [通常で] ／ PRM：疲労→翌日調整の受容 ／ DayGraph：翌日 buffer
- INV：**19,16**,12

### S24 前予定が早く終わった（opportunity）
- 状況：予定より早く終了、空白発生。 / mode：Repair/Complete
- trigger：post-event（早期終了）
- DECIDE：空き時間の意味判定（前倒し/休息/作業）。後続を壊さない範囲 ／ DELIVER：on-open/弱「30 分空きました。○○を前倒しできます」
- 1tap：[前倒し] / [休む] ／ PRM：早期終了時の選好 ／ DayGraph：再配置（INV-16 検証）
- INV：**20,16**,15

### S25 休憩を削れば成立だが翌日が崩れる（全体×一部＋保護）★
- 状況：今日詰め切れば全予定成立、ただし休息ゼロ→翌日破綻予測。 / mode：**Optimize**
- DECIDE：**単日最適 ≠ 全体最適**。休息保護を優先し低価値項を翌日へ ／ DELIVER：「今日に全部入りますが、休息が消えて明日が崩れます。○○を明日が安全です」
- 1tap：[○○を明日へ] / [今日詰める（非推奨）] ／ PRM：休息 vs 詰込の選好 ／ DayGraph：defer
- INV：**16,19**,7,12

### S26 作業を入れれば空白埋まるが移動余白が消える（全体×一部）★
- 状況：空白に作業を入れると次予定の移動余白が消え遅刻リスク。 / mode：Complete/Optimize
- DECIDE：局所「埋める」が全体「移動余白破壊」。移動余白を保護 ／ DELIVER：「ここに作業を入れると次の移動余白が消えます。短め(30分)なら両立します」
- 1tap：[短く入れる] / [空けておく] ／ PRM：余白選好 ／ DayGraph：短縮挿入 or 見送り
- INV：**16**,1,7

### S27 ユーザー予定が目的に合っていない（goal mismatch）
- 状況：成立はするが今日の目的（seed）に資さない配置。 / mode：**Optimize**
- DECIDE：目的との不一致を検出、目的に資する再配置を提案 ／ DELIVER：on-open「今日は"企画を進める"が目的でしたね。午前の集中枠に企画を置くと進みます」
- 1tap：[並べ替える] / [今日はいい] ／ PRM：目的整合の選好 ／ Floor/Perm：既存は尊重（提案のみ）／ DayGraph：並べ替え案
- INV：18,15,7

### S28 位置情報が取れない（degradation）
- 状況：位置許可なし/取得失敗。 / mode：Repair-monitoring
- DECIDE：位置確証不可 → **時刻ベースにフォールバック**、σ 拡大 ／ DELIVER：時刻トリガー維持（leave-by/Final Check は時刻で）。位置依存（到着確証）は弱め＋確認
- 文型：「現在地が取れないので時刻で見ています。○時出発が安全です」／ 1tap：[位置を許可] / [時刻で進める]
- INV：**14**,8,11

### S29 通信がない（degradation）
- 状況：オフライン区間。 / mode：—
- DECIDE：ローカル事前計算（leave-by/Final Check をローカル保存）で動作 ／ DELIVER：ローカル通知。再接続で再評価
- INV：**14**,11

### S30 バッテリーが少ない（degradation）
- 状況：低電力。 / mode：—
- DECIDE：監視頻度を落とす（省電力）、重要ノードのみ最小監視 ／ DELIVER：重要のみ。低stakes は silent
- INV：**14**,9,10

### S31 朝の提案を無視した日（learning・morning）
- 状況：朝 push を無視。 / mode：—（学習）
- DECIDE：朝受容性↓、信頼残高↓ ／ DELIVER：翌日以降 朝 push を絞る → on-open へ。頻度・時刻を調整
- PRM：朝の notification_sensitivity
- INV：10,12,2

### S32 他人との約束の変更が必要（permission）★
- 状況：修復に他人予定の時刻変更が要る。 / mode：Repair
- DECIDE：最適修復が他人関与 → **自動化しない** ／ DELIVER：「○○さんとの予定を 15 分ずらすと全体が成立します。連絡文を用意しました」
- 1tap：[連絡文を送る（確認）] / [自分で連絡] / [別案] ／ Floor/Perm：**他人/予約/支払いは常に確認（INV-5）** ／ DayGraph：相手 OK 後に反映
- INV：**5,16**,1

---

### S33 完全空白・seed なし・目的なし（cold Build）
- 状況：anchors=0, seeds=0, 明確な目的なし。PRM=未処理タスク2件・最近疲労気味・晴・週末。 / mode：Build（low-signal）
- LSAT/conf：—。プラン **conf 低(0.4：根拠が PRM/環境のみ、明示意図なし)**
- trigger：朝窓だが conf 低 → push でなく on-open 既定、or 1 問確認
- DECIDE：明示意図なし→**低リスク案**を弱根拠から：疲労＋週末→回復寄り基調、未処理から軽い前進1つ、晴→外出を選択肢。**強い予定を勝手に固定しない（INV-23 tentative）**
- DELIVER：**on-open**（push しない）or 受容性高なら 1 問「今日は回復したい？軽く進めたい？」
- 文型：「今日は予定も目的も未設定です。最近お疲れ気味なので回復寄りに、軽く○○だけ進める案も。どうしますか？ ［回復日にする］［軽く進める］［自分で決める］」
- 1tap：[回復日]/[軽く進める]/[自分で決める] ／ PRM：seed なし日の選好・1問回答＝目的シグナル
- Floor/Perm：根拠薄→tentative、勝手に確定しない ／ DayGraph：弱候補 or 空のまま(選択待ち)
- INV：**23**,17,19,22,8,15

### S34 物理的に不可能なユーザー予定（infeasibility → control）★
- 状況：user が 10:00 成田 / 10:30 東京駅 / 11:00 新宿 を入力（移動的に不成立）。 / mode：Repair（infeasibility）
- LSAT/conf：成田→東京駅 最短 ~60-90分→10:30 着不能。conf 高（明白に不成立）
- trigger：予定追加時の即整合チェック（INV-16）
- DECIDE：**全体不成立を検出。勝手に直さない・勝手に許さない。最も守るべき予定の選択を促す**（control toward best state, but user decides）。hard 選択で現実解2-3案
- DELIVER：push/on-open（追加直後）
- 文型：「成田→東京駅→新宿 を1時間では回れません（移動だけで最低2時間）。どれを最優先に？ ［成田を優先］［新宿を優先］［時間を見直す］」
- 1tap：[成田優先]/[新宿優先]/[自分で直す] ／ PRM：不可能予定を入れる傾向・優先選好
- Floor/Perm：user 入力尊重(消さない)＋警告必須、確定は user ／ DayGraph：不成立フラグ＋現実解候補
- INV：**16**,7,1,18,23

### S35 通知権限なしだが重要予定あり（No Push degradation）
- 状況：14:00 重要予定、通知権限 off。 / mode：Repair-monitoring（No Push）
- LSAT/conf：通常算出可
- trigger：時刻窓は計算、**push 不可**
- DECIDE：**No Push＝best-effort degrade**（死守ではない）。push 不可かつアプリ閉なら能動通知不可。**on-open 最上位提示＋事前権限要請＋（可能なら）ローカル通知＋時刻表示＋手動確認導線**で最大限。低重要は silent
- DELIVER：**on-open（アプリ内）全面移行**。重要なので「通知を許可すると出発時刻を知らせます」を1回
- 文型：(アプリ内)「14:00 の重要予定。12:50 出発が安全です。通知許可で出発前にお知らせ ［通知を許可］［了解］」
- 1tap：[通知を許可]/[了解] ／ PRM：通知許可の選好
- Floor/Perm：重要は best-effort(in-app)・低重要は silent ／ DayGraph：buffer 予約
- INV：**14**,1,9,10

---

## Part C — 被覆マップ（漏れの自己監査）

| 観点 | カバーする S# |
|---|---|
| **mode** | Build: S13 ／ Complete: S14,S21,S26 ／ Optimize: S11,S12,S15,S23,S25,S27 ／ Repair: S1,S3-S10,S19,S20,S24,S28,S32 ／ 学習: S16,S17,S18,S22,S31 |
| **本丸 Daily-Plan 側** | 朝 Build S13 ／ Complete S14,S21 ／ Optimize S15,S23,S25,S27 ／ 朝提案の無視 S31・部分修正 S22 ／ 夜→翌日 S23 |
| **全体×一部の整合（INV-16）** | S20(cascade),S24,S25,S26,S32 |
| **保護（休息/食事/回復・INV-19）** | S11(食事),S12(休息),S23(翌日),S25(休息vs詰込) |
| **重要度** | 任意 S2 ／ 通常 S4,S14,S21 ／ 重要 S1,S8 ／ catastrophic S9,S10 |
| **Phase（失敗）** | 0 出発前 S4,S13,S24 ／ 1 移動中 S5,S6,S19 ／ 2 接近 S7 ／ 3 会場 S3,S8,S9,S10 |
| **confidence** | 高 S2 ／ 中 S4 ／ 低 S1,S19 |
| **DELIVER** | push S1,S6,S9,S10,S20,S32 ／ on-open S11,S14,S21,S27 ／ silent S2,S16,S30 |
| **不可視セグメント** | S7(館内),S8(受付),S10(保安/荷物) |
| **cascade / multi-day** | cascade S6,S20 ／ multi-day S23,S25 |
| **degradation（INV-14）** | 位置なし S28 ／ 通信なし S29 ／ 低電力 S30 |
| **権限・安全** | 他人予定 S32 ／ 予約・医療 S8 ／ catastrophic S9,S10 ／ 通知連続無視 S16,S31 |
| **学習ループ** | 無視 S16,S31 ／ 採用 S17 ／ 別案 S18 ／ 部分修正 S22 ／ conf 育成 S19 |
| **権限モデル（Origin/Auth/Flex）** | 他人 S32 ／ 不成立 S34 ／ 承認 S22 ／ 外部 S14 |
| **Source Traceability（INV-23）** | 根拠薄→tentative S33 ／ 全 Build/Complete |
| **Reversibility（INV-24）** | 全 Build/Repair/Optimize（差分＋Undo） |
| **cold / infeasible / No-Push** | seed なし S33 ／ 物理不能 S34 ／ 通知権限なし S35 |

> **これは「漏れゼロ」ではない（INV 外の現実は無限）。** 主要 mode×重要度×Phase×confidence×DELIVER を被覆し、未知は PRM/Drift で増殖。CEO の実生活で抜けパターンがあれば本 Part B に追加する（増殖設計）。

---

## 使い方（実装判断の前提）
- Part A Invariant = 実装の **property-based test**（全シナリオで自動検証）。
- Part B 20 シナリオ = **regression fixture**（入力→期待 DECIDE/DELIVER/DayGraph）。
- Phase 0 実装は、この Matrix を満たすことを acceptance 条件とする。**まだ実装には入らない。** 本 Matrix を CEO が通せば、次に実装判断。
