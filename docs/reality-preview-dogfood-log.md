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

### [2026-06-11] record 26 — A-4-c18b CEO done dogfood **PASS（クローズ）**
- 最終結果（CEO/GPT 確認）: before 0/0/0 → 完了※→確認表示→confirm→preview 限定成功表示 → after-write lifeops=1/obs=1/**cadence=1** → cleanup（source_kind=lifeops ∧ action=done・exact 1 件削除）成功 → after 0/0/0
- production 0・PII log 0・full row log 0
- ★done 確認 flow（PRG 2 段階）の実環境 E2E が CEO 操作で完結。**Life Ops feedback loop（4 action 全て）が operator preview で実証済み**になった

### [2026-06-11] record 27 — A-4-c19 mainline readiness / integration design（設計のみ・本線実装なし）
- read-only audit 所見: /plan=PlanClient 3 tab（Calendar/Flow/Map・List は旧 unit 別 flag）・提案表示は localStorage proposals chips のみ・**Morning Briefing/Moment の本線 surface は存在しない**・★preview 入力は fixture のまま（実データ源未接続が最大 gap）
- 設計判断: 最初の surface=**PlanClient 上部の独立『生活まわり』card（案 C・当日 Morning 代表のみ）**・VM は Morning 代表のみ（3 案 summary/Moment 不持込）・rail=**後で/不要/完了※の 3 つ（「採用」は本線 hold＝予定に入った誤解・seed 化未決）**・文言軸=「予定には書き込みません」・done 直後に「提案をしばらく控えます」1 行（候補消滅の体感ケア）
- gate 具体化（dormant）: `PLAN_FLAGS.lifeopsMainline`（LIFEOPS_MAINLINE・default OFF・consumer 0）+ `isLifeOpsMainlineAllowed`（mainline∧planRouteLive∧staging∧!production・**二段階解禁=production deny 解除は別 CEO gate**）+ dormant 構造 lock test（app/ consumer 0・barrel 非 export）
- writer 再利用=可（pure 部変更 0・gate 差し替え版を plan/_actions へ移設する設計）・server 再計算=同 computeLifeOpsPreviewModel で本線でも維持可・3 値方式（candidateKey+action+confirm）維持可
- 推奨順序: **hold → c20=cadence real read 接続 → c21=実データ operator 観測（5 条件・5-7 セッション）→ c22=本線最小 card**
- full suite 20463 GREEN（※断続 flake 2 回/本日 8 run・再現せず・lifeops 外と推定・watch）・tsc 55

### [2026-06-11] record 28 — A-4-c20 cadence real read-only wiring（合成層・staging smoke PASS）
- source audit（migrations 全走査）: 採用=**feedback_done のみ**（M1 lifeops done・c11 CHECK 済・辞書 firewall）。不採用=calendar_events（event_type が CHECK なし自由 TEXT=free text 推定と同類で禁止系）・habit/routine/visit 系 table（**存在しない**）・wear_events（domain 不一致）・localStorage 系（server 不可読）・stargazer completion_rate（別領域）
- 実装=**合成層**: `LifeOpsCadenceRealObservation{categoryId,menu,lastCompletedAtISO,confidence,source,freshness}` → 出口で辞書 roundtrip 再検証 → CadenceObservation。**confidence=low は流さない**（足切りは confidence のみ・freshness=L-2 spec×3 境界の観測 metadata）。**新規 DB query 0**（今日の feed は既存 c8 read の observations 再利用＝読む column 増えない）
- merge: inputs→merge(feedback・c14 不変更)→merge(real)→capRaw（latest 勝ち=結合的）。meta += realCadenceCount / cadenceSourceConflictCount（同 key 異 ISO の観測）
- gate: master∧**LIFEOPS_CADENCE_READONLY**（c7 dormant の初 wiring）∧staging∧!production・LIFEOPS_MAINLINE と独立。page と actions（照合側）が**同一の合成**を使う=表示と再検証がズレない
- staging smoke PASS: gate 開(staging)/閉(production)・total=0/obs=0/feedbackCadence=0/**realCadence=0**（honest zero・write 0・cleanup 不要）
- GPT 14 lock 全 PASS（17 case）・reality 1382・full suite 20480 GREEN・tsc 55

### [2026-06-11] record 29 — A-4-c21 観測 run 整備（CEO 手順で停止・期待値補正あり）
- ★事前検証で**期待値のズレを発見**: rail（押せる代表 3 件）は現 fixture では deadline 候補で占有・cadence 抑制は cycle 候補にのみ作用 → **done on deadline は「変化なし」が現仕様の正解**（c18 render dump + collector/placement urgency 順で確認）
- → c21 の観測価値を再定義: ①loop counts 貫通（obs=1/fbCad=1/realCad=1）②done 確認 UI の体感 ③**製品 finding の体験**=「完了したのに代表に残る」違和感（deadline 完了消費 slice の必要性判断材料）。cycle の「消える体感」は fixture 調整 or deadline 消費実装後に観測
- 整備: checklist（A-G・期待値補正 §0・390px 任意確認・報告テンプレ）。追加実装なし・cleanup は c18b の done 対応 script を再利用
- Claude は UI 不実行（credential 原則・c17b/c18b と同形）

### [2026-06-11] record 30 — A-4-c21 CEO observation run **PASS（product finding 確定）**
- CEO 実行（screenshot 確認済み）: flags ON で preview 表示・rail=確定申告/免許/パスポート（deadline 3 件・期待値補正どおり）・done flow 成功（ok_done 文言表示）・counts 貫通
- ★finding 確定: **done を打っても deadline 候補は残る**（現仕様の正解だが「完了したのに残る」不信が本線では致命的）→ c22=deadline completion consumption へ

### [2026-06-11] record 31 — A-4-c22 deadline completion suppression（presentation・preview only）
- c21 finding への応答: done feedback → **同 key の deadline 候補だけ**を collector 後・pool cap 前で presentation suppression（Morning/Moment/全 tier が同一の抑制済み集合＝ズレ構造的に不可能・source/DB 不変更＝cleanup で自動復元）
- **stale done 防御=occurrence window 照合**: 窓開始（deadline−leadDays）以降の done のみ有効。去年の tax done は今年の候補を消せない（永久抑制が構造的に不可能・test 固定）
- 対象=kind==="deadline" のみ（cycle は c14/c20 cadence の担当・event_prep/unknown 素通し＝二重処理禁止）。accept/later/dismiss 不使用・辞書 roundtrip 再検証
- 配線: 新 flag なし（既存 gated read の observations 再利用・query 増えない）。page+actions 同一注入。meta+=suppressedDeadlineCount（数のみ）。client に観測行「実データ反映（fbCad/realCad/完了済 deadline 抑制）」追加
- 統合 lock: fixture+done(tax)→確定申告が全 tier から消える・免許/パスポート残存・count=1・doneFeedback=[] で DTO 完全一致（復元）
- c22b checklist 作成（CEO 観測: 消える→1/1/1→cleanup→戻る）。GPT 14 lock 13 case・reality 1395・full 20493 GREEN・tsc 55

### [2026-06-11] record 32 — A-4-c22b 整備（CEO 手順で停止）
- checklist 最終化: suppressedDeadline=「実データ反映」3 つ目の数と明示・復元 rerender（G）・体感観点 6 点・報告テンプレを GPT 14 項目対応に
- Claude は UI 不実行（credential 原則・c17b/c18b/c21 と同形）。追加実装なし（docs のみ）

### [2026-06-11] record 33 — A-4-c22b CEO operator smoke **PASS（deadline suppression E2E 完結）**
- 経緯: 初回 A で counts≠0 → **abort 基準が正しく作動**（CEO 停止・出力返送）→ check-only で c21 残存 row（lifeops:tax_filing・done・1 件）と特定 → **Option 1**（残存 row を観測に転用・新規 write 0 件）で実施
- 観測結果（CEO「all pass・期待通り」）: 確定申告が**全 tier/Moment から消える**・免許/パスポート残存・実データ反映 **1/1/1**（3 つ目=suppressedDeadline）→ exact cleanup（1 件）→ **候補が戻る**・実データ反映 0/0/0
- 最終検証（Claude・read-only smoke）: total=0/lifeops=0/obs=0/fbCad=0/realCad=0 ✅
- UI/UX: 違和感の報告なし。**モバイル 390px は未確認**（残 gap・c23 設計時に確認）
- ★process lesson: c21 の cleanup 未実行が翌 run の preflight で検出された=「観測 run は全 0 smoke 出力の返送で閉じる」規約が機能。以後の checklist でも final smoke 返送を必須維持
- ★これで **Life Ops loop の全要素が実環境 E2E 済み**: 4 action write（c17b/c18b）+ cycle cadence 反映（c20）+ deadline suppression と復元（c22b）

### [2026-06-11] record 34 — A-4-c23 mainline minimal card（staging gated・本線投入第一段）
- 接続: /plan page（server）が gate 通過時のみ `computeLifeOpsMainlineModel`（**page と action の単一 helper**）→ `buildLifeOpsMainlineCardDto`（headline+代表≤3・**accept filter**・候補 0→null）→ PlanClient flat props → 最上部に「生活まわり」card。gate OFF=計算 0・props 不渡し・完全従来挙動
- 本線 action 分離: `plan/_actions/lifeops-feedback-mainline.ts`（"use server"・gate=isLifeOpsMainlineAllowed・**accept は server 側でも常時拒否**・done は c18 PRG 2 段階共有・3 値 protocol 維持・PRG 先=/plan）。pure 部品（route/intent/writer/token/合成/suppression）は preview と共有
- 本線文言: 「予定には追加しません」「生活提案の学習にだけ使います」「完了にすると、しばらくこの提案を控えます」軸（「preview 限定」「本線には反映されません」不使用を test 固定）。internal counts/flag 名/source 名は DTO が構造的に不持参
- 390px: rail=flex-wrap+compact chip（wrap class を render lock・実機確認は c23b）
- 既存 lock の公認進化 2 件: c19 dormant（consumer=page+mainline action）・c15 ⑬b（consumer=action 2 file）
- CLI write smoke 不実施（mainline action=operator session 必須・writer/DB 経路は c12/c13/c18 実証済み・新規 DB コード 0）→ 実 E2E は c23b CEO staging 観測
- GPT 18 lock（19 case）・reality 1410・full suite 20508 GREEN・tsc 55

### [2026-06-11] record 35 — A-4-c23b CEO staging observation **PASS（本線 card 初観測）**
- /plan 本線で「生活まわり」card 表示 OK・rail=後で/不要/完了※のみ（採用なし）・preview 語なし・done confirmation flow OK・after-write counts OK・**done 後に対象候補が消えた**・cleanup exact 1 件・after 全 0・**候補復元 OK**・**mobile 390px 期待通り**・production/notification/R4/push 全て 0
- ★c19 観測条件の 390px が充足。残 gap=cooldown 実挙動・later/dismiss の本線 E2E（→c24）

### [2026-06-11] record 36 — A-4-c24 mainline hardening 整備（audit + polish・CEO 観測手順で停止）
- audit 8 点: later/dismiss 経路=実装済み E2E 未観測／cooldown=writer guard（同 handle×action 10 分・recent は gated read 注入・**2 件以上 write は構造的に不可**）+PRG 再送防止／cleanup script=later|dismiss 対応済み／390px=c23b 実機 OK 済み／文言=妥当
- ★polish 1 件実装: result 行を token 種別で色分け — **ok/ok_done のみ成功色（emerald・bold）**・duplicate/gate_off/invalid/denied/failed は **amber・非 bold（data-result-kind="notice"）**＝「過剰な成功表示を出さない」への直接対応。render contract test 3 case 追加
- CEO 観測手順（A=later／B=dismiss／C=cooldown 連打）整備: 各 action 後 cleanup（ACTION 差替）・C は「2 回目が重複文言（amber）・obs=1 のまま・cleanup 対象 1 件」自体が cooldown の証明。done は今回不使用
- full suite 20509 GREEN・tsc 55

### [2026-06-11] record 37 — A-4-c24 CEO 観測 **PASS（later/dismiss/cooldown E2E 完結・c19 観測条件 全充足）**
- A later: 文言 OK・obs=1・**fbCad=0/realCad=0**（cadence 不影響を実証）→ cleanup → 0
- B dismiss: 同上 → cleanup → 0
- C cooldown: 1 回目=記録（成功色）・2 回目=**重複文言（amber・非成功色＝c24 polish が実地で機能）**・obs=1 のまま。**DB 側証拠: later 行がちょうど 1 件**（連打でも 2 件目が書かれない）
- cleanup: ①later=対象 0 件で**冪等 path が実地で正動作**（先行削除済みでも安全）②dismiss=exact 1 件削除 → ③最終 smoke **全 0**（total/lifeops/obs/fbCad/realCad）
- UX 違和感報告なし
- ★**c19 観測条件 全充足**: ①実データ反映妥当性（cycle/deadline）②done→候補変化体感 ③390px ④cooldown 実挙動 ⑤action E2E（later×2/dismiss×1/done×3・accept=hold につき対象外）

### [2026-06-11] record 38 — A-4-c25 production source safety / fixture kill-switch（設計+実装・deny 維持）
- audit: fixture 注入点は**単一**（compute の `args.inputs ?? fixture`）・混入リスク=「deny 解除と同時に mainline model が無言で fixture を流す」（表示+action 再検証の両方）→ deny と**独立**の policy 層で先回り遮断
- policy（**flag では開けない kill-switch**）: `resolveLifeOpsSourceMode`=staging→fixture_allowed／production・**不明 host・未設定→real_only（fail-safe）**。意図的に env flag 非設置（production 誤設定 1 つで嘘候補が出る footgun を排除）
- 適用: `computeLifeOpsMainlineModel`（page/action の単一 helper）内で base inputs を選択（real_only→`{}`）。real channel（feedback 由来）はその上に merge・real 0 件→builder null=card/rail 不在・writer は既存 deny
- ★実測 finding: real-only の単独 cycle 候補（美容院 -60d）は **push tier にのみ**入り代表（protect）は空 → card null（**保守側**）。production では「中途半端な real 1 件」より無表示が安全。代表選定 policy（sparse data 時に他 tier の候補を代表に昇格させるか）は**案 A（実 source 接続）の中心論点**として残置
- gate 4 分離を文書化: ①card visibility（deny 解除=別 CEO gate）②source safety（**解除後も real_only 恒久**）③writer（別 CEO gate）④read flags
- GPT 12 lock（11 case）・preview/dev は不変更 lock・reality 1422・full suite 20520 GREEN・tsc 55

### [2026-06-11] record 39 — A-4-c26 real source contract + sparse representative policy（案 C・deny 維持）
- Part1 contract: `LifeOpsStructuredDeadlineSource`/`LifeOpsStructuredCadenceSource`（将来の user structured input/settings/import の単一受け口）→ 正規化（辞書 roundtrip・ISO 検証・**low confidence drop**）→ 縦 seam 型。free text field 自体が不存在=構造的排除。occurrenceKey 自動導出（`cat:menu:date`）+ typicalIntervalDays は予約 field（occurrence 厳密照合/L-9 で消費予定）
- Part2 sparse policy（**案 C**）: `selectLifeOpsMainlineRepresentatives(model, mode)`=**page 表示と action 照合の共通 selector**。従来 reps 空 ∧ **real_only 限定**で pool から fallback **最大 1 件**（deadline 優先 daysUntil 昇順→cycle）。fixture_allowed では fallback 無効=fixture 由来 fallback を mode で構造排除
- 低圧文言固定 2 句（deadline=「期日が近づいています。余裕があれば少しだけでも」/cycle=「そろそろの時期かもしれません。余裕があれば」・督促語なし lock）。headline は空状態文のまま=誠実
- builder rework: items を selector candidates から直接構成（label/phrase=縦 L-8a・actions=c15 filter・key=momentKey）。fixture_allowed 出力は従来と**完全一致**（c25 JSON 等価 lock 維持）・model+=pooledCandidates（additive）
- ★c25 finding 解消: real_only の cycle 1 件（push のみ）でも card に 1 件出る（⑪ test）。fallback 候補は action 照合にも乗る（押せるのに unknown の断絶なし）
- GPT 18 lock（15 case）・reality 1437・full suite 20535 GREEN・tsc 55

### [2026-06-11] record 40 — A-4-c27 structured source storage contract / migration draft（apply なし）
- audit: 既存 table なし→新規。M1 の owner RLS/naming/per-table trigger を踏襲しつつ、**編集可能な設定系**として owner UPDATE policy を許可（M1 append-only との意図的差分）
- schema 判断: **1 table**（source_type 判別+per-type shape CHECK=deadline 行に cadence 列が混ざれない）。**category_id=TEXT+app 層辞書 validation**（辞書拡張ごとの CHECK migration 負債を回避・roundtrip は c26 normalizer が必須経路）・**menu=安定 3 値なので DB CHECK 併用**（非対称は意図的）
- forbidden column（free_text/title/note/memo/description/place_query/url/raw/source_ref/calendar_title/event_name/store_name/location_name）は**列として不存在**＝static test で恒久 lock。表示名は辞書から導出
- reader contract: column-restricted（select 列固定・**user_id/id を DTO に出さない**）→ row→c26 DTO（active のみ・enum 検証・shape 違反 drop）→ normalizer（辞書/ISO 最終防壁・二重実装しない）
- gate: 新 dormant flag `LIFEOPS_STRUCTURED_SOURCE_READONLY`（master∧structured∧staging∧!prod・default OFF）。**consumer 0**（app/ 参照 0 を lock・table 未 apply で実 read 経路なし・query 0 構造的）
- rollback: clean DROP を migration 末尾に同梱。database.types は apply slice で gen 予約
- GPT 14 lock（13 case）・full suite 20548 GREEN・tsc 55

### [2026-06-11] record 41 — A-4-c28 staging migration apply **PASS（CEO 実行・監査済み）**
- PRE 全 0 → MIGRATION Success → POST 監査: **13 列完全一致**（型/NULL 可否含む）・forbidden 0 行・RLS=true・**4 policy 一致**・**CHECK 7 種完全一致**（PG 正規化形 `= ANY(ARRAY)`・inline 自動命名 `{table}_{col}_check` は c10/c11 確認済み規約どおり）・trigger 1・row_count=0
- ★監査での発見→外科修正: CREATE TRIGGER/POLICY に IF NOT EXISTS 相当がなく **db push 再実行で重複エラーになる**未冪等を検出 → DROP IF EXISTS 前置で冪等化（staging には c27 版適用済み・end-state 同一）。header に staging 適用済み/production 未 apply 注記
- `lifeops_structured_sources` が staging に実在＝**構造化 source の保存先が初めて現実になった**。database.types 更新は reader 接続 slice に予約

### [2026-06-11] record 42 — A-4-c29 structured source reader read-only wiring（staging smoke PASS・honest zero）
- ★型方針の発見と判断: repo に生成済み database.types は**存在しない**（client 全 untyped・structural DTO が確立 pattern）→ 全 schema gen は「余計な差分を混ぜない」要件違反（~100 table・consumer 0）のため、**migration 1:1 の scoped 型**（`LifeOpsStructuredSourcesTable{Row,Insert,Update}`・c28 POST-1 監査と一致・forbidden field 不存在を lock）を contract file に手書き追加
- 配線: mainline model helper に gated read 合流（master∧`LIFEOPS_STRUCTURED_SOURCE_READONLY`∧staging∧!prod・default OFF→query 0）→ row→column-restricted DTO→**c26 normalizer**→compute 新 channel（cadence=latest 勝ち merge・deadline=concat・**capRaw 前**）→ sparse policy → card。page/actions は helper 共有済み=配線変更不要
- meta += structuredDeadlineCount/structuredCadenceCount（数のみ）。full chain lock: fake row→正規化→real_only card に「確定申告」/fallback「美容院」・flood 60→rawDropped=10・0 件 no-op（JSON 一致）・latest 勝ち
- **staging smoke PASS（新 table への初実 query）**: gate 開(staging)/閉(production)・deadlines=0/cadences=0/normalized 0＝honest zero・write 0・cleanup 不要 → reader/RLS/columns が実 DB で機能
- c29 21 case + 既存 c27 13 case・full suite 20556 GREEN・tsc 55

### [2026-06-11] record 43 — A-4-c30 manual structured source seed smoke **PASS（full real loop 成立）**
- CEO 実行: precheck 全 0 → INSERT（deadline/tax_filing/due 2026-06-25/high/active）→ smoke: structured deadlines=1/normalized=1 → **/plan card 表示・done flow 期待通り** → after done: lifeops=1/obs=1/fbCad=1/realCad=1/structured=1 → feedback cleanup exact 1 → structured cleanup exact 1 → final 全 0
- ★**fixture でない本物の structured source → /plan card → done → 学習/抑制 → cleanup 復元の full real loop が初成立**
- ★finding（c31 で固定）: 手動 INSERT の occurrence_key が smoke 開始時刻由来（`tax_filing:2026-06-11T01:37:00Z`）になっていた。c26 の deterministic helper（due date 由来）は存在するが manual SQL が経由しなかった → **全 write を pure builder 経由に強制する writer contract が必要**（=c31）

