# Second Self Map — Wave 1 / L1 mini design（移動レパートリー学習・S2-B）

> 2026-06-05 / **設計のみ・実装は CEO GO 待ち** / 正本 = local main `5f05391f`
> 前提: v0 完成（legKey 単位の precision 加重 belief・main 着地済）。L1 は belief 本体を「レパートリー学習」へ。
> 上位: `docs/second-self-map-implementation-plan.md`（L1=S2-B / L4=cold-start pooling）。

---

## 0. 目的（一言）
v0 は legKey（`anchorId__anchorId`）単位で mode 履歴を読むだけ。L1 は **OD（場所ペア）× timeband × weekday** で条件付けた**移動レパートリー**を学び、未知の leg でも「いつものあなた」を一般化して surface する。

## 1. コード調査で判明した制約（設計の前提・investigation 2026-06-05）
- anchor 型 `lib/plan/external-anchor.ts`: id / startTime / **locationText（自由テキスト）** / sensitiveCategory 等。**placeId も座標もない**。
- anchor source: Supabase `external_anchors`（現在/未来のみ）。`anchorsForDay()` が recurring を都度展開。**過去 anchor の archive なし**。
- 場所同一性: recurring anchor の id は**全日安定**、one-off は**日替わり**。**cross-day の place 同一性は無し**（id≠place）。
- 解決インフラ: `lib/alter-morning/placeResolver.ts`（locationText→{placeId,lat,lng}・2層キャッシュ・**Google API 依存**）。
- 再利用候補: `lib/plan/compose/locationHistory.ts`（locationText を頻度/recency 集約・recurring/one-off 判別）/ `lib/plan/compose/placeAffinity.ts`（場所ランキング）。

→ **2 つの決定的事実**:
- **(A) 過去観測の OD は信頼再構成できない**（anchor archive なし・one-off id 消失）。→ **前方記録（forward-capture）が正道**。「過去は作れない、今から録る」。
- **(B) 堅牢な place 解決は Google API 依存**（CEO 制約で今は不可）。→ L1 は **normalized locationText を crude place key** として **API なし**で開始。後で（CEO 承認後）placeId へ昇格。

## 2. 既存を壊さない拡張方針（CEO 点2）
- `selectedModeStore`（現在選択の正本）/ `hypothesisFeedbackStore`（feedback）/ `ModeBelief` 型 / `buildWeightedModeBelief` — **すべて不変**。
- L1 は **新 store を additive 追加**（`mobilityObservationStore`・別 key）+ **新 pure belief**（`buildRepertoireBelief`）。
- **v0 の legKey belief を fallback の床**にする → odKey 不在/データ不足時は v0 と完全同一挙動（**退行ゼロ**）。

## 3. 段階実装（S2-B・CEO 点3）— pure-first / no-API / no-regression
| phase | 内容 | 依存 | 純度 | 価値 |
|---|---|---|---|---|
| **L1-a** | rich 観測の**前方記録**（新 store）: `{day, legKey, mode, timeband, weekday, originKey, destKey}`。sensitive は place key 省略。**API なし**（key = normalized locationText・`locationHistory.ts` の正規化を再利用） | MapTab onSelect（v0-E と同 hook） | store/正規化 = pure・capture = wiring | データ flywheel 起動（**これが無いと一般化不能**） |
| **L1-b** | belief が **odKey×timeband×weekday を階層 fallback** で条件付け（finest with データ → 粗へ → legKey=v0）。pure | L1-a データ蓄積後 | pure | OD/文脈一般化（核） |
| **L1-c** | recency（**change-aware・素朴 decay 禁止**） | L1-b | pure | 応答性（L3 と統合検討） |
| （L4 別タスク） | cold-start partial-pooling（階層 shrinkage の正式版） | L1-b | pure | cold-start 緩和 |

> ★L1-a を先に出して**データを溜める**。belief 変更（L1-b）は**データが溜まってから**。v0-F tuning を保留したのと同じ「勘でなくデータで」原則。

## 4. recency と研究方針の整合（独立論点・最重要）
- 研究方針（既存）: 「selective forgetting ＝**時間 decay でない**（L3）」。preference-not-policy 上、時間経過だけで選好を忘れるのは誤り。
- → **L1 に素朴な指数 decay を入れない**。recency は **regime-change 検出型**（最近が歴史と乖離した時だけ最近を重視）にするか **L3 に寄せる**。L1-a/b は frequency（counts）を primary に。

## 5. L1-b と L4 のカップリング（独立論点）
- 条件付け（OD×time×weekday）は**データを分割 → cold-start 増**。fallback なしの belief は v0 より surface 減＝**退行**。
- → L1-b は**最低限の階層 fallback を内蔵**（finest level の total≥閾値 else 粗へ → legKey）。正式な partial-pooling（shrinkage）は L4。
- 階層（specific→general）: `odKey×timeband×weekday` → `odKey×timeband` → `odKey×weekday` → `odKey` → `legKey(v0)` →（global=L4）。

## 6. pure module 境界（CEO 点4）
- **pure**: `mobilityObservationStore` の parse/serialize/cap（`hypothesisFeedbackStore` と同型）/ timeband・weekday bucketing / placeKey normalization / `buildRepertoireBelief(observations, query)→ModeBelief`。
- **wiring（GO 待ち）**: MapTab onSelect での capture（anchors の locationText/startTime を集める）= UI 接続。
- **deferred（CEO 承認）**: `placeResolver` で odKey を placeId へ昇格（robustness）。

## 7. scope 境界
- **L1 is**: 新観測 store（additive）+ 階層条件付け belief（pure）+ 既存 belief を fallback 床。
- **L1 is NOT**: `ModeBelief`/`selectedModeStore`/`hypothesisFeedbackStore` 破壊 / Google API / DB・Supabase / push・PR・GitHub / 素朴 time-decay / 距離→mode / fake duration / 人格診断 / v0-F tuning（保留）。

## 8. リスクと対処
| リスク | 対処 |
|---|---|
| 過去 OD 再構成不能 | 前方記録（L1-a）。過去は v0 legKey belief のまま |
| place key の text 揺れ（"自宅"/"home"） | normalized text で開始、後で placeId 昇格（CEO 承認） |
| 条件分割で cold-start 増 | 階層 fallback 内蔵（§5）+ L4 partial-pooling |
| sensitive 場所の漏れ | sensitive leg は place key 省略（v0 の沈黙/非記録と整合） |
| 退行（surface 減） | v0 legKey belief を fallback の床（odKey 不在/薄データ→v0 同一） |
| 素朴 decay の誤り | recency は change-aware・L1 では frequency primary（§4） |

## 9. CEO 判断点（実装 GO 前）
1. **L1-a（前方記録 store・API なし・normalized text key）から始める**で良いか。
2. place key を当面 **normalized locationText（crude・API なし）** で良いか（placeId 昇格は別承認）。
3. timeband の bucket 粒度（**朝/昼/夕/夜 の 4 分割**で良いか）。
4. weekday は **weekday/weekend の 2 値**で開始（7 値は後の精緻化）で良いか。
5. recency は **L1 に入れず L3 へ寄せる**で良いか。

## 10. 参照
- v0 closeout: `docs/second-self-map-v0-closeout.md`
- 実装計画: `docs/second-self-map-implementation-plan.md`
- 再利用候補: `lib/plan/compose/locationHistory.ts` / `placeAffinity.ts` / `lib/alter-morning/placeResolver.ts`
