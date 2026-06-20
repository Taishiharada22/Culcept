# Candidate Lens — main 統合 + freeze closeout（2026-06-20）

状態: **FROZEN（main 統合済み・追加実装なし・resume gate=CEO の P5 phase 選択）**
正本 worktree: `/Users/haradataishi/Culcept-main-reflect-20260604`（canonical main）
親メモ: `memory/project_candidate-lens-phase2.md` / Phase 5 計画: `docs/candidate-lens-phase5-purpose-aware-enrichment-plan.md`

---

## 1. 今セッションで main 着地したもの（lens トラック）

| 着地 | commit | 内容 |
|---|---|---|
| REDO-14 | `76e720670` | ② 詳細カードを viewport 内に収める（`overlayTopOffset` で max-height 動的化＝下部 CTA 見切れ防止・内部スクロール）。① browse / ③ compare 不触。 |
| REDO-15 | `b1393b970` | ②③ の装飾タイル → **実 Google 地図**（`LensPlaceMap`・既存 `useGoogleMapsScript`+browser key 再利用＝新規 API/key なし・fail-open）。`LensCandidateView` に lat/lng 追加。① は装飾のまま。flag `PLACE_CANDIDATE_LENS_MAP_ENABLED`(default true)。 |
| P5 計画 | `b1393b970` | `docs/candidate-lens-phase5-purpose-aware-enrichment-plan.md`（**計画のみ**・未実装）。P5-a 目的別検索語拡張 / P5-b 公式 source evidence / P5-c アプリ内中央 Evidence Preview Modal / P5-d 仕事スコアリング。 |

実機 smoke 済み（dev 600×800）: ② 実地図1枚 + max-height 内部スクロール、③ 実地図2枚、写真は enrichment 取得時のみ実値（未取得は abstract fail-open）。

## 2. flag 状態（freeze 時点）

| flag | 値 | 意味 |
|---|---|---|
| `PLACE_CANDIDATE_LENS_UI_ENABLED` | **true** | lens ①②③ dogfood ON（dev）/ production NODE_ENV hard block |
| `PLACE_CANDIDATE_LENS_MAP_ENABLED` | **true** | ②③ 実地図（key/ready/座標なしは装飾 fail-open） |
| `PLACE_DETAILS_ENRICH_FETCH_ENABLED` / `_UI_ENABLED` | **true** | 写真/営業時間 canary arm / production は env gate（`PLACE_DETAILS_ENRICH_PROD_ALLOWED=1`+deploy まで OFF） |
| `PLACE_CANDIDATE_LENS_EXPLANATION_ENABLED` | false | ③ 行順 explanation note（未投入） |
| `PLACE_CANDIDATE_LENS_PREF_OBS/APPLY_ENABLED` | false | P3 観測/反映（未投入） |
| `PLACE_AFFINITY_REASON_UI_ENABLED` | true | 観測理由付与（順位不変） |
| `PLACE_AFFINITY_RANKING_ENABLED` | false | 候補並べ替え（未投入） |

全 production gate は閉。本番公開・enrichment 本番有効化は別 GO。

## 3. main 統合（multi-session・三者ズレ解消）

2026-06-20、CEO「全てを main に統合」指示。canonical main に 3 トラックが分岐していたため直列統合:

```
1. shift 取込トラック  → merge a2b1a3414（feat/plan-shift-import-realdata-reflection・別セッションが完結）
2. harness docs トラック → merge 106b133f0（claude/nifty-turing-128e67 の docs 81本・本セッションが統合）
   = main HEAD 106b133f0 に lens + shift + harness docs が全て包含
```

### multi-session 事故と回避（記録）
- canonical main worktree を 3 セッション（lens / travel / shift）が共有 → shift マージが4衝突で中断中に lens/travel が遭遇。memory 警告「三者ズレ」が実在化。
- **回避原則**: 中断マージは **abort 厳禁**（解決済み130ファイルが消える）→ オーナーが**完結**。lens work は commit 済み＋マージ土台＋安全 ref `safety/lens-redo15` で三重保全し**待機**。owner 完結後に lens が harness docs を統合。
- 安全 ref（保持）: `safety/lens-redo15`(b1393b970) / `safety/main-pre-harness-merge`(a2b1a3414)。

## 4. 検証（freeze 時点・main HEAD 106b133f0）

| 項目 | 結果 |
|---|---|
| tsc error count | **55**（baseline 完全一致・新規 0） |
| lens unit tests | **125 PASS**（8 files） |
| harness merge | docs-only（non-.md 0）・コンフリクト 0（ort 自動解決） |
| working tree | clean（supabase/.temp churn + node_modules untracked のみ） |

## 5. resume gate（凍結解除条件）

**次の一手 = CEO が P5 phase を選択**（`docs/candidate-lens-phase5-…-plan.md` 参照）。推奨順:
1. **P5-a 目的別検索語拡張**（最有力・外部 endpoint 不要・「おすすめの純度」に最も効く）
2. P5-c Evidence Preview Modal の UI 骨格（外部取得なしで安全に先行可）
3. P5-b 公式 source evidence（規約/robots/新規 endpoint=CEO 承認必須）
4. P5-d 仕事スコアリング（explanation 層が前提）

## 6. 未実施（境界保持・CEO 判断）

- `git push`（GitHub suspended + 未承認）
- 3 stacked branch（shift）/ harness ブランチ の削除（全て main 包含・削除は CEO 判断）
- enrichment 本番 canary（env 投入 + GCP quota + deploy・runbook `docs/candidate-lens-phase4e-production-enable-runbook.md`）
- P5 実装（計画のみ・未 GO）

> 本 closeout 時点で lens トラックは追加実装なし＝freeze。main は lens+shift+harness を全包含・tsc55・lens125PASS。
