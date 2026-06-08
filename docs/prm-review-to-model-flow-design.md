# PRM Review-to-Model Flow — 次フェーズ設計（A1-7-31+・**全 stop gate・設計のみ**）

状態: **設計提出のみ**。本書の各フェーズ実装は CEO 承認 stop gate（M2/M3 apply / review UI・route / PRM persistence 実ユーザー有効化）。A1-7-30 までで write/read の部品は全て揃った（未配線）。

---

## 0. 現在地（A1-7-30 まで）
```
M1 events(staging 適用済・dogfood 蓄積中) → reader → aggregate(dedupe) → proposals
   [部品 ready・未配線] M2 write(mapper/fake/Supabase) / M3 write(mapper/fake/Supabase)
   [draft] M2/M3 migration / [可視化] dev-learning-observation
```
残るは **配線 + apply + review 入口**＝全て gate。

## 1. A1-7-31（gate）: M2/M3 staging apply
- **内容**: prm_review_decisions(M2)→prm_model_entries(M3) を staging に apply（**FK 依存ゆえ M2 先**）。M1 同手順（migration list→dry-run→db push→post-apply smoke）。
- **gate 理由**: DB schema 変更（staging）。M1 apply（A1-7-21）と同じ CEO 承認案件。
- **stop 条件**: dry-run で M2/M3 以外 / FK 順序違反 / smoke 失敗 / production ref。
- **CEO 判断**: apply するか / タイミング（review UI の前か後か）。

## 2. A1-7-32（gate）: Review flow route + UI
- **内容**: 人間が proposal（candidate）を review し decision（approve/reject/defer）を入れる入口。decision → M2 insert（A1-7-30 repo）→ **approve なら M3 entry insert**（review_decision_id FK）。
- **配線**: dev-learning-observation（A1-7-28）に review ボタンを足す or 別 operator dashboard。route（POST /api/reality/review-decision）で M2/M3 repo を呼ぶ（flag-gated・fail-open）。
- **gate 理由**: route 実装 + UI + **大きな仕様判断**。
- **★CEO 仕様判断（要確認）**:
  1. **誰が review するか**: operator（=CEO・推論品質検証）先行か / user（第二の自己 confirm/correct）も即か。dogfood 初期は **operator-only** 推奨（品質を見てから user review を開く）。
  2. **どの UI**: dev-learning-observation 拡張（dev 限定）か / 専用 operator dashboard か。
  3. **review 単位**: candidate proposal 単位（fingerprint）。blocked は対象外（observation 止まり）。
  4. **flag**: REALITY_REVIEW_WRITE（default OFF・staging only・M1 と同パターン）。
- **stop 条件**: raw/seedRef 混入 / certainty high / reviewRequired 迂回 / production。

## 3. A1-7-33（gate）: PRM model 読み + 第二の自己 surfacing
- **内容**: M3 prm_model_entries（review 済 tendency）を read し、**ユーザーが見る「第二の自己」** として surface（「あなたは午後の提案を見送りやすい傾向」等・tendency framing・断定しない）。
- **gate 理由**: **PRM model persistence を実ユーザー向けに有効化する判断**（CEO 明示 stop gate）。実ユーザーに tendency を見せる＝対外影響。
- **★CEO 判断**: いつ・誰に・どの表現で第二の自己を見せるか。Aneurasync 哲学（「自分って、そういう人間だったのか」）の核。dogfood で operator が品質確認 → user 公開は慎重に。
- **安全**: certainty 表示（最大 tentative）・stillPossible 併記・user_correction 導線・decay。

---

## 4. 推奨順序 + 安全契約
1. **A1-7-31 M2/M3 apply**（staging・gate）→ 2. **A1-7-32 review flow**（operator-only・flag OFF・gate）→ dogfood で operator が proposal を review・M2/M3 に蓄積を観測 → 3. **A1-7-33 第二の自己 surfacing**（user 公開・最も慎重・gate）。
- **全フェーズで維持**: reviewRequired（自動学習なし）・certainty no high・raw/seedRef 非保存・owner-RLS・tendency-not-trait・可逆（supersedes/retracted/user_correction）・production 不接触。

## 5. CEO へ: 次に決めるべきこと
- **(a)** A1-7-31 M2/M3 staging apply を承認するか（M2→M3 順・staging のみ）。
- **(b)** A1-7-32 review の **reviewer（operator-only か user も）** と **UI（dev-preview 拡張 か dashboard）**。
- **(c)** A1-7-33 第二の自己 surfacing を実ユーザーに見せる判断（最も慎重・哲学の核）。

いずれも production には進まない。dogfood（staging）は継続。
