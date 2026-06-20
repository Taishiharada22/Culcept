# Alter タブ アセット（W1 整理記録・2026-06-12）

## runtime で実使用（削除・移動禁止）
- `processed/body.png` / `processed/heart.png` — `HumanBatteryFigure.tsx` が静的 import（ビルド時バンドル）
- `over.png` — dev preview（`/plan/dev-alter-tab?overlay=`）の位置合わせ overlay 専用。本番 UI では不使用

## 原本（superseded・参照用）— runtime/ビルド非配線
- `human-body-base.png` / `body-mask.png` / `brain-mask.png` / `heart-mask.png` / `glow-noise-texture.png` / `processed/body-mask.png`
- 用途: `_processAssets.mjs`（手動一回性ツール: `node _processAssets.mjs` → `./processed/*.png` 再生成）の入力。
  人体アセットを再調整する場合のみ必要。どのモジュールからも import されない（バンドル外）。
- W1 判断（CEO 指示 8）: いきなり削除しない。再生成経路を壊さないため現位置に残置し、本 README を superseded 記録とする。
  削除 or docs/assets 退避は将来の衛生判断（repo 重量 ≈5.6MB が問題になった時点で再判断）。
