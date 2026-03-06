// lib/profile/registry.ts
// Unified registry for all profile tags with descriptions and images

export interface TagDescriptor {
    id: string;
    label: string;
    icon?: string;
    color?: string;
    imgs?: [string, string]; // For style lanes & personas (2 images)
    img?: string; // For elements (single image)
    descShort?: string; // 1-line description
    desc?: string; // 2-3 line detailed description
    tips?: string[]; // Optional keywords
}

export interface ProductSubcategory {
    id: string;
    label: string;
    img?: string;
    descShort?: string;
    desc?: string;
    tips?: string[];
}

export interface ProductCategory {
    id: string;
    label: string;
    icon: string;
    subs: ProductSubcategory[];
}

// ============================================================
// STYLE LANES (スタイルレーン)
// ============================================================
// ============================================================
// STYLE LANES (スタイルレーン)
// ============================================================

export const STYLE_LANES: TagDescriptor[] = [
    {
        id: "minimal",
        label: "ミニマル",
        icon: "▫️",
        color: "from-slate-600 to-slate-800",
        imgs: ["/style-lane/minimal/man.png", "/style-lane/minimal/woman.png"],
        descShort: "シンプルで洗練されたスタイル",
        desc: "無駄を省いたクリーンなデザイン。モノトーンやベーシックカラーを中心に、シルエットで魅せるファッション",
        tips: ["シンプル", "モダン", "洗練"],
    },
    {
        id: "street",
        label: "ストリート",
        icon: "🧢",
        color: "from-orange-500 to-red-500",
        imgs: ["/style-lane/street/man.png", "/style-lane/street/woman.png"],
        descShort: "個性と自由を楽しむスタイル",
        desc: "ストリートカルチャーをベースに、オーバーサイズやレイヤード、スニーカーやキャップなどの小物で“今っぽさ”を作るファッション。色やグラフィックで遊びつつ、全体のバランスでまとまりを出すのがポイント。",
        tips: ["カジュアル", "大胆", "自由"],
    },
    {
        id: "vintage",
        label: "ヴィンテージ",
        icon: "🎸",
        color: "from-amber-500 to-yellow-600",
        imgs: ["/style-lane/vintage/man.png", "/style-lane/vintage/woman.png"],
        descShort: "味わいと雰囲気を楽しむスタイル",
        desc: "昔の時代感や古着特有の風合いを活かして、こなれた空気を作るファッション。デニムやレザー、チェックなどの定番要素に、色落ち・擦れ・シルエットの“ゆるさ”を足して、今の街に馴染むレトロ感を出すのがポイント。",
        tips: ["レトロ", "風合い", "こなれ感"],
    },
    {
        id: "sporty",
        label: "スポーティ",
        icon: "🏃",
        color: "from-green-500 to-emerald-600",
        imgs: ["/style-lane/sporty/man.png", "/style-lane/sporty/woman.png"],
        descShort: "動きやすさと軽快さを楽しむスタイル",
        desc: "アクティブウェアを街向けに落とし込んだファッション。ジャージやレギンス、スニーカーなど機能的なアイテムを軸に、シルエットと配色で“スポーツ感”を整えるのがポイント。清潔感のある素材感と、抜け感のあるレイヤードで今っぽくまとまる。",
        tips: ["軽快", "アクティブ", "機能的"],
    },
    {
        id: "luxury",
        label: "ラグジュアリー",
        icon: "💎",
        color: "from-purple-500 to-pink-500",
        imgs: ["/style-lane/luxury/man.png", "/style-lane/luxury/woman.png"],
        descShort: "上質さで魅せる格上げスタイル",
        desc: "素材・仕立て・シルエットの完成度で“品”と“迫力”を出すファッション。派手さよりも、光沢や落ち感、ディテールの精度で差がつく。色数は絞り、バッグや靴など小物まで質感を揃えることで、全体が一気にラグジュアリーに仕上がる。",
        tips: ["上質", "品格", "洗練"],
    },
    {
        id: "daily",
        label: "デイリー",
        icon: "👕",
        color: "from-blue-500 to-cyan-500",
        imgs: ["/style-lane/daily/man.png", "/style-lane/daily/woman.png"],
        descShort: "気負わず、毎日に馴染むスタイル",
        desc: "Tシャツやデニム、シャツなどのベーシックを中心に、自然体でまとまる日常ファッション。派手に盛らず、色とサイズ感を整えるだけで清潔感が出るのが強み。季節感は羽織りや小物で少し足して、無理なく“ちょうどいい”を作る。",
        tips: ["ベーシック", "自然体", "清潔感"],
    },
    {
        id: "elegant",
        label: "エレガント",
        icon: "✨",
        color: "from-rose-400 to-pink-500",
        imgs: ["/style-lane/elegant/man.png", "/style-lane/elegant/woman.png"],
        descShort: "上品さと美しい所作が映えるスタイル",
        desc: "派手さではなく、シルエットの美しさと素材の艶感で“品”を作るファッション。細部まで整ったサイズ感、柔らかな色使い、控えめなアクセサリーで、落ち着いた華やかさを演出する。姿勢や歩き方まで含めて、全体が洗練されて見えるのが特徴。",
        tips: ["上品", "きれいめ", "華やか"],
    },
    {
        id: "workwear",
        label: "ワークウェア",
        icon: "🔧",
        color: "from-amber-700 to-yellow-700",
        imgs: ["/style-lane/workwear/man.png", "/style-lane/workwear/woman.png"],
        descShort: "無骨さと実用性を楽しむスタイル",
        desc: "作業服由来のタフな素材やディテールを、街着として落とし込んだファッション。チョアジャケットやデニム、カーゴなど“道具感”のあるアイテムを軸に、色はアース系でまとめると一気に雰囲気が出る。新品すぎない質感や、程よいゆるさでこなれ感を作るのがポイント。",
        tips: ["タフ", "機能的", "無骨"],
    },
    {
        id: "outdoor",
        label: "アウトドア",
        icon: "🏕️",
        color: "from-lime-600 to-green-700",
        imgs: ["/style-lane/outdoor/man.png", "/style-lane/outdoor/woman.png"],
        descShort: "機能性を街で着こなすスタイル",
        desc: "シェルやフリース、テックパンツなどアウトドア由来のアイテムを、都会のコーデに落とし込んだファッション。動きやすさ・耐候性・軽さを活かしつつ、色数を絞ってシルエットを整えると“ゴープコア”っぽく洗練される。小物はバックパックやキャップで統一するとまとまりやすい。",
        tips: ["機能的", "テック", "軽快"],
    },
    {
        id: "office_casual",
        label: "オフィスカジュアル",
        icon: "💼",
        color: "from-slate-500 to-blue-600",
        imgs: ["/style-lane/officecasual/man.png", "/style-lane/officecasual/woman.png"],
        descShort: "通勤にもなじむ、清潔感と実用性を両立したきれいめスタイル",
        desc: "ジャケットやシャツ、スラックスなどのきちんと感をベースにしながら、堅すぎず自然体で着こなすスタイル。清潔感のある色使いと、程よく力の抜けたシルエットで、仕事にも日常にもなじむバランスを作るのがポイント。",
        tips: ["清潔感", "きちんと感", "実用的"],
    },
    {
        id: "conservative",
        label: "コンサバ",
        icon: "👜",
        color: "from-rose-500 to-pink-600",
        imgs: ["/style-lane/conservative/man.png", "/style-lane/conservative/woman.png"],
        descShort: "上品で無難、好印象を作りやすい王道のきれいめスタイル",
        desc: "流行を追いすぎず、誰から見ても好印象になりやすい上品なファッション。きれいめなシルエット、落ち着いた色味、整った小物使いで、女性らしさと品のよさを自然に引き出すのが特徴。",
        tips: ["上品", "好印象", "王道"],
    },
    {
        id: "feminine",
        label: "フェミニン",
        icon: "🌸",
        color: "from-pink-400 to-rose-500",
        imgs: ["/style-lane/feminine/man.png", "/style-lane/feminine/woman.png"],
        descShort: "やわらかさや華やかさを感じる、女性らしい印象のスタイル",
        desc: "スカートやブラウス、やわらかな素材感を活かして、優しさや華やかさを表現するファッション。丸みのあるシルエットや淡い色合いを使うことで、親しみやすく柔らかな雰囲気に仕上がる。",
        tips: ["やわらかい", "華やか", "女性らしい"],
    },
    {
        id: "clean_casual",
        label: "綺麗めカジュアル",
        icon: "🫧",
        color: "from-sky-500 to-indigo-500",
        imgs: ["/style-lane/clean_casual/man.png", "/style-lane/clean_casual.png"],
        descShort: "ラフすぎず上品すぎない、日常使いしやすい清潔感あるスタイル",
        desc: "カジュアルなアイテムをベースにしながら、色使いやサイズ感を整えて上品に見せるスタイル。Tシャツやシャツ、デニムなどの定番アイテムでも、すっきりとした印象にまとめることで大人っぽく見せられる。",
        tips: ["清潔感", "自然体", "万能"],
    },
    {
        id: "mannish",
        label: "マニッシュ",
        icon: "🧥",
        color: "from-slate-700 to-zinc-800",
        imgs: ["/style-lane/mannish/man.png", "/style-lane/mannish/woman.png"],
        descShort: "直線的でハンサムな要素を取り入れた、凛としたスタイル",
        desc: "ジャケットやシャツ、ワイドパンツなど、メンズライクな要素を取り入れてハンサムに見せるファッション。甘さを抑えた直線的なシルエットと落ち着いた配色で、知的で凛とした空気を作るのが特徴。",
        tips: ["ハンサム", "知的", "凛とした"],
    },
    {
        id: "amekaji",
        label: "アメカジ",
        icon: "🇺🇸",
        color: "from-red-500 to-blue-600",
        imgs: ["/style-lane/amekaji/man.png", "/style-lane/amekaji/woman.png",],
        descShort: "デニムやワーク感を軸にした、ラフで王道なアメリカンカジュアル",
        desc: "デニム、チェックシャツ、スウェット、ワークブーツなどを中心に、ラフで親しみやすい空気を作るファッション。肩の力を抜いた着こなしの中に、タフさや無骨さを少し入れることで、王道のアメカジらしさが出る。",
        tips: ["ラフ", "王道", "無骨"],
    },
    {
        id: "korean_fashion",
        label: "韓国ファッション",
        icon: "🇰🇷",
        color: "from-slate-600 to-sky-600",
        imgs: ["/style-lane/korean/man.png", "/style-lane/korean/woman.png"],
        descShort: "抜け感と今っぽさを意識した、洗練された韓国トレンドスタイル",
        desc: "オーバーサイズやショート丈、抜け感のあるシルエットで“今っぽさ”を作るファッション。シンプルでも洗練されて見えるバランス感が特徴で、モノトーンや淡色を使うと都会的で韓国らしい雰囲気が出しやすい。",
        tips: ["今っぽい", "抜け感", "洗練"],
    },
    {
        id: "trad",
        label: "トラッド",
        icon: "🎓",
        color: "from-amber-600 to-yellow-700",
        imgs: ["/style-lane/trad/man.png", "/style-lane/trad/woman.png"],
        descShort: "品のある定番アイテムをベースにした、きちんと感のある伝統的スタイル",
        desc: "ブレザー、シャツ、ローファー、チェック柄などの定番を軸に、きちんと感と知的さを演出するファッション。流行に左右されにくく、整った印象を作りやすいのが特徴で、清潔感のある着こなしが映える。",
        tips: ["知的", "伝統的", "きちんと感"],
    },
    {
        id: "pale_tone",
        label: "淡色系",
        icon: "🩰",
        color: "from-amber-200 to-rose-200",
        imgs: ["/style-lane/pale_tone/man.png", "/style-lane/pale_tone/woman.png"],
        descShort: "やわらかい淡い色味で統一した、軽やかで優しい雰囲気のスタイル",
        desc: "ベージュ、アイボリー、くすみピンクなどの淡い色を中心に、全体を柔らかくまとめるファッション。色の強さを抑えることで、軽やかで優しい印象になり、親しみやすく穏やかな雰囲気を作れる。",
        tips: ["やわらかい", "淡い", "優しい"],
    },
    {
        id: "west_coast",
        label: "西海岸系",
        icon: "🌴",
        color: "from-cyan-500 to-blue-500",
        imgs: ["/style-lane/west_coast/man.png", "/style-lane/west_coast/woman.png"],
        descShort: "リラックス感と開放感を感じる、自然体で爽やかなカジュアルスタイル",
        desc: "海や太陽を感じるような、開放感のあるラフなカジュアルファッション。明るめの色使い、ゆるいシルエット、自然体な着こなしで、肩の力が抜けた爽やかな雰囲気を作るのがポイント。",
        tips: ["爽やか", "開放的", "リラックス"],
    },
    {
        id: "french_casual",
        label: "フレンチカジュアル",
        icon: "🇫🇷",
        color: "from-blue-500 to-slate-700",
        imgs: ["/style-lane/french_casual/man.png", "/style-lane/french_casual/woman.png"],
        descShort: "気取りすぎず洗練された、さりげない上品さのあるカジュアルスタイル",
        desc: "ボーダー、シャツ、ジャケットなどの定番を自然体で着こなし、肩肘張らずに品よく見せるファッション。派手さはなくても、色数やシルエットを整えることで、さりげなく洗練された印象に仕上がる。",
        tips: ["自然体", "上品", "洗練"],
    },
    {
        id: "preppy",
        label: "プレッピー系",
        icon: "🎒",
        color: "from-emerald-500 to-teal-600",
        imgs: ["/style-lane/preppy/man.png", "/style-lane/preppy/woman.png"],
        descShort: "学生風の品のよさと知的さを感じる、爽やかなクラシックスタイル",
        desc: "シャツ、ニット、ブレザー、ローファーなどを組み合わせて、学生風のきちんと感と清潔感を出すファッション。アメリカンなスクールテイストを感じさせる、爽やかで知的な印象が魅力。",
        tips: ["知的", "爽やか", "クラシック"],
    },
    {
        id: "rock",
        label: "ロック系",
        icon: "🎸",
        color: "from-slate-800 to-rose-700",
        imgs: ["/style-lane/rock/man.png", "/style-lane/rock/woman.png"],
        descShort: "黒やレザーなどを効かせた、強さとエッジを感じるスタイル",
        desc: "レザー、ブラック、ダメージ、細身のシルエットなどを使って、強さと反骨感を表現するファッション。重さのある色使いとシャープな印象で、存在感とエッジをしっかり出すのが特徴。",
        tips: ["強い", "エッジ", "反骨感"],
    },
];

