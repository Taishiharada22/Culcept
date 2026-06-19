# Candidate Lens — P4-e: Production Enable 最小 GO 手順書（Runbook）

> ステータス: **手順書（docs）のみ**。本書時点で **production 有効化しない / env 変更しない / flag true 化しない / GCP 変更しない / 実 API smoke 追加しない**。
> 親: `docs/candidate-lens-phase4e-production-readiness-plan.md` / `…safety-package-spec.md`。guard 実装: `9ef3f4e32`（二重スイッチ env gate）。

---

## 0. GCP readiness（2026-06-19 CEO 完了報告・記録）

| 項目 | 状態 |
|---|---|
| API restriction | ✅ Places API (New) に限定済 |
| quota | ✅ 設定済 |
| budget alert | ✅ 毎月 / 50% / 90% / 100% |
| emergency kill switch | ✅ **quota=0 → env off → flag false → key disable** の順で対応可能 |

→ GCP 側 safety package は完了。**残るは app 側の本番 ON 手順（本書）と CEO の最終 GO**。

---

## 1. 本番 ON に必要な最小変更（二重スイッチ）

現状: `PLACE_DETAILS_ENRICH_FETCH_ENABLED=false` / `PLACE_DETAILS_ENRICH_UI_ENABLED=false` / 本番 env `PLACE_DETAILS_ENRICH_PROD_ALLOWED` 未設定 → **四重で hard block**。

本番で有効化するには **以下 2 系統の両方**が必要（どちらか片方では有効化されない＝誤有効化防止）:
1. **コード**: const flag を true（`lib/plan/candidateLens/placeDetailsEnrichment.ts`）。
2. **本番 env**: `PLACE_DETAILS_ENRICH_PROD_ALLOWED=1`。

`isPlaceDetailsFetchEnabled()/isPlaceDetailsUiEnabled() = const flag && envGateOpen()`、`envGateOpen() = NODE_ENV!=="production" || PROD_ALLOWED==="1"`。

---

## 2. ★現コードの実態（段階解除の前提・重要）

- **client hook は `active = isPlaceDetailsUiEnabled() && isPlaceDetailsFetchEnabled()`（両 flag の AND）**。
  → **fetch ON / UI OFF では client が endpoint を呼ばない**＝**純粋な fetch-only shadow は現コードでは起きない**（課金も発生しない）。
- endpoint は `isPlaceDetailsFetchEnabled()` のみで gate（UI 非依存）だが、client が呼ばないので実質トラフィックは両 flag ON 時のみ。

→ 「fetch 先行 shadow」を**やるには小改修が要る**（§3 Option B）。やらないなら**両 flag 同時 ON＋canary**（§3 Option A）。

---

## 3. fetch flag と UI flag の段階解除順

### Option A（推奨・コード改修なし・canary 方式）
1. **env 先行**: 本番 env に `PLACE_DETAILS_ENRICH_PROD_ALLOWED=1` を投入（**flag は false のまま** → 何も起きない＝env 配線確認のみ・ゼロ課金・ゼロリスク）。
2. **両 flag 同時 true ＋ deploy**: `…FETCH_ENABLED=true` と `…UI_ENABLED=true` を同時に true 化して本番 deploy。
   - ★**canary**: GCP quota を一時的に低め（例 Details/Photo 各 100/day）にし、**少人数・短時間**で観測。問題なければ quota を通常値へ。
3. 安定確認後に対象を広げる（招待制の範囲内）。

### Option B（真の shadow が必要な場合・小改修・別 GO）
- hook の `ensure` gate を `isPlaceDetailsFetchEnabled()` のみに decouple（UI flag は描画のみに使う）→ **fetch ON / UI OFF で課金観測だけ**先行可能。
- 改修＋tests が要る（実装は別 GO）。shadow を厳密にやりたい時のみ。

> 既定は **Option A**（最小変更）。Option B は shadow を厳密化したい時の選択肢。

---

