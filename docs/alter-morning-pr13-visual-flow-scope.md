# W3-PR-13 — Visual Flow (Map + Timeline) Scope Proposal

**作成日**: 2026-04-24
**状態**: scope / invariants / success criteria 提案（CEO 承認前 / 実装未着手）
**base**: `main` @ `5a1da657`（PR-12.5 Stage 2 live verification 完了後）
**目的**: 北極星「map に pin + timeline で 1 日の流れ」への **最短導線** を PR-13 で 1 本引く。

---

## 1. 診断サマリ（2026-04-24、Explore survey 済）

### 1.1 着地済の前提
- ✅ PR-9 places-search handoff live（候補生成 + user 選択 UI まで）
- ✅ PR-10 Scope A：canonical `TransportSegment` 型 + durationHeuristic / shapeGuard / telemetry 着地
- ✅ PR-11 UI 正しさ修正：場所名表示 / 行 tap → PlaceDetailSheet / 開始–終了 range
- ✅ PR-12 / 12.5：`ALTER_MORNING_DIALOG_STATE_V2` + `_PLACES_SEARCH` allowlist canary、production で observability 合格
- ✅ `lib/alter-morning/map/types.ts` / `timeline/types.ts` は型のみ着地済（builder なし）
- ✅ `lib/alter-morning/transport/types.ts` は PR-10 で着地済（builder なし）

### 1.2 北極星までの **hard gap**（診断で確定）
| # | ギャップ | 影響 | 所在 |
|---|--------|------|-----|
| G1 | 候補選択後の `coordinates` が `event.where` に書き戻されない | **pin が描けない**（座標が plan に乗らない） | `lib/alter-morning/dialog/reducer.ts:910-983` (`handleSearchCandidateSelected`)、`WhereSlot` schema `comprehension/eventSchema.ts:67-75`（`coordinates` field 自体が無い） |
| G2 | `WhenSlot` に `endTime` / `durationMin` が無い | **timeline の長さが描けない** | `comprehension/eventSchema.ts:60-65`（startTime + timeHint のみ） |
| G3 | `TransportSegment[]` を plan に組み込む builder が無い | pin 間の連結線が描けない（Map polyline / Timeline badge 両方に影響） | PR-10 Scope A 段階で builder は未着地 |
| G4 | Map / Timeline UI 層が存在しない | そもそも画面が無い（`components/home/morning/MorningPlanCard.tsx:1009` は list 描画のみ） | `components/home/morning/*`、map ライブラリ未導入 |

### 1.3 既に「なぜこれで動いているか」
PR-12.5 の production harness で `candidate_count=5` が返った理由は、**候補生成まで**が live だから。ユーザー選択後の書き戻し以降は未接続。

---

## 2. PR-13 Scope — 3 案と推奨

### 案 A（minimal / 推奨）— **Coordinate persistence + 静的 map pin MVP**
北極星の「第一視覚化」=「pin が地図に立つ」だけを最短で成立させる。

**含む**:
1. G1 修正：`WhereSlot.coordinates` 追加 + `handleSearchCandidateSelected` で書き戻し
2. G3 最小版：2 event が coordinates を持つときに `TransportSegment[]` を assemble する最小 builder（Routes API は呼ばない、直線距離 + `default_walk` で埋める。PR-10 Scope A の durationHeuristic を流用）
3. G4 skinny：`components/home/morning/MorningMapView.tsx` を新設、pin 描画のみ（polyline は出さない）
4. kill switch：`ALTER_MORNING_VISUAL_FLOW` flag 新設（既存 allowlist pattern 踏襲）

**含まない**:
- endTime / durationMin（G2）→ **PR-14 へ繰り上げ**
- Timeline UI → PR-14
- Routes API での経路取得 → PR-15（別立て）
- polyline 描画 → PR-14 と同時

**狙い**: 「座標が生きた data として plan に乗る」という **構造的不可逆性** を 1 本で landing。

### 案 B — Coordinate + endTime + Map + Timeline（wide）
PR-10/11/12 の reservation 通り endTime も同梱し、timeline まで一気に。

**リスク**: 4 gap 同時で review / rollback 単位が大きい。Vercel hang 多発時期にも不利。

### 案 C — Coordinate persistence のみ（ultra-minimal）
G1 だけ。視覚化はゼロ。

**リスク**: 「見える進捗」にならない。CEO の「最短導線」意図から外れる。

### 2.1 推奨
**案 A**。理由:
- G1 は他の全 gap の前提（座標が event に乗らない限り pin も polyline も Timeline segment も建てられない）
- 視覚化を 1 段（pin だけ）でも出すことで「見える進捗」になる
- endTime（G2）は UI 要件としては timeline で初めて効く → PR-14 に同梱するほうが粒度が揃う
- canary 方式は PR-12.5 で実証済のパターンを踏襲できる

---

## 3. Invariants（PR-13 が破ってはいけない不変条件）

### 3.1 既存への非退行
- **I-1** `ALTER_MORNING_VISUAL_FLOW=false` 時、本 PR 前と**バイト単位で同じ UI / 同じ analytics**（kill switch 絶対）
- **I-2** `event.where.coordinates` が無い event は従来通り list rendering にフォールバック（map 側で「表示不可」ではなく、**そもそも map view を出さない**）
- **I-3** PR-12 / 12.5 の `flag_source` gating を壊さない（visual flow flag は dialog-state-v2 の**配下**ではなく**並列**、AND gate は UI 側で組む）