// ============================================================
// PERSONAS (求める人物像) - Same as style lanes
// ============================================================
export const PERSONAS: TagDescriptor[] = STYLE_LANES;

// ============================================================
// ELEMENTS (要素: 好き/苦手)
// ============================================================
export const ELEMENTS: TagDescriptor[] = [
    {
        id: "oversize",
        label: "オーバーサイズ",
        icon: "🧥",
        img: "/elements/oversize.png",
        descShort: "余白で魅せる、今っぽいスタイル",
        desc: "身幅や袖丈にゆとりを持たせ、シルエットの“空気感”で存在感を出すファッション。だらしなく見せないために、丈感・肩の落ち方・足元のボリュームで全体バランスを整えるのがポイント。色数を絞ると一気に洗練される。",
        tips: ["余白", "バランス", "抜け感"],

    },
    {
        id: "justsize",
        label: "ジャストサイズ",
        icon: "📏",
        img: "/elements/justsize.png",
        descShort: "サイズ感で“きちんと”見せるスタイル",
        desc: "肩幅・身幅・袖丈・着丈が体に自然に沿い、清潔感と信頼感が出るファッション。派手さはなくても、シルエットの精度で一気に整って見えるのが強み。ベーシックな色と相性が良く、靴やベルトなどの小物まで揃えると完成度が上がる。",
        tips: ["清潔感", "きれいなシルエット", "きちんと感"],
    },
    {
        id: "tightfit",
        label: "タイトフィット",
        icon: "🧍",
        img: "/elements/tightfit.png",
        descShort: "体のラインで魅せるスタイル",
        desc: "ジャストよりもさらにフィット感を高め、シルエットのシャープさで色気と強さを出すファッション。細身でも窮屈に見せないために、素材の伸び・丈感・足元の抜けでバランスを取るのがポイント。色数を絞ると洗練され、逆に差し色は一点に絞ると映える。",
        tips: ["シャープ", "色気", "メリハリ"],
    },
    {
        id: "monotone",
        label: "モノトーン",
        icon: "⚫️⚪️",
        img: "/elements/monotone.png",
        descShort: "白黒で洗練を作るスタイル",
        desc: "黒・白・グレーだけでまとめ、配色の“強さ”と“余白”で魅せるファッション。色が少ない分、シルエットと素材感の差がそのまま完成度になる。ツヤとマット、細身とオーバーなど、質感や形のコントラストを一つ入れると一気に垢抜ける。",
        tips: ["白黒", "コントラスト", "洗練"],
    },
    {
        id: "earthcolor",
        label: "アースカラー",
        icon: "🌿",
        img: "/elements/earthcolor.png",
        descShort: "自然な色味で落ち着きを出すスタイル",
        desc: "ベージュ、ブラウン、オリーブ、カーキなどの“土や植物”の色でまとめるファッション。派手さはないのに雰囲気が出やすく、素材感（コットン・ウール・スエードなど）と相性が良い。色を近いトーンで揃えると、統一感が強くなる。",
        tips: ["ナチュラル", "落ち着き", "統一感"],
    },
    {
        id: "vividcolor",
        label: "ビビッドカラー",
        icon: "🟥",
        img: "/elements/vividcolor.png",
        descShort: "強い色で主役を作るスタイル",
        desc: "高彩度の色をコーデの核にして、視線を一発で集めるファッション。主役の色を決めたら、他は無彩色やデニムなど“受け”の色で支えるのがコツ。色の面積（トップスだけ、バッグだけ等）をコントロールすると派手すぎず洒落る。",
        tips: ["主役カラー", "色の面積", "インパクト"],
    },
    {
        id: "colorfull",
        label: "カラフル",
        icon: "🌈",
        img: "/elements/colorfull.png",
        descShort: "色遊びを楽しむスタイル",
        desc: "複数の色を組み合わせて、明るさと個性を出すファッション。子どもっぽく見せないために、トーン（くすみ/パキッと）を揃えるか、ベースを白黒にして色を散らすのがポイント。2〜3色に絞って“配色ルール”を作るとまとまる。",
        tips: ["色遊び", "配色ルール", "明るさ"],
    },
    {
        id: "layerd",
        label: "レイヤード",
        icon: "🧩",
        img: "/elements/layerd.png",
        descShort: "重ね着で奥行きを出すスタイル",
        desc: "シャツ×ニット×アウターなど、アイテムを重ねて“立体感”と“情報量”で魅せるファッション。丈の差（インナーを少し出す等）と首元の見せ方で完成度が決まる。色は同系色でまとめると上級者っぽく、差し色は一点にすると綺麗に締まる。",
        tips: ["重ね着", "丈の差", "奥行き"],
    },
    {
        id: "simple",
        label: "シンプル",
        icon: "🫧",
        img: "/elements/simple.png",
        descShort: "足し算しない、王道スタイル",
        desc: "無地やベーシックな形を中心に、迷わず整うファッション。盛らない分、サイズ感・清潔感・色合わせがそのまま印象になる。小物は控えめにして、靴とバッグの質感を揃えるだけで“ちゃんとして見える”。",
        tips: ["ベーシック", "清潔感", "まとまり"],
    },
    {
        id: "onepoint",
        label: "ワンポイント",
        icon: "📍",
        img: "/elements/onepoint.png",
        descShort: "一点だけ効かせるスタイル",
        desc: "全体はベーシックにまとめ、バッグ・靴・柄・色など“主役を一つだけ”置くファッション。やりすぎないのに印象が残り、初心者でも失敗しにくい。主役の一点以外は色数を抑え、形もシンプルにするとワンポイントが綺麗に映える。",
        tips: ["一点主役", "引き算", "印象UP"],
    },
    {
        id: "highbrand",
        label: "ハイブランド",
        icon: "👑",
        img: "/elements/highbrand.png",
        descShort: "格と存在感で魅せるスタイル",
        desc: "素材の上質さ、仕立ての美しさ、全体の統一感で“品格”を作るファッション。ロゴに頼らず、コートやジャケットの構造、革小物の質感、靴の完成度で差が出る。色数を絞って、シルエットと素材の良さを最大限に見せるのがポイント。",
        tips: ["品格", "上質", "統一感"],
    },
    {
        id: "used",
        label: "古着",
        icon: "🧺",
        img: "/elements/used.png",
        descShort: "味とストーリーを楽しむスタイル",
        desc: "色落ちや擦れなど、古着ならではの風合いを活かして“こなれ感”を作るファッション。新品には出せないムードが強みで、デニム・レザー・スウェットなど定番アイテムと相性が良い。全体を古くしすぎず、どこか一点は綺麗にすると今っぽくまとまる。",
        tips: ["風合い", "こなれ感", "ストーリー"],
    },
    {
        id: "fastfashion",
        label: "ファストファッション",
        icon: "⚡️",
        img: "/elements/fastfashion.png",
        descShort: "手軽に今を楽しむスタイル",
        desc: "手に取りやすい価格帯で、トレンドや着回しを気軽に取り入れるファッション。ポイントは“安く見せない工夫”で、色数を絞る・サイズ感を整える・靴とバッグを少し良くするだけで一気に見え方が変わる。ベーシック×一点トレンドが最も失敗しにくい。",
        tips: ["手軽", "着回し", "今っぽい"],
    },
    {
        id: "trend",
        label: "トレンド重視",
        icon: "🔥",
        img: "/elements/trend.png",
        descShort: "今っぽさを最優先するスタイル",
        desc: "その時期の流行シルエットやアイテムを軸に、“旬”で魅せるファッション。短期で更新される分、全部を追わずに「一つだけ流行を入れる」のが上手いやり方。ベーシックを土台にしてトレンドを乗せると、浮かずに洗練される。",
        tips: ["旬", "更新感", "取り入れ上手"],
    },
    {
        id: "standard",
        label: "定番重視",
        icon: "🧱",
        img: "/elements/standard.png",
        descShort: "ずっと使える王道スタイル",
        desc: "流行に左右されにくい定番アイテムで、安定感と信頼感を作るファッション。白T、デニム、シャツ、トレンチ、シンプルな革靴など、長く使える“強い基本”を揃えるのが特徴。サイズ感と手入れで差が出るので、清潔感を維持するほど強くなる。",
        tips: ["王道", "長く使える", "安定感"],
    },
    {
        id: "individual",
        label: "個性重視",
        icon: "🎭",
        img: "/elements/individual.png",
        descShort: "自分らしさで勝負するスタイル",
        desc: "柄・形・色・小物など、自分の“好き”を軸にして印象を作るファッション。目立つことが目的ではなく、世界観の一貫性が完成度になる。主役（髪/柄/シルエットなど）を決めて、他は引き算すると個性がより綺麗に立つ。",
        tips: ["自分らしさ", "世界観", "一貫性"],
    },
];

