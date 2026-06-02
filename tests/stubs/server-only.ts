// vitest 用 no-op stub。
// `server-only` パッケージは bundler の react-server condition での置換前提で、
// 非置換環境（vitest/node）では無条件 throw する。test では server 限定マークを
// no-op に解決させる（production の Next.js bundler 挙動は不変）。
export {};
