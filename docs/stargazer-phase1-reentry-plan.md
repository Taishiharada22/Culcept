# Stargazer Human OS Phase 1 再開計画（2026-04-20 起草）

> 前提: `docs/stargazer-human-os-design.md` §9 Phase 1 検証計画
> 目的: 5人 × 2週間の実証検証に着手するための実行仕様をまとめる
> Status: **DRAFT — CEO 判断待ち項目あり**

---

## §A. インフラ棚卸し（2026-04-20 時点）

### 既存（使える）

| 評価軸 | 使えるテーブル | 行の意味 |
|---|---|---|
| 言い当て精度（Oracle vs Self） | `stargazer_self_vs_oracle_challenges` | 1 日 1 行、oracle_correct_count / user_correct_count が取れる |
| 自己認識精度トレンド | `stargazer_self_accuracy_scores` | 日次 SAS（0-100） + gap（user - oracle） |
| 反応パターン言い当て | `stargazer_reaction_patterns` | 1 日 1 行、user_reaction（resonated/surprised/denied/reflected）で納得感の近似が取れる |
| Decision Engine 利用 | `stargazer_decision_engine_logs` | 1 決定 1 行、actual_choice / regretted / feedback_note で行動変容を追える |
| Daily Intervention 反応 | `stargazer_daily_interventions` | phase × 日次、helpful_rating（1-5）が直接「納得感」に近い |

migration: [supabase/migrations/20260327200000_stargazer_human_os.sql](supabase/migrations/20260327200000_stargazer_human_os.sql)
API: `/api/stargazer/{oracle, self-vs-oracle, decision-engine, daily-intervention}`
UI: `/stargazer/oracle`

### 足りない（Phase 1 で作る必要）

1. **Phase 1 cohort フラグ** — テストユーザーを通常ユーザーと区別して集計するため。既存の `auth.users` に副作用なく付与できる仕組みが要る
2. **日次チェックインの横断収集** — 既存は機能ごとに散っている。Phase 1 期間中の「その日のアプリ全体の納得感」「今日 Stargazer を見て行動が変わったか」を 1 箇所で拾う
3. **2 週間振り返り質問票** — 既存に「週次/期末インタビュー」テーブルなし
4. **検証集計クエリ** — ユーザー単位と cohort 全体で §9.2 成功基準と突き合わせる SQL

---

## §B. テストユーザー選定（CEO 判断項目）

### B-1. 選定基準（推奨案 — CEO 承認待ち）

- **5人** — 設計書 §9.1 のとおり
- **多様性要件**: 年代（20s/30s/40s）、性別、職種（思考型 vs 関係型）、心理学リテラシー（高/低）の最低限の散らしを確保
- **除外**: 社員・家族・過去の検証協力者は除く（Halo 効果回避）
- **同意**: Phase 1 が DRAFT 段階であること、2週間の毎日の入力があること、データは匿名化して社内分析に使うこと、を明示した同意書（簡易版）

### B-2. 招待方針（CEO 判断）

選択肢:
- **(i) 知人招待（CEO 方針どおり）**: CEO / チーム経由で 5 名に個別依頼。速い、同意プロセス簡素
- **(ii) 既存 Aneurasync ユーザーから抽出**: 既に登録済ユーザーに募集 DM。属性コントロールしやすいが、既にバイアスのかかったユーザー
- **(iii) 外部募集**: SNS 等で公募。**今はやらないこと（大規模マーケ）に抵触するため除外**

**推奨**: (i)。CEO 方針に整合、速い。

### B-3. 判断が必要な項目

- [ ] 5 名の属性配分（CEO 指定 / Claude 提案）
- [ ] 同意書の水準（簡易メール同意で可か、フォーム記入まで要るか）
- [ ] 謝礼の有無・金額・支払いタイミング
- [ ] 途中離脱時のデータ扱い方針

---

## §C. 2 週間スケジュール（Day 0 〜 Day 14）

設計書 §9.3 を実行計画に具体化:

| Day | フェーズ | ユーザー体験 | 計測項目 |
|-----|---------|--------------|----------|
| **Day 0** | Kickoff | 初回観測 35 問 → 個人モデル生成、初回 Oracle 提示 | questionPool 消化率、初回 SAS 初期値 |
| **Day 1-7** (Week 1) | Self vs Oracle + 反応パターン | 毎日: Oracle 予測対決 1 回 + 反応パターン言い当て 1 回 | oracle_correct_count、user_reaction 分布、SAS トレンド |
| **Day 8-14** (Week 2) | Decision Engine MVP 追加 | 毎日: 小判断 1 回を Decision Engine に投げる | recommended_option vs actual_choice、regretted 率、feedback_note |
| **Day 15** | 振り返りインタビュー | 15-30 分のインタビュー（対面 or zoom） | 3 軸（精度実感 / 納得感 / 行動変容自己評価）＋ 自由記述 |

### Day 0 の checklist（検証開始日に必要な状態）

- [ ] cohort フラグがユーザーに付与されている
- [ ] 各ユーザーが Stage 1-3 を完走し、45 軸モデルが初期化されている
- [ ] Oracle が予測を出せる状態（パターンが shown 可能）
- [ ] 日次チェックイン UI（§D-2）が表示される
- [ ] 2 週間の連絡・運営担当（AI Ops Unit or CEO 直轄）が決まっている

---

## §D. 不足インフラの最小追加

