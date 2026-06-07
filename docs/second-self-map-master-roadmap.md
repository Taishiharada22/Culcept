# 第二の自己マップ / 個人の現実 OS — マスターロードマップ（原典起算・漏れなし・最終プロダクトまで）

> 2026-06-08 / Build Unit / CEO 指示「元々の計画から起算して今どの位置にいるか・何が残っているか・最終的にどういうプロダクトか、漏れなく全体を提出」
> 上位設計: `second-self-map-master-design.md`（vision/architecture・§1 完全インベントリ）/ `second-self-map-implementation-plan.md`（HOW/status/順序）。
> 運用: 以後**フェーズ毎に Build が自律推論で計画提出 → CEO 精査 → 実装 GO 可否 → commit → 次計画**。本書はその「地図」（個別計画は各フェーズで別 doc）。

---

## 0. 最終プロダクト像（北極星）
**「世界の地図」ではなく「あなたの地図 / the map of YOU」**。/plan を **個人の現実を管理する AI = 第二の自己・秘書・管制塔**にする。
- 毎朝開く → **未来の自分が先に今日を試す（Day Rehearsal）** → 「今日はここが立て込みやすい」「これを早めればその日全体がゆとる」を**予定変更なしで**先に分かる。
- なぜを**本人モデル**で答える（「いつもは電車を選びがち」「あなたのペースだと…」）。文脈（天候・状態・energy）を自動で汲む。沈黙をデフォルトに、断定でなく**仮説**で。
- やがて**許可の上で動く**（Reality 介入層：余白を守る・出発を早める下書き）。会話 UI でも機能壁でも TSP でもない差別化＝**本人モデル × 文脈 × 先回り × 訂正可能性 × 毎日開く理由**。
- これが「世界に存在するマップアプリを超越する」核：Google/Citymapper は世界の地図、我々は**あなた自身の地図**。

### ★★★ CORE PROMISE: 自己理解ループ（魂・現状 BROKEN・最優先で塞ぐ）
FH 原典 §3 line 81 が「**競合が構造的に持てない堀**」と明言した中核＝「**移動が自己理解になる**」（§4.4・堀②・鏡・「自分ってそういう人間だったのか」）。理論は 5 段：
> ①推奨と違う mode を選ぶ→**理由観測**（疲れ/景色/安い/急ぎ/気分）→②observationBridge で Stargazer 合流→③軸（weather_sensitivity 等）でパターン検出→④Alter が「あなたは疲れた雨の日はタクシー」と返す→⑤移動から自己を知る。
**★現状＝5 段すべて BROKEN（2026-06-08 honesty audit で確定）**: ①理由観測 UI が**存在しない**→②mobility は localStorage に siloed で Stargazer に届かない→③mobility 軸 未定義・contradiction engine 未接続→④入力が無く Alter 返答不能→⑤ループ open。
→ 現状は「**地図が習慣を学ぶ**」（L1 done）止まりで「**なぜそう動くかを理解させる**」（M5/堀②）が**無い**。subscription value の「鏡・自己発見」は**現状デリバー不可能**。**これを塞ぐのが神ツール化の最優先**（Phase A の prereq・§4 参照）。

## 1. アーキテクチャ（Stargazer Human OS 5 層 を /plan に写像）
```
[L1 観測 Observation]   selectedMode / OD / 天候 / 時間帯曜日 / 実移動 / DayGraph / feasibility / transport / InnerWeather energy
        ↓
[L2 本人モデル Personal Model]  mobility belief（レパートリー・regime-change・cold-start pooling）+ energy 状態次元 +（将来）あなたのペース・場所の好み
        ↓
[L3 判断/診断 Decision]  Day Rehearsal（forward sim：成立 holds/tight/breaks・friction・buffer・strain・recovery・convergence）+ What-if（候補を仮採用→before/after）
        ↓
[L4 早期警告 Early Warning]  convergence marker（重なりやすい/立て込みやすい）・outlook・「どうするとよさそう？」+（将来）cross-day パターン・先回り
        ↓
[L5 介入 / Human API]  Reality Control OS（ChangeSet・apply・余白を守る）+（将来）外部連携  ← ★production・HELD
```
**現在地**: L1〜L4 の **LOCAL 診断ループは実質完成**。L5（介入・production）は pure layer 構築済で **HELD（GitHub 不可）**。

