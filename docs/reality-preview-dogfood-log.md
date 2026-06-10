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

### [2026-06-11] record 14 — A-4-c7 5層cap dry-run（標準/flood 比較・800）
- 配線: raw cap→collector→pool cap→placement(∞)→compose(tier fitting 5/overflow retained 5+総数)→display(≤3)
- 標準 fixture: meta rawDropped=0 poolDropped=0（cap no-op が**数で可視**＝黙って消えたものゼロ）
- flood（10 候補・期限3+準備2+美容2menu+眉+補充2）: **tier fitting cap 実作動**＝守る4/楽5/攻め5 で頭打ち・overflow line は**総数**（攻め5件）・代表≤3・**Moment 生存**「今なら「食料品の買い物」を…」
- 注: 現行 L-1/L-2 辞書 + collector dedup では chain 候補は最大 ~10 → **pool cap(12) は実データ規模（辞書拡張/recurring 期限）への防御**。cap が縛る挙動は helper flood test(19 件)で証明（deadline 不滅・lane floor 2）
- 安全: S1-S8 PASS・focus 沈黙維持（620=focus_block を test 固定）・flags 群 dormant OFF 確認

### [2026-06-11] record 15 — A-4-c8 feedback read-only source・staging smoke（real・counts のみ）
- gate: smoke 限定 flag ON で許可 / production URL は常に false / default OFF 維持（test 固定）
- real read（owner・LIMIT50）: **M1 total=0・lifeops_prefix=0** → source chain observations=**0**（write 経路未実装ゆえの honest 結果）
- 安全: select/eq/order/limit のみ・write 0・cleanup 不要・row 内容は log 非出力（counts/shape のみ）・service_role fatal
- 学び: 実データ第 1 段の「読める・漏れない・黙って消えない」枠組みが real DB で成立。次に意味あるデータが流れるのは lifeops feedback **write**（別 gate）以降

### [2026-06-11] record 16 — A-4-c12 1-row staging write smoke（real・FULL PASS）
- 前提: c11 で CHECK 拡張 staging apply 済（CEO 実行）。row = `lifeops:beauty_salon:cut` / accept / adoption / lifeops（done でない理由=c9 doc §9: writer contract+c8 が done を drop する lock）
- gate: staging+flags で開 / production URL 常に閉 / before total=0・lifeops=0
- **write: written=true**（=CHECK 拡張の機能的証明・lifeops 受理）→ **read-after-write: lifeops_prefix=1・c8 observations=1・parse roundtrip 一致** → **cleanup: lifeops=0・total=0=before**（既存 M1 不干渉・3 条件 eq の exact 削除）
- ★**実バグ発見→修正→lock**（smoke の価値）: c9 writer が `captured_at: null` を明示送信→PostgREST は明示 null で DEFAULT を使わず **NOT NULL 違反**で insert_failed（fail-open が正しく作動・row 未作成で停止）。修正=payload から captured_at を**省略**（DB DEFAULT NOW()）+ fake-client lock test 追加
- log: counts/boolean/stage のみ（full row/user_id/raw 非出力）・PII 0・production 0

### [2026-06-11] record 17 — A-4-c13 done/completion staging smoke（real・FULL PASS）
- 変更後初の done 経路: row=`lifeops:beauty_salon:cut` / **action=done / signal=completion** / source_kind=lifeops
- gate 開(staging)/閉(production)・before total=0/lifeops=0 → **write=ok** → observations=1（action=done）→ **★cadence=1 件・lastCompletedAtISO=送信時刻と一致(<1s)** → cleanup(3 条件 eq・action=done)→lifeops=0・total=0=before
- 意味論: **accept は cadence 0 件**（採用≠完了・unit lock）・done だけが「前回完了日」を動かす
- log: counts/boolean のみ・PII 0・production 0

### [2026-06-11] record 18 — A-4-c14 feedback→cadence merge + staging read-only smoke（real・PASS）
- merge 配線: done feedback→c8 source→feedbackToCadence→**mergeCadenceIntoLifeOpsInputs（capRaw の直前=cap 最上流・static test 固定）**→collector→…→preview DTO。compute は pure 維持（page が gated read で注入・default OFF→[]→挙動完全不変）
- merge 規則: key=categoryId:menu・**lastCompletedAtISO 新しい方が勝つ**（done 事実>古い宣言・null は日付に負ける）・union・0 件は同一参照 no-op
- ★製品挙動の核を test 固定: 宣言 -60d で due（美容院 出現）でも **done(-5d) merge で候補が静かに消える**＝「done を打てばもう急かさない」。逆に raw row なしで feedback だけから候補出現（⑨）
- staging read-only smoke（c8 拡張・counts のみ・write 0・cleanup 不要）: total=0 / lifeops=0 / observations=0 / **cadence=0**（c13 cleanup 後の honest zero・merge no-op 経路を real で確認）
- 10 lock 充足: ①④done 変換/最新のみ・②③accept/dismiss/later 不使用（c13 既存）・⑤PII firewall（c8 既存）・⑥⑦二重識別**双方向**（⑦新規）・⑧cap 最上流+flood 併用・⑨compute 反映・⑩0 件不変（JSON 完全一致）
- meta: integrationMeta.feedbackCadenceCount（数のみ）追加。安全: write 0・UI/通知 0・production hard block・raw row 非搬出

