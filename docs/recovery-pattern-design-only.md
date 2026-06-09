# Recovery Pattern / 回復パターン — ★design-only（実装 HOLD・stop gate 該当）

> 2026-06-09 / Build Unit / PRG 軸候補。**audit の結果 stop gate に該当 → 実装せず設計のみ記録**。
> CEO 方針「safe なら実装／データが薄く speculative なら停止／既存観測で支えられない join が要るなら停止」に従う。

「どの条件の後に、軽い予定・空白・低負荷行動が必要になりやすいか」を読む（energy rhythm / movement tolerance / density と接続しやすい軸）。

---

## 1. construct（構成概念）
- 本質は **sequential / cross-day / lag-1**：日 N の負荷（packed / high-effort / 多活動）→ 日 N+1 の回復（light / blank / low-load）。
- ★3〜5軸との違い：pace=時間 / tolerance=どう動くか / rhythm=いつ活動 / recovery=**負荷の後にどう戻すか（時間方向の依存）**。

## 2. ★audit 判定 = HOLD（2 つの stop gate）
（詳細は Recovery Pattern audit レポート）
- **(b) 既存観測で支えられない join**：最も豊かな信号＝過去日の **packed/light（dayGraph density / dayMood）は永続化されていない**。過去 anchor から再構成するには `listAnchors()`=**Supabase fetch 必須**（DB/external = stop gate）。dayGraph density / dayMood は「当日のみ ephemeral 計算」。
- **(c) speculative（データ薄）**：lag-1 には連続観測日ペアが要る（noise 回避に ~14 日 × 各日 4+ 観測）。実観測 **~1 件 = 連続日ペア 0** → パターン検証不能。
- pure-local 版（下記）は技術的に書けるが、**今は always not_enough かつ交絡が深く honest に「回復」と呼べない** → 実装の価値が stop gate を上回らない。

## 3. ★safe-local v0 sketch（データが貯まった時のための設計・現時点 HOLD）
DB/anchor/新規データを使わず、**既存 local store の byDay self-join のみ**で書ける最小版（実装は data ≥14 観測日 + CEO 判断後）：
- 日 N の **負荷 proxy** = `MobilityObservation.byDay[N]` の観測数（＋ effort mix）。
- 日 N の **明示的疲労** = `hypothesisFeedbackStore.byDay[N]` の `reason==="tired"` 件数（timeband 不要・per-day countable）。
- 日 N の **移動総時間** = `movementEventStore.byDay[N]` の actualDurationMin 合計（任意）。
- signal：「**高負荷日（多活動 ∧ tired あり）の翌日は軽くなりやすい**」を本人 baseline 比・lag-1 で（sufficient gate＝十分な連続日ペア）。
- reason トーン：「忙しい日の翌日は予定を控えめにすることが多いようです」程度・**trait 化しない**・数字なし。
- ★honesty 限界：観測数は **schedule 駆動**（weekend/曜日/mean-reversion 交絡）。tired corroboration が無いと「回復」と呼べない。tired は triple-gate で **極めて sparse** → 単独では弱い。

## 4. 関係（CEO 要求）
- **energy rhythm**：いつ活動 ←→ recovery：負荷の**後**にどう戻すか（時間依存を 1 段追加）。
- **movement tolerance**：負荷回避 ←→ recovery の「翌日 low-load」は tolerance の時間方向版。
- **density**：当日 packed が recovery の **引き金候補**だが density 履歴は非永続（再構成に DB 要）。

## 5. ★stop gate（本軸が触れたもの）
過去 anchor density = **DB/external** / 連続日ペア = **speculative（データ薄）**。→ 実装停止。

## 6. 他候補の簡易 stop-gate 評価（CEO 優先順 2・3）
- **Social Battery / 対人負荷**：「人と会う予定」検出に **anchor category / companions（"誰と"）** が要る → anchor=Supabase(DB)・companions migration 未適用・かつ **人間関係の断定=sensitive**。→ stop gate（design only）。
- **Past Regret / 後悔パターン**：予定後の修正・見送り・理由 → plan-level の regret は **未捕捉（新規データ）** or dismiss=**Life Ops 近接**。→ stop gate（design only）。

## 7. ★結論・推奨
- PRG の **pure-local 観測のみで安全に書ける軸は出尽くした**（pace / tolerance / place / context / energy rhythm の 5 軸が稼働）。次の 3 候補は全て **DB / 新規データ / sensitive / speculative** の stop gate に当たる。
- 推奨：**(A) 既存 5 軸の dogfood データを蓄積して検証** → 蓄積後に Recovery lag-1 を safe-local v0 で実装、**(B)** または CEO が特定の stop gate を開く（例：bounded な過去 anchor 履歴 read を承認 / companions 適用 / regret 軽量捕捉）。どちらも CEO 判断。
- 実装は HOLD。本 doc は data 充足 or CEO 承認後の着手用。
