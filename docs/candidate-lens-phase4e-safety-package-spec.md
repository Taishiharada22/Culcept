# Candidate Lens — P4-e: 本番 ON 直前 安全パッケージ仕様（実装可能粒度）

> ステータス: **設計のみ**。**production 有効化しない / GCP 設定変更しない / env・key 変更しない / flag を true にしない / 実 API smoke 追加しない**。
> 目的: P4-e を「安全に本番 ON できる直前の状態」まで具体化。実装は §5 の最小 GO（guard 小改修＋tests）まで。
> 親: `docs/candidate-lens-phase4e-production-readiness-plan.md`。現行実装: `613e902e8`（flag 全 OFF）。

---

## 1. production enable 前チェックリスト（最終版）

> 全項目 ✅ で初めて「本番 ON GO」を CEO に上申できる。1 つでも未達なら **dev-only 維持**。

**GCP（CEO・Cloud Console / §2）— ★2026-06-19 完了**
- [x] G-1 API key restriction: Places API (New) に制限済
- [x] G-2 Places API (New) 有効・Place Details / Place Photos 利用可
- [x] G-3 per-API quota: 設定済
- [x] G-4 monthly budget ＋ アラート: 毎月 / 50% / 90% / 100% 設定済
- [x] G-5 emergency kill switch: **quota=0 → env off → flag false → key disable** の順で対応可（確認済）

**App（§3 / §5 で実装・別 GO）**
- [ ] A-1 production 排他を **専用 env gate `PLACE_DETAILS_ENRICH_PROD_ALLOWED`** に置換（`NODE_ENV!=="production"` を直接外さない）＋ tests
- [ ] A-2 fetch flag / UI flag の段階解除手順が確認済（fetch 先行→UI）
- [ ] A-3 production rollback 手順が確認済（§3-4）

**運用・検証（§4）**
- [ ] O-1 dev-only dogfood で ②③/fail-open/attribution/Powered by Google が継続正常
- [ ] O-2 honesty 定点（写真 attribution・Powered by Google・Wi-Fi/電源/静か/雰囲気の未確認維持）逸脱なし
- [ ] O-3 想定コストと budget 上限の合意

**法務（CEO）**
- [ ] L-1 attribution（authorAttributions / Powered by Google）とキャッシュ規約（placeId のみ保存・他は非永続）確認完了

---

## 2. GCP 側でCEOが手動確認/設定する項目（コードからは実施しない）

| 項目 | 具体設定（目安・本番で再調整） | 確認方法 |
|---|---|---|
| **API key restriction** | `GOOGLE_MAPS_API_KEY` → API restriction: **Places API (New)** のみ。Application restriction: サーバ egress IP 許可（client 非露出のためサーバ鍵運用） | Console > APIs & Services > Credentials |
| **Places API New scope** | Places API (New) 有効・Place Details / Place Photos が請求アカウントで課金可 | Console > Enabled APIs / smoke は追加しない（既に scope 確認済） |
| **Details / Photos quota** | Place Details: 例 **60/min・1,000/day**。Place Photo: 例 **60/min・1,000/day**（招待制で十分上限） | Console > Places API (New) > Quotas |
| **monthly budget alert** | Billing > Budgets: 例 **月 $30 上限**＋ 50%/90%/100% 通知（招待制想定 $0〜数$ に対し十分余裕） | Console > Billing > Budgets & alerts |
| **emergency kill switch** | ①**app**: flag false 再デプロイ（恒久・コード） ②**GCP**: 該当 API quota を 0 / キー一時無効（即時・デプロイ不要・最速） | 二系統を事前にドライ確認 |

> ★これらは **CEO が Cloud Console で実施**。本タスクでは触れない（GCP 設定変更禁止）。

---

## 3. app 側 小改修計画（実装は §5 の最小 GO）

### 3-1. 専用 env gate へ置換（`NODE_ENV!=="production"` を直接外さない）
現行（`lib/plan/candidateLens/placeDetailsEnrichment.ts`）:
```ts
export function isPlaceDetailsFetchEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_FETCH_ENABLED && process.env.NODE_ENV !== "production";
}
export function isPlaceDetailsUiEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_UI_ENABLED && process.env.NODE_ENV !== "production";
}
```
改修案（production 排他を**専用 env で明示許可した時だけ**解除・二重スイッチ）:
```ts
/** ★production で有効化を許す唯一の明示スイッチ（本番 env で "1" を投入した時だけ true）。 */
function isProdEnrichAllowed(): boolean {
  return process.env.PLACE_DETAILS_ENRICH_PROD_ALLOWED === "1";
}
/** dev は従来通り常に通過 / production は env 明示時のみ通過。 */
function envGateOpen(): boolean {
  return process.env.NODE_ENV !== "production" || isProdEnrichAllowed();
}
export function isPlaceDetailsFetchEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_FETCH_ENABLED && envGateOpen();
}
export function isPlaceDetailsUiEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_UI_ENABLED && envGateOpen();
}
```
- **不変点**: dev（NODE_ENV≠production）は挙動完全不変。const flag が false の間は全環境 OFF（＝今回 false のまま＝**本番 hard block 維持**）。
- **二重スイッチ**: 本番 ON には **const flag=true かつ env=`1`** の両方が要る（env 単独でも const 単独でも本番では有効化されない）＝誤有効化を構造的に防ぐ。
- **endpoint も連動**: `route.ts` は `isPlaceDetailsFetchEnabled()` を見るので追加改修不要（gate 経由で自動的に production 連動）。

