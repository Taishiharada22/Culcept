// tsc に vitest の test globals（describe / it / test / expect / beforeAll / beforeEach / afterAll / afterEach / vi 等）を認識させる。
//
// 背景: vitest.config は `globals: true`（テストは describe/it/expect を import 不要）だが、
// tsconfig に `compilerOptions.types` が無く `vitest/globals` の ambient 宣言が tsc scope に入らないため、
// globals 依存のテスト（import せず describe 等を使う記法）で TS2304 / TS2582「Cannot find name」が多発していた。
//
// この d.ts は `include: **/*.ts` で tsc に取り込まれ、`vitest/globals`（node_modules/vitest/globals.d.ts の
// `declare global { ... }`）を global scope に持ち込む。
//
// 不変条件:
//   - 型のみ（runtime emit なし）。vitest 実行環境・production bundle・app source に影響しない。
//   - 既存テストファイルは変更しない（明示 import 記法のテストとも共存）。
/// <reference types="vitest/globals" />
