# Candidate Lens — P4-e: Production Readiness 計画（本番有効化の前提・手順）

> ステータス: **計画のみ**。**production 有効化はしない**。本書は「いつ・どうすれば本番 ON にできるか」を具体化する。
> 前提: P4-b/c/d 実装着地済（`613e902e8`・dev-only・flag 全 OFF）。実 API・課金・GCP は P4-e GO まで触らない。
> ★コードからは GCP 設定を変更しない（CEO が Cloud Console で操作）。本書はそのチェックリストと依頼内容。

---

## 0. 前提整理（現状）
- 現状 flag: `PLACE_DETAILS_ENRICH_FETCH_ENABLED=false` / `PLACE_DETAILS_ENRICH_UI_ENABLED=false`（両 default OFF）。
- production hard block: flag＋`NODE_ENV!=="production"`＋endpoint disabled＋budget guard の四重。
- 課金発生点: Place Details Enterprise($0.020/call) ＋ Place Photo($0.007/call)。flag OFF/production では 0。
- key スコープ: 検証済（既存 `GOOGLE_MAPS_API_KEY` に Place Details (New) ＋ Place Photos (New) が有効）。

---

## 1. GCP 側チェックリスト（CEO が Cloud Console で実施・コードからは不可）

| # | 項目 | 内容 | 必須/推奨 |
|---|---|---|---|
| C1 | **API key restriction** | `GOOGLE_MAPS_API_KEY` を **API restriction**: Places API (New) のみに限定。**Application restriction**: サーバ用キーは IP 制限（本番サーバ egress IP）か、最低限 HTTP referrer。client には出ないのでサーバ鍵として運用 | **必須** |
| C2 | **Places API / Details / Photos 使用可否** | Places API (New) が project で有効・Place Details / Place Photos の課金 SKU が請求アカウントで利用可（既に smoke で確認済だが本番 project で再確認） | **必須** |
| C3 | **per-API quota** | Cloud Console > APIs > Places API (New) で **per-minute / per-day quota** を保守的に設定（例: Details 60/min・1,000/day、Photo 60/min・1,000/day）。app guard の上位の本丸 | **必須** |
| C4 | **monthly budget alert** | Billing > Budgets & alerts で **月次予算上限＋50%/90%/100% アラート**（例: 上限 $30/月で招待制想定の十分上）。100% で通知＋（任意）自動 quota 縮小 | **必須** |
| C5 | **emergency kill switch** | 緊急停止の二系統を用意: ①**app**: flag を false に戻し再デプロイ（即時・コード） ②**GCP**: 該当 API の quota を 0 / キーを一時無効化（デプロイ不要・最速） | **必須** |

> ★C1〜C5 のうち **C1・C3・C4・C5 が未整備なら production enable しない**（dev-only 維持）。

---

## 2. アプリ側の production hard block 解除手順（GO 後のみ）

> 解除は「コードの 1 行 flag を true にする」だけではなく、段階を踏む。

1. **前提充足の確認**（§5 の GO 条件を全て満たす）。
2. **fetch flag のみ先行 ON**（`PLACE_DETAILS_ENRICH_FETCH_ENABLED=true`・UI flag は OFF のまま）→ **shadow（UI 不変・課金観測のみ）**で数日。budget/quota の実数を監視。
   - ただし現行 `isPlaceDetailsFetchEnabled()` は `NODE_ENV!=="production"` を含むため、**production で効かせるには gate の見直しが要る**（§2-注）。
3. **UI flag を ON**（`PLACE_DETAILS_ENRICH_UI_ENABLED=true`）→ dogfood ユーザーに ②③ 表示。
4. 異常時は §1-C5 の kill switch。

**★§2-注（production gate の扱い・重要）**: 現状 `isPlaceDetailsFetchEnabled()/isPlaceDetailsUiEnabled()` は `&& process.env.NODE_ENV !== "production"` を持つ＝**production では恒久 false**。本番 ON にするには、この production 排他を「**専用の本番許可フラグ（例: `PLACE_DETAILS_ENRICH_PROD_ALLOWED` env）に置換**」する小改修が要る（不用意に `!=="production"` を外さない）。
  - 推奨: `isXEnabled() = FLAG && (NODE_ENV!=="production" || process.env.PLACE_DETAILS_ENRICH_PROD_ALLOWED==="1")`。env は本番でのみ明示投入。これにより **dev は従来通り・本番は env で明示許可した時だけ**有効になり、誤有効化を防ぐ。この改修自体が P4-e の実装スコープ（別 GO の実装分）。