## 2. ★現在地（2026-06-08 時点・原典 Wave に対する到達度）
| Wave（原典 §5） | 内容 | 到達 |
|---|---|---|
| **Wave 0** | Mobility Hypothesis Surface v0（今日のあなたなら+なぜ+訂正+必要時のみ） | ✅ **完了**（main `5f05391f`） |
| **Wave 1** | L1 belief / L2 correction / L3 忘却 / L4 cold-start / L5 context | ✅ **大部分完了**（L1`3d3d24a8`・L3-a`77104e1a`・L3-b-1`0cc5217b`・L3-b-2 pure`846c3a2e`・L4`93aa5653`+`44633d16`）。**残: L2 完全形(S6 Alter 接続)・L5 完全形(context 自動推定)・L3-b-2 配線(gated)** |
| **Wave 2** | Day Rehearsal(課金核) / energy curve / counterfactual / S3 ペース | ✅ **核完了**（下記詳細）。**残: S3「あなたのペース」** |
| **Wave 3** | M1-M5 / Ambient / 1日交渉（moonshot） | ❌ 未（研究段階） |

### Wave 2 Day Rehearsal の到達（最も厚い・課金核）
pure layer(`f1e87f39`) → 配線(`d9354db4`) → WPM-1 詰まり marker(`1414bf38`) → WPM-2 recovery marker(`59e97dc4`) → Evidence「なぜ?」(`c221ac2d`) → per-marker why(`ea3556c2`) → **Batch 1 full-path 精度(`c60eb3ae`)** → **Batch 2 InnerWeather energy(`deef2b45`)** → **Batch 3 F1 marker factor 別見出し(`af6c30c3`)** → Repair candidate(v0`9c220da2`/v1`25337696`/dedup`db70d018`) → Repair preview/disposition/protect-signal/gap-resolver(各) → **What-if/Draft Preview v0 pure(`ad0c9ee7`)+UI(`e7b45272`)**。
→ **「未来の自分が先に今日を試す」+「候補を仮採用したらどう変わるか」が local で live**。energy curve（strain/recovery/energy を1日に）= 実装済。counterfactual = What-if v0 で達成。