### [2026-06-11] record 19 — A-4-c15 action intent contract（pure・UI/write 非接続）
- 逆向き配線の contract 完成: `LifeOpsCandidate`(category+menu のみ読む)→`buildLifeOpsActionIntent`/`listLifeOpsActionDescriptors`→`actionIntentToWriterInput`→c9 writer 入力（**writer は呼ばない**）
- 意味論: 採用=accept/adoption・完了=done/completion・後で=later/deferral・不要=dismiss/non_adoption（c13 mirror・signal/sourceKind は c9 共有定数から導出＝第二の正本なし）
- **cadenceEligible=done のみ**・done は `requiresExplicitConfirmation=true`（誤タップ→cadence 歪み防止・自動 done の経路なし）
- availability: 辞書 valid→4 action 固定順[採用,完了,後で,不要]・辞書外/enum 外 menu/区切り汚染→null/[]（c8 parse roundtrip firewall 再利用）
- safety: intent は閉集合 field のみ。candidate の placeQuery「美容室 渋谷 ○○」を餌にした混入検査で不出を test 固定
- boundary: **縦 card-presenter には接続せず**（条件付き許可を辞退・縦は横非依存を静的 lock）。app/ import 0・barrel 非 export
- GPT 14 lock 全 PASS・full suite 20419 GREEN・tsc 55

### [2026-06-11] record 20 — A-4-c16 action rail no-write 表示（preview・押せない）
- 接続位置: **Morning 代表（recommended tier の highlights ≤3）だけ**に rail。Moment/他 tier へは広げず（縦長化確認が先・rail を持つ tier はちょうど 1 つを test 固定）
- DTO: `LifeOpsPreviewActionDto{uiLabel, action, cadenceEligible, requiresConfirmation, previewOnly:true}`。**handle は writer 用内部 DTO のため UI 非搬出**（JSON lock）
- 表示: chip rail `採用 完了※ 後で 不要`（span のみ・button/onClick/form/a なし・aria-disabled）。完了だけ amber+※ で視覚区別
- 注記（1 回だけ・短く・非断定）: 「※完了は実際に終わった時だけ（次回の提案周期に影響）。自動では完了になりません。今は表示のみで、押せず・記録もしません。」
- 情報量の所感: 代表 3 件 × chip 4 個は 1 行内に収まり読める。tier 全部に付けると確実に縦長化する（1 箇所方針は正しい）。完了※の区別は一目で分かる
- 安全: writer/server-only/supabase import 0・lib/lifeops 逆 import 0・対象なし時は rail/注記とも不出現で既存 preview 不変
- GPT 13 lock 全 PASS・full suite 20430 GREEN・tsc 55

### [2026-06-11] record 21 — A-4-c17 gated writer wiring（採用/後で/不要のみ・done 不可）
- 配線: rail form submit（candidateKey+action の 2 値のみ）→ server action（host 三重ガード→preview flag→operator auth→**pure resolver**→writer gate）→ c9 writer → PRG redirect token → 固定辞書 1 行
- **client 値を信頼しない**: server で page と同一 chain を再計算し、現在の Morning 代表に candidateKey 照合 → **server 側 candidate から c15 intent 再構築**（辞書 firewall 再通過）。陳腐化 UI は unknown_candidate で安全 reject
- **done は二重拒否**: resolver の action allowlist {accept,later,dismiss} + intent.cadenceEligible 防御。UI 上も 完了※ は chip のまま（`value="done"` の submit が source に存在しないことを 3 test file で lock）
- cooldown: writer 既存 guard（recent は gated read 注入・read gate OFF 時は []=縮退を許容）+ PRG で再送防止
- 表示: ok=「記録しました（preview 限定・本線には反映されません）」等 6 token 固定辞書（URL 生値不表示）。注記は interactive 版「完了はまだ押せません。採用/後で/不要の記録は preview 限定です」
- staging smoke: **未実施**（writer→DB は c12/c13 で実証済・server action は operator session 必須で CLI 不可・新規ロジックは pure resolver で全分岐 lock）→ 実 E2E は CEO operator dogfood を別途提案
- 既存 lock の正当進化 4 件: c14 static order（model 関数名追従）/ c15 ⑬b（actions.ts を公認 consumer 化）/ applyReadiness・P-D render（button 全面禁止→submit のみ・done 不可規則）
- GPT 14 lock 充足・full suite 20445 GREEN・tsc 55

