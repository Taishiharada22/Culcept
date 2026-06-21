# 評価OS — CEO 意思決定レポート（Aneurasync 独自評価 / deep research 統合）

日付: 2026-06-21 ／ 起票: Chief of Staff（25-agent deep research: 3 map + 7 research + 5 design + 5 judge + 4 refute + 1 synth・実 WebSearch + 一次資料検証）／ 宛先: CEO Taishi
全体ステータス: 🟢 構想として強い・推奨明確。ただし「ミシュラン級精度」の看板だけは🔴 reframe 必須。

---

## エグゼクティブ・サマリー（先に結論）

1. **CEO の前提は半分正しい。** Google/Tabelog が歪んでいるのは事実（halo・herding・自己選択・Tabelog 独禁法敗訴・Google fake 10.7%）。だが「だから我々が賢く採点し直せば真の品質が出る」は**過剰楽観**。de Langhe (2016, JCR) で平均星と客観品質の一致は**57%**（乱数50%）— holistic 集約は lossy compression で、磨いても天井は57%。
2. **勝ち筋はアルゴリズムの賢さではない。** Google が**構造的に取れない signal**（purpose × state × post-visit behavior）への非対称アクセス。これは Aneurasync の OS 権限（カレンダー＝目的）＋深層観測（Stargazer）＋来店後1問でしか作れない。
3. **核心の一手：レビューを聞くのをやめる。** 「店に星を貼る」のを放棄し、**最初から分解された状態で観測**（chip-first の aspect/state pair）＋**評価者較正**＋**行動シグナル**＋**状態の分離**＋**正直な不確実性表現**で真値を「復元」でなく「観測」する。
4. **統合判断（CEO が明示的に聞いた問い）：COMBINE。** 評価OSは別プロダクトではなく、purpose-fit candidate lens が cold-start を抜けるために**唯一欠けていた測定器官**。prior synthesis が「最大の急所・未実装」と名指しした post-visit 1問観測がそれ。別建ては学習ループを永久に閉じない。
5. **正直な精度天井：「あなたに今日合う店当て」で勝ち、「平均的に良い店当て」で永久に負ける。** 「ミシュラン級」は技術次元では到達不能。看板は「ミシュランと違う問いに、ミシュランより上手く答える」に reframe。

---

## 1. 前提監査 — CEO は正しいか、真の品質は復元できるか

### CEO 前提の採点（査読済み）

| CEO の主張 | 判定 | 根拠 |
|---|---|---|
| 人間の感情が holistic を歪める | ✅ 正しい | halo（ホテル n=21,338）, herding（Muchnik +25%）, J字分布96% |
| 「飯は旨いが接客悪い→低評価」で無関係属性が引きずられる | ✅ 正しい | halo spillover 実証・負が非対称に強い |
| Google/Tabelog は信頼できない | ✅ 概ね正しい（理由は感情**＋運営インセンティブ**） | Tabelog 独禁法敗訴（チェーン店一律減点・3,840万円賠償）, Google fake 10.7%／年2.4億件削除 |
| だから我々が「より良く」できる | 🟡 **条件付き** | debias で系統誤差は除去可。だが holistic からの個人真値復元は**原理的に不可** |
| アルゴリズムで真の品質を当てられる | 🔴 **過剰楽観** | de Langhe **57%**。情報は圧縮で失われ、同じ入力なら天井は低い |

### halo の例（接客で全体が落ちる）— 直せるか、どう直すか
**部分的に直せる。完全には直せない。**
- **直せる部分（系統バイアス）**: **aspect 分解**（味/接客/価格/雰囲気を別チップで観測）すれば、接客の不満が味の評価に染み出すのを**入力時点で遮断**できる（aspect-based sentiment, 成熟技術）。
- **直せない部分（識別不能性）**: チップ自体が halo に汚染される（接客が悪い体験は「味も微妙」とタップしやすい）。完全分離は不可。最善は「モデル化され部分的に較正された confounding」。
- **結論**: **2-way の粗い分離**（「場所の話か、今日の自分の状態の話か」）なら直せる。**4-way のクリーン分解**（味2.3/接客4.1…）は識別不能で、推測で埋めれば捏造。

