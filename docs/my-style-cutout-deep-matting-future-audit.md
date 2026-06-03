# 【FUTURE / 未達成】Cutout 透過プロ級化（Deep Matting / AI 透過）別 audit

**状態**: **未着手・将来タスク**（CEO 指示で記録のみ・本セッションでは実装しない）
**起点記録**: 2026-06-01
**前提**: M3 / M4 で古典 heuristic（backgroundRemovalV1） + 控えめ post-process（cutoutPostProcess） + 復活ブラシ / 消しゴム（手動補正）まで到達済。 これ以上の品質を求める場合の選択肢。

---

## 1. なぜ別 audit が必要か

現状の cutout は外部 package なし・古典 heuristic + 手動補正で成立しているが、 構造的な限界がある（M3-0 docs § 2 で整理済）:

| # | 古典 heuristic の限界 | 結果 |
|---|---|---|
| D1 | 二値 mask（0/1）— 部分透明 alpha を扱えない | エッジに「ジャギー」「色フリンジ」「まだら残留」 |
| D2 | 色距離だけで判定 — テクスチャ/グラデ/影は色だけでは分けられない | グラデ背景の濃淡や紙背景 grain が flood-fill を止める |
| D3 | flood-fill の隔絶領域 | 服内の白タグ・裏地・小ボタンが「囲み穴」誤抜き |
| D4 | shadow pass の greedy 性 | 服の暗い縁や袖口が削られる |

D1 はとくに根本的で、 alpha matting / deep matting でしか本質解決できない。

---

## 2. audit 対象（CEO 指示の項目）

将来 audit が必要な項目:

```
RMBG / BiRefNet / Transformers.js / WebGPU / ライセンス / bundle size
```

### 2.1 候補モデル / ライブラリ
| 候補 | 種別 | 想定モデルサイズ | 動作環境 | 商用ライセンス | 服特化度 |
|---|---|---|---|---|---|
| **RMBG-2.0**（Briaai/HuggingFace） | ONNX matting | ~50MB | Transformers.js + WebGPU/WASM | 商用は要確認（Bria-AI 商用ライセンス） | 汎用物体（服含む） |
| **BiRefNet** | 双方向高精細 matting | ~40-90MB（variant あり） | Transformers.js | MIT / Apache（変種あり） | 汎用（服含む） |
| **@imgly/background-removal-js** | U²-Net | ~80MB | WASM | 要確認 | 汎用 |
| **MODNet (web)** | portrait matting | ~25MB | Transformers.js | Apache 2.0 | 人体専用（服単体不向き） |
| **rembg-webgpu** | 複数モデル選択可 | 30-150MB | WebGPU | モデル次第 | モデル次第 |

### 2.2 各候補で audit が必要な点
- **モデル容量と初回ダウンロード UX**: 30-150MB をユーザーに DL させる導線（事前ダウンロード / オンデマンド / Service Worker 永続化）
- **WebGPU 非対応端末への fallback**: WASM 退避 or 古典 heuristic 退避
- **商用ライセンス**: Aneurasync の用途で利用可能か（個別審査）
- **bundle size 影響**: 既存 6 MB 程度の bundle に対する増加
- **メモリ消費**: モバイル端末（特に旧 iOS）での OOM リスク
- **処理時間**: 768×768 画像で 1-3 秒の見込み、 UI ブロッキング回避（Web Worker）
- **私的データの取り扱い**: モデル推論はオンデバイスのため外部送信なし（プライバシー要件は満たす見込み・要確認）

### 2.3 統合方法の候補
| 案 | 概要 | リスク |
|---|---|---|
| **A. デフォルト deep matting + 古典フォールバック** | WebGPU 対応端末は deep、 非対応は古典 | 良いがバンドル増・初回 DL UX |
| **B. オプトイン（「もっと綺麗にする」ボタン）** | ユーザーが明示的に切替 | 既存 UX 維持・モデル DL がユーザー選択 |
| **C. サーバー処理** | API でモデル実行 | プライバシー懸念・コスト・現 M2 方針「外部 API なし」抵触 |

---

## 3. audit を始める際のチェックリスト

別 audit を起こす際の調査項目（M3/M4 の audit プロトコル踏襲）:

1. **読み取り監査**: 既存 backgroundRemovalV1 / cutoutBrowser / BackgroundRemover の接続点と、 deep matting を差し込む場所の特定
2. **モデル選定**: 上記 5 候補の現時点比較（精度ベンチマーク・サイズ・ライセンス）
3. **ライセンス確認**: 採用候補の商用利用条件と Aneurasync での適合性
4. **bundle 影響**: webpack/Next.js dynamic import で初期ロードに含めない方法、 Service Worker でモデルキャッシュ
5. **fallback 設計**: WebGPU 非対応 / モデル DL 失敗 / 推論失敗の三層 fallback（→ 古典 heuristic）
6. **UX 設計**: 初回 30-60 秒の DL を「素直に伝える」か「事前ダウンロード」か
7. **計測**: 既存古典との A/B（前景再現率・エッジ品質・処理時間・ユーザー満足度）
8. **段階導入**: feature flag で限定ユーザーに先行展開

---

## 4. 着手判断の閾値

以下のいずれかが当てはまった時に本 audit を起こす:

- ユーザーから「もっとプロ品質の透過がほしい」という具体要望が一定数集まる
- ベータ運用で復活ブラシの使用頻度が高く、 自動精度の根本改善が UX 上必要と判明
- WebGPU の端末普及率が一定水準を超え、 初回 DL の UX 受容性が高まる
- 商用ライセンスや bundle size の状況が好転（軽量モデル登場など）

---

## 5. 関連 docs

- `docs/my-style-cutout-quality-improvement-design.md` — M3/M4 の到達点と古典 heuristic 限界の整理
- M3-0 / M4-2 の文献ソース（Levin et al. closed-form matting / Brown CS / Transformers.js / rembg-webgpu / MDN）

---

## 6. やらないこと（記録時点）

- 本セッションでは **コード変更を一切しない**（docs only）
- 検討は将来別フェーズ。 今は古典 heuristic + 手動補正で十分という判定
- 急ぐ場合でも、 先に上記 audit を読み取りで完走させてから実装可否を判断
