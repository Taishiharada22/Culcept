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
| **S6/L2** | 選択理由フック・Alter 接続（correction-via-explanation 完全形） | ⏳ **partial**（v0-E/F の最小 correction のみ・Alter 接続未） | **残・Phase A** |
| **S4/L5** | 天候バッジ・文脈条件付け（context modifier 自動推定 完全形） | ⏳ **partial**（v0 weather bias のみ） | **残・Phase A** |
| S5 | 1日成立チェック | ✅ done | Day Rehearsal viability |
| — | Day Rehearsal（課金核） | ✅ done | 上記（厚い） |
| — | energy curve | ✅ done | strain/recovery + Batch2 energy |
| — | counterfactual「もし〜なら」 | ✅ done | What-if v0(`ad0c9ee7`/`e7b45272`) |
| **S3** | 個人化移動時間「あなたのペース」 | ❌ **未** | **残・Phase A**（移動観測） |
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

## 4. ★これから（フェーズ計画・順序と根拠）
**制約**: production（deploy/push/PR/Vercel/DB write/Reality apply）は **GitHub 不可ゆえ HELD**。よって**当面は LOCAL で深められる診断・本人モデルを厚くする**。GitHub 復帰後に介入層・production。

### Phase A — 本人モデルと診断の深化（LOCAL・now-able）★次の主戦場
1. **A1 S3「あなたのペース」**: 実移動時間を観測し移動所要を個人化（捏造しない・取れねば「—」）。Day Rehearsal の精度が上がる。pure/local。
2. **A2 L2 完全形（correction-via-explanation / S6 Alter 接続）**: mobility 訂正の「理由」を Alter に接続し本人モデルを言語で深める。
3. **A3 L5 完全形（context modifier 自動推定）**: 天候 bias を超え、状態/energy/予定密度で「今日のあなたなら」を文脈条件付け（prior を汚さない二層）。
4. **A4 What-if 深化**: protect/recovery の inverse what-if（守らないと悪化する方向）・複数候補比較・（安全なら）定性 magnitude。
5. **A5 Place Affinity**: 場所の好み scorer 配線 → behavioral → state 条件付け（「今のあなたなら、この場所」）。
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

## 7. 直近の推奨（次の 1 フェーズ）
**Phase A1「あなたのペース」(S3)** を推奨。理由: ①原典 Wave 2 の唯一の残・②Day Rehearsal（課金核）の精度を直接押し上げる・③LOCAL/pure で production 不要・④移動観測は既存 data（実移動）で着手可。次は A1 の audit + mini design を提出します。

## 8. 証拠（.md）
master-design / implementation-plan / 各 closeout（v0/L1/L3/L4/Day Rehearsal step4・wire・WPM1/2・evidence-ui・per-marker-why・fullpath-batch1・energy-batch2・batch3-f1・batch4-whatif-audit・diagnostic-batch・repair-simulation-v0(+ui)）/ calibration-backlog / decision-log。Reality 介入層: `docs/` reality 系 + `lib/plan/reality/`（別所有・HELD）。