### 縮約不能な限界（重み付けでも閉じない3層）
1. 味は一部が嗜好で精度でない（辛さ・賑わいは人ごとに正負反転）。
2. 専門家は群衆が観測しない潜在次元を符号化 → **群衆に無い次元はデータ処理不等式により原理的に復元不能**。
3. 「良い店」の正解自体が係争的（ground-truth が定義依存）。

---

## 2. 核心インサイト — 何が本当に新しいか

**単一最重要アイデア：レビューを聞くのをやめ、真値を「復元」でなく「観測」する。** 4要素の合流：
- **分解**: holistic 星を捨て、最初から (aspect, sentiment, state) pair として観測（LARA が潜在推定する分解を**入力で確定**。短文・疎・cold-start で free-text 抽出は破綻するがチップは破綻しない）。
- **評価者較正**: 甘辛バイアスを MFRM で除去。「舌が優れてる」は Generalized-MFRM の discrimination slope で形式化（v2・v1 では捏造しない）。
- **行動シグナル**: 自発的再訪（最強・最も gameable でない＝足で投じた票）・再検索・滞在カテゴリ。**絶対値化せず相対選好のみ**。
- **状態分離**: 疲労・天気・同伴・時間帯を**フィルタでなく共変量**として入れ、疲れた雨の日の低評価を θ·state に吸わせ、場所の質 Q_p を汚染させない。

**なぜ Aneurasync だけ可能か（競合の構造的不能）:**

| 競合 | できない理由 |
|---|---|
| Google / Foursquare | カレンダー＝purpose intent への OS 権限が無い |
| Michelin / Infatuation | 人手較正（inspector）で個人スケール不能・精度をコストで買っている |
| Tabelog / Yelp | SNS 集計ゆえ halo・操作・較正崩壊が必然（権威は売買される） |
| Beli | pairwise 機構は正しいが purpose/state/行動接地を持たず SNS 化 |

Aneurasync の非対称資産：**①OS 権限の壁（calendar＝目的）②深層観測 Stargazer（taste でなく判断原理・状態依存）③来店後1問（言った/した照合ループ）④非SNS構造（誇張する観客が居ない＝gaming 耐性が設計レベルで生まれる）**。

---

## 3. 推奨設計 — AneuraScore（最良案の接ぎ木）

**Match Ledger の contrarian core ＋ 階層ベイズ実装 ＋ 二又分岐**を接ぎ木。

### 評価モデル（出力は星でなく分解された事後分布）
```
rating_{u,p,c} = α + Q_p + B_u + Σ_k θ_k·state_k + I_{u,p} + ε
```
- **Q_p** = 場所の質（汚染してはいけない対象）
- **B_u** = この人の評価癖（甘辛・MFRM severity）
- **θ_k·state_k** = 状態の固定効果（疲労/天気/同伴/時間帯＝交絡分離）
- **I_{u,p}** = この人×この場所の適合（**第二の自己の moat**・最もデータ薄・最後まで凍結）

**§10 成分写像**: Quality=Q_p / Fit=I_{u,p} / ContextFit=θ·state / RepeatValue=自発再訪 / DiscoveryValue=初訪問の正の驚き / **Confidence=事後 precision→credible interval 幅** / **Evidence tier=source tag（[自分の評価N件]/[行動観測]/[未確認]）**。

**実装の正直さ（誇張訂正）**: `bayesianAxisUpdater.ts` の共役 Normal-Normal 更新を Q_p に流用は妥当。ただし「VERBATIM 再利用で hierarchical 帰属成立」は**誇張**（当該は軸ごと独立スカラ更新で、Q_p/B_u/I_{u,p} を分離する交差ランダム効果 GLMM は別物）。**正直版＝state 残差化→残差に共役更新、B_u は当面 grand mean、I_{u,p}=0 凍結**。動くが宣伝より弱い。

### エリシテーション・プロトコル
- **いつ（最重要は「いつ聞かないか」）**: デフォルト**沈黙**。トリガー・ホワイトリストのみ発火（初訪問 / 提案場所 / 早期離脱 / 重要予定）。**抑止**（habitual=コンビニ/駅/自宅/職場・疲労時・30日内同型・却下後7-14日）。タイミングは**滞在直後**（peak-end の end・翌日リコール禁忌）。
- **何を**: 星でなく**比較1問**（比較は絶対スケールより信頼性高）。提案場所→「思った通り?」{思った通り/思ったより良/微妙}。**未タップ=null**（「中立」に変換しない）。
- **どれだけ少なく**: 全選択肢1タップ・スワイプで無視可。回答後は「次の提案に覚えておきます」（自己便益）のみ。スコア表示・共有・連続記録なし。

