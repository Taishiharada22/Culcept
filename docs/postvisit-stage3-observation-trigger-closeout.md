# 評価OS Stage 3-B/3-C Closeout — 観測生成導線の固定（docs-only）

作成: 2026-06-22 / 状態: **境界固定（docs-only）**
対象: post-visit 答え合わせ（観測生成）の発火点・one-per-day guard・不変条件
関連: `lib/plan/postVisit/{postVisitObservation,postVisitElicitation,postVisitStore,postVisitAnchorContext}.ts` / `PostVisitCheckCard.tsx` / `CalendarTab.tsx` / `LocationDetailSheet.tsx`

---

## 1. 観測生成の発火点（DONE）

post-visit 答え合わせ器官（`PostVisitCheckCard`）が出る箇所（commit `a360fe98e`/`8b2af5134`）:

| 発火点 | 内容 | trigger |
|---|---|---|
| **Calendar 選択日 anchor row**（`CalendarTab.tsx`） | 経過済み×場所付き×非suppress の anchor に控えめ答え合わせ。**選択日で最大1件**（one-per-day guard） | `past_plan`（+他 trigger） |
| **Travel 場所詳細シート**（`LocationDetailSheet.tsx`・Stage 0-B） | 場所詳細に答え合わせ | discovery 系 |

**Candidate Lens ②③ には答え合わせ（PostVisitCheckCard）は無い**（Fit-Arc readout のみ）。①カードは未配線。

## 2. one-per-day guard（Stage 3-C・固定）

`selectPostVisitAnchorForDay(anchors, now, signals)`（pure）が選択日で**最大1件**を選ぶ。選定ルール:
1. 経過済み（one_off の終了が now 以前・直近窓 14日内） 2. 場所付き（locationText 非空） 3. **one_off のみ**（recurring 除外） 4. **sensitiveCategory 無し**（明示除外） 5. 非suppress（`shouldElicit` が elicit=true＝home/work/habitual/after_skip/recent_same を除外） 6. その中で**より最近終了した予定**を優先（同点 id 安定）。1件も無ければ null。
- store signal（`lastSkipAt`/`lastElicitAtForPlace`）は helper に**注入**（helper は localStorage I/O せず pure）。

## 3. `past_plan` trigger（Stage 3-B・固定）

- `PostVisitTrigger` に `past_plan`（**最低優先度**）。`firstTrigger` で他の情報量の高い trigger（lens_proposed/important_plan/dwell/first_visit/discovery）が優先、無ければ past_plan。
- suppress が安全網（sensitive/home_work/habitual/high_fatigue/after_skip/recent_same が past_plan に優先）→ 実質「一回限り・非日常・非機微の場所付き予定」のみ発火。

## 4. placeKey round-trip（不変条件）

- anchor の `locationText`（canonical `displayName · address`）を `parseCanonicalLocationText` → `${displayName} ${address}` で再構成 → `opaquePlaceKey` が **lens ②③ の Fit-Arc キーと完全一致**（`normalizeLocationText` が末尾空白・大小文字を吸収）。lens 選択場所は anchor.locationText に書かれるため、**過去 anchor の答え合わせ → 同 placeKey で Fit-Arc に蓄積**。

## 5. invariant（固定）

- **書込のみ（write-only）**: 観測は localStorage shadow に貯まるだけ。**ranking/recommendation/winner/highlight に一切反映しない**（`candidateLensResolver` は postVisit を import しない）。
- **hideMirror**: Calendar timeline では汎用「観測の鏡」を出さない（複数 row に同じ鏡が並ぶのを防ぐ・回答後 ack のみ）。
- **stopPropagation**: 答え合わせのタップが anchor 詳細を開かない。
- **保存は Stage 0 whitelist のみ**（placeKey は hash・生 locationText/住所/GPS/滞在分/notes/companions/sensitive は保存しない・sensitive は suppress 判定のみ）。

## 6. flag / production / rollback

- **flag**: `POST_VISIT_CHECK_ENABLED=false`（dormant）+ `isPostVisitCheckEnabled()` の `NODE_ENV!=="production"` **hard block**。Fit-Arc 側も `FIT_ARC_READOUT_ENABLED=false`。
- **flag OFF / production**: `CalendarTab` は `isPostVisitCheckEnabled()` 短絡で `selectPostVisitAnchorForDay`/`Date.now()`/store も評価せず → **DOM 完全不変**。
- **rollback**: ①flag を false のまま（既定） ②配線行（CalendarTab の selectedPostVisit + card / LocationDetailSheet の card）を削除 ③器官ごと OFF。DB/migration/env なし → undo 対象なし。production 未到達。

## 7. テスト

postVisit **86 PASS**（過去判定・recurring/未来/場所なし除外・suppress マッピング・キー一致・past_plan・one-per-day 選定）/ plan **6266 PASS**（退化ゼロ）。

---

## 8. まだ出来ていないこと（Stage 4 以降の前提）

- 観測は「**場所単体**の合った/合わなかった」止まり。**その時の状態（疲労/天気/gap/同行者/時間帯/移動負荷）が保存されない** → 「**どの状態で**合ったか」が学習できない＝複合融合エンジンの教師データが欠ける。
- → **Stage 4-A**: context-tagged observation foundation（observation に coarse/nullable/redacted な `contextSnapshot` を additive 付与）。本書はその前提として観測生成導線を固定するもの。

> 本書は **docs-only**（コード変更なし）。