## 3. ★完全インベントリ（原典全項目 × status・漏れ防止）
| ID | 項目 | status | 着地/メモ |
|---|---|---|---|
| S1-A | selectedMode 永続化 | ✅ done | FH |
| S2-A | 前回想起 recall | ✅ done | FH |
| v0 | Mobility Hypothesis Surface | ✅ done | `5f05391f` |
| S2-B | レパートリー学習（L1） | ✅ done | `3d3d24a8` |
| L3 | 選択的忘却（regime-change） | ✅ done | L3-a/b-1 live・b-2 pure(配線 gated) |
| L4 | cold-start partial-pooling | ✅ done | `93aa5653`+`44633d16` |
| **S6-0** | ★**理由観測 UI**（推奨と違う選択時の 1-tap 理由: 疲れ/景色/安い/急ぎ/気分） | ❌ **未**（UI 不在・hypothesisFeedbackStore に reason field なし） | **★SOUL BLOCKER・Phase A 最優先**（M5/堀②の前提） |
| **S6/L2** | 選択理由フック・Alter 接続（correction-via-explanation 完全形） | ⏳ **partial**（feedback の kind 記録のみ・**理由観測・Alter 接続ともに未**） | 残・Phase A（S6-0 依存） |
| **S4/L5** | 天候バッジ WALK LESS・文脈条件付け | ⏳ **partial（model logic はあるが配線断絶 0/3）**: mobilityHypothesis に contextNote 生成あり・test PASS だが MapTab が weather を渡さない（空 context）・UI 非表示。要 ①JMA fetch ②buildMobilityHypothesis へ渡す ③UI surface | 残・Phase A |
| S5 | 1日成立チェック | ✅ done | Day Rehearsal viability |
| — | Day Rehearsal（課金核） | ✅ done | 上記（厚い） |
| — | strain/recovery 計算（内部 model） | ✅ done | Day Rehearsal engine |
| — | energy budget 調整（Batch2・内部・最大 −25%・**UI 非表示**） | ✅ done | `deef2b45` |
| — | ★**可視化された「1日のエネルギー曲線」（Whoop 思想）** | ❌ **未** | **〔修正: 旧版で energy curve ✅ と書いたのは overclaim〕** Phase B/C |
| — | counterfactual「もし〜なら」 | ✅ done | What-if v0(`ad0c9ee7`/`e7b45272`) |
| **S3** | 個人化移動時間「あなたのペース」 | ❌ **未**（mobility/pace モジュール 0・Day Rehearsal は Google 値そのまま） | **残・Phase A** |
| S1-B | Supabase 永続化（クロスデバイス） | 🔒 gated(DB) | production・HELD |
| M1 | 受動的意図推定 / Ambient | ❌ moonshot | Phase D（天井~43%・balanced のみ） |
| M2 | ルート選好確率モデル | ❌ moonshot | Phase D |
| M3 | 説明可能な地図（深化） | ⏳ partial（なぜ?/per-marker why は live） | Phase D で深化 |
| M4 | 体調連動ルーティング（HDM/wearEvents） | ❌ moonshot | Phase D |
| M5 | 移動の自己発見レポート（鏡・Stargazer 合流） | ❌ moonshot | Phase D |
| — | 1日を交渉するマップ（agentic 再構成） | ❌ moonshot | Phase D |
| — | **Reality Control OS（介入層・ChangeSet/apply）** | ⏳ pure 構築済・**HELD** | **Phase C（production）** |
| — | Place Affinity（場所の好み・よく行く場所） | ⏳ partial（scorer 未配線・P2/P3/P4 未） | 並行 track・Phase A/B |
| — | option 2 deep research（堀仮説） | ❌ 未実行 | 最終段で必要時 |

## 3.5 ★設計提案されたが未実装（FH §4.2/§4.4 派生・旧版ロードマップの漏れ・honesty audit 2026-06-08 で発覚）
旧版 §3 はこれらを**インベントリから落としていた（漏れ）**。FH §4.2 は「bayesianAxisUpdater + Stargazer 軸を足すだけ」を中核 plumbing と位置づけたが、実装は **standalone `mobilityRepertoireBelief`（localStorage）に divergent** し、以下は未着手のまま roadmap に記載が無かった。**この cluster こそが「魂（自己理解ループ）」の配管**。
| 項目（FH §4.2/§4.4） | status | 依存 / 重大度 |
|---|---|---|
| 新 mobility 軸（mobility_pref_walk_vs_car / weather_sensitivity / detour_tolerance）を traitAxes に定義 | ❌ 未（traitAxes 55 軸は全て非 mobility） | 軸定義要・M5 前提 |
| **observationBridge → Stargazer の mobility pipeline** | ❌ 未（observationBridge.saveToStargazer は HOME robot 会話専用・mobility は届かない） | ★堀②の配管・DB write 含む部分は production gated |
| contradiction engine で移動の二面性検出（晴れは徒歩/雨は車） | ❌ 未（engine はあるが mobility を食わせていない） | weather_sensitivity 軸 + S4 配線 依存 |
| **Mobility → Stargazer bridge（移動 belief を trait 軸 delta に変換）** | ❌ 未（mobility は plan/mobility/localStorage に siloed） | ★堀②を閉じる必須・S6-0 + 軸定義 依存 |
| §4.4 行動+理由 → Stargazer 性格観測に合流（移動が自己理解になる） | ❌ 未（S6-0 理由観測が無いので起動しない） | ★★★ SOUL（§0 参照） |
> ★乖離の正直な記録: FH の「Stargazer 合流（足すだけ）」狙いは、L1 を standalone belief で実装した時点で**事実上失われた**（機能目標＝mode 学習は達成・自己理解合流は未）。再接続には上記 5 行が要る。**詳細 reconciliation は別 doc 候補**（`…-strategy-vs-roadmap-reconciliation.md`・CEO 要否判断）。

