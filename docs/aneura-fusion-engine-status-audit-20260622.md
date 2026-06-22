# 評価OS Stage 0→3-C ステータス & 複合融合エンジン監査（read-only・grounded）

監査: 2026-06-22 / Chief of Staff / 🟡 要注意（誇張なし）/ 10エージェント read-only 監査 + 敵対検証
branch: `claude/candidate-lens-p5a`(`Culcept-lens-p5`) / 編集ゼロ / 全主張 file:line 裏付け

> CEO の質問: ①Stage 0→3-C はどこまで終わったか ②「疲労×次予定40分×初対面×雨×過去の静か選好×移動負荷→満足度低下」を複合融合してベストチョイスを出すエンジンは実装できているか

---

## 1. 一行の結論

**「答え合わせの観測ループ」と「適合アークの表層」は作れた。だが CEO 構想の核 ＝“6信号を1つの best-choice に複合融合するエンジン”は未実装。** 現状の Fit-Arc は文脈を無視して post-visit 応答(4択)を単純平均するだけ、placeAffinity は ε=0.05 のタイブレーカーのみで、しかも全 flag OFF + production hard-block のため本番では一切動かない。敵対検証の総合判定も `fusionEngineExists: "no"`。

---

## 2. どこまで終わった（Stage 0→3-C タイムライン）

**全 Stage が flag OFF + production hard-block で、本番挙動は完全に不変。**

| Stage | 作ったもの | 実体 | flag | production |
|---|---|---|---|---|
| **Stage 0** | 観測器官（post-visit 1-tap 4択 + 固定 reason chip） | `postVisitObservation.ts`/`postVisitElicitation.ts`(聞く/聞かない pure)/`postVisitStore.ts`(localStorage shadow・write-only) | `POST_VISIT_CHECK_ENABLED=false`(:22) | **動かない**(NODE_ENV hard-block) |
| **Stage 1** | Fit-Arc readout（適合% をアークの形で） | `fitArcReadout.ts`/`FitArcReadout.tsx`/`PlaceFitArcReadout.tsx` | `FIT_ARC_READOUT_ENABLED=false`(:14) | **動かない**(UI=null・DOM 不変) |
| **Stage 1-B/C/D** | 配線（LocationDetailSheet/②詳細/③「もう一つの見方」） | 上記 UI を3面に配線 | 上記 flag 依存 | **動かない** |
| **Stage 2** | 文言 polish のみ | — | （新規配線なし） | （挙動不変） |
| **Stage 3-A** | scoping doc（Calendar 主フロー接続設計） | docs-only | — | — |
| **Stage 3-B/C** | 観測生成導線（経過予定に1日最大1件カード・one-per-day guard） | `CalendarTab.tsx`/`postVisitAnchorContext.ts` 配線 | 上記 flag 依存 | **動かない**(短絡ゲート) |

補助: `postVisitMetrics.ts`(dogfood 指標+Fit-Arc entry 判定)・`postVisitMirror.ts`(仮説トーン言い換え・<3件は沈黙)。**postVisit 86 tests / plan 6266 tests PASS**（実在）。

到達点の正直な要約:
- ✅ **出来た**: 観測の型・redact・shadow保存・聞く判定・readout model・生成カード配線・テスト。器官と表層は一通り。
- ⚠️ **dormant**: 全て flag OFF + production hard-block。**本番ユーザーには1ピクセルも出ない。**
- ❌ **未着手**: 観測を ranking/推薦に戻す配線（write-only のまま）。`candidateLensResolver` は postVisit を import すらしない。

---

## 3. CEO の6信号 coverage（敵対検証で第二読み確定）

