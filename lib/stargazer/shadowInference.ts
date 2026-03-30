// lib/stargazer/shadowInference.ts
// シャドウコード推論エンジン — 三面鏡の乖離パターンからもうひとりのアーキタイプを推論する
// 心理学的根拠: ユング（影の理論）— 意識が拒絶し無意識に追いやった側面

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ArchetypeCode } from "./archetypeTypes";
import { getArchetypeByCode } from "./archetypeTypes";

export interface ShadowProfile {
  /** もうひとりのアーキタイプコード */
  shadowCode: ArchetypeCode;
  /** もうひとりのアーキタイプ名 */
  shadowName: string;
  /** もうひとりの自分が望んでいるもの */
  shadowDesires: string;
  /** もうひとりの自分が恐れていること */
  shadowFears: string;
  /** もうひとりの自分がどのように現れるか */
  manifestation: string;
  /** もうひとりの自分との統合のヒント */
  integrationHint: string;
  /** 乖離が最も大きい軸 */
  topDivergences: Array<{
    axis: TraitAxisKey;
    axisLabel: string;
    selfScore: number;
    shadowScore: number;
    gap: number;
    interpretation: string;
  }>;
  /** 確信度 */
  confidence: number;
}

/**
 * 三面鏡データからもうひとりのアーキタイプを推論する
 * selfScores = 自画像ミラーのスコア
 * footprintScores = 足跡ミラーのスコア
 * shadowPlayScores = 影絵ミラーのスコア
 */
export function inferShadowProfile(
  selfScores: Partial<Record<TraitAxisKey, number>>,
  footprintScores: Partial<Record<TraitAxisKey, number>>,
  shadowPlayScores: Partial<Record<TraitAxisKey, number>>,
  mainArchetypeCode: ArchetypeCode,
): ShadowProfile | null {
  // Compute divergences: where footprint/shadow MOST differ from self
  const divergences: Array<{
    axis: TraitAxisKey;
    axisLabel: string;
    selfScore: number;
    shadowScore: number;
    gap: number;
  }> = [];

  for (const axisDef of TRAIT_AXES) {
    const self = selfScores[axisDef.id];
    // Shadow score = weighted combination of footprint and shadow_play
    const fp = footprintScores[axisDef.id];
    const sp = shadowPlayScores[axisDef.id];
    if (self === undefined) continue;

    const shadowScore =
      fp !== undefined && sp !== undefined
        ? fp * 0.5 + sp * 0.5
        : fp ?? sp ?? undefined;

    if (shadowScore === undefined) continue;

    const gap = shadowScore - self;
    if (Math.abs(gap) > 0.2) {
      divergences.push({
        axis: axisDef.id,
        axisLabel: `${axisDef.labelLeft} ↔ ${axisDef.labelRight}`,
        selfScore: self,
        shadowScore,
        gap,
      });
    }
  }

  if (divergences.length < 3) return null;

  divergences.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  // Infer shadow code by inverting the main archetype
  // Simple but effective: flip each layer to its opposite
  const mainCode = mainArchetypeCode;
  const l1Map: Record<string, string> = { P: "B", B: "H", H: "P" };
  const l2Map: Record<string, string> = { E: "I", I: "S", S: "E" };
  const l3Map: Record<string, string> = { A: "D", D: "W", W: "A" };

  const shadowCode = (
    (l1Map[mainCode[0]] || "B") +
    (l2Map[mainCode[1]] || "I") +
    (l3Map[mainCode[2]] || "W")
  ) as ArchetypeCode;

  const shadowDef = getArchetypeByCode(shadowCode);
  if (!shadowDef) return null;

  // Generate shadow narrative
  const topDiv = divergences.slice(0, 5);
  const avgGap = topDiv.reduce((s, d) => s + Math.abs(d.gap), 0) / topDiv.length;

  const shadowDesires = generateShadowDesires(shadowCode);
  const shadowFears = generateShadowFears(mainCode);
  const manifestation = generateManifestation(topDiv);
  const integrationHint = generateIntegrationHint(mainCode, shadowCode);

  return {
    shadowCode,
    shadowName: shadowDef.name,
    shadowDesires,
    shadowFears,
    manifestation,
    integrationHint,
    topDivergences: topDiv.map((d) => ({
      ...d,
      interpretation:
        d.gap > 0
          ? `無意識はこの軸で右寄り（${TRAIT_AXES.find((a) => a.id === d.axis)?.labelRight}）に傾いている`
          : `無意識はこの軸で左寄り（${TRAIT_AXES.find((a) => a.id === d.axis)?.labelLeft}）に傾いている`,
    })),
    confidence: Math.min(0.85, avgGap * 1.2),
  };
}

function generateShadowDesires(shadowCode: ArchetypeCode): string {
  const l1 = shadowCode[0];
  const desires: Record<string, string> = {
    P: "認められたい、自分の価値を示したいという気持ち",
    B: "誰かと深く繋がりたいという強い気持ち",
    H: "安全で安心できる場所にいたいという強い気持ち",
  };
  return desires[l1] || "まだ言葉にできていない欲求";
}

function generateShadowFears(mainCode: ArchetypeCode): string {
  const l1 = mainCode[0];
  const fears: Record<string, string> = {
    P: "「結果を出さなきゃ自分の居場所がなくなる」という不安を、もうひとりの自分が抱えてる",
    B: "「繋がりを失ったらどうしよう」という痛みを、もうひとりの自分が引き受けてる",
    H: "「安全な場所が壊れたらどうしよう」という怖さを、もうひとりの自分が抱え込んでる",
  };
  return fears[l1] || "まだ見えていない不安";
}

function generateManifestation(
  divergences: Array<{ axis: TraitAxisKey; gap: number }>,
): string {
  const count = divergences.length;
  if (count >= 5)
    return "もうひとりの自分がいろんな場面で顔を出してる。自分では「そうじゃない」と思ってる方向に、無意識は強く傾いてるよ。";
  if (count >= 3)
    return "いくつかの場面で、自分が思ってるのと違う行動パターンが見えてる。それがもうひとりの自分の現れ方だよ。";
  return "もうひとりの自分の現れ方はまだかすか。観測を重ねると、もっとはっきり見えてくるよ。";
}

function generateIntegrationHint(
  mainCode: ArchetypeCode,
  shadowCode: ArchetypeCode,
): string {
  return `あなたの表の顔（${mainCode}）ともうひとりの自分（${shadowCode}）は正反対の方向を向いてる。もうひとりの自分を敵だと思わないで。「自分の中にもう一つの可能性がある」って認めることが第一歩だよ。もうひとりの自分が望んでることの中に、あなたがまだ認めてない本当の気持ちが隠れてるかもしれない。`;
}