### [2026-06-11] record 44 — A-4-c31 structured source input contract + writer gate（実 write なし）
- ★c30 finding 恒久対応: **occurrence_key は builder が常に自動生成**（deadline=`{cat}:{menu?}:{dueDate}`・cadence=`{cat}:{menu?}:cadence`・now/Date.now 不存在を source level で lock）→ 呼び元が渡す口がない=手書き時刻値の混入が構造的に不可能
- input contract: 構造化値のみ（free text/user_id/id field 不存在・偽装 prop は builder が不透過）。validation=辞書 roundtrip+ISO+DB CHECK 同 shape（dueDate 必須/last か interval/interval∈(0,730] 整数）。confidence='high'・status='active' 固定
- writer skeleton（server-only・**呼び出し元 0=dormant**）: gate（master∧LIFEOPS_STRUCTURED_SOURCE_WRITE∧staging∧!prod・新 dormant flag）→validate→duplicate guard（同 type+category+menu+occurrence の active 既存→already_exists・existing は呼び元注入=隠れ read なし）→insert 1 件・fail-open。payload=row+user_id のみ（id/created_at/updated_at 不含=c12 教訓）
- update 方針=insert のみ（期日変更は archive→新 insert を将来方針）。DB unique index は設計のみ（partial unique・別 slice）。staging write smoke は**計画のみ**（mini-design §1-10・occurrence 回帰検証込み・実行は別 GO）
- roundtrip lock: writer payload→c27 reader DTO→正規化可能（write と read contract の整合）
- GPT 16 lock（11 case）・full suite 20567 GREEN・tsc 55

