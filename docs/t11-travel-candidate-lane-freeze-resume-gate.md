# Travel Candidate Lane Freeze + Resume Gate Decision（docs-only）

> Freeze + gate 定義フェーズ。**コード変更なし**。次ブランチ実装は CEO 承認後。
> 上位文脈: 候補レーン全体（envelope→C2→C3→C4→D→B2→B2-D→acceptance 設計）の凍結点。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. Freeze summary

| 部品 | commit | 種別 | 状態 |
|---|---|---|---|
| envelope / AB bridge（ScheduledDraftCandidateEnvelope） | `215fd491`/`d0ae3a61` | pure・server-only・未配線 | ✅ frozen |
| C2 converter types | `814f7988` | pure types | ✅ frozen |
| C3 converter helper（convertScheduledDraftEnvelopeToTravelCandidate） | `daf393db` | pure・insertion なし | ✅ frozen |
| C4 CandidateCollectionDraft + addTravelCandidateToCollectionDraft | `6bb433bc` | pure・TravelCorePlan 非変更・ranked:false | ✅ frozen |
| D DisplayCandidateCollection + dev preview | `bc56438b` | pure + flag-gated fixture | ✅ frozen |
| B2 CandidateDominanceOverlay | `18a852a9` | pure・Pareto advisory・未配線 | ✅ frozen |
| B2-D DisplayCandidateComparison + dev preview | `95c5e7b7`/`f0baa226` | pure + flag-gated fixture | ✅ frozen |
| acceptance boundary design | `b6f99db7` | **docs-only（型なし）** | ✅ frozen（設計のみ） |

- **完成**: 「scheduled draft → 明示変換 → core-types TravelCandidate → 非plan 保管 → client-safe 表示 → Pareto advisory 比較メモ → acceptance 意味論（散文）」。全 pure・大半 unwired・dev preview のみ flag-gated（fixture・default OFF）。
- **意図的に凍結**: acceptance 型/helper/persistence・S4 carry-in・C4-D TravelCorePlan 反映・B2-E engine/decision 配線・S5 replanning・production `/plan`。全て CEO gate 配下。

---

## 2. 現在の safe candidate lane（不変条件込み）

server-only scheduled draft envelope → 明示 conversion（捏造禁止）→ core-types TravelCandidate（未挿入）→ 非plan CandidateCollectionDraft（immutable・ranked:false）→ client-safe DisplayCandidateCollection（rank なし）→ advisory CandidateDominanceOverlay（Pareto・reorder/scalar なし）→ client-safe 比較メモ（「順位ではない」自然文）→ **docs-only acceptance 意味論（spotlighted/deferred/set_aside/undecided）**。**production state ゼロ**。

---

## 3. 現在の未解決 gate（全て by-design で不在）

- **capture/interaction consumer 不在**（select/保留/却下 を捕捉する UI が無い）
- acceptance 型 — by design 不在
- TravelCorePlan.candidates[] 反映 — by design 不在
- ranking/dominance 配線 — by design 不在
- S5 replanning — by design 不在
- persistence — by design 不在
- production `/plan` — by design 不在

---

## 4. Resume conditions（各 gate を開く前提）

| gate | 開く前に真であるべきこと |
|---|---|
| **acceptance types/helper** | (a) §2.12 命名/CoAlter 整合 CEO 確定 (b) capture consumer が roadmap 化 (c) per-viewer privacy 契約（単一 viewer rationale・rationale-less shared visibility）を型で強制 (d) S4 と同 gate 承認 |
| **S4 carry-in** | S4-B…G の凍結解除（`docs/t11-s4-…` の CEO gate）+ carry-into-S4 が **fail-closed・明示ユーザー行為**として設計 + readiness `selected` と非衝突確認 |
| **C4-D TravelCorePlan reflection** | candidates[] を**読む runtime consumer**が実在 + insertion adapter（C4 設計）の CEO 承認 + 重複/型 fail-closed 維持 |
| **B2-E engine/decision wiring** | multi-candidate **generation** が実在（fixture でなく）+ dominance を読む層の必要性確認 + decision-core 自動判定と user-acceptance の分離維持 |
| **S5 replanning** | 受理/保存された candidate が実在（acceptance + persistence 先行）+ 最小摂動再計画の独立設計 |
| **production `/plan`** | 上記の安全層 + real-entity retrieval + real-user-input provider + Tier1 安全境界（外部 link/booking）の承認 |
| **persistence** | acceptance 意味論確定 + per-viewer privacy の DB スキーマ承認 + CEO の DB マイグレーション承認（CLAUDE.md §1） |

---

## 5. Capture consumer requirement

- **定義**: candidate に対するユーザーの **選ぶ/保留/却下** を実際に**捕捉**する surface（現状の dev preview は read-only で**捕捉しない**）。
- **なぜ acceptance 実装が待つべきか**: 捕捉先が無い acceptance 型/helper/persistence は**供給先の無い第 3 の未消費 overlay**になり、honest-audit（2026-06-14）が指摘する「brain deep, world-connection missing」を悪化させる。実装は capture consumer が roadmap に乗ってからが外科的。
- **将来の capture surface 候補**:
  - dev preview の **button-free capture mock**（観測のみ・送信なし） — 最初の安全な実験先候補
  - 明示 form/input — 本番 UI 前段
  - CoAlter prompt capture（`userAction` 既存語彙との整合要） — **HOLD**（CoAlter runtime 凍結中）
  - production `/plan` UI action — **HOLD**（production 非接触）
