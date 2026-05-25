# Phase 3-L Next Implementation — 4 候補比較 + 自律推奨

**作成日**: 2026-05-22
**承認**: CEO + GPT 合議 (= L-4d MapTab-only visual smoke PASS 受領後、 「次実装計画を 4 候補で比較して提示、 実装には進まずに停止」 指示)
**範囲**: L-4d 完全 freeze 後の次の進路選択肢を **risk-cost-value の 3 軸**で比較し、 ゴールから逆算した自律推奨を提示

> 本 doc は **計画提示まで**。 実装には進まない。 CEO 最終判断を待つ。

---

## 0. ゴールから逆算 (= 上位思想の確認)

最終ゴール: **「自分って、 そういう人間だったのか」 体験** (= Aneurasync 中心問い)
L phase の中位ゴール: **Mobility Truth Layer = 「移動が確定したか / されていないかを観測」**
L-4d で確立: **MapTab で観測表記の最小完成** (= 「移動 約 N 分」 が K-3c-iii 階層 2 で表示)

→ 次の進路を考える基準:
1. **観測 layer を侵食しない** (= 推奨 / 最適化 / 警告に近づかない)
2. **K-3c-iii の階層思想を侵さない** (= Memory Chip 階調維持)
3. **privacy structural を維持** (= L-3c 確立済の構造)
4. **次 phase への安全な土台を作る** (= 整理 / readiness audit)

---

## 1. 4 候補の概要

| 候補 | 内容 | 概略 |
|---|---|---|
| **1. L-4d-b** | Calendar / Flow への移動時間表示展開 | UI 横展開 (= MapTab-only → 全 Tab) |
| **2. L-4e** | telemetry runtime sink | 観測結果の永続化 (= privacy 直結) |
| **3. L closeout docs** | L-1〜L-4d の全体整理 | 26 frozen branches の現状把握 docs |
| **4. L-5 readiness** | 次 Transport phase の論点整理 | mode 推定 / Routes API / 等 (= 多くが禁止境界) |

---

## 2. 候補 1: L-4d-b — Calendar / Flow への移動時間表示展開

### 2.1 目的

MapTab で確立した 「移動 約 N 分」 表示を CalendarTab / FlowTab にも展開し、 全 Tab で統一された観測表記を実現する。

### 2.2 必要な改修

| 項目 | 内容 |
|---|---|
| PlanClient core への geocode state 引き上げ | CalendarTab (= month-centric、 30 日) / FlowTab (= week-centric、 7 日) も使うため必要 |
| visibleAnchors の scope 拡張 | MapTab 単日 → 7 日 or 30 日 |
| geocode active call 回数増 | 月単位の anchor 全件 resolve は重い |
| Calendar / Flow の DayGraphTimeline wiring | useMapTabMovementDisplay 相当を呼ぶ pattern (= L-4d-b は新 hook 設計が必要) |

### 2.3 リスク (= 高)

| リスク | 詳細 |
|---|---|
| **active geocode call 増** | 月 30 日 × N anchor → batch 規模が一気に拡大、 既存 rate limit (= per-user 100/hour) を超える可能性 |
| **privacy 監査必要** | 既存 endpoint の per-request privacy 規約は維持されるが、 **送信回数増** が「privacy 方針内か」 を再確認すべき |
| **performance** | 30 日同時 resolve は client が重くなる可能性、 lazy 化が必須 |
| **K-3c-iii 階調の Tab 横断視覚一貫性** | CalendarTab は「日 grid」、 FlowTab は「week 縦並び」、 各 Tab の文脈で「移動 約 N 分」 がどう見えるか visual smoke 必須 |
| **PlanClient core 改変** | 既存 PlanClient state shape が変わる → 既存 test / 既存 caller への影響範囲確認必要 |

### 2.4 コスト

- readiness audit: 中 (= 上記リスク全件の整理)
- pure helper: 中 (= 新 hook 設計、 但し L-4c-mapbridge + L-4c-pure を流用)
- 実装 + tests: 中-高 (= 各 Tab で独立 wiring + integration tests)
- visual smoke: 高 (= 各 Tab で実機確認)

