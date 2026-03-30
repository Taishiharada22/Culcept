// app/stargazer/_components/SecondaryTypesDisplay.tsx
// 旧12星座 2位・3位表示 — 旧タイプシステム除去済みのためスタブ化
"use client";

interface TypeMatch {
  code: string;
  label: string;
  emoji: string;
  score: number;
}

interface Props {
  topMatches: TypeMatch[];
  lightMode?: boolean;
}

export default function SecondaryTypesDisplay(_props: Props) {
  // Old type system has been removed.
  return null;
}