### 行動シグナル（S/N 順・絶対値化禁止）
自発的再訪 ＞ 来店後1タップ ＞ チェックイン頻度 ＞ 再検索 ＞ しっかり滞在 ＞ リスト内タップ（相対のみ）＞ 短dwell（confound 多）＞ 非再訪（沈黙≠不満）。本人1タップ訂正が全自動シグナルを上書き。

### イノベーション ＆ 正直な精度天井
**新しい点**: ①分解を推論でなく**入力で確定** ②状態を**分離軸**にし Q_p 脱汚染 ③比較エリシテーションが Surprisingly-Popular 第2問 ＆ persona 検証ループを兼ねる ④Beli の pairwise を purpose/state 条件付き＋非公開に一般化。

**正直な精度天井（過剰約束回避）**:
- ✅ **勝つ**: 「この人が・この状態で・この目的のとき満足するか」の**個人化された相対適合**。Google より明確に上。
- ❌ **負ける（設計上の受容）**: ①絶対品質ランキング（招待制小N×疎カバレッジで1店あたり評価者 r=1 が大半。群衆集計は r≥3 で初めて多数決超え→Google の件数規模に絶対負け）②ミシュラン級の技術判定（群衆に無い潜在次元は復元不能）③初訪問の事前精度。
- **正直な看板**: 「Google より賢く採点」でなく「**Google が構造的に取れない signal で、あなたにとっての別の問いに答える**」。

---

## 4. 統合判断（THE KEY DECISION）: COMBINE or SEPARATE?

# 決定: **COMBINE**（疎結合の閉ループ・別プロダクト化は不可）

**論拠**: prior synthesis が P5-d ランキング点火の前提として「**post-visit 1問観測 = cold-start の生死を分ける単一の急所・未実装**」を名指しした。**評価OSはまさにその欠落ピース**。lens（選択前＝仮説提示）と評価OS（訪問後＝答え合わせ）は同一 identifiability 問題の表裏で、別建てにすると**仮説と検証が分断され学習ループが永久に閉じない**。
ただし「combine しても bloat も entangle もしない」は部分的に崩れた → **正確には「別プロダクト化より遥かに低コストだが、entanglement は自動でなく設計で勝ち取る性質」**。

### 具体的な継ぎ目
- **継ぎ目1（書込）**: lens の単一 seam `PlaceCandidatesPanel.onSelect(canonical, candidate)` に post-visit トリガを対応づけ。新規 store `PlaceVisitFeedback`。
- **継ぎ目2（読込）**: 評価OS出力 Q_p を `placeAffinity.ts` の rerank に **personaTerm と並ぶ第3項 qualityTerm（±ε・bounded・非逆転・shadow-log）** として注入。fail-open/clamp/安定ソート継承。
- **継ぎ目3（点火ゲート）**: P5-d の4段点火ゲートに「**評価OSが state 汚染を除去できているかの shadow 検証**」を1段追加。

### entanglement 封じ込め（必須）
1. **ranking 反映を当面禁止**（P3-c 不変原則継承）— 評価信号は表示順止まり。
2. **推測値を lens 比較表に隣接させない**（de Langhe 57% で復元不能ゆえ直接観測値のみ）。
3. **consent/privacy を combine 前に再設計**（訪問系列＋感情の blast radius 拡大。観測書込 consent 未ゲート・delete cascade 未確認を先に解消）。
4. **post-visit トリガを lens 開封者に条件付けない**（selection bias 再生産回避・予定経過をトリガに）。

⚠️ **branch 注記**: 評価 OS の **post-visit rating route はどこにも無い = 測定器官は真にゼロから**。supporting 観測ストア（mobility/condition/affinity）は lens/Travel worktree 側に在り本 p5a branch には未配置 → 実装は lens 統合済み worktree で行い main 着地後に seam 追加（CLAUDE.md §8 ブランチ確認厳守）。

---

## 5. 段階ロードマップ

