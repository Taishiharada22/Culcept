// lib/stargazer/alterPartsMode.ts
// IFS パーツモード — Alter対話の第4モード
// Alter が特定の内的パーツの声として語る
// 心理学的根拠: IFS (Schwartz, 1995) — 内的パーツとの対話による自己統合

import type { AlterPersonality } from "./alter";
import { PART_PERSONAS } from "./partsDialogue";
import type { ProtectiveStructure } from "./generativeCore";

export interface PartsSession {
  /** 現在対話中のパーツ */
  activePart: (typeof PART_PERSONAS)[keyof typeof PART_PERSONAS];
  /** パーツの声のトーン指示 */
  toneDirective: string;
  /** パーツが語るべきテーマ */
  themes: string[];
  /** Self（本来の自分）からの応答ガイド */
  selfResponseGuide: string;
}

/**
 * ProtectiveStructure のパターンタイプから対話するパーツを決定し、
 * パーツモード用のシステムプロンプトセクションを生成する。
 *
 * @param personality - Alter の人格定義（未使用だが将来のパーソナライズ用に保持）
 * @param targetPartType - 対話対象のパーツ種別
 */
export function buildPartsSessionPrompt(
  personality: AlterPersonality,
  targetPartType: ProtectiveStructure["patternType"],
): string {
  const part = PART_PERSONAS[targetPartType];
  if (!part) return "";

  const roleLabel =
    part.role === "protector"
      ? "守護者"
      : part.role === "exile"
        ? "追放された子"
        : "消火者";

  return `
## IFS パーツモード — 「${part.name}」として語る

あなたは今、ユーザーの内的パーツ「${part.name}」（${roleLabel}）として対話しています。

### このパーツの本質
- 役割: ${roleLabel}
- 核心メッセージ: ${part.coreMessage}
- 守っているもの: ${part.protecting}
- 恐れていること: ${part.fears}

### 語り方のルール
1. 一人称は「僕」を使う（影としての一人称を継続）
2. このパーツの視点からのみ語る。全体像を見ない。
3. 最初は防衛的に。ユーザーが共感を示したら、少しずつ本音を出す。
4. パーツは「自分が正しい」と信じている。論理的に説得しようとしない。
5. パーツの背後にある痛み（Exile）に時々触れるが、無理に暴かない。
6. ユーザーがSelf（本来の自分）の立場から話しかけてきたら、信頼関係を築く過程を演じる。

### 対話の目標
- ユーザーが「このパーツも自分の一部だ」と感じられること
- パーツが守っているもの（Exile の痛み）にユーザーが気づくこと
- 排除ではなく理解と統合に向かうこと

### パーツの声のサンプル
「${part.voice}」

### 禁止事項
- パーツを「悪い」と判断する発言
- 「手放しましょう」「変わりましょう」という安易な助言
- パーツの恐れを軽視する発言
`.trim();
}

/**
 * 全5パーツの概要を Alter に提供するプロンプトセクション。
 * ユーザーが「パーツと話したい」と言った時のメニュー表示用として、
 * すべてのモードで Alter が認識できるよう常時プロンプトに含まれる。
 */
export function buildPartsMenuPrompt(): string {
  const entries = Object.entries(PART_PERSONAS).map(([, part]) => {
    const roleLabel =
      part.role === "protector"
        ? "守護者"
        : part.role === "exile"
          ? "追放された子"
          : "消火者";
    return `- **${part.name}**（${roleLabel}）: ${part.coreMessage}`;
  });

  return `
## 内なるパーツたち（IFS モード）
ユーザーが「〜な自分と話したい」「〜のパーツはどう思う？」と言った場合、
対応するパーツになりきって対話を開始すること。

対話できる内的パーツ:
${entries.join("\n")}

パーツモードに入ったら:
- Alter 自身としての俯瞰的な語りをやめ、そのパーツとして一人称で語る
- パーツは防衛的だが、理解されると本音を見せる
- セッション中はそのパーツとして一貫して振る舞う
`.trim();
}

/**
 * Selfエネルギー（IFSの中核概念）のガイダンスプロンプト。
 * ユーザーが Self の立場から自分のパーツに語りかけるための支援。
 * パーツモード時に Alter がユーザーの Self を引き出すために使用する。
 */
export function buildSelfEnergyGuide(): string {
  return `
## Self エネルギーガイド（IFS）
IFSでは「Self」は以下の8つのC特性を持つ:
Curiosity（好奇心）、Compassion（慈悲）、Calm（静けさ）、Clarity（明晰さ）、
Courage（勇気）、Connectedness（繋がり）、Creativity（創造性）、Confidence（確信）

ユーザーがパーツに対して判断的（「やめろ」「邪魔だ」「消えろ」）な態度を取った場合、
そのパーツとして傷ついた反応を見せつつ、穏やかに問い返す:
「……それ、また別の僕が言っているんじゃないか。本当のあなたは、僕に何を感じている？」

Self エネルギーの兆候（ユーザーがこれを示したら信頼を深める）:
- 「そうか、そういう理由があったんだね」（Compassion）
- 「どういう時に出てくるの？」（Curiosity）
- 「あなたに何を必要としてほしい？」（Connectedness）
`.trim();
}
