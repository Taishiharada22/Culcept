// lib/rendezvous/faceTypes.ts
// クライアントセーフな顔タイプ定数（"server-only" なし）
// faceTypeClassifier.ts のサーバー専用ロジックから分離

export type FaceTypeId =
  | "lumiere"     // 曲線 × フレッシュ × 温
  | "bloom"       // 曲線 × フレッシュ × 涼
  | "terre"       // 曲線 × ディープ × 温
  | "aurora"      // 曲線 × ディープ × 涼
  | "prism"       // 直線 × フレッシュ × 温
  | "silhouette"  // 直線 × フレッシュ × 涼
  | "ember"       // 直線 × ディープ × 温
  | "monolith";   // 直線 × ディープ × 涼

export type FaceTypeInfo = {
  id: FaceTypeId;
  name: string;
  nameJa: string;
  description: string;
  detailedDescription: string;
  keywords: string[];
};

export const FACE_TYPES: Record<FaceTypeId, FaceTypeInfo> = {
  lumiere: {
    id: "lumiere",
    name: "Lumière",
    nameJa: "リュミエール",
    description: "ふわっと柔らかい光をまとった、自然体の親しみやすさ",
    detailedDescription: "一緒にいると心がほぐれる、日だまりのような存在。笑顔に嘘がなく、飾らない優しさが自然ににじみ出る。初対面でもどこか懐かしい安心感がある人。",
    keywords: ["親しみ", "柔らかい", "明るい", "温かい", "自然体"],
  },
  bloom: {
    id: "bloom",
    name: "Bloom",
    nameJa: "ブルーム",
    description: "透き通った爽やかさと、思わず目を奪われる華やかさ",
    detailedDescription: "清潔感と透明感が印象的で、その場の空気を明るくする人。派手ではないのに目が離せない、花が咲くような存在感。健康的な美しさに惹かれる人向け。",
    keywords: ["爽やか", "透明感", "華やか", "清潔感", "健康的"],
  },
  terre: {
    id: "terre",
    name: "Terre",
    nameJa: "テール",
    description: "どっしりとした安心感と、包み込むような深い優しさ",
    detailedDescription: "落ち着いた雰囲気で、一緒にいると地に足がつく感覚。多くを語らなくても伝わる包容力があり、困った時に頼りたくなる大地のような存在。",
    keywords: ["安定", "包容力", "落ち着き", "深み", "頼りがい"],
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    nameJa: "オーロラ",
    description: "ふとした瞬間に引き込まれる、奥行きのある神秘的な魅力",
    detailedDescription: "見るたびに新しい表情を見せる、つかみどころのない美しさ。静かだけど強い引力があり、「もっと知りたい」と思わせる人。ミステリアスな空気に惹かれる人向け。",
    keywords: ["神秘的", "奥行き", "引力", "クール", "知りたくなる"],
  },
  prism: {
    id: "prism",
    name: "Prism",
    nameJa: "プリズム",
    description: "見る角度で表情が変わる、エネルギッシュで多面的な魅力",
    detailedDescription: "笑った顔、真剣な顔、ふざけた顔、全部が別人みたいに魅力的。一緒にいると飽きない、変化し続けるエネルギーの持ち主。刺激的な関係を求める人向け。",
    keywords: ["活発", "多面的", "エネルギッシュ", "変化", "刺激的"],
  },
  silhouette: {
    id: "silhouette",
    name: "Silhouette",
    nameJa: "シルエット",
    description: "無駄のない洗練されたオーラと、都会的なシャープさ",
    detailedDescription: "佇まいだけで絵になる、計算されていない洗練。クールな印象だけど、ふとした隙に見せる素顔にギャップがある。スマートな雰囲気に惹かれる人向け。",
    keywords: ["洗練", "モダン", "シャープ", "都会的", "ギャップ"],
  },
  ember: {
    id: "ember",
    name: "Ember",
    nameJa: "エンバー",
    description: "静かに燃える情熱と、芯の強さからにじむ温もり",
    detailedDescription: "派手さはないけれど、目の奥に強い意志と温かさを感じる人。熱量を内に秘めていて、深く付き合うほどその魅力に気づく。じわじわ惹かれるタイプ。",
    keywords: ["情熱", "力強い", "温もり", "芯の強さ", "じわじわ"],
  },
  monolith: {
    id: "monolith",
    name: "Monolith",
    nameJa: "モノリス",
    description: "圧倒的な存在感と、知性が生み出すカリスマ性",
    detailedDescription: "その場にいるだけで空気が変わる、唯一無二の存在感。知性と自信が自然に滲み出ていて、「この人についていきたい」と思わせる。強いリーダーシップに惹かれる人向け。",
    keywords: ["存在感", "カリスマ", "知性", "威厳", "リーダーシップ"],
  },
};
