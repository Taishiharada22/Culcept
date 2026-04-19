# CoAlter Phase 2 — 観測ダッシュボード仕様（1 枚）

最終更新: 2026-04-19（Phase 2 凍結直後）
目的: 凍結した Phase 2（3-mode body）を **実測** に載せ、Phase 3 優先順位を
観測ベースで決める判断材料を揃える。
SQL: `scripts/coalter-phase2-kpis.sql`（7 指標 + 4 補助）
データソース: `coalter_messages.metadata` (JSONB) + `coalter_sessions` のみ（追加ログ不要）

---

## 前提

- 初回観測 = 基準線。閾値はすべて **暫定**。初回値を見て CEO が確定させる。
- 集計ウィンドウは **30 日**、粒度は **1 日**。
- 監視頻度は **週 1 回**（金曜）に Build Unit が集計し、Chief of Staff が共有。
- 閾値を超えたら **🟢 正常 / 🟡 要注意 / 🔴 ブロック中** の 3 段でラベル。

---

## 7 指標（必須観測）

### KPI-1: mode 選択率（decision / negotiate / clarify 分布）
- **定義**: `routerTrace.selectedMode` 別の件数と割合。分母は trace を持つ coalter メッセージ総数。
- **SQL**: `scripts/coalter-phase2-kpis.sql` KPI-1
- **暫定閾値（観測前の目安、CEO 判断で調整）**:
  - decision: 60-80% が健全
  - negotiate: 10-25%
  - clarify: 5-15%
- **🔴 アラート**: decision = 100%（mode router が死んでいる）／ clarify > 30%（clarify 自己増殖抑制が効いていない兆候）
- **Phase 3 示唆**:
  - negotiate が極端に少ない → contradiction 検出の閾値が硬すぎる可能性
  - clarify が極端に少ない → misread 検出が弱い可能性

### KPI-2: gate block 率
- **定義**: `executorFallbackReason = 'gate_blocked'` の割合。内訳は `gateResult.reason` で consent / emotion_heat に分解。
- **SQL**: KPI-2
- **暫定閾値**:
  - 全体 < 10%
  - emotion_heat_high のみ: < 5%（感情高ぶり時の抑制が機能していれば自然に低い）
- **🔴 アラート**: > 30%（そもそも CoAlter が発火する前提が崩れている）
- **Phase 3 示唆**:
  - emotion_heat_high が多い → softening tone の拡充が先
  - consent_not_active が多い → onboarding / 同意 UX の改善が先

### KPI-3: movie-first theme fallback 率
- **定義**: `executorFallbackReason = 'theme_not_movie_yet'` ÷ gate 通過数
- **SQL**: KPI-3
- **暫定閾値**:
  - 観測前は不明（CoAlter の会話テーマが実際どう分布するかに依存）
  - 初回観測で **movie 比率** を確定させることが目的
- **🔴 アラート**: > 80%（= 実態の大半が movie 以外だが negotiate/clarify が食えていない → G6 拡張を最優先に格上げすべきシグナル）
- **Phase 3 示唆**: この数字が「次に movie の隣に何を materialize するか」を決める一次根拠（食事 / 旅行 / 予定調整のどれを先に実装するか）

### KPI-4: usedFallback 発生率（legacy session 再合成）
- **定義**: `metadata.card` 欠損かつ `metadata.proposalCard` 存在の割合。resolver fallback が実データで走る頻度の proxy。
- **SQL**: KPI-4
- **暫定閾値**:
  - 現在 < 50%（Phase 6.C 前の legacy session が一定残る想定）
  - 30 日後 < 10%（新規 session の書き込みで希釈される想定）
- **🔴 アラート**: 新規作成されたセッション（created_at が直近 7 日）で > 5%（= 新しいのに card が書けていない → invoke route の書き込み障害）
- **Phase 3 示唆**: 高止まりなら backfill script（既存 session に card を合成書き込み）を用意する判断材料