## 4. ★これから（フェーズ計画・順序と根拠）
**制約**: production（deploy/push/PR/Vercel/DB write/Reality apply）は **GitHub 不可ゆえ HELD**。よって**当面は LOCAL で深められる診断・本人モデルを厚くする**。GitHub 復帰後に介入層・production。

### Phase A — 本人モデルと診断の深化（LOCAL・now-able）★次の主戦場
**★再順序（honesty audit 2026-06-08）: 旧版は A1=S3 pace を推奨したが、製品の魂（自己理解ループ）が architecturally 未実装と判明 → SOUL を最優先に。**
0. ★**A0 S6-0 理由観測 UI（SOUL prereq・最優先）**: 推奨と違う mode を選んだ時に 1-tap で理由（疲れ/景色/安い/急ぎ/気分）を観測。hypothesisFeedbackStore に reason field 追加（local・低侵襲・任意・可逆）。**これが無いと堀②/M5/鏡が永久に起動しない**。local 部分（UI + reason 蓄積 + 局所パターン）は now-able。Stargazer DB 合流は production gated（観測の local 化は先行可）。
1. **A1 S3「あなたのペース」**: 実移動時間を観測し移動所要を個人化（捏造しない・取れねば「—」）。Day Rehearsal の精度が上がる。pure/local。
2. **A2 L2 完全形（correction-via-explanation / S6 Alter 接続）**: A0 の理由を Alter に接続し本人モデルを言語で深める（「あなたは疲れた雨の日はタクシー」）。
3. **A3 L5 完全形（context modifier 自動推定 + S4 配線修復）**: ★S4 の断絶（MapTab→weather 未配線 0/3）を直す＝JMA fetch→buildMobilityHypothesis→contextNote surface。状態/energy/予定密度で文脈条件付け（prior を汚さない二層）。
4. **A4 What-if 深化**: protect/recovery の inverse what-if（守らないと悪化する方向）・複数候補比較・（安全なら）定性 magnitude。
5. **A5 Place Affinity**: 場所の好み scorer 配線 → behavioral → state 条件付け（「今のあなたなら、この場所」）。
- 関連 LOCAL: 可視化「1日のエネルギー曲線」（旧 overclaim の実体化）= Phase B 寄りだが local 可。
→ 各 slice: audit→pure 実装→test→tsc footprint 0→（必要なら）local smoke→main 着地→closeout。CEO GO 毎。

### Phase B — 早期警告 / cross-day（LOCAL）
1. **B1 cross-day パターン**: 単日でなく週次の傾向（「この曜日は立て込みやすい」「連続でこの動きをすると疲れやすい」）。Second Self Map の観測蓄積を時間軸へ。
2. **B2 先回り（balanced・仮説のみ）**: research 天井 ~43% を踏まえ、断定せず「先に気づける」程度。notification fatigue 回避（沈黙デフォルト）。

### Phase C — 介入層 / production（GitHub 復帰後・CEO 承認必須）
1. **C1 Reality Control OS 配線**: 「余白を守る」「出発を早める」を**許可の上で**実適用（ChangeSet→apply）。draft preview（What-if）→ act-on の橋渡し。pure 構築済・INV-17 等のガード済。
2. **C2 production / DB / 較正**: S1-B クロスデバイス永続化・実データで calibration backlog 消化（L3-c/L4-c/strain 飽和/energy weight/magnitude）。
3. **C3 deploy / canary / 外部連携**: staging→canary→production。外部連携（予約等）は個別 CEO 承認。

### Phase D — moonshot / 研究
M1 意図推定 / M2 選好確率 / M3 説明可能 深化 / M4 体調連動（HDM）/ M5 自己発見レポート（鏡）/ Ambient 第二の自己 / 1日交渉（agentic）。option 2 deep research をここで投入。