### 2.5 価値

- ユーザー体験: 中-高 (= 全 Tab で「移動 約 N 分」 が見える)
- 設計的価値: 中 (= 既存 4 layer を全 Tab で利用、 cohesion)
- Aneurasync 思想整合性: 中 (= 観測 layer の覆い率向上、 但し「観測すぎ」 のリスクはない)

### 2.6 着手の前提条件

- L-4d-b readiness audit が **必須** (= active geocode call / privacy / performance / state shape を厳密検討)
- CEO smoke でいきなり実装 GO は危険

---

## 3. 候補 2: L-4e — telemetry runtime sink

### 3.1 目的

L-1 で定義済の `MovementResolutionTelemetry` 型を runtime に書き出す経路を確立し、 観測結果を集計可能にする。

### 3.2 必要な改修

| 項目 | 内容 |
|---|---|
| 保存先決定 | Supabase migration / 既存 analytics endpoint / dev console のいずれか |
| 保持期間決定 | TTL / GDPR 整合性 |
| PII 再監査 | 型レベル PII-free は L-3c で保証済、 但し runtime sink で aggregation時の追加 PII 漏洩リスク確認 |
| privacy policy 更新 | 永続化する以上、 既存 policy で十分か再確認 |

### 3.3 リスク (= 高)

| リスク | 詳細 |
|---|---|
| **privacy policy 直結** | 「保存する」 行為が privacy policy の範囲か、 法務 / 規約レビュー必要 |
| **第三者送信** | Supabase は AWS / GCP backend、 既存 user data と同領域、 但し telemetry を別 table にすべきか judgment |
| **PII 漏洩 再監査** | L-3c で型は PII-free だが、 集計時に「同じ user が同じ場所に同じ時刻に移動」 等の reconstruct が可能か |
| **dev / production の差** | dev で sink を作るのは比較的安全、 production は CEO 高リスク判断 |

### 3.4 コスト

- readiness audit: 高 (= privacy / 保存先 / 保持期間 全件)
- 実装: 中-高 (= migration 含む)
- 監査 / 法務 confirm: 高

### 3.5 価値

- 観測 layer 完成: **高** (= 「観測したものを後で見返せる」 が初めて成立)
- Aneurasync 思想整合性: **高** (= 「自分はこういう移動傾向だった」 への接続)
- ユーザー体験: 低 (= 即座には見えない、 後で集計が見える pattern)

### 3.6 CEO 既存方針

- CEO 永続規約: 「runtime telemetry sink は type-only 維持推奨」
- GPT: 「優先度は低め」

→ **L-4e は後回し**が CEO 既存方針整合。 但し「いつかは必要」 なので readiness audit だけ進める選択肢もある。

---

## 4. 候補 3: L closeout docs — L-1〜L-4d の全体整理

### 4.1 目的

L phase 全体 (= L-1 / L-2 / L-3a / L-3b / L-3c / L-4a / L-4b / L-4c-pure / L-4c-mapbridge / L-4d) の現状を 1 doc で読める形に整理し、 次 phase の安全な土台を作る。

### 4.2 必要な改修

| 項目 | 内容 |
|---|---|
| L phase 全体図 | 4 layer + bridge + pipeline + UI 接続の依存関係 |
| 26 frozen branches list | 各 branch の役割 / commit hash / 補完関係 |
| GitHub PR 順序更新 | K closeout PR runbook (= `docs/alter-plan-phase3-k-pr-runbook.md`) を L 対応に拡張 |
| 残課題 / deferred ledger 統合 | L-4d-S1 (= sensitive smoke) / L-4d-S2 (= loading flicker) / K deferred / 等を 1 doc |
| 永続禁止 list 統合 | 各 audit doc で散在している禁止項目を 1 doc に集約 |
| 思想 transmission | L phase で確立した設計原則 (= privacy structural / observation only / placement vs override) を future Claude / dev のために抽出 |