- **HOLD**: CoAlter prompt capture / production `/plan` UI action（runtime/production gate）。dev preview capture mock のみ将来の最小実験候補。

---

## 6. Boundary safety invariants（凍結中も恒久遵守）

- `spotlighted` は readiness の `selected`（`engine.ts:50`→`assessReadiness`→`hasActionAuthority` 予約 gate）に**決してならない**。
- `deferred` は `schedule_hold`（commit rank2）を**意味しない**。
- `set_aside` は**削除しない**（注記のみ・可逆）。
- `undecided` は**不在**（操作でない・consent でない）。
- **action authority なし**・**booking/calendar authority なし**。
- **client-only privacy filtering 禁止**（filtering は server 完了）。
- **private rationale（`forParticipant`・`forced_by_private_constraint`）漏洩なし**（単一 viewer rationale・shared visibility は rationale-less）。
- **自動 cross-viewer convergence なし**（hint は将来・両者 spotlighted のみ・mutual deferred/set_aside で不発・当面 DEFERRED）。
- **別 GO なしに acceptance persistence しない**。
- **UI copy 注意（CEO 補正・将来 UI 用に保全）**: `spotlighted` のトークンは保持しつつ、UI 文言は **「気になる」「注目」「候補として見る」「この案を見ておく」**。**「選択済み」「決定」「この案にする」「確定」「予約する」「実行する」は禁止**（「選択」は決定/確定を含意し、`spotlighted`=可逆な per-viewer lean と矛盾するため）。

---

## 7. 次 Travel ブランチ比較

| 案 | 内容 | 評価 |
|---|---|---|
| A. real entity retrieval Tier1 設計 | fixture の場所 → 実 entity を pipeline へ | honest-audit critical path の 1 つ。世界接続。だが外部取得は Tier1 境界要 |
| **B. production travel input/provider preflight** | 実ユーザー入力（intake/制約/居住地）を pipeline へ供給する境界設計 | **critical path のもう 1 つ。fixture 依存を解消する起点。downstream 解錠が最大** |
| C. S5 replanning 設計 | 受理候補の再計画 | **後**（acceptance + persistence 前提・依存未成熟） |
| D. safe links / Maps URL 設計 | 「予約直前まで→hand off」の外部 link 安全境界（Tier1） | 製品の terminal（hand-off）。外部・高 gate。input/entity が無いと出口だけ先行 |
| E. capture consumer 無しで acceptance 型を続行 | — | ✗ §5 の通り未消費 overlay 増・非推奨 |

---

## 8. Recommendation

- **候補レーンの実装は凍結**（本書）。E（capture consumer 無しの acceptance 続行）は**しない**。
- **次 Travel ブランチ（CEO priority 次第の二択）**:
  - **第一推奨: B — production travel input/provider preflight（docs-only）**。理由（⑤）: 全パイプラインが fixture 給餌で、real-user-input provider は honest-audit の critical path。実入力が入れば既存の C3→C4→D→B2→B2-D が実データで意味を持ち、acceptance/ranking/S5 の前提（実候補）も揃う。downstream 解錠が最大・外科的。
  - **代替: D — Tier1 safe links / Maps URL 設計（docs-only）**。CEO が「hand-off 体験（予約直前まで→外部で予約）」を優先するなら。外部・高 gate ゆえ Tier1 安全境界設計から。
- **本セッションから Stargazer / weekday Plan には戻らない**（CEO 指示）。

---

## 9. Verification summary

- **latest commits**: `b6f99db7`（acceptance 設計・docs）← `f0baa226`/`95c5e7b7`（B2-D）← `18a852a9`（B2）← `bc56438b`（D）← `6bb433bc`（C4）← `daf393db`（C3）← `814f7988`（C2）← `d0ae3a61`（A+B）。
- **test counts**: 候補レーン新規 = A+B 10 / C2 4 / C3 14 / C4 13 / D 35 / B2 20 / B2-D1-3 17 / B2-D4-5 14。
- **tsc baseline**: **55（不変）**。
- **full suite**: **21448 passed / 1 skipped / 0 failed**（1107 files・直近実行）。
- **tree clean**: yes（commit 済み・未追跡なし）。
- **no push**: yes（全 local・push なし・production 非接触）。

---

## 10. Stop

- 本書（Freeze + Resume Gate Decision）で**停止**。
- 次ブランチ（B or D）の実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **Freeze**: 候補レーン（envelope→C2→C3→C4→D→B2→B2-D→acceptance 設計）を凍結。完成＝fixture 駆動の安全な「生成手前→構築→保管→表示→比較→acceptance 意味論」。production state ゼロ・tsc 55・full suite green・tree clean・push なし。
- **Resume gate**: acceptance 型/helper・S4 carry-in・C4-D・B2-E・S5・production `/plan`・persistence の各々に開放前提を定義。共通の鍵＝**capture/interaction consumer の実在**と各 CEO gate。
- **Boundary invariants**: `spotlighted`≠readiness selected / `deferred`≠schedule_hold / `set_aside` 非削除 / `undecided`=不在 / authority・booking なし / private 非漏洩 / auto cross-viewer なし / 別 GO なし persistence なし。UI copy=「気になる/注目/候補として見る/この案を見ておく」（「選択/決定/確定/予約/実行」禁止）。
- **推奨次ブランチ**: **B（production travel input/provider preflight）第一推奨**、代替 **D（Tier1 safe links/Maps URL）** — CEO priority 次第。Stargazer/weekday Plan には戻らない。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