## 5. 横断原則（不可侵・全フェーズ）
- read-only 診断が基本。介入は**許可の上**のみ（Phase C）。最適化の押し付け・常時通知・人格断定をしない。
- 生スコア/内部数値/level 名/confidence を UI に出さない。**仮説トーン**（〜かもしれません）。捏造しない（unknown は unknown・偽数字なし・距離→mode 推定なし・locked mode なし）。
- observed > inferred。sensitive blackout。filter-bubble 上限（confirmation を増幅せず correction を効かせる）。
- 各 slice: tsc footprint 0 / test / zero-conflict / zero-loss / 個別 commit。実データ無しの magic number 調整は calibration backlog（gated）。

## 6. 運用カデンツ（CEO 確定 2026-06-08）
**Build が自律的に大規模推論 → フェーズ計画を .md で提出 → CEO 精査 → 実装 GO 可否 → commit → 次計画**。漏れ防止に本ロードマップ §3 インベントリを常に status 更新。production 案件は必ず CEO 承認。

## 7. 直近の推奨（次の 1 フェーズ）— ★honesty audit 後に変更
**〔訂正〕** 旧版は A1「あなたのペース」(S3) を推奨したが、honesty audit で**製品の魂（自己理解ループ）が architecturally 未実装**と判明 → 推奨を変更。
**推奨 = A0「理由観測 UI」(S6-0)**。理由: ①FH が「**競合が構造的に持てない堀**」と明言した堀②/鏡/「自分ってそういう人間だったのか」の**唯一の起動点**・②subscription value（自己発見）の前提・③local 部分（1-tap 理由 UI + reason 蓄積）は production 不要で now-able・④これが無い限り Alter/M5/自己理解は永久に起動しない。
S3 pace は精度向上として A1 に続けて。**次は A0 の audit + mini design**（理由観測のスキーマ・低侵襲 UX・local 蓄積・将来の Stargazer 合流 接地）を提出します。

## 8.5 ★honesty 訂正記録（2026-06-08・independent audit `wf_a7caa6b8-b9b`）
CEO の「嘘をついているか・FH 漏れなく含むか」への正直な回答。independent 検証（5 cluster・実コード/git 裏取り）の確定結果：
- **意図的な嘘は無いが、3 件の overclaim/understatement を確定**: ①「energy curve ✅done」は誤り（内部 budget のみ・可視化曲線は未）②S6 partial は label は正しいが「理由観測 UI が皆無」を understate ③S4「weather bias partial」は配線断絶 0/3 を未記載。
- **漏れ（旧版インベントリから欠落）= §3.5 に追加**: 新 mobility 軸・observationBridge→Stargazer pipeline・contradiction engine 二面性・Mobility→Stargazer bridge・§4.4 理由観測フック。
- **乖離（未記載）= 記録**: FH §4.2「Stargazer 軸を足すだけ」計画 → 実装は standalone belief に divergent（機能達成・自己理解合流は未）。
- **★最重大**: 製品の「魂」＝移動→自己理解（堀②・鏡）が 5 段すべて BROKEN（§0 CORE PROMISE 参照）。旧版はこの**重大さを過小評価**していた。
- **FH 項目の取りこぼし（項目ごと欠落）は無い**（S1-S6/M1-M5 は全てインベントリにある）。正しく反映: S1-A/S2-A/S2-B/S5/L3/L4/counterfactual/S1-B gated/Phase 構造/read-only/仮説トーン。
→ 本訂正で roadmap は実態と整合。**最優先は魂（A0 理由観測）**。

## 8. 証拠（.md）
master-design / implementation-plan / 各 closeout（v0/L1/L3/L4/Day Rehearsal step4・wire・WPM1/2・evidence-ui・per-marker-why・fullpath-batch1・energy-batch2・batch3-f1・batch4-whatif-audit・diagnostic-batch・repair-simulation-v0(+ui)）/ calibration-backlog / decision-log。Reality 介入層: `docs/` reality 系 + `lib/plan/reality/`（別所有・HELD）。
