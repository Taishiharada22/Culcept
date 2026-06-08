# Confirm / Correct Loop — 設計（A1-7-35・**設計のみ・write 実装は stop gate**）

状態: **設計提出のみ・実装しない**。confirm/correct **write 実装・Alter 連結・Home/Stargazer 本線接続・本格 user-facing 公開** は全て CEO 承認 stop gate。前提: A1-7-34（second-self read-only surface・operator-only dev-preview）まで稼働。

---

## 0. なぜ最重要か（共創 = 第二の自己の核心）
- events→review→model で蓄積した tendency を、**ユーザー自身が confirm/correct して co-create する**。これで PRM は「冷たいモデル」でなく **本人が形作る第二の自己**になる。
- 「合っている」= **「自分って、そういう人間だったのか」の瞬間**（最高体験）。「違う」= **ユーザーの所有権・agency**。
- **directly observed signal**（user の confirm/correct）は最強の証拠。だが**それでも certainty は ≤tentative**（PRM は断定しない・自己認識は変わりうる）。

## 1. loop（閉じる）
```
events → review(operator/M2) → model(M3) → 【user が surface を見る】
   → 「合っている / 違う / 向きが違う / 文脈が違う」
   → confirm/correct を記録 → model の provenance/重みを更新（certainty は ≤tentative のまま）
   → 次の surface に反映（co-created）
```

## 2. affordance（second-self surface 上）
| 操作 | 意味 | 記録 |
|---|---|---|
| **合っている** | 自己認識の確認（最強 signal） | user 確認（§3a） |
| **違う** | tendency が誤り | user_correction="rejected" + retracted_at（論理削除） |
| **向きが少し違う** | 方向が逆/ずれ | user_correction="direction_adjusted" |
| **文脈が違う** | 場面が違う | user_correction="context_refined" |

- copy は**非断定・共同編集**: 「合っていますか？ 違っていたら、いつでも直せます」。

## 3. データモデル（M2/M3 既存列で完結・migration 不要）
### 3a. confirm（合っている）
- **新 M2 review decision**（reviewer=**"user"**・decision="approve"・同 proposal_fingerprint・server 再導出 snapshot）を 1 件 insert。
  - = 「ユーザー自身が review した」provenance（reviewer="user" は M2 CHECK 済）。
  - 既存 M3 はそのまま（certainty 不変・≤tentative）。surface で「あなたも確認した観測」と provenance 表示。
  - **任意**: user M2 を review_decision_id にした新 M3（supersedes_id=旧 M3）で version 化（強い provenance）。v1 は M2 confirm 記録のみで十分。
### 3b. correct（違う/向き/文脈）
- 既存 **M3 を UPDATE**（owner・M3 は UPDATE policy あり）: `user_correction` を set（+ reject は `retracted_at=now` で論理削除＝surface から消える・可逆）。
- = ユーザーの override（最強の修正 signal）。raw/personality を作らない（enum code のみ）。

## 4. route（**全 flag-gated・owner-RLS・redacted**）
- `POST /api/reality/tendency-feedback`（統合）: `{ proposalFingerprint, feedback: "confirm"|"reject"|"direction"|"context" }`。
  - auth user・flag `REALITY_TENDENCY_FEEDBACK_WRITE`（default OFF）。
  - **server 再導出**で proposal/M3 を解決（client 値を信用しない）。
  - confirm → §3a（user M2 insert・A1-7-30 repo 再利用）。correct → §3b（M3 UPDATE・新 repo method or RPC）。
  - redacted return（id/raw 出さない）。fail-open / partial failure 明示。

## 5. model への効き（certainty は不変）
- confirm → provenance 強化（user 確認回数・decay_weight 維持/上げ）。**certainty は ≤tentative のまま**（断定しない絶対原則）。
- reject → retracted_at で surface から除外（model から論理削除・可逆）。
- direction/context → user_correction を surface に併記（「あなたが調整した観測」）。次の aggregation/review で重み調整（将来）。
- **directly observed > inferred**: user feedback を最優先の証拠として将来 aggregation に反映（設計メモ）。

## 6. 安全契約（全維持）
- owner-RLS・service_role 禁止・flag default OFF・redacted・**certainty no high**（user confirm でも上げない）。
- correct は enum code のみ（raw/personality なし）・reject は retracted_at で**可逆**（破壊的削除でない）。
- **Alter 連結・Home/Stargazer 本線・本格 user 公開は別 gate**（本設計に含めない）。

## 7. 実装最小 slice（CEO 承認後）
1. flag `REALITY_TENDENCY_FEEDBACK_WRITE`（default OFF）。
2. M3 update repository method（user_correction / retracted_at・owner-RLS・fail-open）+ mapper + unit test（fake）。
3. tendency-feedback route core（server 再導出→confirm=M2 insert / correct=M3 update・redacted・partial failure）+ test。
4. route handler（flag-gated）。
5. second-self surface の disabled button → 実 feedback ボタン（flag-gated）。
6. staging controlled smoke（M3 作成→confirm/correct→検証→cleanup）。

## 8. ★CEO 判断（実装前）
- **(a)** confirm の記録方式（user M2 のみ / +新 M3 version）。
- **(b)** correct の effect（reject=retracted / direction・context の将来 aggregation 重み）。
- **(c)** copy（confirm=「自分って、そういう人間だったのか」を起こす・correct=尊厳ある「直せます」）。
- **(d)** write 実装 GO（= correction write を有効化する判断）。

## 9. しない（A1-7-35 の境界 = stop gate）
**実装一切しない**（本 slice は設計のみ）。confirm/correct write 実装・Alter 連結・Home/Stargazer 本線接続・本格 user-facing 公開・production は全て CEO 承認 stop gate。
