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

### [2026-06-10 夜] record 2 — A-4-c4 calibration 後の再観測（fixture・575/620/800）
- 修正内容: placement cap=pool 安全弁化（∞）・compose full-pool per-tier 着席（seated_in_tier）・fixture 期限+2（免許/パスポート）
- 表示確認: headline「…余裕があれば「免許の更新」も入れられそうです」（2 件言及に進化）/ 守る4件・楽5-6件・攻め5件+「入りきらない2件」/ also=null（tier overflow へ移住）
- **★Moment 発火を初観測（800）**: window_open「今なら「食料品の買い物」を入れやすそうです」＝朝の代表 3 件（確定申告/免許/パスポート）除外後の **4 件目が昼にそっと出る**意図 UX。620=focus_block 沈黙維持・575=代表 exclude+窓外で沈黙（正しい）
- LifeOps: L1 OK / L2 **OK**（発火例+非重複を同時観測）/ L3 OK / L4 OK / L5 OK / L6 OK / L7 WATCH（楽6件 line は多め・presentation は代表3で抑制済）/ L8 **OK**（counts+overflow line で 3 案の差が見える・美容院が push 差分として可視）/ L9 OK（「この案では入りきらない」は静か）
- 安全: S1-S8 = PASS
- 残メモ: 代表 3 件が 3 案で同一（urgency 上位ゆえ自然・深刻でない）/ 楽案の件数が時刻でブレる（過去窓 skip の正しい結果・気にならない範囲）/ 美容院は窓が広い実日なら fitting に昇格する設計
- 本線接続判断: **record 1 の hold 2 点は解消**。引き続き protocol §6 の蓄積条件（≥10 record 等）と CEO 判断待ち

### [2026-06-10 夜] records 3–12 — A-4-c5 Operator Observation Run（10 シナリオ・fixture chain dump・DB 0）
> 方法: 縦実 collector→placement→compose→briefing/moment の pure chain を scenario 別 inputs で dump（nowMs 固定・決定論）。記録は §5+§8 フォーマット簡約。

**record 3｜S1 deadline 強（overdue 含む）**: HL「確定申告を先にすませると安心です。余裕があれば免許の更新も」・3 案とも 2 件で同一・Moment 沈黙(2=全代表既出)。L4 **WATCH**: overdue でも headline がエスカレーションしない（reps の phrase には「期日を過ぎています」が出る）。tier 同一は「期限だけの日は 3 案が収束する」＝自然と判断（メモ）。Moment 完全沈黙は「朝に全部言った日」として正しいが、期限日に昼の後押しゼロで良いかは**観測継続**。
**record 4｜S2 event_prep 強（面接前日）**: HL「美容院あたりを入れると自然です」・3 案同一 3 件（前日 prep は全て protect lane）・注意 2 件（確認/見た目）が正しく出る・Moment 沈黙(3)。前日収束は「面接前日は全案が準備に寄る」＝**思想として defensible**（OK・メモ）。
**record 5｜S3 daily_upkeep が Moment で出る日**: ★Moment 発火 `window_open`「今なら「食料品の買い物」を入れやすそうです」（代表 3=期限群の次の 1 件）。L2/L3/L9 OK。
**record 6｜S4 push 着席（広い午後窓）**: 勾配 **2/2/3**・美容院が **push の fitting にだけ**入る（overflow でなく着席差別化）。L8 **OK の理想形**。
**record 7｜S5 focus 中沈黙**: 620 で「沈黙(4・focus_block)」維持。L3 OK。
**record 8｜S6 recovery 中沈黙（手組み tier・moment 層観測）**: 800 recovery block → 「沈黙(4・recovery_block)」。L3 OK。
**record 9｜S7 候補ゼロ**: HL「今日は生活まわりで急ぎのものはなさそうです」・3 案「追加なし」・Moment 沈黙(0)。静かで正しい。L5/L6/L9 OK。
**record 10｜S8 overflow 多（45 分窓のみ）**: ★**観測中に crash を発見**（moment の deadline fallback が window=null overflow で `p.window!` 参照）→ CEO ルールに従い停止→mini-design（窓なし＝moment の根拠なし・no_window で skip）→外科修正+lock test→**再観測 PASS**: fitting 1+「入りきらない 4-5 件」（静か・督促感なし）・Moment 沈黙(reasons=already_surfaced,no_window×2)。L9 OK。
**record 11｜S9 3 案勾配（期限+前日面接+美容+補充）**: 4/4/4+overflow 差（easy/push に 1 件・protect なし）・★Moment 発火「今なら「資料の準備」を入れやすそうです」（非代表 4 件目）・注意 2 件。美容院が protect に入るのは「面接前日」protect 扱いの帰結（defensible・メモ）。
**record 12｜S10 Morning 代表と Moment 非重複（明示）**: record 5 の発火候補=食料品の買い物は代表 3 件（確定申告/免許/パスポート）に**含まれない**。重複ゼロを明示確認。L2 OK。

**集計（records 3–12）**: PASS 軸多数 / **WATCH 3**（overdue headline 非エスカレーション・期限日の Moment 完全沈黙の是非・L7 page 全体の縦長は継続）/ **FAIL 1→修正済**（S8 crash→no_window skip+lock test）。
**判定**: 3VM 役割分離=成立・3 案の差=成立（収束する日は思想的に正しい収束）・Moment 発火/沈黙=自然・overflow=秘書的。**本線接続はまだ hold**（protocol §6 の実 staging 蓄積と WATCH 3 件の扱いが先）。

### [2026-06-10 夜] record 13 — A-4-c6 hardening 検証（overdue day・620/800）
- 入力: tax_filing 期限=昨日（overdue 1 件のみ）・標準 2 窓
- **escalation**: HL「「確定申告」は期日を過ぎています。今日は少しだけでも触れると安心です」（一段強い・督促語なし）
- **Moment policy**: 620=「沈黙(1・focus_block)」（**focus 例外なし維持**）/ 800=`window_open`「今なら「確定申告」を入れやすそうです」（**朝に出た urgent を一度だけ再提示**・excluded=0/1 が policy 作動を示す）
- LifeOps: L3 OK / L4 OK（非断定維持）/ 新軸: escalation OK・urgent 再提示 OK
- 安全: S1-S8 PASS・通知 0（preview VM のみ）
