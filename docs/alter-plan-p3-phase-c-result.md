# P3 Phase C Result — ICS + Google 共存 pass → P3 完成判定 (案)

起草日: 2026-05-29
親 phase: P3 Completion → Phase C (= 共存確認 + 完成判定)
CEO 確定: (= 完成宣言 + main merge GO は CEO 待ち)

---

## §1. 完了宣言

**Phase C (= ICS + Google の同一 Plan UI 共存) は CEO 視覚確認で pass**。

- staging で Google import 済 user のまま `/tmp/p3-phase-c-smoke.ics` を追加 import
- 5/29・5/30 の Plan UI で ICS 由来予定と既存予定 (= Google import 含む) が共存表示
- production には一切書き込みなし

---

## §2. 検証結果 (= Phase C pass 5 条件、 CEO 視覚確認)

| # | 条件 | 結果 | 根拠 (= CEO smoke screenshot) |
|---|------|------|------|
| 1 | Google import 済の状態を維持 | ✅ | 既存予定 (= 5/30 「仕事」09:00-17:00 等) が残存 |
| 2 | Phase C 用 ICS fixture を追加 import | ✅ | ICS 3 件表示: 5/29 「デザインレビュー」13:00 / 5/29 「1on1」16:00 / 5/30 「コーヒーチャット」11:00 |
| 3 | 同一 UI で Google 由来予定と ICS 由来予定が共存表示 | ✅ | 5/29・5/30 とも ICS + 既存予定が同一タイムラインに並ぶ |
| 4 | 既存予定を壊さない | ✅ | 既存予定が消失・変質せず残存 |
| 5 | 意図しない重複や消失がない | ✅ | ICS 3 件が重複なく追加、 既存予定の loss なし |

→ **5 条件すべて pass** (= CEO「共存できているように思います」)。

---

## §3. 観察された overlap 事項 (= P3 範囲外、 deferred)

### 観察 (= CEO)
5/30 で「仕事」09:00-17:00 と ICS「コーヒーチャット」11:00-11:30 が時間重複。 望ましい表示は「仕事」を 09:00-11:00 / 11:30-17:00 に分割し、 間にコーヒーチャットを置くこと。 現状は両 block が独立表示。

### scope 判断 (= P3 完成 scope 外)
1. **import は正常** — 両予定とも正しい時刻で取り込み済。 データ破損ではなく「両方正しく存在した上での描画の仕方」 (= pass 条件 5 の「重複・消失」 ではない)。
2. **source 非依存** — 任意の時間重複予定 (= 手動×手動 / Google×Google 含む) で起きるタイムライン描画全般の挙動。 外部取り込み層 (= P3) の範囲ではない。
3. **プロダクト設計論点を含む** — 短予定が長予定を「割る」 vs 「重ねる」 vs 「入れ子」、 「仕事中の小休止」 の意味論など、 自明な正解がない。 → カレンダータブ再設計 / Plan UI トラックで扱う。

### 対応
- task #206 でバックログ化。 Phase C readiness §6 / 後続 UI トラックで扱う。
- CEO 判断: 「今回の修正範囲外で、 以降に行う予定だったら、 それでいい」 → **deferred で確定**。

---

## §4. P3 完成判定 (案) — completion-readiness §0 照合

| P3 完成条件 | 状態 |
|------------|------|
| ICS import end-to-end | ✅ Phase A pass |
| Google import end-to-end | ✅ Phase B pass |
| 両系統が同一 UI で共存 (= Phase C 5 条件) | ✅ Phase C pass (= 本 doc) |
| production への副作用 0 | ✅ 全 smoke staging runtime |

→ **4 条件すべて満たす。 P3 完成判定 = PASS (案)**。 CEO の**完成宣言 + main merge GO 待ち**。

---

## §5. 次の動作 (= CEO 判断待ち)

1. **P3 完成宣言** (= CEO) → 本 doc の (案) を確定に
2. **main merge** (= `feat/p3-completion` → main、 中間 merge せず Phase C pass 後にまとめて = CEO 既定方針)。 Claude が実行する場合は branch 確認 + full suite green + closeout 固定の上で。
3. merge 後の残課題 = Phase C readiness §6 (= Outlook / sync 高度化 / overlap 描画 #206 / tsc debt / カレンダータブ再設計) + 戦略トラック §6.3 (= 情報→経営転用フロー)

---

## §6. 関連 doc

- `docs/alter-plan-p3-completion-readiness.md` (= 親、 §0 完成条件)
- `docs/alter-plan-p3-phase-c-readiness.md` (= Phase C 設計、 §9 fixture)
- `docs/alter-plan-p3-phase-b-result.md` / `docs/alter-plan-p3-phase-a-result.md` (= Google / ICS 側 result)
