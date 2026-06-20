# Day Rehearsal What-if Preview — UI placement mini design（設計のみ・実装は次 GO）

> 2026-06-07 / **設計のみ・実装しない** / 前提: What-if Preview v0 pure layer（`previewRepairEffect`）main live（`a39ba2d4`）+「どうするとよさそう？」候補 disclosure live。
> 前提（CEO）: v0 は read-only preview・候補選択 UI でない・実行導線でない・予定変更でない・**控えめな補足説明**・raw evidence/internal score/数値改善は出さない。

---

## 0. 結論（先に）
- **★核心 finding: candidate.suggestion と preview.body は重複が大きい**（action と effect の言い換えで、特に clarity/utilization はほぼ同義）。両方を常時並べると冗長 + 情報過多（HARD GATE「情報量が多すぎる」抵触）。
- preview の**distinct な価値 = uncertainty（何が未確定か）+ category（effect/clarity/utilization の枠）**。body は候補とほぼ重なる。
- **推奨**: **案B（候補ごとの second-level「もしやるなら？」disclosure・default 閉）**。default は候補行のみ（現状維持・overload なし）、tap で preview を opt-in。中身は **uncertainty 主体・effect 候補のみ**（clarity/utilization は候補で足りる）。confidence は **内部のみ**（user-facing で出さない）。raw evidence 非表示。
- ★ もし「重複で薄い」と判断するなら **UI は出さず pure layer のまま保持**（preview は将来の定量版で UI 化）も妥当。CEO 判断。

## 1. CEO 10 質問への回答
| # | 質問 | 回答 |
|---|---|---|
| 1 | 候補直下に小さく出す（常時）か | △ 可能だが **冗長 + overload リスク**（候補 3 + preview 3 = 6 行・body は候補と重複）。常時は非推奨。 |
| 2 | 「もしやるなら？」second-level disclosure か | ✅ **推奨**。default 閉・opt-in で overload 回避・preview を候補に直結。 |
| 3 | 「どうするとよさそう？」内に収めるか | ✅ はい。新 disclosure を増やさず既存内に nest（banner>どうする?>候補>もしやるなら?）。 |
| 4 | 常時 preview は情報量過多か | **はい（過多リスク）**。→ 案B（opt-in）+ effect 候補のみ + uncertainty 主体で軽量化。 |
| 5 | effect/clarity/utilization をどう見分けるか | category 別に**「もしやるなら？」の文言を変える**: effect=「もしやるなら？」/ clarity=「確認すると？」/ utilization=「活かすと？」。ラベル色分けはしない（slate 維持）。 |
| 6 | confidence を user-facing に出すか | **内部のみ（v0 で出さない）**。high/medium/low を出すと定性 preview に過剰な精度を含意（「medium だから半分効く」等の誤読）。内部 trace 保持のみ。 |
| 7 | evidence raw 非表示でよいか | ✅ はい（候補と同方針）。 |
| 8 | reduce_density が予定変更指示に見えないか | preview 段でも弱い（low・「決めつけません」）。UI でも reduce_density の「もしやるなら？」は最弱 or 出さない。具体的予定削除/変更の文言なし。 |
| 9 | copy が「改善します」断定でないか | pure layer が既に hypothesis トーン・断定なし。UI は body/uncertainty をそのまま出す（ad-hoc copy なし）。 |
| 10 | button/apply/save/予定変更導線に見えないか | **テキストのみ**（候補と同原則）。実行 UI・選択 UI・チェックなし。「もしやるなら？」は**説明の disclosure であって実行トグルでない**。 |

## 2. 重複（candidate ↔ preview.body）の整理
| kind | candidate.suggestion | preview.body | 重複度 / preview の distinct 価値 |
|---|---|---|---|
| leave_earlier | 出発を少し早める余地 | 余白を少し守りやすくなるかも | 中。distinct=effect 方向 + uncertainty「度合い未確定」 |
| protect_buffer | 余白を守ると重なりにくそう | 余白を残せると重なりにくそう | **高（ほぼ同義）**。distinct=uncertainty のみ |
| confirm_uncertain | 確認できると安心かも | 確認できると見通しが立てやすそう | **高**。distinct ほぼなし（候補で足りる） |
| use_recovery_window | 一息つく時間に使えそう | 一息に使えると次に入りやすそう | **高**。distinct ほぼなし |
| reduce_density | 軽くできると余白を守りやすいかも | 軽くできると余白を守りやすいかも | **ほぼ完全重複** |
- → **effect（特に leave_earlier）以外は preview body が候補とほぼ同義**。UI で body を再掲する価値は低い。**preview を出すなら uncertainty 中心**（候補が言っていない「何が未確定か」）。

## 3. 推奨設計（案B・lean・実装は次 GO）
- 「どうするとよさそう？」disclosure 内の各候補行の下に、**category 別 second-level `<details>`（default 閉）**:
  - effect: summary「もしやるなら？」→ body（effect 方向）+ uncertainty（「ただし、度合いは未確定です」）
  - clarity/utilization: preview を**出さない or uncertainty のみ**（候補で effect は伝わっているため）
- confidence は出さない（内部）。raw evidence 非表示。reduce_density は最弱 or preview なし。
- read-only・実行 UI なし・テキストのみ。

## 4. 実装する場合のスケッチ（次 GO 時）
- `CalendarTab`: 既存 repairCandidates に対し `previewRepairEffects(repairCandidates)` を additive 計算 → banner に渡す（candidate と preview を index 対応で）。
- `DayOutlookBanner`: 各候補行の下に（effect のみ）`<details>「もしやるなら？」` で preview.body + uncertainty。confidence/evidence/appliesTo は出さない。
- render contract test: default 閉 / opt-in / effect のみ / uncertainty 表示 / confidence 非表示 / 実行 UI なし / 禁止語なし / 既存「どうするとよさそう？」非破壊。
- tsc footprint 0・read-only。

## 5. HARD GATE 照合
- preview が予定変更の提案に見えない（説明 disclosure・実行 UI なし・断定なし）。
- **情報量過多 → 案B（opt-in）+ effect のみ + uncertainty 主体で回避**（常時全 preview は非推奨）。
- effect 断定なし（hypothesis・confidence 非表示）。
- UI 配線は小（既存 disclosure 内に nest・banner/候補 disclosure 非破壊）。大改修にならない。
- 既存「どうするとよさそう？」disclosure を壊さない（nest 追加のみ）。

## 6. CEO 判断点（実装 GO 前）
1. UI を**出す（案B lean）**か、**pure のまま保持**（重複で薄い→定量版で UI 化）か。
2. 案B（候補ごと「もしやるなら？」second-level disclosure・default 閉）で良いか。
3. preview を **effect 候補のみ**に絞り、clarity/utilization は候補のみ（preview UI なし）で良いか。
4. confidence は **内部のみ（非表示）**で良いか。
5. uncertainty を主・body を従（or body 非表示で uncertainty のみ）にするか。
6. reduce_density の「もしやるなら？」は **出さない**で良いか。