### KPI-5: activeCard 復元失敗率
- **定義**: 完了済み session の最新 coalter message で `card` / `proposalCard` **両方欠損** の割合。
- **SQL**: KPI-5
- **暫定閾値**: **0%**（ここは妥協しない）
- **🔴 アラート**: > 0%（= 相手側クライアントや再読込で何も出ない障害）
- **Phase 3 示唆**: 出た時点で Phase 3 より前に緊急修正

### KPI-6: negotiate proposals=0 発生率
- **定義**: `card.mode = 'negotiate'` のうち `proposals` が空配列の割合。
- **SQL**: KPI-6
- **暫定閾値**:
  - < 30% が健全（pieExpansion だけで成立するケースは設計上許容）
  - > 50% は materialize ロジックが弱いシグナル
- **🔴 アラート**: > 70%（第三案がほぼ出ていない）
- **Phase 3 示唆**: 高率なら negotiate materialization（catalog / reranker / PE 統合）が Phase 3 最優先

### KPI-7: clarify question=null 発生率
- **定義**: `card.mode = 'clarify'` のうち `question` が null の割合。
- **SQL**: KPI-7
- **暫定閾値**:
  - < 40% が健全（emotion_heat mid / target 不明で 0 問は正常系）
  - > 60% は質問生成ロジックが働いていないシグナル
- **🔴 アラート**: > 80%（clarify が「聞かずに閉じる」ほぼ全件）
- **Phase 3 示唆**: 高率なら target 判定 / 質問テンプレ改善が Phase 3 上位

---

## 補助指標（セット観測）

### AUX-1: router reason 分布
8 分岐のどこで決まったか。`default_decision` が 90% 超なら signal 検出が弱い。

### AUX-2: fallback reason 分布
`gate_blocked` / `theme_not_movie_yet` / null の比。KPI-2/KPI-3 の sanity check。

### AUX-3: セッション lifecycle
`active` が長時間滞留していたら invoke 未完了（= DB 書き込みエラー）の可能性。

### AUX-4: 連続 clarify 実測
`previousMode = clarify && selectedMode = clarify` の件数。自己抑制の副作用を見る。

---

## 運用フロー

1. **初回観測（T+7 日）**: Build Unit が 7 KPI + 4 AUX を走らせ、ベースライン表を作成。
2. **CEO に提出**: 閾値の確定と 🟢🟡🔴 ラベルを決定してもらう。
3. **週次更新**: 毎週金曜に差分を `docs/weekly-priorities.md` に記載。
4. **Phase 3 優先順位**: 初回観測結果 → Phase 3 の A / B / C 候補を順位付け（次の判断タスク）。

---

## Phase 3 判断との接続（CEO 指示通り）

| 観測結果パターン | Phase 3 で優先すべき方向 |
|-----------------|-------------------------|
| clarify 率が高く復元失敗率 > 0% | UX / 復元改善が先 |
| negotiate proposals=0 率が高い | negotiate materialization（catalog / ranker）が先 |
| theme fallback 率が極端に高い | movie-first の次の展開先決定（food / travel / schedule のどれを先に執行に載せるか）が先 |
| gate block 率が高い | softening tone / consent UX が先 |
| mode 分布が決定に 100% 寄る | router signal 検出（misread / contradiction / stall）のチューニングが先 |

---

## 追加ログは作らない方針

CEO 指示の「SQL / scripts / 閾値」はすべて既存 `coalter_messages.metadata` 内で充足できる。新規テーブルや analytics event の追加は **観測結果を見るまでは保留** する。初回観測で metadata だけで足りない項目が出たら、その時に拡張を判断する。

---

## 参照

- SQL 集: `scripts/coalter-phase2-kpis.sql`
- 凍結チェックリスト: `docs/coalter-phase2-freeze-checklist.md`
- 設計書: `docs/coalter-phase2-3mode-design.md`