| Phase | 最小の正直な一歩 | flag/cost/privacy/rollback | 前提 | P5 lens との織り込み |
|---|---|---|---|---|
| **P1 personal memory** | 来店後1タップ（比較1問）＋ Q_p 共役更新を localStorage に private 蓄積。「未来の自分を楽にする記憶整理」フレーム。pure `shouldElicit()` + shadow-first | flag OFF / cost≈0 / 生GPS非保存 / rollback=flag戻すだけ | **なし（NOW 着手可）** | P5-a R1 と並行。星なし chip-first で反SNS土台 |
| **P2 anon Local Intel** | 場所単位 Q_p を device 跨ぎ集約。MFRM severity-debias ＋ ベイズ縮約。**匿名・公開ランキング化しない** | flag OFF / Overpass 無料・PoC fill-rate / owner-RLS・consent gate DB / rollback=集約停止 | **CEO 承認＋consent DB＋staging re-link** | P5-b/P5-c と接続。確認済み属性のみ source tag |
| **P3 AneuraScore** | state 残差化済み {Q_p/B_u/θ·state} を credible interval+N+source tag で。qualityTerm として placeAffinity 注入 | flag OFF + production hard-block / pure / rollback=qualityTerm clamp 0 | **P5-d 4段ゲート** | **P5-d 点火の前提部品**。gate stage-2 が Q_p 乖離検証そのもの |
| **P4 hidden gems** | I_{u,p} 高 × Q_p 母集団低 = 「世間は平凡だがあなたに合う」→「自分ってそういう人間だったのか」 | flag OFF / pure / rollback=surprise 停止 | observed 十分（個人×場所10件超）まで仮説トーン | P5 完了後。Google が構造的に出せない signal の体現 |

**MVP**: full MCMC でなく共役近似で軽量開始。I_{u,p} は単独ユーザー観測10件超まで凍結。SSPFE 的 persona 共駆動は**不採用**（PERSONA_EPSILON tiebreaker のまま λ 漸進較正）。

---

## 6. 正直さ・反SNS・プライバシー・反ゲーミング guardrails（non-negotiables）

- **反SNS**: 星/いいね/コメント/フィード/人気ランキング/連続記録を**ゼロ**。集約しても公開ランキング化しない。出力は本人だけ（localStorage/owner-RLS）。語彙は「覚えておく/このパターンを確認」、レビュー語彙（評価/星/共有/投稿）禁止。
- **捏造禁止 / subjective≠truth**: 未タップ=null 厳守。未確認属性は推測で埋めず unknown。source tag 必須。絶対スコア化せず credible interval 併記。嗜好は仮説トーン（断定禁止）。
- **行動ログ privacy**: 生GPS非保存（category化 OD のみ）。**正確な滞在時間を保存しない**（duration neglect で信号にならず追跡リスクのみ・短/しっかりの2値）。sensitive 場所は両端 null。title×notes pair をログしない。
- **反ゲーミング**: **本人専用・非公開＝誇張する観客が構造的に居ない**（最大の anti-gaming moat。Yelp/Tabelog/Google の腐敗源を設計で消す）。最も gameable でない signal（自発再訪）を最重視。
- **governance**: 全 flag 既定 OFF + production hard-block・shadow-log-first・fail-open。live rank 点火は4段ゲート＋CEO承認後のみ。

---

## 7. 棄却した道 ／ 生き残るリスク

### 棄却
- ❌ holistic 星を入力にする（57% 天井に縛られる）
- ❌ per-visit の4-way クリーン分解（識別不能・推測で埋めれば捏造）
- ❌ 生 tap を Bayesian prior にそのまま投入（早期偏りを強prior 固定＝毒）
- ❌ SSPFE の persona 共駆動 λ（断定・prior synthesis 明示却下）
- ❌ blanket post-visit prompting（response 5-15%・MNAR・疲労時の捏造誘発→active learning に限定）
- ❌ Beli の SNS フィード層（pairwise 機構だけ盗み社交層は捨てる）