// ============================================================
// PRODUCT TAXONOMY (商品像: メインカテゴリ → サブカテゴリ)
// ============================================================
export const PRODUCT_TAXONOMY: ProductCategory[] = [
    {
        id: "outerwear",
        label: "アウター",
        icon: "🧥",
        subs: [
            {
                id: "subcategory.outerwear.jacket",
                label: "ジャケット",
                img: "/samples/subcategory/outerwear/jacket.png",
                descShort: "きちんと感を足す万能アウター",
                desc: "羽織るだけでコーデが引き締まる定番アウター。カジュアルにもきれいめにも振れ、素材や丈感で印象が大きく変わる。肩の収まりと着丈のバランスが“こなれ”の決め手。",
                tips: ["万能", "きちんと感", "引き締め"],
            },
            {
                id: "subcategory.outerwear.coat",
                label: "コート",
                img: "/samples/subcategory/outerwear/coat.png",
                descShort: "季節感と品格を作る主役アウター",
                desc: "秋冬の印象をほぼ決める、存在感のあるアウター。インナーがシンプルでも完成度が上がりやすく、丈と素材で大人っぽさが出る。色はベーシック寄りにすると長く使える。",
                tips: ["主役", "季節感", "品格"],
            },
            {
                id: "subcategory.outerwear.blouson",
                label: "ブルゾン",
                img: "/samples/subcategory/outerwear/blouson.png",
                descShort: "軽さと今っぽさが出るショート丈",
                desc: "短め丈でバランスが取りやすく、カジュアルに抜け感を作れるアウター。ボリュームがあるとトレンド寄り、すっきりだと大人カジュアルに寄せやすい。ボトムの太さで雰囲気が変わる。",
                tips: ["軽快", "ショート丈", "抜け感"],
            },
            {
                id: "subcategory.outerwear.down",
                label: "ダウン",
                img: "/samples/subcategory/outerwear/down.png",
                descShort: "防寒とボリュームで決まる冬の定番",
                desc: "暖かさを優先しつつ、シルエットでおしゃれに見せられる冬アウター。ボリュームが出やすい分、色数を絞ってまとめると洗練される。丈はショートで軽快、ロングで大人っぽく仕上がる。",
                tips: ["防寒", "ボリューム", "冬の定番"],
            },
            {
                id: "subcategory.outerwear.cardigan",
                label: "カーディガン",
                img: "/samples/subcategory/outerwear/cardigan.png",
                descShort: "柔らかさと温度調整を足す羽織り",
                desc: "軽く羽織れて、コーデにやさしい雰囲気を足せるアイテム。室内外の温度差にも対応しやすく、シャツやTシャツなど幅広く合わせられる。丈と編み地の表情で印象が決まる。",
                tips: ["羽織り", "柔らかい", "温度調整"],
            },
            {
                id: "subcategory.outerwear.trench",
                label: "トレンチ",
                img: "/samples/subcategory/outerwear/trench.png",
                descShort: "王道で上品なロングアウター",
                desc: "羽織るだけで“きれいめ”に寄る春秋の定番アウター。ベルトやラペルの見え方で雰囲気が変わり、スニーカーで外せばカジュアルにも着られる。ベージュは王道、黒やネイビーは都会的。",
                tips: ["王道", "上品", "きれいめ"],
            },
        ],
    },

    {
        id: "tops",
        label: "トップス",
        icon: "👕",
        subs: [
            {
                id: "subcategory.tops.tshirt",
                label: "Tシャツ",
                img: "/samples/subcategory/tops/tshirt.png",
                descShort: "毎日の土台になるベーシック",
                desc: "一枚でもインナーでも使える万能トップス。首元の形（クルー/V）と生地の厚みで印象が変わる。サイズ感を整えるだけで清潔感が出て、ジャケットやシャツの中でも活躍する。",
                tips: ["ベーシック", "万能", "清潔感"],
            },
            {
                id: "subcategory.tops.shirt",
                label: "シャツ",
                img: "/samples/subcategory/tops/shirt.png",
                descShort: "きれいめにも崩しにも使える定番",
                desc: "着るだけで“整う”トップス。タックインで端正に、羽織りでラフにと振れ幅が広い。襟の形と着丈、袖のボリュームで雰囲気が決まる。シワ感が目立つので手入れも重要。",
                tips: ["きちんと", "羽織り", "着回し"],
            },
            {
                id: "subcategory.tops.knit",
                label: "ニット",
                img: "/samples/subcategory/tops/knit.png",
                descShort: "季節感と上品さが出る素材トップス",
                desc: "編み地の表情で一気に雰囲気が出るトップス。ハイゲージはきれいめ、ローゲージはカジュアル寄り。毛玉やヨレが出やすいので、サイズ感と手入れで完成度が変わる。",
                tips: ["季節感", "上品", "素材感"],
            },
            {
                id: "subcategory.tops.sweat",
                label: "スウェット",
                img: "/samples/subcategory/tops/sweat.png",
                descShort: "楽なのに今っぽいカジュアル",
                desc: "リラックス感がありながら、シルエット次第で一気におしゃれに見えるトップス。オーバーならストリート寄り、ジャストなら大人カジュアル。きれいめに寄せたいなら色数を絞って靴で締める。",
                tips: ["ラフ", "シルエット勝負", "今っぽい"],
            },
            {
                id: "subcategory.tops.polo",
                label: "ポロシャツ",
                img: "/samples/subcategory/tops/polo.png",
                descShort: "カジュアルと品のちょうど中間",
                desc: "襟があるだけで清潔感ときちんと感が出るトップス。Tシャツより大人っぽく、シャツよりラフに着られる。丈と身幅を整えると一気に上品に見える。",
                tips: ["清潔感", "大人カジュアル", "襟"],
            },
            {
                id: "subcategory.tops.vest",
                label: "ベスト",
                img: "/samples/subcategory/tops/vest.png",
                descShort: "一枚足して奥行きを出すアイテム",
                desc: "レイヤードで“情報量”と立体感を作れるアイテム。シンプルなトップスに重ねるだけで雰囲気が変わる。丈の位置（短め/長め）でスタイルアップもしやすい。",
                tips: ["レイヤード", "奥行き", "変化球"],
            },
            {
                id: "subcategory.tops.hoodie",
                label: "フーディ",
                img: "/samples/subcategory/tops/hoodie.png",
                descShort: "ストリート感を作る定番トップス",
                desc: "フードの存在感で一気にカジュアルに寄せられるトップス。ジャケットやコートの中に入れると抜け感が出る。大人っぽく着たいなら無地・色数少なめ・丈感を整えるのがコツ。",
                tips: ["ストリート", "抜け感", "重ね着"],
            },
            {
                id: "subcategory.tops.blouse",
                label: "ブラウス",
                img: "/samples/subcategory/tops/blouse.png",
                descShort: "軽さと華やかさを足すきれいめ",
                desc: "素材の落ち感や襟元のデザインで上品に見せられるトップス。オフィスにもデートにも対応しやすい。甘くなりすぎないよう、ボトムはデニムやスラックスでバランスを取ると今っぽい。",
                tips: ["きれいめ", "華やか", "軽やか"],
            },
            {
                id: "subcategory.tops.camisole",
                label: "キャミソール",
                img: "/samples/subcategory/tops/camisole.png",
                descShort: "抜け感を作る軽やかトップス",
                desc: "肩ひもが細く、肌見せで“軽さ”と“女性らしさ”が出るトップス。1枚で主役にも、シャツやジャケットのインナーにも使える。素材（サテン/リブ/レース）で印象が変わるので、見せ方に合わせて選ぶとまとまる。",
                tips: ["軽やか", "抜け感", "インナーにも"],
            },
            {
                id: "subcategory.tops.tanktop",
                label: "タンクトップ",
                img: "/samples/subcategory/tops/tanktop.png",
                descShort: "ヘルシーに決まる定番インナー",
                desc: "肩まわりがすっきり見えて、カジュアルにもきれいめにも使える万能トップス。1枚で着るならサイズ感と素材の厚みが重要。シャツやカーデの中に入れるだけでも、抜け感が出て今っぽくまとまる。",
                tips: ["ヘルシー", "万能", "抜け感"],
            },
            {
                id: "subcategory.tops.peplum",
                label: "ペプラム",
                img: "/samples/subcategory/tops/peplum.png",
                descShort: "ウエストを綺麗に見せる華やかトップス",
                desc: "ウエスト位置から裾が広がる形で、自然にスタイルアップが狙えるトップス。甘さが出やすい分、ボトムはデニムやスラックスで引き算すると大人っぽい。短丈×ハイウエストの組み合わせが鉄板。",
                tips: ["スタイルアップ", "華やか", "メリハリ"],
            },
            {
                id: "subcategory.tops.cachecoeur",
                label: "カシュクール",
                img: "/samples/subcategory/tops/cachecoeur.png",
                descShort: "首元を美しく見せる大人シルエット",
                desc: "前を重ねるデザインで、Vラインができて顔まわりがすっきり見えるトップス。女性らしさと上品さが出やすく、デートやきれいめコーデに強い。胸元が開きすぎる場合はインナーで調整するとバランスが良い。",
                tips: ["大人っぽい", "首元きれい", "上品"],
            },
            {
                id: "subcategory.tops.oneshoulder",
                label: "ワンショルダー",
                img: "/samples/subcategory/tops/oneshoulder.png",
                descShort: "一気にモードに寄る肌見せトップス",
                desc: "片側だけ肩を出すデザインで、非対称の“違和感”がスタイルの主役になるトップス。主張が強いので、ボトムはシンプルにして全体を引き締めると洗練される。アクセは控えめでも成立しやすい。",
                tips: ["モード", "非対称", "主役トップス"],
            },
            {
                id: "subcategory.tops.offshoulder",
                label: "オフショルダー",
                img: "/samples/subcategory/tops/offshoulder.png",
                descShort: "デコルテが映える華やかトップス",
                desc: "両肩を見せて、首〜肩まわりを綺麗に見せるトップス。フェミニンにも大人っぽくも寄せられる。甘くなりすぎないよう、ボトムはデニムやタイトスカートなど“締める”アイテムを合わせるとバランスが良い。",
                tips: ["華やか", "デコルテ", "女性らしさ"],
            },
            {
                id: "subcategory.tops.baretop",
                label: "ベアトップ",
                img: "/samples/subcategory/tops/baretop.png",
                descShort: "潔さで魅せるヘルシーな主役",
                desc: "肩ひもなしで胸元をすっきり見せるトップス。1枚で着るならフィット感と素材の安心感が重要で、羽織り（シャツ/ジャケット）を合わせると街でも着やすい。ボトムはワイドやハイウエストでバランスを取ると綺麗に決まる。",
                tips: ["ヘルシー", "主役", "羽織りで調整"],
            },
        ],
    },

    {
        id: "bottoms",
        label: "ボトムス",
        icon: "👖",
        subs: [
            {
                id: "subcategory.bottoms.pants",
                label: "パンツ",
                img: "/samples/subcategory/bottoms/pants.png",
                descShort: "万能に使えるボトムの基本",
                desc: "素材やシルエット次第でカジュアルにもきれいめにも振れる定番。トップスがシンプルでも、パンツの形で全体の印象が決まる。丈（ワンクッション/ノークッション）を合わせると完成度が上がる。",
                tips: ["万能", "シルエット", "丈感"],
            },
            {
                id: "subcategory.bottoms.jeans",
                label: "デニム",
                img: "/samples/subcategory/bottoms/jeans.png",
                descShort: "外さないカジュアルの主役",
                desc: "季節を問わず使える定番ボトム。色落ちや加工で雰囲気が変わる。きれいめに寄せたいなら濃色・加工少なめ、ラフにしたいなら淡色・ゆるシルエットが使いやすい。",
                tips: ["定番", "着回し", "カジュアル"],
            },
            {
                id: "subcategory.bottoms.shorts",
                label: "ショーツ",
                img: "/samples/subcategory/bottoms/shorts.png",
                descShort: "軽快さを出す夏の定番",
                desc: "涼しさと動きやすさを優先できるボトム。子どもっぽく見せないには、丈（膝上〜膝丈）と靴の選び方が重要。トップスを少しきれいめにすると大人っぽくまとまる。",
                tips: ["軽快", "夏", "バランス"],
            },
            {
                id: "subcategory.bottoms.skirt",
                label: "スカート",
                img: "/samples/subcategory/bottoms/skirt.png",
                descShort: "揺れ感で女性らしさを出す",
                desc: "動いたときのシルエットで印象が決まるボトム。丈（ミニ/ミディ/ロング）で雰囲気が大きく変わる。甘さを抑えたいなら、足元をスニーカーやブーツにして外すと今っぽい。",
                tips: ["揺れ感", "丈で印象", "外し"],
            },
            {
                id: "subcategory.bottoms.chino",
                label: "チノ",
                img: "/samples/subcategory/bottoms/chino.png",
                descShort: "きれいめにも使えるカジュアル",
                desc: "コットン素材の定番パンツで、デニムより上品に見えやすい。ベージュ系は王道、黒やオリーブは都会的にまとまる。センタープレス入りならさらにきれいめに寄せられる。",
                tips: ["定番", "上品カジュアル", "万能"],
            },
            {
                id: "subcategory.bottoms.cargo",
                label: "カーゴ",
                img: "/samples/subcategory/bottoms/cargo.png",
                descShort: "無骨さで雰囲気を作るパンツ",
                desc: "ポケットなどのディテールで存在感が出るボトム。トップスはシンプルにするとバランスが取りやすい。太めならストリート寄り、細めなら大人カジュアルに寄せやすい。",
                tips: ["無骨", "ディテール", "ストリート"],
            },
            {
                id: "subcategory.bottoms.slacks",
                label: "スラックス",
                img: "/samples/subcategory/bottoms/slacks.png",
                descShort: "一気に大人っぽく見えるきれいめ",
                desc: "落ち感のある素材とセンターラインで“きちんと感”が出るボトム。スニーカー合わせでも上品にまとまりやすい。丈を合わせるだけで清潔感が増すので、裾のバランスが重要。",
                tips: ["きれいめ", "落ち感", "大人"],
            },
            {
                id: "subcategory.bottoms.cropped",
                label: "クロップド",
                img: "/samples/subcategory/bottoms/cropped.png",
                descShort: "足元を軽く見せる丈感",
                desc: "くるぶしが見える程度の短め丈で、抜け感と軽快さを作れるボトム。靴が主役になりやすく、ローファーやスニーカーとの相性が良い。上は少しゆるめにするとバランスが取りやすい。",
                tips: ["軽快", "抜け感", "足元映え"],
            },
            {
                id: "subcategory.bottoms.bermuda",
                label: "バミューダ",
                img: "/samples/subcategory/bottoms/bermuda.png",
                descShort: "品よく履ける大人ショーツ",
                desc: "膝丈前後のショーツで、短パンより落ち着いた印象にまとまる。シャツやジャケットと合わせるときれいめに、スウェットと合わせると今っぽい。足元はローファーやきれいなスニーカーが相性◎。",
                tips: ["大人ショーツ", "膝丈", "品"],
            },
            {
                id: "subcategory.bottoms.capri",
                label: "カプリ",
                img: "/samples/subcategory/bottoms/capri.png",
                descShort: "細身で上品な七分丈",
                desc: "膝下〜ふくらはぎあたりの丈で、軽さと女性らしさが出るボトム。トップスをタイトにするとクラシックに、ゆるめにすると今っぽく外せる。足元はパンプスやサンダルで抜けを作るときれい。",
                tips: ["七分丈", "上品", "軽さ"],
            },
            {
                id: "subcategory.bottoms.skinny",
                label: "スキニー",
                img: "/samples/subcategory/bottoms/skinny.png",
                descShort: "シャープに締まる細身シルエット",
                desc: "脚のラインをすっきり見せて、全体を引き締めるボトム。トップスはオーバーやロング丈と相性が良く、メリハリが出る。窮屈に見せないために、素材の伸びと足元の抜けがポイント。",
                tips: ["細身", "引き締め", "メリハリ"],
            },
            {
                id: "subcategory.bottoms.sarouel",
                label: "サルエル",
                img: "/samples/subcategory/bottoms/sarouel.png",
                descShort: "個性と抜け感が出る変化球",
                desc: "股上が深く、独特のドレープ感で雰囲気を作るボトム。シンプルなトップスと合わせると主役が立つ。足元は細めの靴で締めるとバランスが良く、だらしなく見えにくい。",
                tips: ["個性", "ドレープ", "抜け感"],
            },
            {
                id: "subcategory.bottoms.tapered",
                label: "テーパード",
                img: "/samples/subcategory/bottoms/tapered.png",
                descShort: "脚がきれいに見える万能シルエット",
                desc: "太ももはゆとり、裾に向かって細くなる形で、体型を選びにくい定番。きれいめにもカジュアルにも使えて、スニーカーでもローファーでも合う。丈を合わせると一気に整う。",
                tips: ["万能", "きれい見え", "バランス"],
            },
            {
                id: "subcategory.bottoms.wide",
                label: "ワイド",
                img: "/samples/subcategory/bottoms/wide.png",
                descShort: "今っぽさが出るボリューム感",
                desc: "裾まで太いシルエットで、コーデに存在感と余白を作るボトム。トップスを短めにするか、タックインでウエスト位置を出すとスタイルが良く見える。素材が落ちると大人っぽい。",
                tips: ["ボリューム", "今っぽい", "余白"],
            },
            {
                id: "subcategory.bottoms.gaucho",
                label: "ガウチョ",
                img: "/samples/subcategory/bottoms/gaucho.png",
                descShort: "揺れ感のあるワイドシルエット",
                desc: "スカートのように見えるほど広がるボトムで、軽やかさと女性らしさが出る。トップスはコンパクトにまとめるとバランスが良い。足元はヒールで上品に、スニーカーで外しても可愛い。",
                tips: ["揺れ感", "軽やか", "女性らしさ"],
            },
            {
                id: "subcategory.bottoms.baggy",
                label: "バギー",
                img: "/samples/subcategory/bottoms/baggy.png",
                descShort: "ルーズでストリート感が強い太め",
                desc: "かなり太いシルエットで、ラフさと迫力を作るボトム。トップスを短丈やタイトにするとバランスが良く、全身ダボつきにくい。足元はボリュームスニーカーで揃えると完成度が上がる。",
                tips: ["ルーズ", "ストリート", "迫力"],
            },
        ],
    },

    {
        id: "shoes",
        label: "シューズ",
        icon: "👟",
        subs: [
            {
                id: "subcategory.shoes.sneakers",
                label: "スニーカー",
                img: "/samples/subcategory/shoes/sneakers.png",
                descShort: "外しにも主役にもなる万能靴",
                desc: "カジュアルの定番で、どんなスタイルにも合わせやすい。ボリューム系はストリート寄り、すっきり系はきれいめにも対応。汚れが目立つので、清潔感の維持が重要。",
                tips: ["万能", "外し", "清潔感"],
            },
            {
                id: "subcategory.shoes.boots",
                label: "ブーツ",
                img: "/samples/subcategory/shoes/boots.png",
                descShort: "足元に重さと雰囲気を足す",
                desc: "履くだけでコーデが締まり、季節感も出せる靴。レザーならきれいめ、スエードなら柔らかい印象。パンツの裾のかかり方で見え方が変わるので、丈の調整が効く。",
                tips: ["締まる", "季節感", "重厚感"],
            },
            {
                id: "subcategory.shoes.derby",
                label: "ダービー",
                img: "/samples/subcategory/shoes/derby.png",
                descShort: "品と信頼感を作る定番",
                desc: "足元から一気に“きちんと”を作れる靴。ローファーは抜け感、レースアップは端正な印象。スラックスはもちろん、デニムでも大人っぽくまとまる。手入れで差が出る。",
                tips: ["品", "きちんと", "大人"],
            },
            {
                id: "subcategory.shoes.sandals",
                label: "サンダル",
                img: "/samples/subcategory/shoes/sandals.png",
                descShort: "軽さと抜け感を作る夏靴",
                desc: "足元を軽く見せて、季節感を一気に出せる靴。スポサンはアクティブ、レザーサンダルは大人っぽい。ソックス合わせで街っぽく外すのもおすすめ。",
                tips: ["抜け感", "夏", "軽快"],
            },
        ],
    },

    {
        id: "bag",
        label: "バッグ",
        icon: "👜",
        subs: [
            {
                id: "subcategory.bag.tote",
                label: "トート",
                img: "/samples/subcategory/bag/tote.png",
                descShort: "容量と使いやすさの定番",
                desc: "荷物が入って、どんな服にも合わせやすい万能バッグ。キャンバスはカジュアル、レザーはきれいめに寄る。サイズを大きめにすると今っぽく、ミニだと上品にまとまる。",
                tips: ["万能", "容量", "合わせやすい"],
            },
            {
                id: "subcategory.bag.shoulder",
                label: "ショルダー",
                img: "/samples/subcategory/bag/shoulder.png",
                descShort: "両手が空く街の定番",
                desc: "使い勝手が良く、コーデのバランスも取りやすいバッグ。ストラップの太さや長さで印象が変わる。きれいめなら細め、ストリートなら太めが馴染みやすい。",
                tips: ["実用的", "街向き", "バランス"],
            },
            {
                id: "subcategory.bag.crossbody",
                label: "クロスボディ",
                img: "/samples/subcategory/bag/crossbody.png",
                descShort: "軽快でアクティブな斜めがけ",
                desc: "体に沿うシルエットで、移動が多い日でも楽なバッグ。小ぶりだと都会的で、スポーティにも振れる。上半身のアクセントにもなるので、シンプルコーデのスパイスに使いやすい。",
                tips: ["軽快", "斜めがけ", "アクセント"],
            },
            {
                id: "subcategory.bag.backpack",
                label: "バッグパック",
                img: "/samples/subcategory/bag/backpack.png",
                descShort: "機能性で選ぶ大容量",
                desc: "両手が空いて荷物も入る、実用性最強のバッグ。素材で印象が変わり、ナイロンはアクティブ、レザーは大人っぽい。服装は色数を絞ると“通学感”が出にくい。",
                tips: ["機能的", "大容量", "両手フリー"],
            },
            {
                id: "subcategory.bag.hand",
                label: "ハンド",
                img: "/samples/subcategory/bag/hand.png",
                descShort: "上品さが出るきれいめバッグ",
                desc: "持つだけで“きちんと”見えるバッグ。形がしっかりしているほど上品に、柔らかいレザーなら抜け感が出る。服がシンプルでも、バッグで格が上がる。",
                tips: ["上品", "きれいめ", "格上げ"],
            },
            {
                id: "subcategory.bag.boston",
                label: "ボストン",
                img: "/samples/subcategory/bag/boston.png",
                descShort: "クラシックで存在感のある形",
                desc: "丸みのある定番フォルムで、持つだけで雰囲気が出るバッグ。小さめなら可愛く、大きめなら旅行にも使える。レザーだと一気に大人っぽく、コーデの主役にもなる。",
                tips: ["クラシック", "存在感", "大人"],
            },
            {
                id: "subcategory.bag.second",
                label: "セカンド",
                img: "/samples/subcategory/bag/second.png",
                descShort: "手元を締めるミニバッグ",
                desc: "必要最低限を持ち歩く、スマートな手持ちバッグ。レザーなら上品、ナイロンなら軽快。コーデを大きく崩さず、さりげなく“できる感”を足せる。",
                tips: ["ミニ", "スマート", "手持ち"],
            },
            {
                id: "subcategory.bag.business",
                label: "ビジネス",
                img: "/samples/subcategory/bag/business.png",
                descShort: "信頼感を作る仕事バッグ",
                desc: "書類やPCが入って、見た目も端正なバッグ。形が崩れにくいものほど“きちんと感”が出る。黒・ネイビー・ブラウンなど落ち着いた色が相性◎。",
                tips: ["信頼感", "端正", "実用性"],
            },
            {
                id: "subcategory.bag.duffel",
                label: "ダッフル",
                img: "/samples/subcategory/bag/duffel.png",
                descShort: "旅行やジムにも使える大容量",
                desc: "荷物が多い日に便利なボストン系バッグ。スポーティにもカジュアルにも合わせやすい。街で持つなら色数を抑えたシンプルなデザインが使いやすい。",
                tips: ["大容量", "アクティブ", "便利"],
            },
            {
                id: "subcategory.bag.carrycase",
                label: "キャリーケース",
                img: "/samples/subcategory/bag/carrycase.png",
                descShort: "移動をスマートにする旅アイテム",
                desc: "旅行や出張で活躍する定番。サイズ選びと静音キャスターが快適さを左右する。色は黒・シルバーなどベーシックだと汎用性が高く、服装とも合わせやすい。",
                tips: ["旅", "機能性", "スマート"],
            },
            {
                id: "subcategory.bag.brief",
                label: "ブリーフ",
                img: "/samples/subcategory/bag/brief.png",
                descShort: "端正でミニマルな仕事バッグ",
                desc: "薄型でスマートに見える定番バッグ。スーツにもきれいめカジュアルにも相性が良い。レザーなら品格、ナイロンなら軽さが出る。形が崩れないものを選ぶと印象が強い。",
                tips: ["端正", "スマート", "きちんと"],
            },
        ],
    },

    {
        id: "accessories",
        label: "アクセサリー",
        icon: "💍",
        subs: [
            {
                id: "subcategory.accessories.hat",
                label: "帽子",
                img: "/samples/subcategory/accessories/hat.png",
                descShort: "一瞬で雰囲気が変わる小物",
                desc: "被るだけでスタイルの方向性が決まるアイテム。キャップはストリート、ハットは大人っぽく。色は服と同系色にすると馴染みやすく、主張させたいなら一点だけ差し色にする。",
                tips: ["雰囲気", "アクセント", "方向性"],
            },
            {
                id: "subcategory.accessories.watch",
                label: "時計",
                img: "/samples/subcategory/accessories/watch.png",
                descShort: "手元の品格を作る定番",
                desc: "さりげなく“きちんと”を足せるアクセサリー。金属ならシャープ、レザーならクラシックに寄る。服がシンプルでも、時計一つで大人っぽさが出る。",
                tips: ["品格", "きちんと", "手元"],
            },
            {
                id: "subcategory.accessories.sunglasses",
                label: "サングラス",
                img: "/samples/subcategory/accessories/sunglasses.png",
                descShort: "顔まわりを締めるスパイス",
                desc: "かけるだけで雰囲気が出て、コーデ全体が締まるアイテム。形（ウェリントン/ボストン/スクエア）で印象が変わる。主張しすぎないなら黒やべっ甲が使いやすい。",
                tips: ["雰囲気", "引き締め", "スパイス"],
            },
            {
                id: "subcategory.accessories.jewelry",
                label: "ジュエリー",
                img: "/samples/subcategory/accessories/jewelry.png",
                descShort: "さりげなく上質さを足す",
                desc: "首元・手元・耳元に“光”を足して、コーデの完成度を上げるアイテム。盛りすぎると重く見えるので、基本は一点主役が綺麗。シルバーはクール、ゴールドは華やかに寄る。",
                tips: ["上質", "一点主役", "艶"],
            },
        ],
    },
]
    ;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getStyleLane(id: string): TagDescriptor | undefined {
    return STYLE_LANES.find((lane) => lane.id === id);
}

export function getPersona(id: string): TagDescriptor | undefined {
    return PERSONAS.find((persona) => persona.id === id);
}

export function getElement(id: string): TagDescriptor | undefined {
    return ELEMENTS.find((element) => element.id === id);
}

export function getProductCategory(id: string): ProductCategory | undefined {
    return PRODUCT_TAXONOMY.find((cat) => cat.id === id);
}

export function getProductSubcategory(subcategoryId: string): ProductSubcategory | undefined {
    for (const category of PRODUCT_TAXONOMY) {
        const sub = category.subs.find((s) => s.id === subcategoryId);
        if (sub) return sub;
    }
    return undefined;
}