### [2026-06-11] record 45 — A-4-c32 structured writer smoke **FULL PASS（+occurrence `::` 外科修正）**
- ★double colon は**表記ミスでなく実装の実態だった** → smoke 前に外科修正: 非空 segment のみ `:` join（deadline menu なし=`tax_filing:2026-06-25`・menu あり=`beauty_salon:cut:2026-06-25`・cadence=`…:cadence`）。staging table は c30 cleanup 済みで空＝保存データ影響ゼロの最適時に補正。旧 format lock 8 箇所更新+`::` 不在 lock 追加
- smoke 結果（staging・全 PASS）: gate 開/production 常閉 → **occurrence builder 実出力=`tax_filing:2026-06-25`（dueDate 由来・:: なし）** → before 全 0 → write#1 ok → count=1・reader=1・**実 DB roundtrip で occurrence 一致（c30 回帰なし）**・normalizer=1・**card chain: 実 row→reader→normalizer→real_only card に「確定申告」** → write#2=already_exists・insert 0・count=1 のまま → exact cleanup 1 件 → after 全 0・feedback 不干渉
- ★c31 writer contract が実 DB の RLS/CHECK/reader/normalizer/duplicate と噛み合うことを実証＝**UI 入力は本当に表層になった**
- finding（c33 へ）: duplicate guard の existing は row 形だが c29 reader は c26 DTO を返す → UI server action 用に「active rows の column-restricted 読み」か「DTO 受けの guard overload」を c33 で整備
- full suite 20567 GREEN・tsc 55

