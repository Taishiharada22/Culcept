# Alter Plan — Wave 1 W1-4-pre Completion Checkpoint

> Status: **W1-4-pre 完了、CEO 判断待ち（DB 環境の決定）**
> Date: 2026-04-30
> Branch: `feat/alter-plan-wave1-clean`
> Latest HEAD: `00445a92` (W1-4pre-4)

本文書は **Wave 1 の DB 非依存フェーズ完了報告**。`docs/alter-plan-foundation-design.md` の不変モデルとは別物（設計書を肥大化させないため別ファイル）。CEO が次の判断（DB 環境の決定）を下すために必要な情報をすべて集約する。

---

## 1. 達成した層（W1-4-pre 範囲）

| Layer | 完成状態 | Commit | 行数 |
|---|---|---|---|
| 設計書 | ✅ docs/alter-plan-foundation-design.md（12 セクション、Privacy / Validity 含む） | 1d0de344 → 0920ab84（追記反映） | +937 |
| Plan foundation types | ✅ lib/plan/*.ts（8 型ファイル + index） | a2cd9c92 | +589 |
| Plan route shell | ✅ app/(culcept)/plan/*.tsx（feature flag 配下、Home 非接触） | 37109fea | +145 |
| ExternalAnchor migration draft | ✅ 2 テーブル + CHECK + RLS + ON DELETE CASCADE | dbe7be8b → de1045ce | +286 |
| PlanDriftEvent migration draft | ✅ append-only event log（target 多態 + targetSnapshot） | 8e2f8879 → 2ea28f70 | +205 |
| AlterConfirmation FSM | ✅ pure state machine + thin React hook | eccfc01e → 0920ab84 | +650 |
| ExternalAnchor input validation | ✅ pure DTO + 6 種 error code | 08e2ba74 | +837 |
| Weekday template → RRULE | ✅ FREQ=WEEKLY;BYDAY のみ、canonical | 81e8754c | +679 |
| Repository interface + memory impl | ✅ atomic bundle / cascade / user 分離 / 情報漏洩防止 | d0659149 → c2c8f432 | +1177 |
| Integration flow tests | ✅ 11 シナリオ、ユーザー物語形式 | 00445a92 | +648 |
| **CLAUDE.md Rule 8** | ✅ 作業開始 / commit 前の必須 3 点確認義務化 | 5f913937 | +9 |

**累積 commits: 15 / 累積行数: ~6,162 lines（うちテスト 50%+）**

---

## 2. テスト品質の可視化（自立推論で追加）

214 tests を質的に分類：

| 分類 | tests | 例 |
|---|---|---|
| **ユーザー物語型**（仕様書として読める） | ~14 | "学生が歯科予約 5/10 14:30 を手動入力" |
| **不変原則防御型**（型 + テストの二重防御） | ~85 | "confirmed への遷移は accept 以外で到達しない" |
| **エッジケース**（境界 / 異常入力） | ~75 | "title 256 文字 → too_long" |
| **接続検証**（integration / 接続部の問題検出） | ~40 | "canonical 化が repository まで届く" |
| **計** | **214** | — |

```
$ npx vitest run tests/unit/plan/
Test Files  5 passed (5)
     Tests  214 passed (214)
  Duration  ~180ms
```

---

## 3. 依存グラフ

```
Plan foundation types (W1-1)
  ├─ ExternalAnchor (discriminated union: one_off | recurring)
  ├─ ExternalAnchorSource (raw retention)
  ├─ PlanSeed
  ├─ PlanDriftEvent (polymorphic target + snapshot)
  ├─ DraftPlan (level: candidate | draft)
  ├─ AlterConfirmation (action / state / meta)
  └─ LocationCategory (共有 enum)
        │
        ↓
  ┌─────┴──────────────────────────────────────────┐
  ↓                       ↓                          ↓
Plan route       ExternalAnchor              AlterConfirmation
(W1-2)             input layer                    FSM (W1-7+7b)
                  (W1-4pre-1)                  
                       ↓
                Weekday Template
                       ↓
                ExternalAnchor
                  Repository
                (W1-4pre-3+3b)
                       ↓
                Flow integration
                  (W1-4pre-4)

Migration drafts (Supabase 未適用):
  external_anchors / external_anchor_sources (W1-3 → W1-3 fix)
  plan_drift_events (W1-5 → W1-5b)
```

---

## 4. DB 非接触保証

| 項目 | 確認方法 | 結果 |
|---|---|---|
| Supabase client import | `grep -E "^import.*supabase"` | **0 件** |
| `createClient(` 呼び出し | `grep -nE "createClient\("` | **0 件** |
| `fetch(` 呼び出し | grep | **0 件** |
| `localStorage.` / `sessionStorage.` | grep | **0 件** |
| API route 作成 | `ls app/api/plan/` | **存在しない** |
| `.env.local` 編集 | `git diff -- .env.local` | **変更なし** |
| `supabase` コマンド実行 | （Phase B 以降の操作ログ） | **ゼロ**（Docker 不在で実行不能） |
| migration の本番適用 | `supabase db push` | **ゼロ** |
| アプリ起動 | `npm run dev` 等 | **ゼロ** |
| `feat/alter-morning-wave3-pr8` への混入 | branch 監視 | **ゼロ**（凍結済み） |

---

## 5. 残課題（CEO 判断必須）

### 5.1 DB 環境未決定

現状：
- local Docker / OrbStack / Colima いずれもインストールなし
- `.env.local` が production Supabase を指す
- `supabase/.temp/linked-project.json` 存在（過去 link 履歴）

### 5.2 未実装の主要 layer

| 残 layer | 依存 |
|---|---|
| W1-4 real insert（Supabase 実装） | DB 環境決定後 |
| W1-6 passive drift logging | migration 適用後 |
| W1-8 Home ⇄ Plan アクセス導線 | Home 側の最小改修、最後の Wave 1 commit |

### 5.3 W1-3 / W1-5 で残した未解決論点（参考）

- `updated_at` trigger: trigger なし、application 層更新 ← **確定済み**
- hard unique constraint: なし、重複検出は API/UI 層 ← **確定済み**（Scenario 11 で仕様化）
- soft delete: Wave 後半検討 ← 保留
- `start_time` TIME 型: 採用 ← **確定済み**
- `exception_dates` DATE[]: 採用 ← **確定済み**
- `deleteSource` 戻り値曖昧: 解消 ← **確定済み**（W1-4pre-3b）

---

## 6. CEO 判断選択肢 — DB 環境

### Option A: local container runtime 導入

**内容**: OrbStack（推奨）または Docker Desktop / Colima を macOS に導入 → `supabase start` で local stack 起動 → migration 適用検証

**Pre-mortem（失敗予測）**:
- 開発者ごとの環境セットアップ差で「動く / 動かない」分岐
- CI/CD で同じことを再現する必要がある（doubling effort）
- macOS の disk / memory 消費（OrbStack でも数 GB）

**判断後の観測ポイント**:
- `supabase start` 成功 → `migration list --local` で全 migration 認識
- W1-4 real insert 実装後、local API + RLS 動作確認
- 1 週間継続使用で開発フローに馴染むか

**コスト**: インストール時間 + 学習コスト（低-中）

### Option B: staging Supabase project 作成（私の推奨）

**内容**: production とは別の Supabase project を作成 → migration 適用 → `.env.staging` を新設 → preview deploy で動作確認

**Pre-mortem（失敗予測）**:
- env / key 管理が複雑化（local / staging / production の 3 系統）
- staging が長期に陳腐化（同期忘れ）→ 「あるあるバグ」
- Vercel preview deploy で staging を指す設定が必要

**判断後の観測ポイント**:
- staging project URL / anon key を `.env.staging` に格納（gitignore）
- Vercel preview branch を staging に向ける
- W1-4 real insert → preview で動作確認 → CEO の最終承認後に production 適用

**コスト**: Supabase project 作成（5 分）+ Vercel 設定 + env 管理運用（中）

### Option C: production migration 直接適用

**内容**: CEO 承認 → `supabase db push` で production に migration 適用 → W1-4 real insert を production で動作確認

**Pre-mortem（失敗予測）**:
- ロールバック計画必須（DOWN migration 必要）
- 適用中の production 動作影響（メンテナンス窓推奨）
- 既存 user データへの schema 影響（新規テーブルなので低リスクだが、ゼロではない）

**判断後の観測ポイント**:
- `supabase db push --dry-run` で対象 migration を確認
- メンテナンス窓で適用
- RLS が user-scoped で動作することを smoke test
- 既存機能の regression を Vercel / Sentry で監視

**コスト**: ロールバック準備 + メンテナンス窓 + 緊急対応体制（高）

### 私の自立推論による推奨: **Option B（staging Supabase project）**

理由 3 つ：
1. **production 直触り回避**（A の Docker と同程度に安全）
2. **CI/CD と Vercel preview deploy で自動検証可能**（A よりスケール）
3. **aneurasync の既存運用（production 直接フロー）から最小の変更**で安全化を実現

ただし、env 管理コストを許容するかは CEO 判断。

---

## 7. ロールバック・撤退条件

W1-4-pre は**完全に DB 非接触**で構築されたため、撤退コストは最小：

| 撤退アクション | コスト |
|---|---|
| ブランチ `feat/alter-plan-wave1-clean` を破棄 | ファイル削除のみ、production 影響ゼロ |
| 設計書 `docs/alter-plan-foundation-design.md` を残す or 破棄 | 履歴に残す or 削除（学びの価値あり） |
| 既存 `feat/alter-morning-wave3-pr8` / Home / Alter / CoAlter | 一切影響なし（汚染ブランチも凍結済み） |

---

## 8. レビュー観点（reviewer 向け）

### 重視すべき不変原則

- ✅ DB 非接触（Section 4 参照）
- ✅ Home 既存レイアウト変更ゼロ
- ✅ feat/alter-morning-wave3-pr8 への混入ゼロ
- ✅ 214 tests PASS / tsc errors 0
- ✅ pure functions / throw しない / 入力 mutate しない

### 注目すべき設計判断

- discriminated union での型レベル強制（one_off vs recurring、candidate vs draft）
- `confirmed_at NOT NULL` で未確認 AI 推測の保存禁止を物理層で守る
- `deleteSource` で user 不一致と source 不在を同一戻り値（情報漏洩防止）
- weekday template の RRULE は `FREQ=WEEKLY;BYDAY` のみ（汎用 RRULE エンジンではない、意図的な狭さ）
- repository は method-level userId（instance scope ではない）
- 重複登録の許容（unique constraint なし、検出は上位層責務）

### W1-4-pre で**意図的に除外**したもの（範囲外）

- API route / Supabase client / DB insert
- UI / Plan 画面接続 / Home 変更 / 横スワイプ
- localStorage / Document Import / PDF / image / chat
- 汎用 RRULE エンジン / monthly / yearly / UNTIL / COUNT / TZID
- migration の本番適用

---

## 9. Next Step（CEO 承認後）

```
[CEO 判断: Option A / B / C]
  ↓
[DB 環境準備]
  ↓
W1-4 real insert
  - Supabase 実装の ExternalAnchorRepository
  - API route (POST/GET/DELETE /api/plan/anchors)
  - 既存 memory mock との interface 互換確認
  ↓
W1-6 passive drift logging
  - 編集操作 → PlanDriftEvent 自動記録
  - target='external_anchor' から開始
  ↓
W1-8 Home ⇄ Plan アクセス導線
  - feature flag 段階開放
  - Home 既存レイアウトは最後まで触らない
  ↓
Wave 1 完了
```

---

**この checkpoint で W1-4-pre をクローズする。Wave 1 残り（W1-4 real / W1-6 / W1-8）の着手判断は CEO 待ち。**