### 生き残るリスク
1. **🔴 time-to-value / cold-start 逆説**: 招待制小N×疎カバレッジで I_{u,p}（moat 主役）が観測10件超まで凍結。初期ユーザーは Google との差を体感できず「また行きたい1タップ」だけの薄い体験で離脱しうる。**緩和**: 初期価値を推薦精度でなく「答え合わせの気づき」(aha)に置き、persona-prior 外挿で初訪問にも仮説トーンの fit 理由を出す。
2. 🟡 招待クラスタの独立性欠落（趣味の似た知人＝多様性と独立性が同時欠落＝wisdom-of-crowds 崩壊）。集約ゲインは文献値の数割引き。
3. 🟡 peak-end は定義上不可避（ただし再訪決定を駆動するのも remembered utility ゆえ予測対象としては正しい signal＝reframe で資産化）。
4. 🟡 行動シグナルの confound（短滞在＝takeout/通過の誤読。900秒未満は質signal にせず弱分類）。
5. 🟡 consent/privacy blast radius（combine で訪問系列＋感情結合→先に consent gate/delete cascade 解消）。

### 「ミシュラン級」は達成可能か → **reframe すべき**
技術次元では**不可能**（群衆に無い潜在次元・データ処理不等式）。絶対品質ランキングでも**不可能**（r=1 の壁）。**達成可能なのは「ミシュランと違う問い（この人×状態×目的の適合）に、ミシュランより上手く答える」**。看板を「ミシュラン級精度」から「**あなた専用の的中**」に変えれば、過剰約束を避けつつ genuinely 強い主張になる。

---

## 8. CEO 意思決定ポイント

| # | 決定事項 | CoS 推奨 | 一言根拠 |
|---|---|---|---|
| **D1** | COMBINE or SEPARATE | ✅ **COMBINE**（疎結合の閉ループ） | 評価OSは lens の欠落測定器官。別建ては学習ループを永久に閉じない |
| **D2** | 最初に作るもの | ✅ **P1: 来店後1タップ比較観測（chip-first・星なし・localStorage・shadow-first）** | cold-start の生死を分ける単一の急所。自律実装可（flag OFF・production 不触） |
| **D3** | 精度の看板 | ✅ **「ミシュラン級」撤回→「あなた専用の的中（Google が取れない signal）」に reframe** | 技術次元・絶対品質では到達不能。過剰約束は世界観（捏造禁止）に反する |
| **D4** | 評価モデルの野心レベル | ✅ **v1 は state残差化＋共役 Q_p のみ。MFRM/DS/MACE/BTS/SP の rater-weighting タワーは r≥3 自動解錠の凍結 backlog へ** | r=1 が大半の招待制で多重モデルは数ヶ月の死荷重 |
| **D5** | privacy 前提 | ✅ **combine 前に consent gate ＋ delete cascade ＋ staging re-link を解消**（CEO 承認案件） | 訪問系列＋感情の blast radius。DB 作業は別GO |
| **D6** | ranking 反映 GO/NO-GO | 🟡 **当面 NO-GO（表示順止まり）。P5-d 4段ゲート＋shadow 検証通過後に再起票** | フィルターバブル/過剰断定リスク |

**承認が必要**: D5（consent/DB・staging re-link）、P2 以降の集約、ranking 点火（D6）。**自律実行可**: D2 の P1 実装（flag OFF・pure・shadow-first・production hard-block）、設計書起草。

---

## 付録: 設計案の判定スコア（1-5）

| 案 | accuracyRealism | inputBurdenLow | secondSelf | moat | feasibility | honesty/privacy | combine |
|---|---|---|---|---|---|---|---|
| AneuraScore（Latent-Quality OS） | 4 | 5 | 5 | 4 | 3 | 5 | combine |
| Quiet Ledger（行動先行・1タップ補完） | 4 | 5 | 5 | 4 | 4 | 5 | combine |
| Crowd-Calibrated Local Intel | 3 | 4 | 4 | 4 | 2 | 5 | combine |
| Reflexion（来店後1-tap=cold-start kill-switch） | 4 | 4 | 5 | 4 | 2 | 5 | combine |
| **Match Ledger（場所でなく MATCH を採点）** | 4 | 4 | 5 | **5** | 3 | 5 | combine |

**5案すべてが COMBINE 判定**。Match Ledger が moat=5 で最強（per-place スカラを持たず、purpose×state 条件付き better(A,B) 比較演算子を1タップから較正＝de Langhe 57% 天井を構造的に回避）。

> 本レポートは **research/設計勧告のみ**。実装・route・API・production・env・DB・origin/main push はしていない。次は CEO の §8 判断（特に D1 COMBINE と D2 来店後1タップ着手）待ち。
