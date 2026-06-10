# Reality Preview Dogfood Log（A-4-c3 protocol 準拠・**redacted**）

> 記録規則: `docs/reality-preview-dogfood-protocol-a4-c3.md` §5。
> **anchor のタイトル・場所・人物は書かない**。counts・enum・提案ブロックの HH:MM・抽象的な感想のみ。
> S1–S8 に FAIL が出たら dogfood を中断し、修正（+lock test）後に再開する。

## 参考初期値（A-4-c2 smoke・2026-06-10 時点の実測）
- counts: anchors=5 windows=6 memory=0 usableContexts=0
- envelope: readiness=ready tier=protect trigger=silent permission=allowed
- reflection: stage=done verdict=can_apply items=6 blockers=0 warnings=0

---

<!-- 以降、§5 フォーマットで record を追記 -->

### [2026-06-10 夜] record 1 — Life Ops 3VM fixture 観測（初回・protocol §8）
- 方法: fixture render dump（nowMinute=575/620/800 の 3 時点・renderToStaticMarkup・DB 0・実データ源 0）
- counts: windows=2（朝60分/午後180分）fixture候補=5（期限1・準備2・周期2）placed=3 alsoAvailable=2
- 表示確認: headline「今日は「確定申告」を先にすませると安心です」/ 3案（守る1件・楽3件・攻め3件）/「ほかにも候補が2件あります」/ Moment=620で「沈黙（silenced 1・focus_block）」/ 重複制御 row「代表 1 件を除外（1）」/ fixture明示文・無書き込み文あり
- LifeOps: L1 OK / L2 OK+WATCH / L3 OK / L4 OK / L5 OK / L6 OK / L7 WATCH / L8 WATCH / L9 OK
- 安全: S1-S8 = PASS（button/PII/id/full payload/導線 0・integration tests で固定済）
- LifeOps 引用メモ:
  - 【L2/観測穴】recommended=protect で代表=確定申告 1 件→exclude→**Moment が 3 時点すべて沈黙**。重複制御は完璧に効いている（再表示ゼロ）が、**Moment が発火する姿を fixture 観測で一度も見られない**。発火例の観測には「評価 tier の切替」or「代表>1 の fixture」が必要。
  - 【L8】**楽な案と攻める案が完全同一**（同じ 3 件・同じ順）。cap 3 で push lane（美容院）が placement 段階で unplaced→push 専用候補が tier に届かず、easy と push の差がゼロに見える。
  - 【窓ヒント揺れ】同じ確定申告が 守る案=午後/楽な案=午前（620 時点）— tier 内 refit の正しい結果だが、初見で「なぜ案によって時間帯が違う？」と一瞬戸惑う。800 時点では過去窓 skip により全案午後に収束（正しい）。
  - 【L7】Life Ops section 単体は 10 秒で掴める。page 全体（envelope+Reflection+LifeOps）は operator 用として許容だが縦に長い（user-facing にはこのままでは情報過多）。
- 修正すべき heuristic（**観測中は直さない・後続 slice 提案**）: ①Moment 発火観測手段（評価 tier を選べる観測軸 or 代表数>1 fixture）②easy/push の差が出る fixture/cap 調整（push lane が cap に食われない placement か fixture 多様化）③tier 間で窓ヒントが違う理由の一言説明
- 本線接続判断: hold（L8 の 3 案無差別と Moment 発火未観測を解消してから）
