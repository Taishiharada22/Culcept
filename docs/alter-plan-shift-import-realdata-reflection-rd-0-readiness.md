# SR RD-0: 実データ save → /plan 反映 readiness（docs-only）

> 区分: **readiness（docs-only）**。**実 save / DB write / VLM 再実行 / production / push / PR / merge / deploy / Vercel env 変更 すべて未実施**。
> branch: **`feat/plan-shift-import-realdata-reflection`**（base = `feat/plan-shift-month-grid-reflection` HEAD `72d49987`・stacked）。
> 目的: 実シフト画像 import → DB save → /plan で実データ反映、を **どう安全に検証するか**を整理する。**検証実行自体は別 GO**。

---

## 0. 前提（受け継ぐ context）

### 0.1 productization branch 側（freeze 中・PR 待ち）
- import save action（`importShiftRoster` → RPC `import_shift_roster`）
- **S-save-0 多重防御**: ① flag `PLAN_SHIFT_IMPORT_SAVE`（server-only・default OFF）② **S-save-0 接続先 URL guard**（`STAGING_PROJECT_REF` allowlist / `PRODUCTION_PROJECT_REF` deny・fail-closed）
- S-geo / Persist / A1-A4 safety guard（confusable hint / 本人行 cross-check / blank+content mismatch）
- 書き込み先:
  - **勤務 → `external_anchors`**（`anchorKind=one_off` / source 経由で `source_type='shift_image'`）
  - **休み/希望休 → `plan_day_indicators`**（`sourceType='shift_image'`）
- migration: `sr_shift_import_source_type_and_day_indicators` + `sr_shift_import_rpc`（main-existing・staging-applied・**production 未適用**）
- staging save smoke 過去 PASS（S-save-3 / 4A replace / 4B conflict）

### 0.2 month-grid-reflection branch 側（freeze 中・本 stacked branch 基底）
- shift_image source marker（B-1 commit `4d11b84c`）
- week/day/month reflection（B-2 visual smoke PASS）
- 月 view enablement readiness（C-0/C-3/C3-1 build PASS/C3-2/C3-3 judgment）
- 月 view flag `NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED`（default OFF）

→ **本 branch は両方の context を持つ唯一の派生**。新規実装はせず、両方の検証 method を 1 枚にまとめる。

---

## 1. Layer A: staging validation plan（実 save 済データ → /plan 反映）

### 1.1 staging を使う前提
- **接続先**: staging Supabase（`STAGING_PROJECT_REF` allowlist 一致）。`PRODUCTION_PROJECT_REF` は deny で fail-closed。
- **flag**: `PLAN_SHIFT_IMPORT_SAVE=true`（**staging 限定**・本 readiness 中は OFF・別 GO で一時 ON）
- **user**: staging の自分の user_id 1 名のみ。allowlist がある場合はそこに限定。
- **raw 非保存原則**: raw 画像 / base64 / VLM raw response は **DB にも payload にも保存しない**（座標 / コードメタ / source_id / 抽出結果のコードのみ）。

### 1.2 save 前 preflight（実行直前に毎回）
```
- branch / git status / .env.local 非編集 確認
- 接続先 URL = STAGING_PROJECT_REF 一致（production deny を実機確認）
- PLAN_SHIFT_IMPORT_SAVE は **smoke 時のみ env true**（恒久追加しない）
- staging user_id の確定（本人）
- 既存 source 一覧の snapshot 取得（cleanup 用）
- /api/plan/anchors の現状応答 snapshot（before）
```

### 1.3 save 手順（**実行は別 GO**）
```
1. dev server を smoke env で起動（PLAN_SHIFT_IMPORT_SAVE=true・staging 接続）
2. 取込 entry → 画像投入 → review 画面 → 校正 → 保存
3. save action は S-save-0 guard 通過後 → import_shift_roster RPC
4. 保存後 /api/plan/anchors で fetch（before/after 差分確認）
5. /plan の week / day / month view を auth ブラウザで visual 確認
6. cleanup（§1.6）→ env rollback → dev server 停止
```

### 1.4 /plan 反映で確認したいこと（実データ）
```
- external_anchors に shift_image source の 勤務 anchor が入る
- plan_day_indicators に shift_image source の 休み / 希望休 が入る（sourceType='shift_image'）
- /api/plan/anchors で取得できる（sources / anchors / dayIndicators）
- week view（CalendarTab）に反映: 勤務 density / 休み dot / 取込「取」marker
- day view（FlowTab）に反映: 勤務 EventCard / 休み badge / 取込「取込」marker
- month view（MonthGridView・enable flag は smoke 時のみ）に反映: cell に勤務コード chip + 休み chip + 取込「取込」marker
- shift_image 由来 marker が実データでも出る（B-1 と同じ marker 経路）
- manual / non-shift には marker が出ない（regression）
```

### 1.5 month view flag との関係
- staging smoke では **dev mode** で行うため、月 view flag は **NEXT_PUBLIC で dev server 起動時に一時 ON** 可（C-1 で実証済の方式）。
- 本番 dogfood ON は C3-3 judgment 通り **GitHub 復旧 + Vercel env 変更 GO 待ち**。

