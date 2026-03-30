export type SeekBlock = {
    hard_include: string[];
    soft_include: string[];
    hard_exclude: string[];
    soft_exclude: string[];
    handshake_rules: string[];
};

export type IAmProfile = {
    lanes: string[];
    likes: string[];
    avoid: string[];
    silhouette_pref: string | null;
    material_pref: string | null;
    tags: string[];
};

export type StyleDna = {
    body_type: string | null;
    body_subtype: string | null;
    pc_season: string | null;
    pc_base: string | null;
    top_lanes: string[];
    style_score: number;
};

export type TasteLayers = {
    layer_7d: Record<string, number>;
    layer_30d: Record<string, number>;
    layer_180d: Record<string, number>;
    updated_at: string | null;
};

export type SeekResponse = {
    ok?: boolean;
    enabled?: boolean;
    seek?: {
        seek_people: SeekBlock;
        seek_market: SeekBlock;
        is_public: boolean;
        handshake_people: string[];
        handshake_market: string[];
        updated_at: string | null;
    };
    i_am?: IAmProfile;
    taste_layers?: TasteLayers;
    style_dna?: StyleDna;
};

export type PresenceResolvedResponse = SeekResponse & {
    ok: true;
    enabled: true;
    seek: NonNullable<SeekResponse["seek"]>;
    i_am: NonNullable<SeekResponse["i_am"]>;
    taste_layers: NonNullable<SeekResponse["taste_layers"]>;
    style_dna: NonNullable<SeekResponse["style_dna"]>;
};

export const KNOWN_LANES = [
    "minimal",
    "street",
    "vintage",
    "sporty",
    "luxury",
    "daily",
    "elegant",
    "workwear",
    "outdoor",
] as const;

export const TAG_LABELS: Record<string, string> = {
    minimal: "ミニマル",
    street: "ストリート",
    vintage: "ヴィンテージ",
    sporty: "スポーティー",
    luxury: "ラグジュアリー",
    daily: "デイリー",
    elegant: "エレガント",
    workwear: "ワークウェア",
    outdoor: "アウトドア",
    monotone: "モノトーン",
    justsize: "ジャストサイズ",
    simple: "シンプル",
    highbrand: "ハイブランド",
    onepoint: "ワンポイント",
    used: "古着",
    vividcolor: "ビビッドカラー",
    colorfull: "カラフル",
    earthcolor: "アースカラー",
    natural: "ナチュラル",
    autumn: "Autumn",
    refined: "洗練",
    clean: "クリーン",
    quiet: "静けさ",
    classic: "クラシック",
    modern: "モダン",
    quality: "品質重視",
    structure: "構築的",
    structured: "構築的",
    luxuryfeel: "高級感",
    neutral: "ニュートラル",
};

const FIRST_IMPRESSION =
    "完成度の高い空気感をまとっている。言葉が少なくても、佇まいだけで説得力がある。「この人は何かを分かっている」と感じさせるタイプ";

const CHARM =
    "ノイズを排除できる審美眼と、自分の基準を静かに貫く芯の強さ。一緒にいると、周囲の美意識まで自然と引き上がる";

const DEEPER_TRUTH =
    "一見クールに見えるが、美しいものへの感動は人一倍深い。ただ、それを表に出さないから周囲には伝わりにくい";

const SELF_IMAGE = "合理的で冷静、感情に振り回されない人間";
const OTHERS_IMAGE = "何を考えているか分からない、でも確実にセンスがある人";

const ATTRACTED =
    "自分だけの基準を持ち、それを押しつけない人。静かな強さに惹かれる。特にミニマル、きれいめ、ラグジュアリー——そういう人に無意識に引き寄せられる";

const COMMON_MISUNDERSTANDING =
    "あなたは自分を「合理的で冷静」だと思っているが、相手は「何を考えているか分からない」と感じている。このズレが、すれ違いの種になることが多い";