## 4. `PLACE_DETAILS_ENRICH_PROD_ALLOWED` の扱い
- **本番 env のみ**に `=1` を投入（dev/test には不要・dev は NODE_ENV で通過）。
- env 単独では有効化されない（const flag true が別途必要）。
- **OFF への戻し**が最速級の kill の一つ（§7・env off）。Secret/環境変数管理で投入・除去する。
- ソース（`.env.local` 等）にはコミットしない。

---

## 5. production smoke の最小回数（本番 ON 直後）
- **Details 2〜3 / Photo 2〜3 / ② 1〜2 / ③ 1**（dogfood アカウント 1 名で ①→②→③ 1 周）。
- 直後に GCP の Details/Photo call 数・budget 消化・error 率を確認 → 異常なければ dogfood 開放。
- それ以上の smoke は不要（最小に留める）。

---

## 6. rollback 手順（速い順）
1. **GCP quota=0**（即時・デプロイ不要・最速で全遮断）。
2. **env off**: `PLACE_DETAILS_ENRICH_PROD_ALLOWED` 除去（envGateOpen が本番で閉じる → 全 OFF）。
3. **flag false**: const flag を false に戻して deploy（恒久）。
4. **key disable**: 最終手段（キー無効化）。
- 永続物ゼロ（DB/localStorage なし）→ データ rollback 不要。
- ※ CEO 確認の kill switch 順（quota=0 → env off → flag false → key disable）と一致。

---

## 7. ON してよい条件（全て満たす時のみ）
- [ ] GCP: API restriction / quota / budget alert / kill switch ＝**完了**（§0・✅）。
- [ ] app: 二重スイッチ env gate 実装済（`9ef3f4e32`・✅）。
- [ ] dev dogfood で ②③/fail-open/attribution/Powered by Google が継続正常（honesty 逸脱なし）。
- [ ] 法務: attribution・キャッシュ規約の CEO 確認完了。
- [ ] 想定コストと budget 上限の合意（招待制≲20人で $0〜数$/月）。
- [ ] canary 手順（quota 低め→観測→通常）と rollback を実行できる状態。

## 8. ON してはいけない条件（1 つでも該当なら dev-only 維持）
- GCP の quota/budget/kill switch のいずれか未確認。
- 法務確認（attribution/キャッシュ）未完。
- dogfood で honesty 逸脱（attribution 欠落・未確認の実値化）や fail-open 不全。
- canary なしで一斉 ON しようとしている。
- env と const flag の二重条件を理解せず片方だけ操作している。

---

## 9. 監視項目（ON 後）
- GCP: Place Details / Place Photo の **call 数**・**budget 消化%**・**quota 接近**。
- アプリ: endpoint の **error/timeout 率**・**fail-open 発生率**（abstract へ落ちた割合）。
- honesty 定点: 写真 **author attribution** 表示・**Powered by Google** 表示・**Wi-Fi/電源/静か/雰囲気の未確認維持**（実値化されていないこと）。
- explanation note（E-b）: register A 文言・「元の並びに戻す」の動作（人格断定/追跡語が出ていないこと）。

## 10. 異常時停止条件（即 kill）
- budget アラート **90%** 到達。
- error/timeout 率の急増、または fail-open 率の異常上昇。
- quota 上限への接近。
- honesty 逸脱（attribution 欠落写真の表示・未確認項目の実値化・捏造）。
- 予期せぬ課金増・写真表示崩れ。
→ §6 の順（quota=0 → env off → flag false → key disable）で停止。

---

## 11. E-c（copy A/B 検証）について
- **register A は E-b で出荷済**（「最近の選び方をもとに、〈軸〉を上に並べています。」）。本番 ON 後の dogfood で運用。
- **register B（やさしい鏡）は未採用**（docs 残置）。A/B 採用は dogfood の納得感/不快感を見て CEO 判断（別 GO）。
- E-c に新規実装は不要（A は既存・B 採用時のみ実装）。

---

> 本書は手順書。**production 有効化・env 投入・flag true 化・GCP 変更・実 API smoke は CEO の最終 GO まで行わない。**
