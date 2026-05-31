# M1: localStorage quota cleanup — close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01・実機確認済）

D2 My-Style persistence close で残課題化していた localStorage quota 圧迫を、 実機 console 観測 → M1-1 / M1-2A の 2 commit で実質解消。

> ⚠️ **触らない領域**:
> IndexedDB / server purge / current wardrobe / My-Style current v3 / UI / Supabase / DB / migration / server-sync /
> external API / package / push / deploy / production canary / D6 scoreCandidate（M1 後の別フェーズ）

---

## M1 commit
| | commit | 役割 |
|---|---|---|
| 1 | `7b10eb58` | **M1-1** — `culcept_tryon_history_v1`（約 4.54MB orphan）を `EXPENDABLE_EXACT_KEYS` に追加 |
| 2 | `0cffe565` | **M1-2A** — `loadStateBundle` から `PREVIOUS_BACKUP_STORAGE_KEY` 読込停止 + `culcept_my_style_v2_backup` を expendable key 追加 |
| 3 | （本コミット） | **M1-3 close docs** |

---

## 確定した実装仕様

### M1-1: culcept_tryon_history_v1 は orphan
- 静的監査で現行コードベースに **reader / writer / 定数定義が一切存在しない**ことを確認
  - `"culcept_tryon_history_v1"` 文字列リテラル: 0 件
  - `tryon_history` / `tryonHistory` / `TRYON_HISTORY` 変数名: 0 件
  - `app/(culcept)/try-on/` 配下の localStorage 利用: 0 件
- 過去実装の遺残（owner が削除された後も localStorage に残存）
- 実機観測サイズ: **約 4.54MB**（localStorage 5MB quota の主犯・top 1）

### M1-1: ensureStorageSpace の expendable exact key に追加
- `lib/stargazer/localStorageHelper.ts` の `EXPENDABLE_EXACT_KEYS` に `"culcept_tryon_history_v1"` を 1 行追加
- 即時削除ではなく、 **次回 ensureStorageSpace 実行時に物理回収**される設計（既存 helper 流儀）
- My-Style persist で quota warning 発生時の catch path で自動回収

### M1-2A: culcept_my_style_v2_backup の復元経路を停止
- `app/(immersive)/my-style/_lib/state.ts` の `loadStateBundle` から `PREVIOUS_BACKUP_STORAGE_KEY` の fallback 読込を停止
- 変更前: `readJsonStorage(BACKUP_STORAGE_KEY) ?? readJsonStorage(PREVIOUS_BACKUP_STORAGE_KEY)`
- 変更後: `readJsonStorage(BACKUP_STORAGE_KEY)` のみ
- 死蔵 const `PREVIOUS_BACKUP_STORAGE_KEY` の宣言もコメントアウト（unused 化防止 + 履歴可視）

### M1-2A: culcept_my_style_v2_backup を expendable key に追加
- `EXPENDABLE_EXACT_KEYS` に `"culcept_my_style_v2_backup"` を追加
- D2 で確定した「v2_backup race」（quota fail → v3/v3_backup 消失 → v2_backup 復活 → auto persist が IDB を v2 時代 state で上書き → 削除済 item 蘇生）の素因を物理回収

---

## 実機確認結果（2026-06-01）

### Before（M1 着手前）
- 総容量: **約 5.24MB**（quota 上限近接）
- top 15 主犯:
  - `culcept_tryon_history_v1`: 約 4.54MB
  - `culcept_my_style_v2`: 約 0.67MB
  - 他: 数 KB ずつ

### After（M1-1 + M1-2A 実装後）
- **culcept_tryon_history_v1 が消失**（ensureStorageSpace 次回実行で物理回収）
- localStorage top 15 合計: **約 0.70MB**（実質的に quota 圧迫解消）
- 残存: `culcept_my_style_v2` の 0.67MB（legacy migration source として意図的保持）+ 他小サイズ key 群

---

## culcept_my_style_v2 本体は legacy migration 保護のため残す
- `loadStateBundle` の `currentRaw = readJsonStorage(STORAGE_KEY) ?? readJsonStorage(PREVIOUS_STORAGE_KEY)` は**完全に不変**
- `PREVIOUS_STORAGE_KEY = "culcept_my_style_v2"` の読込は維持
- `ensureStorageSpace` の `EXPENDABLE_EXACT_KEYS` にも v2 本体は追加していない
- **理由**: v2 → v3 への migration がまだ完了していない旧端末ユーザーの wardrobe 復元元として残す必要（CEO 補正どおり）

## M1-2B は deferred
- v2 本体を読まなくする M1-2B は**着手しない**
- 根拠:
  - M1-1 + M1-2A の効果で実機 quota が 5.24MB → 0.70MB へ激減し、 圧迫実害が解消
  - v2 本体（0.67MB）を残しても quota に十分余裕がある
  - v2 を読まなくするリスク（legacy migration source 失効）に対して、 削減効果（0.67MB）が見合わない
- 将来再評価する場合は、 v2 を唯一の復元元としているユーザーがいるかの追加 audit が必須

## M1 で削除していないもの
- IndexedDB 一切（特に `culcept_mystyle` / D2-3 正本）
- server / Supabase / DB
- current wardrobe（IDB / server 上の wardrobe item）
- My-Style v3 本体 (`culcept_my_style_v3`) / v3 backup (`culcept_my_style_v3_backup`)
- culcept_my_style_v2 本体（PREVIOUS_STORAGE_KEY 読込維持）
- culcept_my_style_v1 (LEGACY) — OLD_VERSION_RE で間接的に既に削除対象だが、 明示削除はしていない

---

## 検証総括
- 累計新規 test: 15 cases（M1-1: 7 / M1-2A: 8）
- my-style 全テスト: 119 PASS（既存 D2 fix 含む・退化 0）
- plan + Calendar + stargazer 全: 5868 PASS / 退化 0
- eslint: clean
- tsc: 全体 1116（baseline 維持）/ 自分のファイル 0（差分内 0）
- 実機: tryon_history 消失 + 総容量 0.70MB 確認

---

## 残課題 / 別トラック（M1 外）
- **M2** 既存 item 再処理（C1L-6 deferred・白抜き既存 item の透過バッチ復旧）
- **M3** weather route 404（`/api/weather/subscription` 別件）
- **M1-2B** v2 本体読込停止（deferred・必要性が出てから再評価）

---

## GO / NO-GO
- **M1: CLOSE（CEO 承認・実装＋ docs 完了）**
- 次フェーズは **D6**（scoreCandidate への bag/accessory 限定 weighting）