---

## 3. 実 API smoke（本番有効化時）の最大回数

- production 有効化直後の確認 smoke は **最小**に: **Details 2〜3 / Photo 2〜3 / ② 1〜2 / ③ 1**。
- 既存 dev smoke と同様、dogfood アカウント 1 名で ①→②→③ を 1 周。
- budget alert と quota dashboard で実数を確認してから一般 dogfood に開放。

---

## 4. rollback 手順
1. **最速（GCP）**: 該当 API の quota を 0、またはキーを一時無効化（デプロイ不要・即時遮断）。
2. **アプリ**: `PLACE_DETAILS_ENRICH_FETCH_ENABLED` / `..._UI_ENABLED` を false に戻して再デプロイ → 既存 UI 完全不変に復帰（flag OFF＝バイト不変）。
3. **本番許可 env**: `PLACE_DETAILS_ENRICH_PROD_ALLOWED` を外す（§2-注の改修後）。
4. 永続物ゼロ（DB/localStorage なし）→ 残留データなし・データ rollback 不要。

---

## 5. 想定月間コスト（招待制・少人数 dogfood）
> 単価: Details Enterprise $0.020/call（無料枠 1,000/月）・Photo $0.007/call（無料枠 1,000/月）。②③ 開封のみ課金・browse 0・memo dedup。

| 規模（仮定） | 月間 ②③ 開封 ≒ call | Details 課金 | Photo 課金 | 月額 |
|---|---|---|---|---|
| 招待 ~10人 × 2/日 | ~600 | 無料枠内 | 無料枠内 | **≈ $0** |
| ~20人 × 2/日 | ~1,200 | (1,200−1,000)×$0.020=$4 | (1,200−1,000)×$0.007=$1.4 | **≈ $5.4** |
| ~30人 × 2/日 | ~1,800 | $16 | $5.6 | **≈ $21.6** |

→ **招待制・少人数（≲20人）では実質 $0〜数ドル/月**。budget alert は十分上（例 $30）に設定し、超過は quota で抑える。

---

## 6. 招待制 / 少人数 dogfood 時の運用
- 対象は知人・招待制のみ（CLAUDE.md「少人数の初期検証ユーザー獲得は行う」）。一斉公開はしない。
- 監視: 週次で GCP の Details/Photo 実 call 数・budget 消化・エラー率を確認。
- honesty 維持の定点チェック: 写真の attribution 表示・Powered by Google・未確認項目（Wi-Fi/電源/静か/雰囲気）が実値化されていないこと。
- フィードバック: 写真が出る/出ない（abstract fallback）・営業時間の正確さ・違和感の有無を収集。

---

## 7. production enable GO 条件（満たせば ON 可）
- [ ] C1 key restriction 設定済（Places API (New) 限定＋IP/referrer）
- [ ] C3 per-API quota 設定済（Details/Photo の min/day 上限）
- [ ] C4 monthly budget ＋ アラート設定済
- [ ] C5 kill switch 二系統（app flag ＋ GCP quota/key）確認済
- [ ] §2-注の **本番許可 env gate 改修**を実装・テスト済（誤有効化防止）
- [ ] dev dogfood で ②③/fail-open/attribution/Powered by Google が継続的に正常
- [ ] CEO による法務確認（attribution・キャッシュ規約）完了
- [ ] 想定コストと budget 上限の合意

## 8. 未達なら dev-only 維持（production にしない）
- key restriction / quota / budget / kill switch のいずれか未整備。
- 本番許可 env gate 改修が未実装（`!=="production"` を雑に外すのは禁止）。
- 法務確認（attribution/キャッシュ）未完。
- dogfood で honesty 逸脱（attribution 欠落・未確認の実値化）や fail-open 不全が出た。
→ いずれも **flag OFF のまま dev-only 継続**（既存 UI 不変・課金ゼロ）。

---

## 9. P4-e の実装スコープ（GO 後・別 GO）
- §2-注の **本番許可 env gate 改修**（production 排他を env 明示許可に置換・誤有効化防止）＋ test。
- （任意）budget guard を per-user 化 or 観測ログ強化（本丸は GCP 側）。
- ※ GCP 設定（C1〜C5）は CEO が Cloud Console で実施・コードからは行わない。

> 本書は計画。**production 有効化・GCP 設定変更・env/key 変更は CEO GO まで行わない。**