### 1.6 cleanup 戦略（save 後に必ず）
- staging で生成された **source / anchors / day_indicators** を **source_id で一括削除**（DELETE FROM ... WHERE source_id = ?・user_id = staging 自分・SQL は別 GO で確定）
- cleanup SQL は **dry-run（SELECT COUNT）→ DELETE** の 2 段。raw 削除確認（座標メタは座標のみなので raw 不在）。
- cleanup 完了後 `/api/plan/anchors` で消滅確認。

---

## 2. Layer B: production path（gate map）

| Phase | 内容 | gate / GO |
|---|---|---|
| **B-P0** | productization branch の **PR / merge** | **GitHub 復旧 + CEO GO**（現状 freeze・push 禁止） |
| **B-P1** | **production migration apply**（`sr_shift_import_source_type_and_day_indicators` + `sr_shift_import_rpc`） | **CEO + DB op**（read-only probe → apply → read-only probe） |
| **B-P2** | production で **save なし** dry-run（entry/live のみ・保存 disabled 維持） | CEO + flag 段階 ON |
| **B-P3** | limited canary（少人数の userId allowlist で entry/live・保存 disabled） | CEO |
| **B-P4** | **save canary**（guard を canary 限定で production allow + `PLAN_SHIFT_IMPORT_SAVE` ON を canary 範囲のみ） | **二重 opt-in・CEO 承認必須** |
| **B-P5** | broader rollout（allowlist 拡大→全体） | CEO |

→ **本 RD-0 では B-P0〜B-P5 は触らない**（Layer A の staging 検証法を確定するだけ）。

---

## 3. 危険点（staging で起こり得る事故）

```
- DB write が発生する（save 自体が write・raw 非保存原則は保持）
- VLM 実行が発生し得る（live draft 経路は LLM/VLM 呼び出し有）
- cleanup 漏れ → staging に goblin row が残る
- user_id 不一致 → 他 user の row 操作リスク
- production ref 誤接続 → S-save-0 guard が fail-closed で止めるが env 設定ミス時の二重防御確認必須
- PLAN_SHIFT_IMPORT_SAVE の扱い → 一時 env で smoke 終了後 unset 確実に
- .env.local 編集漏れ → 恒久追加してしまうと flag が常時 true 化
- dev server 残留 → port 3000 残留で再起動失敗
```

---

## 4. gate（実行時に毎回確認・**実行は別 GO**）

```
- 接続先 URL が STAGING_PROJECT_REF 一致（read-only probe）
- production deny が fail-closed で効く（誤設定検証）
- staging user_id 確定（本人のみ・allowlist あれば一致）
- PLAN_SHIFT_IMPORT_SAVE は process env のみ（.env.local 非編集）
- cleanup SQL 事前準備（source_id 確定後・DELETE 前に SELECT COUNT）
- dev server 起動・停止手順（kill PID + TaskStop + port 確認）
- env rollback（PLAN_SHIFT_IMPORT_SAVE unset・dev server 停止・cleanup 完了確認）
```

---

## 5. 本 RD-0 中の禁止（厳守）

```
DB write / 保存再実行 / VLM 再実行
production / push / PR / merge / deploy / Vercel env 変更
PLAN_SHIFT_IMPORT_SAVE=true（一時的にも RD-0 中は OFF）
production flag ON / NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED 恒久 ON
proxy.ts 変更 / auth 例外追加
raw 画像 / base64 / VLM raw response の commit
productization branch / month-grid-reflection branch への直接追加
```

---

## 6. 次工程（CEO 判断）

| 候補 | 内容 | 種別 |
|---|---|---|
| **RD-1** | Layer A staging validation 詳細手順（preflight + save + cleanup + observe）の docs（**docs-only**） | docs-only |
| **RD-2** | Layer A staging 実行（dev server + smoke env + auth ブラウザ save + cleanup） | **CEO gate**（DB write / VLM 接触のため別 GO） |
| **RD-3** | Layer B B-P0/B-P1 着手 | **GitHub 復旧 + CEO + DB op** |

→ **本 RD-0 では RD-1 詳細手順は書かない**。RD-1 を docs-only で起草するかは CEO 判断。

---

## 結論
- 本 branch `feat/plan-shift-import-realdata-reflection` は **productization + month-grid-reflection の両 context を保持する stacked branch**（base `72d49987`）。
- **Layer A（staging 実 save→/plan 反映）は手順設計が固まれば検証可能**。ただし DB write / VLM 接触のため **実行は別 GO**。
- **Layer B（production path）は B-P0〜B-P5 の段階を踏む**。**現状は B-P0（PR/merge）で stop**（GitHub 復旧 + CEO 待ち）。
- **本書は docs-only。実 save / VLM / DB write / production 非接触**。次は CEO が RD-1 docs 着手 / RD-2 staging 実行 / RD-3 production path 着手 を判断。