### 3.2 データ整合性
- **I-4** 書き戻す `coordinates` は `NormalizedPlaceCandidate.coordinates` を**そのまま**採用（別途 re-geocode しない）
- **I-5** `WhereSlot.coordinates` は optional field として追加。既存 session の migration は不要（未設定 = 表示不可）
- **I-6** TransportSegment builder は **`fromEvent.where.coordinates && toEvent.where.coordinates` が揃った pair のみ** に対して segment を生成。片方欠けたら skip（例外を投げない）

### 3.3 UI / 世界観
- **I-7** Map は list の**置き換えではなく補助ビュー**（トグル or 並列）。list の信頼性が現在の主戦場なので、map で上書きしない
- **I-8** 未確定 pin は `confirmationState: "provisional"` で**薄い色 + 破線枠**。確定風の表示禁止（PR-8 rev 1 UI truth separation 原則の map への波及）
- **I-9** 日本語ラベル維持、glassmorphism design system 準拠

### 3.4 ロールアウト
- **I-10** preview / production どちらも allowlist-only で投入。global ON は PR-13 merge 時点では行わない（PR-12 Stage 3 と同様に段階を分ける）
- **I-11** `stargazer_analytics` に `alter_morning_map_rendered` を 1 本追加（session / pin_count / has_fallback の最小 metadata）

---

## 4. Success Criteria（完了判定）

### 4.1 Structural（merge 必須条件）
- **S-1** `WhereSlot.coordinates` が schema / reducer / handleSearchCandidateSelected / persistence で一貫して流れる（unit test で立証）
- **S-2** TransportSegment builder が 2+ coordinates の event から segment を生成（unit test）
- **S-3** `ALTER_MORNING_VISUAL_FLOW=false` の下で **tests 全 PASS / CLS なし / 既存 snapshot 不変**
- **S-4** 既存テスト 1953/1953 本 PASS、新規 unit 最低 12 本追加 PASS（想定 breakdown: reducer 4 / builder 4 / MapView render 4）

### 4.2 Live Verification（preview canary で判定）
- **V-1** preview harness で候補選択後に `event.where.coordinates` が plan return に含まれる（DB or API response で立証）
- **V-2** CEO UUID allowlist で visual flow ON にし、**2+ event を含む morning plan で pin が地図に立つ**（実機スクショ）
- **V-3** `alter_morning_map_rendered` が `stargazer_analytics` に着弾（`pin_count >= 2` を最低 1 本）
- **V-4** `ALTER_MORNING_VISUAL_FLOW=false` に戻した状態で既存 flow と完全一致（regression スクショ）

### 4.3 Rollout（production canary で判定、別 Stage）
- **R-1** production allowlist（CEO + Role C）で map が 1 回以上描画された `alter_morning_map_rendered` 観測
- **R-2** 24h で provider_failure / reducer 例外 / render crash がゼロ
- **R-3** list view との併存で主戦場の UI 正しさが退行していない（PR-11 の 4 項目を再確認）

---

## 5. Out of Scope（明示的に除外）

- Timeline UI（PR-14）
- endTime / durationMin schema（PR-14 と同梱）
- Routes API 呼び出し（PR-15 候補）
- pin ドラッグで場所修正、周辺 POI レイヤ、Google Maps app intent
- 他ユーザーとの共有、過去日 timeline
- map library 選定の長期最適化（PR-13 では軽量 library 1 つで十分、詳細比較は追記）

---

## 6. 依存関係と次 PR への影響

- PR-13 が解除するもの: PR-14 timeline が「event に区間 + 連結」を描ける前提
- PR-14 で同梱予定: G2（endTime/durationMin）+ timeline UI + polyline
- PR-15 候補: Routes API 統合（Transport の `confidence` を `route_api` に昇格、`estimatedDurationMin` を実測値へ）

---

## 7. 本 PR の branch / commit 粒度（提案）

```
feat/alter-morning-pr13-visual-flow-mvp
├── C1: WhereSlot.coordinates 追加 + schema rev + unit
├── C2: handleSearchCandidateSelected で coordinates 書き戻し + unit
├── C3: transport builder 最小版（direct line + default_walk） + unit
├── C4: components/home/morning/MorningMapView.tsx（新設、pin のみ）
├── C5: ALTER_MORNING_VISUAL_FLOW flag + allowlist（PR-12.5 pattern 踏襲）
├── C6: alter_morning_map_rendered analytics 配線
└── C7: docs/decision-log + rollout plan (本文書) 更新
```

Map library 候補: 軽量案として `react-map-gl + MapLibre GL`（OSS、無料）または `@vis.gl/react-google-maps`（Google 既存 key を再利用）。選定は C4 で 1 本に絞る（CEO 判断点）。

---

## 8. CEO 判断点（承認を求める項目）

1. **案 A / B / C の選択**（推奨: A）
2. **Map library 選定**：
   - (a) MapLibre GL（Google 依存を増やさない、世界観との親和性で別途検討）
   - (b) `@vis.gl/react-google-maps`（既存 `GOOGLE_MAPS_API_KEY` 再利用、Places との一貫性）
   - 推奨: (b)。既に key 投入済 + Places で UX 整合
3. **flag 命名**：`ALTER_MORNING_VISUAL_FLOW` で OK か（`_MAP_VIEW` 等への rename 希望の有無）
4. **rollout 段階**：PR-12.5 と同じく preview → production allowlist → global の 3 段で進めるか

---

## 9. 参照

- `docs/alter-morning-roadmap.md`（北極星 + PR 階段）
- `docs/alter-morning-pr10-14-interface-reservation.md`（型予約、本 PR で map/timeline builder を landing）
- `docs/alter-morning-pr12-production-rollout-plan.md`（canary pattern 先例）
- Explore diagnostic（2026-04-24）: G1〜G4 の file:line 根拠
