# 評価OS Stage 4-A3b — dogfood flag ergonomics + manual smoke kit

作成: 2026-06-22 / 状態: **env flag 化 + 手動 smoke 手順（CEO 実行用）**
関連: `lib/plan/postVisit/postVisitObservation.ts`(`isPostVisitCheckEnabled`) / `fitArcReadout.ts`(`isFitArcReadoutEnabled`)

> 背景: Stage 4-A3 の headless smoke は `/plan/*` の auth gate でブロック（BLOCKED）。本書は **source const を毎回編集せず dev session だけで flag ON** にし、CEO がログイン済みブラウザで **実 Calendar flow を手動 smoke** できるようにする。

---

## 1. dogfood flag（dev-only env 点火）

| flag | env 変数 | 点火条件 |
|---|---|---|
| post-visit 答え合わせ器官 | `NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD` | `NODE_ENV !== "production"` **かつ** 値が厳密に `"1"` |
| Fit-Arc readout | `NEXT_PUBLIC_ANEURASYNC_FIT_ARC_DOGFOOD` | 同上 |

- **default OFF**: env 未設定 → false（const も false のまま）。
- **production hard block**: `isXxxEnabled()` は `NODE_ENV === "production"` で **env が立っていても必ず false** を最優先で返す。
- **source const 編集不要**: 以前は `export const ... = false` を一時編集していたが、不要になった。

---

## 2. 手動 smoke 手順（CEO・ログイン済みブラウザ）

> `.env.local` は **恒久編集しない**。env は起動コマンドに inline で渡す（ephemeral）。

1. **dev session だけ flag ON で起動**（プロジェクトルートで）:
   ```bash
   NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD=1 NEXT_PUBLIC_ANEURASYNC_FIT_ARC_DOGFOOD=1 npm run dev
   ```
2. ブラウザで **ログイン**（既存の認証）→ `/plan` を開く。
3. **Calendar の過去予定**（場所付き・経過済み・one_off・非機微）がある日を選ぶ。
   - その anchor row に **控えめな答え合わせカード**（「この前の予定の場所、次も候補に残す？」）が **選択日で最大1件だけ** 出る（one-per-day guard）。出ない場合は §4 を確認。
4. **1件回答**（また候補に残す / 条件次第 / 今日は違った / もういい のいずれか・任意で理由 chip）。「次の提案に覚えておきました」が出れば保存成功。
5. **`/plan/dev-postvisit-dogfood`** を開く（同じログイン session）。集計を確認:
   - `観測 total` が増えている
   - `context 付き` が増えている（coverage %）
   - `by sourceSurface` = `calendar_past_anchor`
   - `by trigger` = `past_plan`
   - `by timeOfDay / dayType / gapBucket` が coarse bucket に入っている
   - **`redaction 違反` = 0**（赤くなっていない）
   - `Fit-Arc per place` の対象 place の件数が増え、state が insufficient→tentative→observed に動く
   - **raw 値が出ていないこと**: 場所名原文・住所・notes・相手名・exact gap minutes が **どこにも表示されない**（短縮 opaque placeKey と bucket のみ）
6. **flag OFF で消えることを確認**: dev server を止め、env なしで `npm run dev` → `/plan/dev-postvisit-dogfood` は **空/非表示**（panel が null）、Calendar の答え合わせカードも **消える**（DOM 不変）。

---

## 3. localStorage smoke data の扱い

- 観測は **localStorage（key `aneurasync.postvisit.v1`）にのみ** 貯まる（DB 送信なし）。
- smoke 後に消したい場合: dev コンソールで `localStorage.removeItem("aneurasync.postvisit.v1")`。
- 継続して観測を貯めたい場合（Stage 4-B の素地）はそのまま残してよい。

---

## 4. カードが出ない時のチェック

- 過去予定が **recurring**（繰り返し）→ 対象外（除外仕様）。
- 場所が **自宅/職場/駅（transit）/機微（医療等）** → suppress で出ない（仕様）。
- 場所が **未設定**（locationText 空）→ 対象外。
- その日に該当が複数あっても **1件だけ**（one-per-day guard）。
- 同じ place を直近に聞いた / 直近に skip した → cooldown で出ない（仕様）。

---

## 5. なぜ no-auth bypass / middleware bypass を作らないか

- `/plan/*` の auth gate は **本番の保護境界**。これを dev で外す route や middleware bypass を作ると、**保護を弱める設計**が混入し、誤って production に出るリスク・世界観（安全第一）と衝突する。
- dev routes（`dev-*`）は元々「**開発者がログイン済みで**」使う設計。CEO はログイン session を持つので、bypass 無しで実フローを踏める。
- よって **auth はそのまま**、点火だけ env で容易にする、が最小で安全な解。

---

## 6. 境界（本 stage でやらないこと）

env flag 点火の容易化 + 手順 doc のみ。**no-auth route / middleware bypass / DB / API / migration / ranking 反映 / Context Fit readout / 新規 UI 配線は作らない**。production は hard-block 維持・flag default OFF。