### 4.3 リスク (= 低)

- docs only、 実装変更 0
- 既存 freeze branches に touch しない
- 新規 env / DB / dependency 変更 0

### 4.4 コスト

- 中 (= 26 branches の review + 整理に時間がかかる)
- 但し pure intellectual labor、 危険境界は触れない

### 4.5 価値

- **高** (= 次 phase の土台、 新 dev / 別 session が L 全体を 1 doc で把握可能)
- **継続性**: 過去の判断が忘れられず、 同じ議論を繰り返さない
- **次 phase 着手前の安全策**: 何が確立されたか / 何が deferred か / 何が永続禁止か を明示

### 4.6 派生効果

- L-4d-b readiness audit を書くときに本 closeout docs が前提となる (= 全 layer の把握なしに次の判断はできない)
- L-5 readiness audit でも同様

---

## 5. 候補 4: L-5 readiness — 次 Transport phase の論点整理

### 5.1 目的

L-4 範囲を超える Transport 関連機能 (= mode 推定 / Routes API / 等) のうち、 何が CEO 禁止境界内で可能か整理する。

### 5.2 候補機能 list

| 機能 | CEO 禁止境界との関係 |
|---|---|
| mode 推定 (= 「歩いて」「車で」 等表示) | L-4 範囲外、 但し「観測のみ」 なら可能性あり |
| Routes API integration | **新 env / 新 dep**、 高リスク |
| Arrival Risk Memory | **永続禁止** (= CEO 規約) |
| recommendation / optimization | **永続禁止** (= CEO 規約) |
| 移動 mode 別 confidence 計算 | 「観測」 範囲、 但し精度が必要 |
| 過去 N 日の移動 pattern 集計 | telemetry sink (= L-4e) 依存 |
| Cross-day pattern hint | L-4 範囲外、 K-3c-iii ledger 経由 |

### 5.3 リスク (= 中)

- 大半の機能が **禁止境界に近い**
- 「観測のみ / 推奨しない」 の判断が機能毎に必要
- 各機能の readiness audit が複数必要 (= 1 つの L-5 ではなく L-5a / L-5b / 等の細分化が予想される)

### 5.4 コスト

- readiness audit のみ: 低-中
- 実装まで: 高 (= 各機能で独立 readiness + audit + 実装)

### 5.5 価値

- 観測 layer の拡張: 中
- Aneurasync 思想整合性: 中 (= 「自分の移動傾向」 の認識深化、 但し範囲設計次第)

### 5.6 着手の前提

- **L closeout docs (= 候補 3) が前提**: 何が禁止境界かを明示してから L-5 readiness audit を始める

---

## 6. 比較表

| 軸 | 候補 1 (L-4d-b) | 候補 2 (L-4e) | 候補 3 (L closeout docs) | 候補 4 (L-5 readiness) |
|---|---|---|---|---|
| リスク | 高 (= geocode call 増 / state 引き上げ) | 高 (= privacy 直結) | **低** (= docs only) | 中 (= 禁止境界に近接) |
| コスト | 中-高 | 高 | 中 | 低-中 |
| 価値 | 中-高 | 高 (= 但し CEO 後回し方針) | **高** (= 次 phase 土台) | 中 |
| Aneurasync 思想整合性 | 中 | 高 | 高 (= 整理は思想に整合) | 中 |
| CEO 過去方針 | 「全 Tab 一括 NO、 PlanClient state 化要監査」 | 「type-only 維持推奨、 優先度低め」 | 明示なし、 但し整理は常に良い | 「禁止境界明確化が必要」 |
| 危険境界 | active geocode call / state 引き上げ | privacy policy | なし | mode 推定 / Routes API |
| 着手の前提 | 候補 3 完了が望ましい | 候補 3 完了が望ましい、 CEO 後回し方針 | 即着手可 | 候補 3 完了が必須 |

---

## 7. 自律推奨 — 順序付き path

### 7.1 推奨順序