export const PRESENCE_API_FALLBACK: PresenceResolvedResponse = {
    ok: true,
    enabled: true,
    i_am: {
        lanes: ["minimal", "elegant", "luxury"],
        likes: ["monotone", "justsize", "simple", "highbrand", "onepoint"],
        avoid: ["vividcolor", "used", "sporty"],
        silhouette_pref: "justsize",
        material_pref: "cotton",
        tags: [
            "minimal",
            "elegant",
            "luxury",
            "monotone",
            "justsize",
            "simple",
            "highbrand",
            "onepoint",
            "clean",
            "refined",
            "quiet",
            "classic",
            "modern",
            "quality",
            "natural",
            "autumn",
        ],
    },
    style_dna: {
        body_type: "natural",
        body_subtype: null,
        pc_season: "autumn",
        pc_base: "warm",
        top_lanes: ["minimal", "elegant", "luxury"],
        style_score: 65,
    },
    seek: {
        seek_people: {
            hard_include: ["minimal", "elegant"],
            soft_include: ["luxury", "simple"],
            hard_exclude: ["workwear", "outdoor"],
            soft_exclude: ["vividcolor", "used"],
            handshake_rules: [],
        },
        seek_market: {
            hard_include: ["minimal", "luxury"],
            soft_include: ["elegant", "simple"],
            hard_exclude: ["workwear", "sporty"],
            soft_exclude: ["vividcolor", "used"],
            handshake_rules: [],
        },
        is_public: true,
        handshake_people: [],
        handshake_market: [],
        updated_at: "2026-03-07T00:00:00.000Z",
    },
    taste_layers: {
        layer_7d: {
            minimal: 8.9,
            elegant: 7.8,
            monotone: 7.3,
            luxury: 6.2,
            simple: 5.8,
            justsize: 5.5,
        },
        layer_30d: {
            minimal: 8.4,
            elegant: 7.4,
            luxury: 6.1,
            simple: 5.9,
            monotone: 5.7,
        },
        layer_180d: {
            minimal: 7.9,
            elegant: 7.1,
            luxury: 5.8,
            simple: 5.1,
        },
        updated_at: "2026-03-07T00:00:00.000Z",
    },
};