| # | 信号 | コードに存在? | best-choiceに融合? | 状態 | 根拠(file:line) |
|---|---|---|---|---|---|
| ① | **疲労** | partial | **no** | signal-exists-not-fused | `postVisitElicitation.ts:41,58`(「疲れてる→質問しない」SUPPRESS＝逆方向)。型に fatigue field なし `postVisitObservation.ts:86`。score 入力に疲労なし `placeAffinity.ts:139-147` |
| ② | **次予定まで40分(gap)** | **yes** | **no** | **死配線** | エンジン完成 `placeAttributeModel.ts:150-163`(gap→schedule_fit/margin_impact+orderableScore)。だが唯一の描画 site `PlaceCandidatesPanel.tsx:506-514` が **gapMinutes prop を渡さない**→常に undefined→属性永久 null→recommendation に1度も寄与せず |
| ③ | **初対面/同行者** | partial | **no** | signal-exists-not-fused | companions は compose 表示専用 `ComposeFormPanel.tsx:144-180`。social_fit 軸は常時 null `placeAttributeModel.ts:59,183`。**first-meeting 概念は plan/place に grep ヒットゼロ** |
| ④ | **雨(天気)** | **yes** | **partial** | flag三重ゲートで無効 | weatherKind 消費エンジン+JMA実予報配管あり `placeConditionAffinity.ts:62-66`/`PlaceCandidatesPanel.tsx:341-346`。だが順位加点は `PLACE_AFFINITY_RANKING_ENABLED=false` で全環境OFF・reason は dev 限定 `placeAffinityReasonUi.ts:39-43`。本番は reason も順位も出ない |
| ⑤ | **過去の静か選好** | partial | **no** | signal-exists-not-fused | 「静か(quiet)」軸は常時 null(捏造しない) `placeAttributeModel.ts:59,78,187`。UserPlacePreference は**③比較表の表示行順だけ**変え recommendation/isBest は canonical 固定 `candidateLensUi.ts:227-260`。persona prior は live にデータ構築コードなし(test のみ) |
| ⑥ | **移動負荷→満足度低下** | **no** | **no** | absent | **MobilityObservation 型に satisfaction field 自体が無い** `mobilityObservationStore.ts:36-53`。load×satisfaction の相関関数は lib 全体 grep でゼロ。移動レパートリー学習(mode分布)+回避傾向観測のみで満足度を測定も予測もしない |

**6信号のうち best-choice の順位を実際に変えられるものは現状ゼロ。**

---

## 4. 複合融合エンジンは実装できているか → No（CEO 構想の核は未実装）

「複数文脈を1つの best-choice に積算する機構」は5つ存在するが、**全て live 融合に到達していない**:

1. **`candidateLensResolver.ts:88-129`**(最も近い) — lens 軸を重み積算して勝者を出す。だが production hard-block + **gapMinutes 未配線で schedule_fit/margin_impact が null・social_fit 常時 null → live な orderable 軸が walk_estimate(距離)1本に縮退** → 「2軸以上の融合」未到達。
2. **`contextModifier.ts:220-324`** — weather+density+energy+移動負荷 を tilt に集約する真の多文脈集約だが、production hard-block + 出力は**日次の定性 tilt(楽/きつい)で best-choice でない**(数値 score を意図的に拒否) + 同行者/次予定/過去選好/満足度を含まない。
3. **`best-action.ts:164-218`** — deadline/goalAttainment 等の本物の多 metric 合算だが caller が検証器/skeleton のみ＝live 未配線、subjective metric は 0 固定。
4. **`placeAffinityCombiner.ts:87-131`** — general+P2(過去選好)+P3(weather/timeband)を融合する combiner。だが `PLACE_AFFINITY_RANKING_ENABLED=false` + production hard-block。
5. **`alterHomeAdapter.ts:158-244`** — opportunity/cost/regret 合算だが判断圧 dimension で場所ランキングでない。

### CEO 名指しの2点（根拠付き）
- **Fit-Arc = 文脈無視の単純平均**: `fillRatio` = RESPONSE_FIT(keep1.0/conditional0.6/not_today0.35/no_more0.0)の**非加重算術平均**のみ(`fitArcReadout.ts:74`)。型に state/weather/companion field が無く(`postVisitObservation.ts:86`)、**fillRatio が分かれる軸は唯一 placeKey(場所)だけ**。「今の自分に応じて変わる適合」ではない。
- **placeAffinity = ε=0.05 タイブレーカーのみ**: persona は |term|≤ε の最弱 tie-breaker で base 差≥0.10 では絶対に逆転せず、persona prior 構築コードも live に無い(`placeAffinity.ts:80,83`)＝**決して発火しない dead path**。