### [2026-06-11] record 46 — A-4-c33 structured source input UI（staging gated・deadline first・CEO smoke 手順で停止）
- ★設計核心: **登録入口（生活まわりを登録）≠ 候補 card** — source 0 件（候補 card null）でも入口が出る独立 card で bootstrap 問題を解消。表示条件=mainline gate ∧ LIFEOPS_STRUCTURED_SOURCE_WRITE（default OFF→props 不渡し=非表示・production 二重 deny）
- UI: 種類=辞書 money_admin group 由来 enum picker（確定申告/免許の更新/パスポートの更新・表示名は辞書 label）+ `<input type="date">` + 登録。**入力要素は select/date/hidden のみ**（text/textarea 不存在 lock・送れる field は categoryId/dueDateISO/sourceType の 3 名のみを HTML lock）。GPT 例の支払い/書類提出は辞書未登録=picker 対象外（辞書拡張は別 slice）
- server action（`_actions/lifeops-structured-input.ts`）: formData から読むのは **4 名のみ**（occurrence/user_id/id/confidence/status を読まない static lock・action 内で occurrence を組み立てない）→ mainline gate→auth 注入→**c31 builder（writer 経由・occurrence 自動生成）**→duplicate guard→PRG `/plan?lifeopsSrc=`
- c32 finding 対応: `readActiveStructuredRowsForDuplicateGuard`（writer module 内・**write gate 配下=OFF/production で query 0** を fake lock・column-restricted・rows は UI/DTO 非搬出）
- 文言: 成功「登録しました。生活まわりの提案に反映します。」/重複「同じ期限はすでに登録されています。」/不正「期限日を確認してください。」+footnote「予定には追加しません。生活提案の材料として使います。」（success のみ成功色）
- lock 進化 2 件: c31 writer consumer=input action を公認／c19 mainline gate consumer=3 file へ
- ⚠flake 3 回目（proposalPlanClientHelpers の PlanClient import・単体 36/36 PASS・再実行 green=並列 import race と推定・watch 継続）
- GPT 16 lock（24 case 相当）・full suite 20576 GREEN・tsc 55

### [2026-06-11] record 47 — A-4-c33b CEO operator smoke **PASS（入力 UI 本線 E2E・cleanup は Claude 委任実行）**
- CEO 実行（server log + smoke 出力で裏取り）: before 全 0 → /plan 登録入口から **license_renewal を 2 期日登録（lifeopsSrc=ok ×2）** → **同一期日の再登録 → lifeopsSrc=already_exists（duplicate guard の本線 UI E2E 実証）**
- ★**UI 経由の occurrence key が正形式**: `license_renewal:2026-06-11` / `license_renewal:2026-06-12`（`::` なし・dueDate 由来＝c32 補正が本線 UI で実証・c30 finding 完全クローズ）
- cleanup（CEO 委任→Claude 実行）: 新 guarded script `lifeops-structured-dogfood-cleanup.ts`（check→confirm 二段・category 指定・上限件数 guard）で **exact 2 件削除（total 2→0）** → 最終 smoke 全 0（M1=0/structured=0/normalized=0）
- 学び: CEO は picker から tax_filing でなく license_renewal を選択（想定 category 決め打ちの cleanup 手順は脆い）→ 本 script は category パラメータ化+全 money_admin 走査で対応