export const PRESENCE_SCREENSHOT = {
    hero: {
        archetype: "薪火",
        group: "AURA",
        title: "静かな洗練の中に、揺るがない美学がある人",
        description:
            "内面の豊かさと外見のクールさにギャップがある。近づきたいのに距離を感じさせてしまうことがある",
        chips: ["ナチュラル", "Autumn", "65%"],
    },
    radar: {
        axes: [
            { axis: "審美眼", score: 92 },
            { axis: "社交性", score: 50 },
            { axis: "独創性", score: 32 },
            { axis: "安定感", score: 64 },
            { axis: "表現力", score: 25 },
            { axis: "こだわり", score: 98 },
            { axis: "快感力", score: 43 },
            { axis: "深さ", score: 95 },
        ],
        summary:
            "「こだわり」が突出し「表現力」は控えめな、尖った個性を持つプロフィール。この凹凸こそが唯一無二の輪郭であり、「何かが足りない」のではなく「何かが突き抜けている」と見るべきだ",
    },
    strengths: {
        items: [
            {
                label: "感性の広さ",
                score: 98,
                grade: "S",
                description:
                    "多様な美を受け入れる広い視野。異なる価値観の人ともすぐに共鳴できる",
            },
            {
                label: "決断力",
                score: 98,
                grade: "S",
                description:
                    "何を選び何を捨てるか明確。この潔さが行動力と成果を生む",
            },
            {
                label: "自己一貫性",
                score: 90,
                grade: "S",
                description:
                    "選択に迷いがなく、すべてが一つの軸で繋がっている。この一貫性が周囲の信頼を生む",
            },
            {
                label: "影響力",
                score: 63,
                grade: "B",
                description:
                    "控えめながら確実に影響を与えている。静かなリーダーシップ",
            },
            {
                label: "受容力",
                score: 17,
                grade: "D",
                description:
                    "フィルターが強い。合わないものをはっきり排除する。それは自分を守る力でもある",
            },
        ],
        weapon:
            "あなたの最大の武器は「感性の広さ」。多様な美を受け入れる広い視野。異なる価値観の人ともすぐに共鳴できる",
        growth:
            "成長の余白は「受容力」にある。フィルターが強い。合わないものをはっきり排除する。それは自分を守る力でもある。ここを意識するだけで、人としての厚みが一段増す",
    },
    personaCards: [
        { title: "第一印象", body: FIRST_IMPRESSION, tone: "indigo" as const },
        { title: "伝わる魅力", body: CHARM, tone: "emerald" as const },
        { title: "深く知ると見える本質", body: DEEPER_TRUTH, tone: "violet" as const },
    ],
    gap: {
        selfImage: SELF_IMAGE,
        othersImage: OTHERS_IMAGE,
        percent: "40%",
        percentNum: 40,
        description:
            "自己認識と他者の印象にほどよいズレがある。あなたには「見た目以上の深み」があり、それが知れば知るほど面白い人物像を作っている",
        oneWord:
            "冷静に見えるのは、心を動かされたものにだけ全力で向き合いたいからです",
    },
    potential: {
        items: [
            {
                title: "クリエイティブ・ディレクション",
                percent: "64%",
                description:
                    "審美眼と決断力が求められる領域。あなたの「削ぎ落とす力」「品質を見極める目」は、ディレクションに最適",
            },
            {
                title: "ブランド・戦略設計",
                percent: "56%",
                description:
                    "品格と一貫性を重んじる姿勢が、ブランドの核を設計する力になる",
            },
            {
                title: "キュレーション・選定",
                percent: "56%",
                description:
                    "膨大な選択肢の中から本質を見抜く目利きの力。「これだ」と決める感覚が強い",
            },
            {
                title: "ストーリーテリング・発信",
                percent: "25%",
                description:
                    "ものの背景にある文脈を読み取り、語れる力。あなたが表に出るには少し勇気がある",
            },
        ],
        summary:
            "あなたが最も自然に力を発揮できるのは「クリエイティブ・ディレクション」の領域。審美眼と決断力が求められる領域。あなたの「削ぎ落とす力」「品質を見極める目」は、ディレクションに最適。ここを磨いてキャリアや活動の軸を造ると、無理なく結果がついてくる",
    },
    relationshipShape: {
        attracted: ATTRACTED,
        mismatch: COMMON_MISUNDERSTANDING,
    },
    companion: {
        title:
            "あなたのことは、もう分かっている。静かな洗練の中に—それがあなたの本質だ",
        cards: [
            {
                title: "あなたについて分かっていること",
                body:
                    "あなたは自分を「合理的で冷静、感情に振り回されない人間」だと思っている。でも周りが見ているのは「何を考えているか分からない、でも確実にセンスがある人」だ。このズレは弱さではない—むしろ「こだわり」の高さが、あなたの本当の魅力を隠している。表現力が控えめなのは、そこに意識が向いていないだけだ。気づけば、変わる",
                tone: "violet" as const,
            },
            {
                title: "あなたの最大の武器",
                body:
                    "「感性の広さ」—これがあなたの核心的な強みだ。多様な美を受け入れる広い視野。異なる価値観の人ともすぐに共鳴できる。この力は意識しなくても自然と発揮されているが、意識的に使えば周囲への影響力は何倍にもなる。自信を持っていい。これは本物の力だ",
                tone: "emerald" as const,
            },
            {
                title: "あなたが疲れたとき",
                body:
                    "穏やかに見えるが、揺るがない芯がある。この人が怒ったとき、周囲は本気だと分かる。だからこそ、あなたが疲れるパターンは決まっている——「本質を見抜きたい」が脅かされたとき、あなたは消耗する。でも知っておいてほしい。あなたの「薪火」のような存在感は、疲れていても周囲を照らしている。立ち止まっていい。それでもあなたの価値は変わらない",
                tone: "indigo" as const,
            },
            {
                title: "気をつけてほしいこと",
                body:
                    "あなたは「ビビッドカラーと古着」を避ける傾向がある。それ自体は悪いことではないが、ここに無意識のバイアスが潜んでいる可能性がある。近寄りがたい、感情がないと思われがち——この誤解を解く鍵は、苦手なものの「なぜ苦手か」を言語化すること。理由が分かれば、それは「苦手」から「理解できるが選ばないもの」に変わる",
                tone: "amber" as const,
            },
            {
                title: "次に開く扉",
                body:
                    "「自分の基準」だけで完結しない場を持つと、新しい感性に出会える。受け入れることも引き算の一部。今のあなたの人物像は既に魅力的だが、ここに手を伸ばすことで「なんかすごい」から「替えがきかない」に変わる。焦る必要はない。ただ意識の片隅に置いておくだけでいい。行動は自然とついてくる",
                tone: "blue" as const,
            },
        ],
        quote:
            "ノイズを排除できる審美眼と、自分の基準を静かに貫く芯の強さ—それがあなた。世界中であなただけが持つこの組み合わせを、忘れないでほしい。私はいつでもここにいる",
    },
    iam: {
        firstImpression: FIRST_IMPRESSION,
        deeperTruth: DEEPER_TRUTH,
        charm: CHARM,
        misperception:
            "完成度が高いぶん、壁がある・感情がない・人を遠ざけていると誤解されやすい。本当はそうではなく、静かに観察し、確かめてから心を開くタイプ",
        values:
            "本質を見抜きたい。表層のノイズを剥がして、一番大事なものだけを手元に残す",
        distance:
            "初対面では壁がある。しかし一度信頼すると、驚くほど誠実で深い関わりを持つ",
        growth: {
            current:
                "ノイズを排除できる審美眼と、自分の基準を静かに貫く芯の強さ。それが今のあなたの強み",
            blindSpot:
                "一見クールに見えるが、美しいものへの感動は人一倍深い。ただ、それを表に出さないから周囲には伝わりにくい",
            next:
                "「自分の基準」だけで完結しない場を持つと、新しい感性に出会える。受け入れることも引き算の一部",
        },
    },
    iseek: {
        dynamics: {
            attracted:
                "自分だけの基準を持ち、それを押しつけない人。静かな強さに惹かれる。本質を見極める目と、妥協しない誠実さ——そういう人に無意識に引き寄せられる",
            deepen:
                "「本質を見抜く力」と「選び取る潔さ」——この二つの価値観が重なる相手とは、時間が経つほど関係が深まる。削ぎ落とす美学と品への敬意の両方を理解できる相手は稀だが、出会えたときの共鳴は深い",
        },
        caution: {
            initial:
                "あなたの「合理的で冷静」という自己認識と違うタイプに新鮮さを感じるが、根底の価値観が重ならないほど長期的な摩擦も生まれやすい",
            clash:
                "言葉や物が多すぎる人。雑然とした環境は、この人のエネルギーを奪う。「量で勝負する」「とりあえず試す」——こうした価値観とは感覚レベルで相容れない",
            mismatch:
                "あなたは自分を「合理的で冷静」だと思っているが、相手は「何を考えているか分からない」と感じている。このズレが、すれ違いの根になることが多い",
        },
        styleEvidence: {
            attracted: ["minimal", "elegant", "luxury"],
            clash: ["workwear", "outdoor", "sporty"],
        },
        cta: {
            title: "AIマッチを確認する",
            description:
                "あなたの人物像に基づいて相性の近い人を発見",
            href: "/match",
        },
    },
};