---

## 5. なぜこの順序だったか（critical path の正当性）

**「まだ作ってない」のではなく「観測が貯まる前に融合を点火すると false-alive になるので、意図的に器官→表層→生成導線の順で止めている」**段階。
- 複合融合（疲労×天気×gap×…→満足度）の学習には、まず「この場所はこの状態で合った/合わなかった」の**結果ラベル(satisfaction)を集める器官**が要る。無い状態で融合スコアを出しても係数を当てる教師データがゼロ。
- アーク単独リリースは「答え合わせなしでは凍結し『死んだ glyph』」＝false-aliveness（deep-research docs 明記）。だから表示だけ先に光らせず dormant 保持。
- 融合本体(P2/P3)は明示的に後段へ繰延（設計 docs が非目的宣言・eval-OS も「ranking 反映は当面 NO-GO＝表示順止まり」と自己評価）。

---

## 6. 構想実現への gap と最短経路 ⚠️（実装提案・未着手）

6信号融合を本当に動かすのに足りないもの（critical path 順）:
1. **観測に文脈タグを構造化保存**: 現 `PostVisitObservation` は7 field のみで state/weather/companion/gap が**保存されない**。観測時にこれらをスナップショット。← 無いと条件付き学習の教師データが永久に作れない。
2. **死配線2本を繋ぐ**: ② gapMinutes を `PlaceCandidatesPanel:506` から渡す（schedule_fit が初めて non-null）。⑤ persona prior のデータ構築を live に。← **新規エンジン不要・配線数行**で「2軸目」が立つ。
3. **条件付き posterior を組む(P2/P3)**: 貯まった観測から「雨 ∧ gap<45 ∧ 初対面」条件下の満足度分布を Bayesian 共役更新（既存 `bayesianAxisUpdater` 再利用可・新エンジン不要）。
4. **複合スコアに統合**: `placeAffinityCombiner`(bounded nudge) か `candidateLensResolver`(重み付き比較) に合流。**融合の「箱」は既に健全に存在**＝足りないのは入力signalと教師データ。
5. **flag 段階点火**: reason-only(dev)→shadow ranking→live ranking。各段で honesty(捏造しない)維持。

**正直な但し書き**: 融合機構(combiner/重み付き推薦/ベイズ機械)は既に存在し品質も健全。欠けているのは「観測の文脈タグ付け」「条件付き posterior」「死配線の接続」であって**ゼロからのエンジン構築ではない**。docs も「ミシュラン級の絶対品質ランキング」は r=1 の壁で不可能と撤回済み・「あなた専用の的中」に reframe 済み。過大な期待値を置かないこと自体が設計前提。

---

## 7. CEO 判断点

- **(A) 複合融合(P2/P3)へ進む** — gap 1〜2（観測の文脈タグ付け + 死配線2本接続）に着手し「2軸以上で動く」最小融合を立てる。メリット=構想の核に最短。コスト=観測が薄く初期精度は低い。
- **(B) 観測が貯まるまで現状維持** — Stage 0 を dev/dogfood で flag ON にし**文脈タグ付き観測の収集を先に開始**、教師データが一定量たまってから (A)。メリット=false-aliveness 完全回避・王道。コスト=体感の前進が見えにくい。

**CoS 所見**: 設計原則「迷ったら整合性と世界観」+ docs 自己評価（観測器官が cold-start の生死を分ける急所）に照らすと、**(B) Stage 0 を dev で点火 → 文脈タグ付き観測を貯める → 一定量後に (A) 条件付き posterior** が筋。ただし「どちらに進むか」「観測器官をいつ ON にするか」は flag 点火・dogfood 露出を含むため **CEO 決裁案件**。

---

本書は read-only 監査の記録（実装・route・API・production・env・DB・origin/main push なし）。