### D-1. Phase 1 cohort フラグ

**案（CEO 承認待ち）**: `user_profiles` or 新規 `stargazer_phase1_cohort` テーブルに `enrolled_at / left_at / status` を持たせる。

推奨: 新規テーブル（既存 user 周りに副作用を与えない）
```sql
CREATE TABLE stargazer_phase1_cohort (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at DATE NOT NULL,
  left_at DATE,
  cohort_label TEXT NOT NULL DEFAULT 'phase1_v1',
  consent_version TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  demographic JSONB -- {age_range, gender, role, psychology_literacy}
);
```

### D-2. 日次チェックイン UI + テーブル

新規テーブル案:
```sql
CREATE TABLE stargazer_phase1_daily_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  -- 3 軸を 1 画面で取る
  today_accuracy_feel INTEGER CHECK (today_accuracy_feel BETWEEN 1 AND 5),
  today_resonance INTEGER CHECK (today_resonance BETWEEN 1 AND 5),
  today_changed_action BOOLEAN,
  changed_action_note TEXT,
  free_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, checkin_date)
);
```

UI: `/stargazer/phase1/checkin` または Home 上の固定カード（cohort フラグあるユーザーにのみ表示）。30 秒で回答可能な構造（ボタン式 + 自由記述は任意）。

### D-3. 2 週間振り返り質問票

構造化ファイル or DB。最低限:
- 精度実感（5段階）: 「Stargazer の予測はあなたに当たっていた？」
- 納得感（5段階）: 「自分のことを言っていると感じた？」
- 行動変容（自由記述 + 数値）: 「実際に行動が変わったことは何回ありましたか？ 例を挙げてください」
- 継続意向（5段階）: 「Phase 1 終了後も使い続けたいですか？」
- 離脱理由があれば（自由記述）

推奨: 対面/zoom の半構造化インタビューで集める（5人なら量的スケーリング不要）。記録は docs に markdown で残す。

### D-4. 検証集計 SQL

各ユーザー単位:
```sql
-- ユーザー A の 2 週間結果
SELECT
  -- 言い当て精度
  AVG(oracle_correct_count::float / NULLIF(array_length(scenarios, 1), 0)) AS oracle_accuracy,
  -- 納得感（反応パターン + daily checkin）
  AVG(today_resonance) AS avg_resonance,
  COUNT(*) FILTER (WHERE user_reaction IN ('resonated','surprised','reflected')) AS positive_reaction_days,
  -- 行動変容
  COUNT(*) FILTER (WHERE today_changed_action = true) AS changed_action_count
FROM ...  -- JOIN 構造は実装時に書く
WHERE user_id = $1 AND date BETWEEN enrollment AND enrollment + 14;
```

全体集計:
```sql
-- §9.2 成功基準に対する 5人の分布
```

実装は D-2 テーブル作成後。

---

## §E. Go / No-Go 判定基準（5人での解釈）

§9.2 の成功基準は以下:
- 言い当て精度 **60% 以上**
- 納得感 **平均 3.5 以上**
- 行動変容 **2 週間で 3 回以上**

5 人しかいないので、判定は **閾値人数** で行う:

| 軸 | 達成 | 要改善 | 失敗 |
|---|---|---|---|
| 言い当て精度 60%+ | 4+ 名で達成 | 2-3 名 | 0-1 名 |
| 納得感 3.5+ | 4+ 名で達成 | 2-3 名 | 0-1 名 |
| 行動変容 3回+ | 4+ 名で達成 | 2-3 名 | 0-1 名 |

**Go**: 3 軸すべて「達成」
**要改善**: 1-2 軸が「要改善」 → Phase 2 に行く前に修正点を洗い出し、Phase 1.5 として再検証
**No-Go**: 1 軸でも「失敗」 → 設計を根本から見直す（§12 リスク「予測精度が不十分」の発動）

---

## §F. CEO 判断が必要な項目（まとめ）

| # | 項目 | 判断粒度 |
|---|------|----------|
| F-1 | §B-1 選定基準（多様性配分）は案通りで良いか | 承認 or 指定 |
| F-2 | §B-2 招待方針 (i) 知人招待 で進めてよいか | 承認 or 別方針 |
| F-3 | §B-3 謝礼・同意水準 | CEO 指定 |
| F-4 | §D-1 cohort テーブル新規追加は migration として許可か | 承認 |
| F-5 | §D-2 daily checkin UI を Home 固定カードに出すか、専用ルートにするか | 選択 |
| F-6 | §C Kickoff 日（Day 0）の目標日 | 指定 |

---

## §G. 実装順（承認後）

1. **cohort テーブル migration** (§D-1) — CEO 承認後に実行
2. **daily checkin テーブル + UI** (§D-2) — Home 固定カード or 専用ルート
3. **5 名招待 + 同意プロセス** (§B) — CEO 方針確定後
4. **Day 0 Kickoff** — 各ユーザーが Stage 1-3 完走 + 初期モデル生成
5. **Day 1-14 実行** — 週次で中間モニタリング、異常なら途中介入可
6. **Day 15 振り返りインタビュー** — 構造化 + 自由記述
7. **集計 → decision-log 記載 → Go/No-Go 判定**

---

## §H. 本計画の出口

承認後、本計画に従って実装が進む。本計画は Phase 1 期間中は生きた文書として更新し、Phase 1 終了時に Go/No-Go の記録と学びを付記してクローズする。
