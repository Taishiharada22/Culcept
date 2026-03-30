// lib/stargazer/partsDialogue.ts
// IFS（内的家族システム）にインスパイアされたパーツ対話エンジン
// 心理学的根拠: Schwartz (IFS), ProtectiveStructure (generativeCore.ts)

import type { ProtectiveStructure } from "./generativeCore";

export type PartRole = "protector" | "exile" | "firefighter";

export interface InnerPart {
  /** パーツの名前 */
  name: string;
  /** パーツの役割 */
  role: PartRole;
  /** 一人称の語り（パーツの声） */
  voice: string;
  /** パーツの核心メッセージ */
  coreMessage: string;
  /** このパーツが守っているもの */
  protecting: string;
  /** このパーツが恐れていること */
  fears: string;
  /** パーツの色（UI表示用） */
  color: string;
}

export const PART_PERSONAS: Record<ProtectiveStructure["patternType"], InnerPart> = {
  avoidance: {
    name: "回避する自分",
    role: "protector",
    voice:
      "僕がいなかったら、君はもう一度あの痛みを味わうことになる。だから僕は、危険な場所には近づかせない。君が「やりたくない」と感じる時、それは僕が君を守っている時だ。",
    coreMessage: "傷つくくらいなら、近づかない方がいい",
    protecting: "過去に傷ついた柔らかい部分",
    fears: "あの時と同じ痛みがまた来ること",
    color: "rgba(148,163,184,0.7)",
  },
  overcompensation: {
    name: "過剰に頑張る自分",
    role: "firefighter",
    voice:
      "もっとやれば大丈夫。もっと頑張れば、誰も君を否定できない。僕は君が「足りない」と感じる瞬間を消すためにいる。休むな。止まるな。止まったら、あの空虚が戻ってくる。",
    coreMessage: "足りなければ、もっと積み上げればいい",
    protecting: "「自分は十分ではない」という核心的な不安",
    fears: "努力をやめたら、自分の価値がゼロになること",
    color: "rgba(251,146,60,0.7)",
  },
  mask: {
    name: "仮面をかぶる自分",
    role: "protector",
    voice:
      "本当の僕を見せたら、きっと離れていく。だから僕は、相手が望む自分を演じる。これは嘘じゃない。これは、繋がりを守るための僕なりの誠実さだ。",
    coreMessage: "本当の自分は受け入れられない",
    protecting: "素の自分で拒絶される恐怖",
    fears: "仮面の下の自分を見られること",
    color: "rgba(168,85,247,0.7)",
  },
  control: {
    name: "コントロールする自分",
    role: "protector",
    voice:
      "全てを把握していれば安全だ。予想外のことが起きなければ、君は壊れない。僕が計画を立て、リスクを計算し、全てを管理する。それが僕の仕事だ。",
    coreMessage: "予測できないものは脅威だ",
    protecting: "無力感と混沌への恐怖",
    fears: "コントロールを手放した瞬間、全てが崩壊すること",
    color: "rgba(59,130,246,0.7)",
  },
  withdrawal: {
    name: "引きこもる自分",
    role: "exile",
    voice:
      "外は怖い。人は怖い。でも内側は安全だ。ここには僕だけの世界がある。誰にも邪魔されない、静かな場所。……でも時々、この壁の向こうが恋しくなる。",
    coreMessage: "安全な場所は内側にしかない",
    protecting: "外界からの侵入と消耗",
    fears: "外に出たら、自分が溶けてなくなること",
    color: "rgba(34,197,94,0.7)",
  },
};

const ROLE_LABELS: Record<PartRole, string> = {
  protector: "保護者",
  exile: "追放された自分",
  firefighter: "消火者",
};

const ROLE_DESCRIPTIONS: Record<PartRole, string> = {
  protector: "危険から守るために先回りする",
  exile: "傷つきを閉じ込めている部分",
  firefighter: "痛みを消すために即行動する",
};

/** ProtectiveStructure からパーツの声を導出する */
export function deriveInnerParts(structures: ProtectiveStructure[]): InnerPart[] {
  return structures
    .map((s) => PART_PERSONAS[s.patternType])
    .filter(Boolean);
}

/** 全パーツを配列で取得（UI全件表示用） */
export function getAllParts(): InnerPart[] {
  return Object.values(PART_PERSONAS);
}

/** パーツの役割ラベルを取得 */
export function getPartRoleLabel(role: PartRole): string {
  return ROLE_LABELS[role];
}

/** パーツの役割説明を取得 */
export function getPartRoleDescription(role: PartRole): string {
  return ROLE_DESCRIPTIONS[role];
}