**第 1 phase (= 即着手推奨)**:
1. **候補 3: L closeout docs** — 26 frozen branches を 1 doc で読める形に整理
   - 理由: 全候補で土台になる、 低リスク、 高価値
   - 期間目安: 1 session で着地可能 (= pure docs labor)
   - 着地物: `docs/alter-plan-phase3-l-closeout.md` (= L 全体図 / branches / deferred / 思想)

**第 2 phase (= L closeout 後)**:
2. **候補 1: L-4d-b readiness audit** (= 実装ではなく audit のみ)
   - 理由: PlanClient state 引き上げの是非を厳密検討
   - 期間目安: 1 session で audit 完了 (= read-only / docs only)
   - 着地物: `docs/alter-plan-phase3-l-4d-b-readiness-audit.md`
   - 判断: audit 結果次第で「low-risk なら連続実装」 / 「危険ならさらに細分化」

**第 3 phase (= L-4d-b audit 結果次第)**:
3a. L-4d-b audit が low-risk → 実装着手
3b. L-4d-b audit が高 risk → L-5 readiness or 別軸 pivot

### 7.2 候補 2 (= L-4e) と候補 4 (= L-5) の扱い

- 候補 2 (= L-4e): CEO 既存方針通り **後回し**。 必要時に readiness audit 単独着手。
- 候補 4 (= L-5): **L closeout docs と L-4d-b audit 後に判断**。 禁止境界の明示が前提。

### 7.3 なぜこの順序が最良か (= 自律推論)

1. **整理 → 判断 → 実装の自然な順序** — どの実装も「現状理解」 を前提とする
2. **L-4d-b は最も近い実装可能候補** — 但し audit なしの実装はリスク高
3. **候補 2 / 4 は前提条件が多い** — 整理 / 別 audit を先に通すべき
4. **「シンプルかつ論理的」** — 最小のリスクで最大の価値を得る = 候補 3 → 候補 1 audit
5. **CEO 暫定推奨と整合** — CEO は「L closeout docs または L-4d-b readiness audit」 を提示、 私は両方を順次採用

---

## 8. CEO 判断ポイント

| Q | 内容 | 推奨回答 |
|---|---|---|
| Q1 | 順序: 候補 3 → 候補 1 audit → 実装判断 が良いか | **YES (= 私の自律推奨)** |
| Q2 | 候補 2 (= L-4e) を先に挟むか | NO (= CEO 既存方針通り後回し) |
| Q3 | 候補 4 (= L-5) を先に挟むか | NO (= 整理が先) |
| Q4 | 即着手するのは候補 3 (= L closeout docs) で良いか | YES (= 即着手可) |

---

## 9. 永続禁止 (= 全候補で共通維持)

❌ CalendarTab / FlowTab への移動時間表示の **実装** (= audit はOK) / PlanClient core の geocode state 化の **実装** (= audit はOK) / 新規 geocode endpoint 呼出 / runtime telemetry sink の **実装** / DB-env-package-dependency 変更 / localStorage / Arrival Risk Memory / warning-recommendation-optimization 文言 / fetch-push-gh / reset-restore-stash-branch delete / frozen branches への commit

---

## 10. 関連 docs

- `docs/alter-plan-phase3-l-4d-closeout-audit.md` (= 本 commit と同時、 L-4d 着地確定)
- `docs/alter-plan-phase3-l-transport-design.md` v0.2 (= L 全体設計)
- 各 L-x audit doc / decision-log entry

---

## 11. 思想の transmission

1. **「整理 → 判断 → 実装」 が cohesion を保つ** — 26 branches を放置せず、 1 doc で把握する努力
2. **危険境界の明確化は実装と同等に重要** — 何をしないか の言語化
3. **CEO 後回し方針を尊重** — telemetry sink は急がない
4. **自律推奨は CEO 推奨と矛盾しない** — 両者を統合した順序を提示
5. **小さく確かな一歩 (= L closeout docs) から始める** — 次の意思決定が clean になる