### 3-2. fetch flag と UI flag の段階解除（本番）
1. GCP（§2）整備 → 本番 env に `PLACE_DETAILS_ENRICH_PROD_ALLOWED=1` 投入。
2. **fetch flag のみ true**（UI flag false）→ ②③ で fetch は走るが **UI は abstract のまま**＝課金観測のみ（shadow）。budget/quota 実数を数日監視。
3. 問題なければ **UI flag true** → dogfood に ②③ 実表示。
4. 各段は別デプロイ・各段で kill switch を即実行できる状態を維持。

### 3-3. production rollback
- 最速: GCP quota=0 / key 無効（即時・デプロイ不要）。
- app: `PLACE_DETAILS_ENRICH_PROD_ALLOWED` を外す or flag false 再デプロイ → 既存 UI 完全不変に復帰。
- 永続物ゼロ（DB/localStorage なし）→ データ rollback 不要。

---

## 4. dev-only dogfood 運用案（本番 ON 前の検証）

| 項目 | 値（目安・CEO 調整） |
|---|---|
| **対象人数** | 5〜15 名（招待制・知人）。dev 環境で flag ON（const true・NODE_ENV=dev） |
| **期間** | 約 2 週間の検証窓（延長可） |
| **1 日あたり API 上限** | app budget guard `ENRICHMENT_BUDGET_CAP`（現状 60/min・500/day・1,000/month）で頭打ち＋（本番時は）GCP quota。dogfood 実数想定 ~30〜80/day で余裕 |
| **監視項目** | Details/Photo の call 数・budget 消化率・HTTP/timeout エラー率・fail-open 発生率・honesty（attribution / Powered by Google 表示・未確認項目の非実値化） |
| **異常時停止条件** | budget 90% 到達 / error 率の急増 / quota 接近 / honesty 逸脱（attribution 欠落・未確認の実値化）/ 予期せぬ写真表示崩れ → **即 kill switch**（flag false or quota 0） |

> dogfood は **dev 環境**で行う（production には出さない）。実 API は走るが招待制・少人数・上限内で実質 $0〜数$。

---

## 5. 次に実装 GO 可能な最小 scope（production enable ではない）

> ★ここまでが「次の実装 GO」候補。**production readiness guard の小改修まで**。

- **実装する**: §3-1 の env gate 置換（`isProdEnrichAllowed` / `envGateOpen` 導入・2 関数差し替え）＋ unit tests:
  - dev（NODE_ENV≠production）: 挙動不変（const false → false / const true → true）。
  - production ＋ env 未設定: **false（hard block 維持）**。
  - production ＋ `PLACE_DETAILS_ENRICH_PROD_ALLOWED=1` ＋ const true: true。
  - production ＋ env=1 ＋ const false: **false**（const も必要＝二重スイッチ）。
- **実装しない（明示）**: const flag を true にしない / env を設定しない / GCP 触らない / 実 API smoke 追加しない / endpoint 改修不要。
- **効果**: コードは「本番 ON できる機構」を備えるが、**flag false ＋ env 未設定ゆえ production は依然 hard block**。以後は CEO が GCP 整備（§2）＋ env 投入＋ flag 段階解除で ON。
- 検証: tests/tsc/eslint・**flag OFF 完全不変の再確認**。footprint 0。

---

## 6. 何を満たせば本番 ON GO / 未達なら dev-only
- **GO 可**: §1 チェックリスト全 ✅（GCP G-1〜5・App A-1〜3・運用 O-1〜3・法務 L-1）。
- **dev-only 維持**: key restriction/quota/budget/kill switch のいずれか未整備 / env gate 改修未実装 / 法務未確認 / dogfood で honesty 逸脱や fail-open 不全。

> 本書は設計。**production 有効化・GCP/env/key/quota 変更・flag true・実 API smoke 追加は CEO GO まで行わない。**