### [2026-06-11] record 22 — A-4-c17b operator dogfood 整備（Claude は UI 不実行・CEO 手順で停止）
- 判断: **Claude は UI dogfood を実行しない**。operator ログインに credential 入力が必要で、browser tool 経由だと secret が transcript に露出（=「secrets 管理は CEO のみ」原則違反）。GO の指示どおり整備して停止
- 整備物: ①checklist doc（preflight 12 項目対応表・手順 A-G・abort 基準・報告テンプレ）②cleanup script（**check→confirm 二段**・exact 条件=owner-RLS∧lifeops:%∧source_kind∧action∧acted_at窓∧一致1件時のみ実測 handle eq 削除・0件=冪等PASS・2件以上=削除せず fatal）③before/after counts は既存 c8 readonly smoke を再利用（lifeops/observations/cadence を一括出力）
- 対象 action=**later**（GPT 推奨に同意: 意味最軽量・cadence 影響なし・cleanup 漏れ時の学習歪み最小）
- check-mode 実走（read-only）: staging guard PASS・signed in（…42d0）・before lifeops=0・matched 0 件 → 冪等 PASS（script の実 DB 動作を削除なしで実証）
- full suite 20445 GREEN・tsc 55

### [2026-06-11] record 23 — A-4-c17b CEO operator dogfood 実施結果（**PASS**・CEO 実行）
- before: lifeops=0/obs=0/cadence=0 → rail 表示 OK・**完了※押せず**・「後で」を 1 回 → UI 結果=preview 限定・本線未反映文言 → after-write: lifeops=1/obs=1/**cadence=0** → cleanup 対象 1 件→削除成功 → after: 全て 0
- credential/full row/user_id/DB id/raw の共有なし（CEO 報告）
- ★UI→server action→writer→DB→read-after-write→cleanup の **controlled E2E が実環境で完結**（non-cadence action・done 不可のまま）

### [2026-06-11] record 24 — A-4-c18 done confirmation（PRG 2 段階）+ staging done smoke PASS
- 方式比較→**PRG 2 段階 confirm token 採用**（c17 PRG と整合・stateless・client 無状態維持。専用ページ=gate 複製で過剰／client state=useState lock 違反で不採用）
- flow: rail 完了※=stage-1 button（**confirm field なし form→押しても write されず** `?lifeopsConfirm=done:{key}` へ PRG）→ page が token parse+**現在 rail 実在検証**で pendingDone 注入 → 確認 block「『◯◯』を完了として記録しますか？／次回の提案周期に影響します。preview 限定です。本線には反映されません。／[記録する][戻る]」→ stage-2（confirm 完全一致 ∧ 候補再照合）だけ write → ok_done
- 防御: 1 クリック write 経路は構造的に不存在（route pure 関数で全分岐 lock）・不正 confirm/陳腐化 key→reject・戻る=plain link（write 経路なし）・confirm field は確認 block の 1 箇所のみ（HTML lock）・handle 非露出継続
- **staging done smoke PASS**（c13 script 再実行・GPT 12 条件）: before total=0/lifeops=0 → done/completion/lifeops 1 行 write=ok → lifeops=1・obs=1・parse 一致・**cadence=1・drift<1s** → cleanup→0・total 不変・counts log のみ
- full suite: 1 回 flake（再現せず・以後 2 連続 GREEN 20459 PASS/0 fail）・tsc 55

### [2026-06-11] record 25 — A-4-c18b CEO done dogfood（UI 成功・cleanup script 修正）
- CEO 報告: before 0/0/0 → **完了※→確認表示→confirm→preview 限定成功表示** → after-write lifeops=1/obs=1/**cadence=1**（done flow E2E 成功）
- ★cleanup 不具合発見: CEO 指定 `LIFEOPS_DOGFOOD_CLEANUP_ACTION=done` を script が未読（旧名 `LIFEOPS_DOGFOOD_ACTION` のみ）+ done が c17b スコープの enum で拒否 → matched 0 で done row 残存（confirm 削除は未実行=安全側に倒れた）
- 修正: 正式名 `LIFEOPS_DOGFOOD_CLEANUP_ACTION` 対応（旧名 fallback 後方互換・既定 later）+ allow enum に done 追加（c18b 正式化）
- check-only 再実行（read-only）: **matched=1・handle=lifeops:tax_filing**（CEO の done row を exact 特定）→ 削除コマンドを CEO へ返却・delete は未実行
- full suite 20459 GREEN・tsc 55
