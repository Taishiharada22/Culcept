/**
 * presenceInterpret.ts — Presence Mirror Interpretation Engine v2
 *
 * 「説明」ではなく「発見」を生む。
 * ユーザーが「自分って、外から見るとこういう人なんだ」と感じる瞬間を作る。
 *
 * 設計原則:
 * - 単一レーンの説明ではなく、レーン×レーン、レーン×PC、レーン×要素の組み合わせで固有の物語を生む
 * - 「あなたは○○です」ではなく「あなたは○○と映りやすい。でも実は——」の構造
 * - 関係性は条件列挙ではなく、引力・摩擦・成長の物語として語る
 * - Perception Gap（自己認識と外からの見え方のズレ）を可視化する
 */

/* ════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════ */

export type PresenceInput = {
    lanes: string[];
    likes: string[];
    avoid: string[];
    silhouette_pref: string | null;
    material_pref: string | null;
    body_type: string | null;
    body_subtype: string | null;
    pc_season: string | null;
    pc_base: string | null;
    style_score: number;
    seek_people_hard_include: string[];
    seek_people_soft_include: string[];
    seek_people_hard_exclude: string[];
    seek_people_soft_exclude: string[];
    tags: string[];
};

export type PresenceSummary = {
    headline: string;
    subline: string;
};

export type IAmMirrorResult = {
    firstImpression: string;
    deeperTruth: string;
    charm: string;
    misperception: string;
    values: string;
    interpersonalDistance: string;
};

export type ISeekRelationsResult = {
    attracted: string;
    deepenWith: string;
    initialButFade: string;
    clashWith: string;
    commonMisunderstanding: string;
};

export type PerceptionGap = {
    selfImage: string;      // 本人が思っている自分
    othersImage: string;    // 他者から見た自分
    gapInsight: string;     // そのズレが意味すること
    gapLevel: number;       // 0-100 ズレの大きさ
};

export type GrowthVector = {
    currentStrength: string;  // 今の強み
    blindSpot: string;        // 気づいていない可能性
    nextStep: string;         // 次に開ける扉
};

export type PresenceAura = {
    primaryColor: string;     // グラデーション開始色
    secondaryColor: string;   // グラデーション終了色
    keyword: string;          // 1語のオーラキーワード
    intensity: number;        // 0-100 オーラの強さ
};

export type ImpressionEvolution = {
    recent: { keyword: string; signal: string }[];   // 7日
    medium: { keyword: string; signal: string }[];    // 30日
    longTerm: { keyword: string; signal: string }[];  // 180日
    narrative: string;   // 変遷の物語
    trend: "deepening" | "shifting" | "stable" | "emerging";
};

/* ── Personality Radar (8軸パーソナリティ分析) ── */
export type PersonalityDimension = {
    axis: string;        // 軸名
    score: number;       // 0-100
    insight: string;     // その軸の洞察
    actionHint?: string; // スコアが低い場合のアクションヒント
};

export type PersonalityRadar = {
    dimensions: PersonalityDimension[];
    overallShape: string; // 全体の形についての洞察
};

/* ── Strength-Weakness Analysis (強み・弱み分析) ── */
export type StrengthAxis = {
    label: string;
    score: number;       // 0-100
    grade: "S" | "A" | "B" | "C" | "D";
    insight: string;
    isStrength: boolean;
    icon: string;
    actionHint?: string; // 成長のヒント
};

export type StrengthAnalysis = {
    axes: StrengthAxis[];
    topStrength: string;
    topGrowthArea: string;
};

/* ── Potential Map (ポテンシャルマップ) ── */
export type PotentialField = {
    field: string;       // 領域名
    fit: number;         // 0-100 適性度
    reason: string;      // なぜ適しているか
    icon: string;
};

export type PotentialMap = {
    thriveIn: PotentialField[];  // 力を発揮できる場
    coreMessage: string;        // あなたが最も輝ける場所
};

/* ── Companion Voice (コンパニオンの声) ── */
export type CompanionMessage = {
    category: "strength" | "encouragement" | "warning" | "direction";
    title: string;
    message: string;
    icon: string;
};

export type CompanionVoice = {
    greeting: string;
    deepUnderstanding: string;
    messages: CompanionMessage[];
    closingWords: string;
};

/* ── Genome Summary (結論サマリー) ── */
export type GenomeSummary = {
    completionPct: number;       // 全体の完成度
    strongAxes: { axis: string; score: number }[];  // 強い軸（top 2）
    weakAxis: { axis: string; score: number };       // 弱い軸
    nextAction: string;          // 次のおすすめ行動
    nextActionCta: string;       // CTAテキスト
    nextActionHref: string;      // CTA先
    statusLabel: string;         // ステータスラベル
    statusLevel: "high" | "mid" | "forming" | "collecting"; // ステータスレベル
    missingDataHints: string[];  // 不足データのヒント
};

/* ════════════════════════════════════════════════════════
   Lane Combination Narratives
   — 2レーンの組み合わせで固有の物語を生む
   ════════════════════════════════════════════════════════ */

type CombinationNarrative = {
    headline: string;
    firstImpression: string;
    deeperTruth: string;
    charm: string;
    tension: string;  // 内部矛盾・緊張から生まれる魅力
};

const LANE_COMBOS: Record<string, CombinationNarrative> = {
    "minimal+elegant": {
        headline: "静かな洗練の中に、揺るがない美学がある人",
        firstImpression: "完成度の高い空気感をまとっている。言葉が少なくても、佇まいだけで説得力がある。「この人は何かを分かっている」と感じさせるタイプ",
        deeperTruth: "一見クールに見えるが、美しいものへの感動は人一倍深い。ただ、それを表に出さないから周囲には伝わりにくい",
        charm: "ノイズを排除できる審美眼と、自分の基準を静かに貫く芯の強さ。一緒にいると、周囲の美意識まで自然と引き上がる",
        tension: "内面の豊かさと外見のクールさにギャップがある。近づきたいのに距離を感じさせてしまうことがある",
    },
    "minimal+street": {
        headline: "削ぎ落とした美学と、型破りな自由が同居する人",
        firstImpression: "シンプルなのにどこか引っかかる。きれいにまとまっているようで、既存の枠には収まっていない不思議な存在感",
        deeperTruth: "秩序と混沌を両方持っていて、どちらにも完全には属さない。この「どっちつかず」こそが、この人の最大の個性",
        charm: "クリーンさの中にある遊び心。予想を裏切る選択ができる人で、一緒にいると退屈しない",
        tension: "整えたい衝動と壊したい衝動が共存している。自分でもどちらが本当の自分か分からなくなることがある",
    },
    "minimal+vintage": {
        headline: "時間軸を超えた美意識を持つ、静かな探求者",
        firstImpression: "無駄がないのに温度がある。新しいものにも古いものにも等しく価値を見出せる、独自の審美眼を感じさせる",
        deeperTruth: "「良いもの」の定義が一般と違う。流行や時代に左右されず、自分だけの基準で世界を見ている",
        charm: "選んだものに必ず理由がある。その理由を聞くと、世界の見え方が少し変わる。知的好奇心をくすぐる人",
        tension: "こだわりが強すぎて、他人の選択に無意識にジャッジを入れてしまうことがある",
    },
    "elegant+sporty": {
        headline: "華やかさと躍動感を併せ持つ、ギャップの魅力がある人",
        firstImpression: "明るくて華がある。動きがある場でも洗練を失わない、バランス感覚の良さを感じさせる",
        deeperTruth: "美しさと強さを両立させたいという強い意志がある。どちらかだけでは満足できない、欲張りな向上心",
        charm: "フォーマルにもカジュアルにも対応できる柔軟さ。どんな場にいても浮かず、むしろ場を引き締める",
        tension: "完璧を目指すあまり、弱さを見せることに抵抗がある。頑張りすぎて疲れていることに自分で気づけないことがある",
    },
    "street+vintage": {
        headline: "反骨精神と文化的教養を持つ、独自の世界観の住人",
        firstImpression: "「自分の物語」がある人。流行を追わないのに古臭くならない。新しいルールを自分で作っている感覚",
        deeperTruth: "根底にあるのは「既存の価値観への静かな反抗」。それをスタイルという形で表現している",
        charm: "他の人が気づかない面白さを発見する力。一緒に散歩するだけで、街の見え方が変わる",
        tension: "独自すぎて共感者が少ない。「分かってもらえない」という孤独を感じやすい",
    },
    "street+sporty": {
        headline: "自由とエネルギーの塊。場の空気を一瞬で変えられる人",
        firstImpression: "近くにいるだけで元気になれる存在感。カジュアルなのに印象に残る",
        deeperTruth: "陽気に見えて、実はリズムにとても敏感。場の空気を読む力が高く、計算ではなく本能で人を楽しませている",
        charm: "壁のなさと行動力。「とりあえず行ってみよう」が口癖で、周囲を巻き込む力がある",
        tension: "テンションで勝負できるが、静かな場面でどう振る舞うか迷うことがある。沈黙が苦手",
    },
    "luxury+minimal": {
        headline: "最少で最上を追求する、削ぎ落としの美学を持つ人",
        firstImpression: "少ないもので高い完成度を出す。量ではなく質、言葉ではなく空気感で勝負するタイプ",
        deeperTruth: "見えるものすべてに投資基準がある。妥協しない姿勢は、自分自身への高い要求の表れ",
        charm: "「少なく持って、深く使う」という生き方そのものが周囲にインスピレーションを与えている",
        tension: "基準が高すぎて、他人を巻き込むことに遠慮してしまう。「求めすぎかも」と自分を抑えることがある",
    },
    "luxury+elegant": {
        headline: "確かな審美眼と華やかさで、空間の質を変えられる人",
        firstImpression: "そこにいるだけで場のグレードが上がる。品格と華やかさの両方を自然にまとっている",
        deeperTruth: "美しさへのこだわりは、自分と周囲への深いリスペクトの表現。「最高の自分」を毎日更新し続けている",
        charm: "見る目の確かさと、それを惜しみなく共有する寛大さ。良いものを教えてくれる存在",
        tension: "他人の美意識の低さにストレスを感じやすい。黙っていても態度に出てしまうことがある",
    },
    "daily+outdoor": {
        headline: "どこにいても自然体で、一緒にいて心が休まる人",
        firstImpression: "肩の力が抜けていて、安心感がある。飾らないのに魅力的。無理をしていない空気感",
        deeperTruth: "「ちょうどいい」の感覚が鋭い。足し算より引き算が上手で、本当に必要なものを見極めている",
        charm: "存在自体が安らぎ。一緒にいると「これでいいんだ」と思える。頑張りすぎている人を自然と癒す力がある",
        tension: "心地よさを優先するあまり、成長の機会を逃すことがある。変化を避ける傾向も",
    },
    "workwear+vintage": {
        headline: "ものづくりの精神と時間の重みを尊ぶ、ストーリーテラー",
        firstImpression: "持ち物ひとつひとつに歴史がある。表面ではなく「裏側」を大事にしている人だと直感的に分かる",
        deeperTruth: "消費ではなく共生。ものと長く付き合うことで、自分自身の輪郭も深まっていくと信じている",
        charm: "モノを介して語れる人生の深さ。黙って見せるだけで説得力がある",
        tension: "新しいものへの抵抗感が強すぎることがある。変化を「薄まり」と捉えがち",
    },
};

/* ════════════════════════════════════════════════════════
   Single Lane Personas (fallback when no combo match)
   ════════════════════════════════════════════════════════ */

type LaneCore = {
    firstImpression: string;
    deeperTruth: string;
    charm: string;
    misperception: string;
    values: string;
    distance: string;
    attracted: string;
    clash: string;
    growthEdge: string;  // 成長の余白
    selfImage: string;   // 本人が思っている自分
    othersImage: string; // 他者から見た自分
};

const LANES: Record<string, LaneCore> = {
    minimal: {
        firstImpression: "無駄のない佇まいに、確かな知性と審美眼を感じさせる。声が大きくなくても、選択の精度で存在感を放つ人",
        deeperTruth: "静けさの奥に、強い感受性がある。引き算のセンスは「何を捨てるか」に人一倍向き合ってきた証拠",
        charm: "選び抜く力。そしてその選択に迷いがないこと。「この人が選んだなら間違いない」と周囲に思わせる信頼感",
        misperception: "近寄りがたい、感情がないと思われがち。本当は感動屋で、心を動かされたものには深く入れ込む",
        values: "本質を見抜きたい。表層のノイズを剥がして、一番大事なものだけを手元に残す",
        distance: "初対面では壁がある。しかし一度信頼すると、驚くほど誠実で深い関わりを持つ",
        attracted: "自分だけの基準を持ち、それを押しつけない人。静かな強さに惹かれる",
        clash: "言葉や物が多すぎる人。雑然とした環境は、この人のエネルギーを奪う",
        growthEdge: "「自分の基準」だけで完結しない場を持つと、新しい感性に出会える。受け入れることも引き算の一部",
        selfImage: "合理的で冷静、感情に振り回されない人間",
        othersImage: "何を考えているか分からない、でも確実にセンスがある人",
    },
    street: {
        firstImpression: "型にはまらないエネルギーがある。自由でありながら、自分なりのルールを持っている気配がする",
        deeperTruth: "ラフに見えて繊細。場の空気を誰よりも速く読み、自分の立ち位置を瞬時に調整できる",
        charm: "一緒にいると日常が楽しくなる。場を盛り上げるのではなく、場を「面白くする」才能",
        misperception: "軽い人だと思われがち。でも芯は誰より硬い。自由に見えて、譲れないラインが明確にある",
        values: "自分らしくいられるか。それが全ての判断基準。窮屈さは何より耐えられない",
        distance: "誰にでもオープンに見えるが、本当の内面を見せる相手はごく少数。フレンドリーさの裏にある選別眼は鋭い",
        attracted: "リズムが合う人。言葉で説明できない「ノリ」の一致が何より大事",
        clash: "ルールで縛ろうとする人。形式を愛する人とは根本的に噛み合わない",
        growthEdge: "自由を守るだけでなく、「何のための自由か」を問うと、表現に深みが出る",
        selfImage: "自由で柔軟、誰とでもうまくやれる人間",
        othersImage: "楽しいけど掴めない、近いようで遠い人",
    },
    vintage: {
        firstImpression: "独自の文脈を持っている人。トレンドとは違う時間軸で生きている知性と深さを感じさせる",
        deeperTruth: "「古い」のではなく「時間に耐えたもの」を愛している。その目利きの裏には、膨大な経験と試行錯誤がある",
        charm: "ものを通して語れる物語の豊かさ。会話の中で、他の人が気づかない面白さを引き出せる人",
        misperception: "頑固でこだわりが強いだけの人に見えがち。でも新しいものを拒絶しているのではなく、選別基準が違うだけ",
        values: "流されないこと。自分の目で見て、自分の手で触れて、自分で判断する",
        distance: "少人数で深く付き合うのが自然体。広く浅い付き合いはエネルギーを消耗する",
        attracted: "自分なりの世界観を持っている人。文脈のある会話ができる相手",
        clash: "表面だけで判断する人、ストーリーのないものに飛びつく人",
        growthEdge: "自分の世界観に閉じず、「理解できないもの」をあえて取り入れると、審美眼がさらに研ぎ澄まされる",
        selfImage: "独自の美意識で生きている、ブレない人間",
        othersImage: "こだわりの強い、ちょっと近寄りがたい人",
    },
    sporty: {
        firstImpression: "ポジティブなエネルギーと健やかさが伝わる。行動力があり、周囲に活力を与える存在感",
        deeperTruth: "動き続ける裏に「止まると不安」がある。行動で解決する癖があり、内省の時間が足りないことがある",
        charm: "前向きさが本物であること。作った明るさではなく、身体性から来る自然なポジティブさ",
        misperception: "考えが浅いと見られがち。でも体感を通じた直感は鋭く、理屈より先に正解を掴んでいることが多い",
        values: "動いて確かめる。理論だけの世界には収まれない、体感派の哲学",
        distance: "誰とでもすぐ打ち解ける。しかし深い関係を築くには、一緒に何かを体験した時間が必要",
        attracted: "フットワークが軽い人。一緒に動ける相手に自然と惹かれる",
        clash: "頭でっかちで動かない人。変化を恐れる空気は、この人にとって酸欠に等しい",
        growthEdge: "立ち止まることも強さだと知ると、行動の質が変わる。静の中にある動を見つける",
        selfImage: "行動力があり、前向きで健康的な人間",
        othersImage: "元気で付き合いやすいけど、深い話ができるか不安な人",
    },
    luxury: {
        firstImpression: "品格と確かな目利きを感じさせる。妥協のない生き方が、言葉なしに伝わってくる",
        deeperTruth: "贅沢を求めているのではなく、「最善を選ぶ」ことで自尊心を保っている。自分への投資は、自己肯定の形",
        charm: "確かな判断力と、良いものを惜しみなく共有する懐の深さ。周囲のレベルを自然と引き上げる",
        misperception: "見栄っ張りや物質主義に見えがち。本質は「量」ではなく「質」への執念",
        values: "妥協しない。中途半端に手を打つくらいなら、待ってでも最善を選ぶ",
        distance: "信頼の壁は高いが、超えた相手には驚くほど寛大。与えることに喜びを感じる",
        attracted: "自分を磨き続けている人。努力を積み重ねている人に深い敬意を持つ",
        clash: "安さだけで選ぶ人、「何でもいい」が口癖の人。価値判断のない選択に居心地の悪さを感じる",
        growthEdge: "「最善を選ぶ」だけでなく「不完全を愛する」余裕が加わると、品格がさらに深まる",
        selfImage: "確かな審美眼を持ち、妥協しない人間",
        othersImage: "敷居が高く、ちょっと緊張する人",
    },
    daily: {
        firstImpression: "安心感のある空気をまとっている。一緒にいるだけで肩の力が抜ける、自然体の心地よさ",
        deeperTruth: "「何もしていない」ように見えるが、実は人の機微をよく見ている。さりげない配慮が得意",
        charm: "存在自体が癒し。頑張りすぎている人に「それでいいよ」と伝えられる稀有な力",
        misperception: "こだわりがない、無頓着だと思われやすい。しかし「心地よさ」への基準は実は非常に高い",
        values: "日常を丁寧に生きること。派手さより、毎日が穏やかであることに価値を置く",
        distance: "壁がなく、誰とでも自然に関われる。ただし「気を遣いすぎて疲れていても顔に出さない」面がある",
        attracted: "一緒にいて無理のない人。背伸びしなくていい関係に安心を感じる",
        clash: "常に刺激を求める人、日常を「退屈」と呼ぶ人。この人の大切にしているものを否定されると静かに傷つく",
        growthEdge: "心地よさの外に少しだけ足を踏み出すと、「安心感」が「冒険も包み込める安心感」に進化する",
        selfImage: "穏やかで気楽、特別なこだわりはない人間",
        othersImage: "一緒にいて心が休まる、実はよく人を見ている人",
    },
    elegant: {
        firstImpression: "華やかさと品の良さが同居する存在感。洗練された空気をまとい、場のトーンを自然と引き上げる",
        deeperTruth: "美しくあることは努力の結果。その裏にある「こうありたい」という強い意志を、普段は見せない",
        charm: "一緒にいると、自分も美しくありたいと思える。美意識の伝播力を持っている",
        misperception: "完璧主義で近寄りがたいと思われやすい。内面は意外と柔らかく、不完全さにも優しい",
        values: "美しさは自分への誠実さ。外見を整えることは、内面を整えることと地続きだと信じている",
        distance: "礼儀正しく丁寧。でも心を開くまでには段階がある。一足飛びに親密になることは少ない",
        attracted: "繊細さを理解してくれる人。美を共有できる相手に深い絆を感じる",
        clash: "がさつな人、美しさに価値を置かない人。この人にとって美は贅沢品ではなく必需品",
        growthEdge: "「美しくなくてもいい瞬間」を許せると、その姿がかえって一番美しく映る",
        selfImage: "美意識が高く、品のある人間",
        othersImage: "洗練されていて素敵だが、素を見せてくれない人",
    },
    workwear: {
        firstImpression: "実直さと堅実さが伝わる。言葉より行動で信頼を積み重ねるタイプだと直感的に分かる",
        deeperTruth: "シンプルな外見の裏に、機能性と耐久性への深い哲学がある。ものを大事にする人は、人も大事にする",
        charm: "嘘がなさそうな空気感。黙っていても信頼が伝わる。「この人に任せたら大丈夫」と思わせる安定感",
        misperception: "地味でこだわりがないと見られがち。しかし「何を選ばないか」に最もこだわっているタイプ",
        values: "使い続けられること。消費ではなく共生。短期的な華やかさより、長期的な信頼を選ぶ",
        distance: "多くを語らないが、態度で示す。信頼した相手との関係は非常に深く、長い",
        attracted: "手を動かすことが好きな人。言葉だけの人間には心を開きにくい",
        clash: "表面だけを飾る人、使い捨ての文化に生きる人。この人の生き方の根幹に触れるNGライン",
        growthEdge: "機能だけでなく「遊び」を取り入れると、堅実さに魅力的な余白が生まれる",
        selfImage: "地に足がついた、無駄のない人間",
        othersImage: "寡黙で実直、信頼はできるが感情が見えにくい人",
    },
    outdoor: {
        firstImpression: "開放的でリラックスした空気感。自然体なのに存在感がある、風通しの良い人",
        deeperTruth: "自由に見えるが、心地よさの基準は明確。自分が「楽でいられる環境」を設計する力がある",
        charm: "一緒にいると肩の力が抜ける。都会の緊張感を忘れさせてくれる存在",
        misperception: "ラフで適当に見えることがあるが、環境や素材へのこだわりは実はかなり強い",
        values: "快適であること。自然の中に身を置くことで、自分のリズムを取り戻せると知っている",
        distance: "壁がなくオープン。しかし束縛は苦手で、互いの自由を尊重できる関係を好む",
        attracted: "自然のリズムで過ごせる人。一緒に外に出かけたくなる相手",
        clash: "閉鎖的な人、常に都会の論理で動く人。自然の時間感覚を理解できない人",
        growthEdge: "「心地よい場所にいる」だけでなく、「心地よくない場所を心地よくする」力を開発すると、器が広がる",
        selfImage: "自然体で自由、縛られない人間",
        othersImage: "リラックスしていて楽しいが、ちゃんとしてほしい時にちょっと不安な人",
    },
};

/* ════════════════════════════════════════════════════════
   PC × Body Cross Insights
   ════════════════════════════════════════════════════════ */

const PC_AURA: Record<string, { keyword: string; quality: string; tension: string; primary: string; secondary: string }> = {
    spring: {
        keyword: "陽だまり",
        quality: "場を明るくする力がある。この人がいると、周囲の表情が自然と和らぐ",
        tension: "楽観的に見えるが、人の痛みに敏感。笑顔の裏で傷ついていることに気づかれにくい",
        primary: "#f59e0b",
        secondary: "#fb923c",
    },
    summer: {
        keyword: "水面",
        quality: "穏やかな知性と、見る人の心を鎮める静かな力がある",
        tension: "控えめに見えるが、内側に鋭い美的感覚を持っている。主張しない分、理解されるのに時間がかかる",
        primary: "#6366f1",
        secondary: "#8b5cf6",
    },
    autumn: {
        keyword: "薪火",
        quality: "落ち着いた温かみと、大人の余裕を感じさせる。一緒にいると安心する深い安定感",
        tension: "穏やかに見えるが、揺るがない芯がある。この人が怒ったとき、周囲は本気だと分かる",
        primary: "#d97706",
        secondary: "#dc2626",
    },
    winter: {
        keyword: "刃",
        quality: "シャープで印象的。短い言葉で核心を突く力がある。存在するだけでフォーカスが集まる",
        tension: "冷たく見られやすいが、一度心を許した相手には驚くほど情が深い。ギャップが魅力であり、誤解の元でもある",
        primary: "#1e1b4b",
        secondary: "#7c3aed",
    },
};

const BODY_DEPTH: Record<string, { physical: string; impression: string }> = {
    straight: {
        physical: "直線的で凛とした体の存在感が、発言に説得力を加えている",
        impression: "堂々としていて頼もしい。リーダーシップを期待されやすいが、本人はそう思っていないことも多い",
    },
    wave: {
        physical: "曲線的で柔らかい印象が、親しみやすさとして伝わっている",
        impression: "華やかで繊細。周囲は「守りたい」と思うが、本人は見た目以上にしなやかで強い",
    },
    natural: {
        physical: "骨格のラフさが「飾らなくても大丈夫」という空気を作っている",
        impression: "こなれた自然体。作り込まない魅力が伝わるが、本人の内面のこだわりは意外と強い",
    },
};

/* ════════════════════════════════════════════════════════
   Element Patterns → Psychological Insights
   ════════════════════════════════════════════════════════ */

const ELEMENT_PSYCHOLOGY: Record<string, { deep: string; socialSignal: string }> = {
    monotone: { deep: "感情を色に載せない選択。それは「自分を見せたくない」のではなく、「色以外で語りたい」という静かな主張", socialSignal: "知的で冷静、一歩引いて物事を見ている人" },
    earthcolor: { deep: "大地に触れたい感覚。安定と温かみを求めるのは、人間関係でも同じ", socialSignal: "安心感があり、一緒にいて疲れない人" },
    vividcolor: { deep: "感情をダイレクトに表現したい衝動。世界を鮮やかに見ている証拠", socialSignal: "エネルギッシュで、場を華やかにする人" },
    colorfull: { deep: "多様性を楽しめる柔軟さ。ひとつに決められないのは、世界の面白さを知りすぎているから", socialSignal: "社交的で創造的、退屈させない人" },
    oversize: { deep: "身体を包む余白は、心の余白でもある。縛られたくない、でも包まれたい", socialSignal: "おおらかでリラックスした雰囲気" },
    justsize: { deep: "「ちょうどいい」を追求する精度。それはものだけでなく、人間関係にも当てはまる", socialSignal: "バランス感覚が良く、整った印象" },
    tightfit: { deep: "自分の輪郭をはっきりさせたい意志。ぼやけることへの抵抗がある", socialSignal: "意志が強く、存在感がはっきりした人" },
    layerd: { deep: "一枚で終わらない重層性。人間関係でも表層だけでは満足できない", socialSignal: "深みのある人、一筋縄ではいかない面白さ" },
    simple: { deep: "削ぎ落とした先に残るものを信じている。「足りない」のではなく「これで十分」という確信", socialSignal: "潔くて清潔感がある、信頼できる人" },
    onepoint: { deep: "全体を崩さずに個性を入れるバランス感覚。主張したいが目立ちすぎたくないという繊細な自意識", socialSignal: "センスの良さが光る、さりげない存在感" },
    highbrand: { deep: "品質への投資は自己肯定の形。「自分にはこれだけの価値がある」という静かな宣言", socialSignal: "上質な空気をまとう、品格のある人" },
    used: { deep: "時間が刻んだ痕跡に美を見る。この人は「新品」より「育った」ものを愛する", socialSignal: "独自の審美眼がある、ストーリーを大切にする人" },
    standard: { deep: "時代が変わっても変わらないものへの信頼。根底にあるのは「普遍」への美意識", socialSignal: "安定感があり、ブレない人" },
    trend: { deep: "時代の空気を感じ取るアンテナの鋭さ。変化を恐れないのは、自分の軸があるから", socialSignal: "モダンで洗練された、今を生きている人" },
    individual: { deep: "唯一無二であること。それは孤独でもあり、自由でもある", socialSignal: "替えがきかない存在感、独自のオーラ" },
    fastfashion: { deep: "実験と失敗を恐れない柔軟さ。完璧を求めるより、試す数で勝負する", socialSignal: "フットワークが軽く、変化を楽しめる人" },
};

/* ════════════════════════════════════════════════════════
   Tag → Human-readable Labels
   ════════════════════════════════════════════════════════ */

const TAG_LABELS: Record<string, string> = {
    monotone: "モノトーン",
    earthcolor: "アースカラー",
    vividcolor: "ビビッドカラー",
    colorfull: "カラフル",
    oversize: "オーバーサイズ",
    justsize: "ジャストサイズ",
    tightfit: "タイトフィット",
    layerd: "レイヤード",
    simple: "シンプル",
    onepoint: "ワンポイント",
    highbrand: "ハイブランド",
    used: "ユーズド",
    standard: "スタンダード",
    trend: "トレンド",
    individual: "個性派",
    fastfashion: "ファストファッション",
    minimal: "ミニマル",
    street: "ストリート",
    vintage: "ヴィンテージ",
    sporty: "スポーティ",
    luxury: "ラグジュアリー",
    daily: "デイリー",
    elegant: "エレガント",
    workwear: "ワークウェア",
    outdoor: "アウトドア",
};

function tagLabel(tag: string): string {
    return TAG_LABELS[tag] ?? ELEMENT_PSYCHOLOGY[tag]?.socialSignal ?? tag;
}

function tagSocialSignal(tag: string): string {
    return ELEMENT_PSYCHOLOGY[tag]?.socialSignal ?? TAG_LABELS[tag] ?? tag;
}

/* ════════════════════════════════════════════════════════
   Core Build Functions
   ════════════════════════════════════════════════════════ */

function getComboKey(lanes: string[]): string | null {
    if (lanes.length < 2) return null;
    const [a, b] = [lanes[0], lanes[1]];
    const key1 = `${a}+${b}`;
    const key2 = `${b}+${a}`;
    return LANE_COMBOS[key1] ? key1 : LANE_COMBOS[key2] ? key2 : null;
}

export function buildPresenceSummary(input: PresenceInput): PresenceSummary {
    const { lanes, pc_season } = input;
    const comboKey = getComboKey(lanes);
    const combo = comboKey ? LANE_COMBOS[comboKey] : null;
    const primary = lanes[0] ? LANES[lanes[0]] : null;
    const pc = pc_season ? PC_AURA[pc_season.toLowerCase()] : null;

    let headline: string;
    if (combo) {
        headline = combo.headline;
    } else if (primary && pc) {
        headline = `${primary.firstImpression.split("。")[0]}。${pc.quality.split("。")[0]}`;
    } else if (primary) {
        headline = primary.firstImpression.split("。")[0];
    } else {
        headline = "あなたの輪郭はまだ描かれていない。使い続けることで、他者から見た姿が浮かび上がる";
    }

    let subline: string;
    if (combo) {
        subline = combo.tension;
    } else if (primary) {
        subline = `ただし——${primary.misperception.split("。")[0]}`;
    } else {
        subline = "データが増えるほど、あなた自身も知らなかった「見え方」が明らかになります";
    }

    return { headline, subline };
}

export function buildIAmMirror(input: PresenceInput): IAmMirrorResult {
    const { lanes, likes, avoid, pc_season, body_type, silhouette_pref } = input;
    const comboKey = getComboKey(lanes);
    const combo = comboKey ? LANE_COMBOS[comboKey] : null;
    const primary = lanes[0] ? LANES[lanes[0]] : null;
    const secondary = lanes[1] ? LANES[lanes[1]] : null;
    const pc = pc_season ? PC_AURA[pc_season.toLowerCase()] : null;
    const body = body_type ? BODY_DEPTH[body_type.toLowerCase()] : null;

    // ── 第一印象 ──
    let firstImpression: string;
    if (combo) {
        firstImpression = combo.firstImpression;
    } else {
        const parts: string[] = [];
        if (body) parts.push(body.impression.split("。")[0]);
        if (primary) parts.push(primary.firstImpression.split("。")[0]);
        if (pc) parts.push(pc.quality.split("。")[0]);
        firstImpression = parts.length > 0
            ? parts.slice(0, 2).join("。") + "。初対面の人にはそう映りやすい"
            : "まだデータが少ない。行動を重ねることで、あなたの第一印象が見えてくる";
    }

    // ── 深く知ると見える本質 ──
    let deeperTruth: string;
    if (combo) {
        deeperTruth = combo.deeperTruth;
    } else {
        const parts: string[] = [];
        if (primary) parts.push(primary.deeperTruth);
        if (pc) parts.push(pc.tension);
        if (secondary) parts.push(`さらに${secondary.firstImpression.split("。")[0]}という別の顔も持っている`);
        deeperTruth = parts.length > 0
            ? parts.slice(0, 2).join("。")
            : "あなたの深層はまだ観測中。もう少し使い込むと、表面からは見えない本質が浮かぶ";
    }

    // ── 魅力 ──
    let charm: string;
    if (combo) {
        charm = combo.charm;
    } else {
        const parts: string[] = [];
        if (primary) parts.push(primary.charm);
        // likes から深い洞察を追加
        const likeDeepInsights = likes
            .map((l) => ELEMENT_PSYCHOLOGY[l]?.socialSignal)
            .filter(Boolean)
            .slice(0, 2);
        if (likeDeepInsights.length > 0) {
            parts.push(`周囲は「${likeDeepInsights.join("」「")}」と感じている`);
        }
        charm = parts.length > 0
            ? parts.slice(0, 2).join("。")
            : "あなたの魅力はこれから明らかになる";
    }

    // ── 誤解されやすい点 ──
    const misParts: string[] = [];
    if (primary) misParts.push(primary.misperception);
    // likes×avoid の矛盾から誤解パターンを生成
    if (likes.includes("simple") && likes.includes("highbrand")) {
        misParts.push("シンプル好きなのに高級志向？ 実は「最小限の最上級」を求めている、ということが伝わりにくい");
    }
    if (likes.includes("oversize") && (lanes.includes("elegant") || lanes.includes("luxury"))) {
        misParts.push("ラフに見えるのにこだわりが強い——その二面性を「矛盾」ではなく「奥行き」として受け取ってもらうには時間がかかる");
    }
    if (avoid.length > 0) {
        const avoidSignals = avoid
            .map((a) => ELEMENT_PSYCHOLOGY[a]?.socialSignal)
            .filter(Boolean)
            .slice(0, 2);
        if (avoidSignals.length > 0) {
            misParts.push(`「${avoidSignals.join("」「")}」な人を無意識に遠ざけることがあり、相手からは壁を感じられやすい`);
        }
    }
    const misperception = misParts.length > 0
        ? misParts.slice(0, 2).join("。")
        : "まだデータが少ない";

    // ── 価値観 ──
    const valueParts: string[] = [];
    if (primary) valueParts.push(primary.values);
    const deepLikeInsights = likes
        .map((l) => ELEMENT_PSYCHOLOGY[l]?.deep)
        .filter(Boolean)
        .slice(0, 2);
    if (deepLikeInsights.length > 0) {
        valueParts.push(deepLikeInsights[0]!.split("。")[0]);
    }
    const values = valueParts.length > 0
        ? valueParts.slice(0, 2).join("。")
        : "あなたの価値観はこれから浮かぶ";

    // ── 対人距離感 ──
    const distParts: string[] = [];
    if (primary) distParts.push(primary.distance);
    if (silhouette_pref === "oversize" || likes.includes("oversize")) {
        distParts.push("距離が近すぎると息苦しい。自分の空間を持てる関係が心地よい");
    } else if (silhouette_pref === "tightfit" || likes.includes("tightfit")) {
        distParts.push("密度の高い関係を求める。中途半端なつながりよりも、深く関わるか関わらないかの二択");
    }
    if (body) {
        distParts.push(body.physical.split("。")[0]);
    }
    const interpersonalDistance = distParts.length > 0
        ? distParts.slice(0, 2).join("。")
        : "あなたの対人傾向はまだ見えていない";

    return { firstImpression, deeperTruth, charm, misperception, values, interpersonalDistance };
}

export function buildISeekRelations(input: PresenceInput): ISeekRelationsResult {
    const {
        lanes, likes, avoid,
        seek_people_hard_include: hardInc,
        seek_people_soft_include: softInc,
        seek_people_hard_exclude: hardExc,
        seek_people_soft_exclude: softExc,
    } = input;
    const primary = lanes[0] ? LANES[lanes[0]] : null;

    // ── 惹かれやすい相手 ──
    const attractedParts: string[] = [];
    if (primary) attractedParts.push(primary.attracted);
    if (hardInc.length > 0) {
        const labels = hardInc.slice(0, 3).map((t) => ELEMENT_PSYCHOLOGY[t]?.socialSignal ?? t);
        attractedParts.push(`特に${labels.join("、")}——そういう人に無意識に引き寄せられる`);
    } else if (likes.length > 0) {
        const likeSignals = likes.slice(0, 3).map((l) => ELEMENT_PSYCHOLOGY[l]?.socialSignal ?? l);
        attractedParts.push(`自分が好むもの（${likeSignals.join("、")}）を相手にも求めやすい`);
    }
    const attracted = attractedParts.length > 0
        ? attractedParts.slice(0, 2).join("。")
        : "データが蓄積されると見えてくる";

    // ── 相性が深まりやすい相手 ──
    const deepenParts: string[] = [];
    if (softInc.length > 0) {
        const labels = softInc.slice(0, 3).map((t) => ELEMENT_PSYCHOLOGY[t]?.socialSignal ?? t);
        deepenParts.push(`${labels.join("、")}——こうした要素が重なる相手とは、時間が経つほど関係が深まる`);
    }
    if (lanes.length >= 2) {
        deepenParts.push(`${tagLabel(lanes[0])}と${tagLabel(lanes[1])}の感覚を両方理解できる相手は稀だが、出会えたときの共鳴は深い`);
    }
    if (deepenParts.length === 0 && primary) {
        deepenParts.push(`${primary.values.split("。")[0]}——この軸を共有できる相手とは自然と長く続く`);
    }
    const deepenWith = deepenParts.length > 0
        ? deepenParts.slice(0, 2).join("。")
        : "データが蓄積されると見えてくる";

    // ── 最初は惹かれても長続きしにくい ──
    const fadeParts: string[] = [];
    // 自分のレーンと真逆の要素をSEEKに入れている矛盾を検出
    if (lanes.includes("minimal") && (hardInc.some((t) => ["colorfull", "vividcolor", "layerd"].includes(t)))) {
        fadeParts.push("華やかな表現力に最初は惹かれるが、日常では自分の「静けさ」が恋しくなる。刺激と安らぎの間で揺れやすい");
    }
    if (lanes.includes("luxury") && (hardInc.some((t) => ["used", "fastfashion"].includes(t)))) {
        fadeParts.push("カジュアルさに新鮮さを感じるが、「質」の基準が合わなくなる瞬間が来やすい");
    }
    if (lanes.includes("street") && (hardInc.some((t) => ["elegant", "highbrand"].includes(t)))) {
        fadeParts.push("洗練された空気に惹かれるが、自分の自由さを窮屈に感じさせられたとき、距離を取りたくなる");
    }
    if (fadeParts.length === 0) {
        if (primary) {
            fadeParts.push(`あなたの「${primary.selfImage?.split("、")[0]}」という自己認識と違うタイプに新鮮さを感じるが、違いが大きいほど長期的な摩擦も生まれやすい`);
        } else {
            fadeParts.push("表面的な共通点で繋がると、深い部分でのズレに後から気づくことがある");
        }
    }
    const initialButFade = fadeParts.slice(0, 2).join("。");

    // ── ズレやすい相手 ──
    const clashParts: string[] = [];
    if (primary) clashParts.push(primary.clash);
    if (hardExc.length > 0) {
        const labels = hardExc.slice(0, 3).map((t) => ELEMENT_PSYCHOLOGY[t]?.socialSignal ?? t);
        clashParts.push(`${labels.join("、")}——これらは感覚レベルで相容れない要素`);
    }
    const clashWith = clashParts.length > 0
        ? clashParts.slice(0, 2).join("。")
        : "データが蓄積されると見えてくる";

    // ── すれ違い ──
    const misParts: string[] = [];
    if (softExc.length > 0) {
        const softExcLabels = softExc.slice(0, 2).map((t) => ELEMENT_PSYCHOLOGY[t]?.socialSignal ?? tagLabel(t));
        misParts.push(`小さな違和感が蓄積するパターンに注意。特に相手に「${softExcLabels.join("」「")}」の気配があると、言語化しないまま距離を取りがち`);
    }
    if (primary) {
        // selfImage vs othersImage のギャップから生まれるすれ違い
        misParts.push(`あなたは自分を「${primary.selfImage?.split("、")[0]}」だと思っているが、相手は「${primary.othersImage?.split("、")[0]}」と感じている。このズレが、すれ違いの根にあることが多い`);
    }
    if (misParts.length === 0) {
        misParts.push("自分の基準と相手の基準が暗黙のうちにすれ違い、気づいたときには溝が深くなっていることがある");
    }
    const commonMisunderstanding = misParts.slice(0, 2).join("。");

    return { attracted, deepenWith, initialButFade, clashWith, commonMisunderstanding };
}

/* ════════════════════════════════════════════════════════
   New Features: Perception Gap / Growth Vector / Aura
   ════════════════════════════════════════════════════════ */

export function buildPerceptionGap(input: PresenceInput): PerceptionGap {
    const primary = input.lanes[0] ? LANES[input.lanes[0]] : null;
    const pc = input.pc_season ? PC_AURA[input.pc_season.toLowerCase()] : null;

    if (!primary) {
        return {
            selfImage: "まだデータが少ない",
            othersImage: "まだデータが少ない",
            gapInsight: "データが増えると、自己認識と外からの見え方の「ズレ」が見えてきます",
            gapLevel: 0,
        };
    }

    const selfImage = primary.selfImage;
    const othersImage = primary.othersImage;

    // likes/avoid のパターンからズレレベルを計算
    let gapLevel = 30; // base gap
    if (input.likes.includes("simple") && input.likes.includes("highbrand")) gapLevel += 15;
    if (input.likes.includes("oversize") && (input.lanes.includes("elegant") || input.lanes.includes("luxury"))) gapLevel += 15;
    if (input.lanes.includes("minimal") && input.likes.includes("colorfull")) gapLevel += 15;
    if (input.lanes.includes("street") && input.likes.includes("elegant")) gapLevel += 10;
    if (pc?.tension) gapLevel += 10;
    gapLevel = Math.min(95, gapLevel);

    let gapInsight: string;
    if (gapLevel >= 60) {
        gapInsight = `あなたが思う自分と、周囲が受け取る印象にはかなり差がある。でもこのギャップこそが「もっと知りたい」と思わせる魅力の源泉でもある`;
    } else if (gapLevel >= 40) {
        gapInsight = `自己認識と他者の印象にほどよいズレがある。あなたには「見た目以上の深み」があり、それが知れば知るほど面白い人物像を作っている`;
    } else {
        gapInsight = `自己認識と外からの見え方が比較的一致している。良くも悪くも「見たまま」の印象が伝わっている。意外性を加えたいなら、普段選ばないものを試してみるのもいい`;
    }

    return { selfImage, othersImage, gapInsight, gapLevel };
}

export function buildGrowthVector(input: PresenceInput): GrowthVector {
    const primary = input.lanes[0] ? LANES[input.lanes[0]] : null;
    const secondary = input.lanes[1] ? LANES[input.lanes[1]] : null;

    if (!primary) {
        return {
            currentStrength: "まだデータが少ない",
            blindSpot: "行動データが増えると、気づいていない可能性が見えてくる",
            nextStep: "スタイルデータを充実させることで、成長の方向性が明確になる",
        };
    }

    const currentStrength = `${primary.charm.split("。")[0]}——これがあなたの最大の武器`;

    let blindSpot: string;
    if (secondary) {
        blindSpot = `${secondary.growthEdge}。${primary.growthEdge.split("。")[0]}`;
    } else {
        blindSpot = primary.growthEdge;
    }

    // likes/avoid のパターンからnextStepを導出
    const avoidElements = input.avoid.filter((a) => ELEMENT_PSYCHOLOGY[a]);
    let nextStep: string;
    if (avoidElements.length > 0) {
        const avoidDeep = ELEMENT_PSYCHOLOGY[avoidElements[0]]?.deep;
        nextStep = `苦手を避けるだけでなく「なぜ苦手か」を深掘りすると、自分の輪郭がさらに鮮明になる。${avoidDeep?.split("。")[0] ?? ""}`;
    } else if (input.lanes.length === 1) {
        nextStep = "もうひとつのレーンを探すことで、表現の幅が広がる。一本の軸は強みだが、二本目の軸が加わると「この人は面白い」に変わる";
    } else {
        nextStep = primary.growthEdge;
    }

    return { currentStrength, blindSpot, nextStep };
}

export function buildPresenceAura(input: PresenceInput): PresenceAura {
    const pc = input.pc_season ? PC_AURA[input.pc_season.toLowerCase()] : null;
    const primary = input.lanes[0] ? LANES[input.lanes[0]] : null;

    const LANE_AURA_COLORS: Record<string, { primary: string; secondary: string }> = {
        minimal: { primary: "#64748b", secondary: "#94a3b8" },
        street: { primary: "#f97316", secondary: "#ef4444" },
        vintage: { primary: "#d97706", secondary: "#ca8a04" },
        sporty: { primary: "#22c55e", secondary: "#10b981" },
        luxury: { primary: "#a855f7", secondary: "#ec4899" },
        daily: { primary: "#3b82f6", secondary: "#06b6d4" },
        elegant: { primary: "#f43f5e", secondary: "#ec4899" },
        workwear: { primary: "#b45309", secondary: "#a16207" },
        outdoor: { primary: "#65a30d", secondary: "#16a34a" },
    };

    const laneColors = input.lanes[0] ? LANE_AURA_COLORS[input.lanes[0]] : null;

    return {
        primaryColor: pc?.primary ?? laneColors?.primary ?? "#6366f1",
        secondaryColor: pc?.secondary ?? laneColors?.secondary ?? "#8b5cf6",
        keyword: pc?.keyword ?? "未知",
        intensity: Math.min(100, input.style_score + (input.likes.length * 5) + (input.lanes.length * 10)),
    };
}

/* ════════════════════════════════════════════════════════
   Impression Evolution — 印象の変遷
   ════════════════════════════════════════════════════════ */

type TasteLayers = {
    layer_7d: Record<string, number>;
    layer_30d: Record<string, number>;
    layer_180d: Record<string, number>;
};

export function buildImpressionEvolution(tasteLayers: TasteLayers | null | undefined): ImpressionEvolution {
    if (!tasteLayers) {
        return {
            recent: [],
            medium: [],
            longTerm: [],
            narrative: "行動データが蓄積されると、あなたの印象がどう変化しているかが見えてきます",
            trend: "emerging",
        };
    }

    const toKeywordList = (layer: Record<string, number>) =>
        Object.entries(layer)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([key, val]) => ({
                keyword: tagLabel(key),
                signal: ELEMENT_PSYCHOLOGY[key]?.socialSignal ?? tagLabel(key),
                score: val,
            }));

    const recent = toKeywordList(tasteLayers.layer_7d);
    const medium = toKeywordList(tasteLayers.layer_30d);
    const longTerm = toKeywordList(tasteLayers.layer_180d);

    // Determine trend by comparing top keywords across time periods
    const recentTop = Object.keys(tasteLayers.layer_7d).slice(0, 3);
    const longTermTop = Object.keys(tasteLayers.layer_180d).slice(0, 3);
    const overlapCount = recentTop.filter((k) => longTermTop.includes(k)).length;

    let trend: ImpressionEvolution["trend"];
    let narrative: string;

    if (longTerm.length === 0) {
        trend = "emerging";
        narrative = "まだ長期データが少ないが、直近の行動から印象の輪郭が形成されつつある";
    } else if (overlapCount >= 3) {
        trend = "deepening";
        // 長期間同じ要素が支配的 → 深化
        const coreKeyword = recent[0]?.keyword ?? "——";
        narrative = `「${coreKeyword}」を軸にした印象が一貫して深まっている。あなたの核は揺るがず、時間とともにその印象はより確信的なものになっている`;
    } else if (overlapCount >= 1) {
        trend = "shifting";
        const stableKey = recentTop.find((k) => longTermTop.includes(k));
        const newKey = recentTop.find((k) => !longTermTop.includes(k));
        const stableLabel = stableKey ? tagLabel(stableKey) : "";
        const newLabel = newKey ? tagLabel(newKey) : "";
        narrative = `根底にある「${stableLabel}」は変わらないが、最近は「${newLabel}」の要素が加わり、印象に新しい層が生まれている。この変化は進化の兆し`;
    } else {
        trend = "stable";
        narrative = "印象の構成要素は安定している。良くも悪くも「予想通り」の人物像。意外性を加えたいなら、まだ試していないスタイル領域に足を踏み出してみるのも手";
    }

    return {
        recent: recent.map(({ keyword, signal }) => ({ keyword, signal })),
        medium: medium.map(({ keyword, signal }) => ({ keyword, signal })),
        longTerm: longTerm.map(({ keyword, signal }) => ({ keyword, signal })),
        narrative,
        trend,
    };
}

/* ════════════════════════════════════════════════════════
   Personality Radar — 8軸パーソナリティ分析
   ════════════════════════════════════════════════════════ */

export function buildPersonalityRadar(input: PresenceInput): PersonalityRadar {
    const { lanes, likes, avoid, style_score, pc_season, body_type,
        seek_people_hard_include: hardInc, seek_people_hard_exclude: hardExc,
        seek_people_soft_include: softInc,
    } = input;

    const has = (list: string[], items: string[]) => items.filter((i) => list.includes(i)).length;
    const allItems = [...lanes, ...likes];

    // 1. 審美眼 (Aesthetic Sense)
    let aesthetic = 30;
    aesthetic += has(allItems, ["elegant", "luxury", "minimal", "highbrand"]) * 12;
    aesthetic += has(allItems, ["standard", "simple", "onepoint"]) * 5;
    aesthetic += has(avoid, ["fastfashion", "colorfull"]) * 8;
    aesthetic += Math.min(style_score * 0.2, 15);
    aesthetic = Math.min(98, Math.max(10, aesthetic));

    // 2. 社交性 (Sociability)
    let sociability = 25;
    sociability += has(allItems, ["sporty", "street", "daily", "colorfull", "vividcolor"]) * 12;
    sociability += has(allItems, ["outdoor"]) * 10;
    if (lanes.length >= 2) sociability += 10;
    if (has(allItems, ["minimal"]) > 0 && lanes.length === 1) sociability -= 10;
    sociability += softInc.length * 3;
    sociability = Math.min(98, Math.max(10, sociability));

    // 3. 独創性 (Originality)
    let originality = 20;
    originality += has(allItems, ["vintage", "individual", "street", "workwear"]) * 12;
    originality += has(allItems, ["used", "layerd"]) * 8;
    const sortedLanes = lanes.slice(0, 2).sort().join("+");
    if (lanes.length >= 2 && !["daily+outdoor", "elegant+minimal"].includes(sortedLanes)) originality += 15;
    originality += has(avoid, ["standard", "fastfashion"]) * 5;
    originality = Math.min(98, Math.max(10, originality));

    // 4. 安定感 (Stability)
    let stability = 30;
    stability += has(allItems, ["minimal", "standard", "daily", "simple", "justsize"]) * 8;
    if (body_type === "straight") stability += 12;
    stability += has(allItems, ["monotone"]) * 8;
    stability -= has(allItems, ["vividcolor", "trend", "colorfull"]) * 5;
    stability += Math.min(style_score * 0.15, 10);
    stability = Math.min(98, Math.max(10, stability));

    // 5. 表現力 (Expressiveness)
    let expressiveness = 20;
    expressiveness += has(allItems, ["colorfull", "vividcolor", "layerd", "oversize"]) * 12;
    expressiveness += has(allItems, ["elegant", "individual", "trend"]) * 8;
    expressiveness += has(allItems, ["sporty", "street"]) * 6;
    if (body_type === "wave") expressiveness += 8;
    expressiveness -= has(allItems, ["monotone", "simple"]) * 3;
    expressiveness = Math.min(98, Math.max(10, expressiveness));

    // 6. こだわり度 (Commitment)
    let commitment = 20;
    commitment += likes.length * 4;
    commitment += avoid.length * 6;
    commitment += hardExc.length * 8;
    commitment += hardInc.length * 6;
    commitment += has(allItems, ["highbrand", "used"]) * 10;
    commitment += Math.min(style_score * 0.2, 12);
    commitment = Math.min(98, Math.max(10, commitment));

    // 7. 共感力 (Empathy)
    let empathy = 30;
    empathy += has(allItems, ["daily", "outdoor"]) * 10;
    if (body_type === "wave") empathy += 10;
    if (pc_season?.toLowerCase() === "spring") empathy += 8;
    if (pc_season?.toLowerCase() === "summer") empathy += 5;
    empathy += softInc.length * 4;
    empathy -= hardExc.length * 3;
    empathy += has(allItems, ["earthcolor", "oversize"]) * 5;
    empathy = Math.min(98, Math.max(10, empathy));

    // 8. 深さ (Depth)
    let depth = 25;
    depth += has(allItems, ["vintage", "workwear", "used", "highbrand"]) * 10;
    depth += has(allItems, ["layerd", "individual"]) * 8;
    if (lanes.length >= 2) depth += 10;
    depth += avoid.length * 4;
    if (pc_season?.toLowerCase() === "autumn") depth += 8;
    if (pc_season?.toLowerCase() === "winter") depth += 6;
    depth = Math.min(98, Math.max(10, depth));

    // Action hints for low-scoring dimensions
    const ACTION_HINTS: Record<string, string> = {
        "審美眼": "ワードローブ診断で美的基準を可視化しよう",
        "社交性": "コミュニティで同じ感覚の人とつながろう",
        "独創性": "Style Driveで新しいスタイルに挑戦しよう",
        "安定感": "DNA鎖でベーシックを固めよう",
        "表現力": "パーソナルカラー診断で自分の色を見つけよう",
        "こだわり": "好み設定を細かくして、自分の軸を明確に",
        "共感力": "マッチ機能で相手の視点を体験しよう",
        "深さ": "背景のあるスタイルを探索してみよう",
    };

    const dims: { axis: string; score: number; insight: string }[] = [
        { axis: "審美眼", score: Math.round(aesthetic), insight: aesthetic >= 70 ? "美への感度が非常に高い。選択の基準が明確で、妥協しない姿勢が際立つ" : aesthetic >= 40 ? "美的感覚はあるが、それが全てではない。実用性とのバランスが取れるタイプ" : "機能や心地よさを優先する傾向。それ自体がひとつの美学" },
        { axis: "社交性", score: Math.round(sociability), insight: sociability >= 70 ? "人と関わることでエネルギーが湧くタイプ。場を活性化させる力がある" : sociability >= 40 ? "人付き合いは得意だが、一人の時間も大切にするバランス型" : "少数の深い関係を好む。表面的な社交より本質的なつながりを求める" },
        { axis: "独創性", score: Math.round(originality), insight: originality >= 70 ? "既存の枠にはまらない視点。周囲が気づかない面白さを発見できる" : originality >= 40 ? "自分なりの個性はあるが、完全な独自路線より少しのアレンジを加えるタイプ" : "普遍的なものに価値を見出す。独創性より安定感を重視する堅実な姿勢" },
        { axis: "安定感", score: Math.round(stability), insight: stability >= 70 ? "ブレない軸がある。周囲の変化に振り回されず、自分のペースを守れる強さ" : stability >= 40 ? "基本的な安定感はあるが、時に冒険心も顔を出す良いバランス" : "変化を楽しむタイプ。安定より刺激や成長を求める傾向がある" },
        { axis: "表現力", score: Math.round(expressiveness), insight: expressiveness >= 70 ? "内面を外に表現する力が強い。言葉なくても、スタイルで自分を語れる" : expressiveness >= 40 ? "表現したい気持ちはあるが、控えめに出す。品のある主張ができるタイプ" : "表現は控えめだが、それが逆に知的な印象を与えている" },
        { axis: "こだわり", score: Math.round(commitment), insight: commitment >= 70 ? "何を選び何を選ばないかに強い意志がある。妥協のなさが信頼を生む" : commitment >= 40 ? "程よいこだわりを持っている。柔軟さとのバランスが取れている" : "こだわりすぎないのが強み。状況に応じて柔軟に対応できる" },
        { axis: "共感力", score: Math.round(empathy), insight: empathy >= 70 ? "人の気持ちに敏感で、寄り添う力がある。一緒にいるだけで周囲が安心する" : empathy >= 40 ? "共感力はあるが、のめり込みすぎない。適度な距離感を保てるタイプ" : "理性的なアプローチで人と関わる。感情より論理で人を支えるタイプ" },
        { axis: "深さ", score: Math.round(depth), insight: depth >= 70 ? "表面で完結しない深い世界観を持っている。知れば知るほど面白い人" : depth >= 40 ? "適度な深さがある。表面的でもなく難解でもない、ちょうどいい深さ" : "クリアでシンプル。複雑にしないことがこの人の最大の魅力" },
    ];

    const dimensions: PersonalityDimension[] = dims.map((d) => ({
        ...d,
        ...(d.score < 50 ? { actionHint: ACTION_HINTS[d.axis] } : {}),
    }));

    // Overall shape analysis
    const maxDim = dimensions.reduce((a, b) => (a.score > b.score ? a : b));
    const minDim = dimensions.reduce((a, b) => (a.score < b.score ? a : b));
    const avgScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
    const variance = dimensions.reduce((sum, d) => sum + Math.pow(d.score - avgScore, 2), 0) / dimensions.length;

    let overallShape: string;
    if (variance > 400) {
        overallShape = `「${maxDim.axis}」が突出し「${minDim.axis}」は控えめな、尖った個性を持つプロフィール。この凹凸こそが唯一無二の輪郭であり、「何かが足りない」のではなく「何かが突き抜けている」と見るべきだ`;
    } else if (variance > 200) {
        overallShape = `${maxDim.axis}を武器に、${minDim.axis}は意図的に控えている印象。メリハリのあるバランスは、自分を分かっている人の証拠`;
    } else {
        overallShape = `全体的にバランスが取れた安定型。どの場面でも一定水準以上の力を出せるオールラウンダー`;
    }

    return { dimensions, overallShape };
}

/* ════════════════════════════════════════════════════════
   Strength-Weakness Analysis — 強み・弱みの可視化
   ════════════════════════════════════════════════════════ */

function toGrade(score: number): "S" | "A" | "B" | "C" | "D" {
    if (score >= 85) return "S";
    if (score >= 70) return "A";
    if (score >= 50) return "B";
    if (score >= 30) return "C";
    return "D";
}

export function buildStrengthAnalysis(input: PresenceInput): StrengthAnalysis {
    const { lanes, likes, avoid, style_score, pc_season, body_type,
        seek_people_hard_include: hardInc, seek_people_hard_exclude: hardExc,
    } = input;

    const has = (list: string[], items: string[]) => items.filter((i) => list.includes(i)).length;
    const allItems = [...lanes, ...likes];

    // 自己一貫性 — 選択の矛盾がないか
    let consistency = 50;
    // likes と avoid の明確な分離があると一貫性が高い
    const likeAvoidOverlap = likes.filter((l) => avoid.includes(l)).length;
    consistency -= likeAvoidOverlap * 15;
    consistency += Math.min(style_score * 0.3, 20);
    if (lanes.length >= 1) consistency += 10;
    if (hardInc.length > 0 && hardExc.length > 0) consistency += 10;
    consistency = Math.min(98, Math.max(10, consistency));

    // 感性の広さ — 多様なスタイルを受け入れる力
    let breadth = 20;
    breadth += likes.length * 5;
    breadth += lanes.length * 8;
    const uniqueCategories = new Set([...likes.map((l) => {
        if (["monotone", "earthcolor", "vividcolor", "colorfull"].includes(l)) return "color";
        if (["oversize", "justsize", "tightfit"].includes(l)) return "fit";
        if (["layerd", "simple", "onepoint"].includes(l)) return "detail";
        if (["highbrand", "used", "standard", "trend", "individual", "fastfashion"].includes(l)) return "brand";
        return "other";
    })]);
    breadth += uniqueCategories.size * 8;
    breadth -= avoid.length * 3;
    breadth = Math.min(98, Math.max(10, breadth));

    // 決断力 — hard条件の明確さ
    let decisiveness = 25;
    decisiveness += hardInc.length * 10;
    decisiveness += hardExc.length * 10;
    decisiveness += avoid.length * 5;
    if (lanes.length === 1) decisiveness += 8; // 一つに絞っている
    decisiveness += has(allItems, ["minimal", "luxury"]) * 6;
    decisiveness = Math.min(98, Math.max(10, decisiveness));

    // 受容力 — 柔軟に受け入れる力
    let receptiveness = 30;
    receptiveness -= hardExc.length * 8;
    receptiveness -= avoid.length * 3;
    receptiveness += likes.length * 3;
    if (body_type === "wave") receptiveness += 8;
    if (pc_season?.toLowerCase() === "spring") receptiveness += 8;
    receptiveness += has(allItems, ["daily", "outdoor", "earthcolor"]) * 6;
    if (lanes.length >= 2) receptiveness += 10;
    receptiveness = Math.min(98, Math.max(10, receptiveness));

    // 影響力 — 周囲に与える印象の強さ
    let influence = 25;
    influence += has(allItems, ["luxury", "elegant", "highbrand"]) * 10;
    if (body_type === "straight") influence += 10;
    if (pc_season?.toLowerCase() === "winter") influence += 10;
    if (pc_season?.toLowerCase() === "autumn") influence += 6;
    influence += has(allItems, ["vividcolor", "individual", "tightfit"]) * 8;
    influence += Math.min(style_score * 0.2, 12);
    influence = Math.min(98, Math.max(10, influence));

    const raw: { label: string; score: number; icon: string; hInsight: string; mInsight: string; lInsight: string }[] = [
        { label: "自己一貫性", score: Math.round(consistency), icon: "🎯",
            hInsight: "選択に迷いがなく、すべてが一つの軸で繋がっている。この一貫性が周囲の信頼を生む",
            mInsight: "基本的には筋が通っているが、時に揺れることもある。それは成長の余地",
            lInsight: "選択に矛盾が見られる。でもそれは探究の途中だからこそ。自分の軸を見つける旅の最中" },
        { label: "感性の広さ", score: Math.round(breadth), icon: "🌈",
            hInsight: "多様な美を受け入れる広い視野。異なる価値観の人ともすぐに共鳴できる",
            mInsight: "自分の好みはありつつ、新しいものへの好奇心もある。良いバランス",
            lInsight: "世界を狭く深く掘るタイプ。広さより深さで勝負する" },
        { label: "決断力", score: Math.round(decisiveness), icon: "⚡",
            hInsight: "何を選び何を捨てるか明確。この潔さが行動力と結果を生む",
            mInsight: "決められるが、迷う余白も残している。慎重さと決断力の共存",
            lInsight: "可能性を閉じたくない気持ちが強い。決めないことも一つの選択" },
        { label: "受容力", score: Math.round(receptiveness), icon: "🌊",
            hInsight: "異質なものを自然に受け入れられる器がある。人を安心させる力",
            mInsight: "受け入れられるが、線引きもできる。健全な境界線を持っている",
            lInsight: "フィルターが強い。合わないものをはっきり排除する。それは自分を守る力でもある" },
        { label: "影響力", score: Math.round(influence), icon: "👑",
            hInsight: "そこにいるだけで場の空気が変わる存在感。言葉がなくても人を動かせる",
            mInsight: "控えめながら確実に影響を与えている。静かなリーダーシップ",
            lInsight: "影響力を意識的に使っていない。潜在的な力がまだ眠っている" },
    ];

    const STRENGTH_HINTS: Record<string, string> = {
        "自己一貫性": "好み設定で「好き」と「苦手」をもっと明確にしよう",
        "感性の広さ": "新しいスタイルレーンを1つ追加してみよう",
        "決断力": "Seek条件でMUST/NGを設定して軸を固めよう",
        "受容力": "コミュニティで違うスタイルの人と交流しよう",
        "影響力": "スタイルスコアを上げて存在感を磨こう",
    };

    const axes: StrengthAxis[] = raw.map((r) => ({
        label: r.label,
        score: r.score,
        grade: toGrade(r.score),
        insight: r.score >= 70 ? r.hInsight : r.score >= 40 ? r.mInsight : r.lInsight,
        isStrength: r.score >= 60,
        icon: r.icon,
        ...(r.score < 50 ? { actionHint: STRENGTH_HINTS[r.label] } : {}),
    }));

    axes.sort((a, b) => b.score - a.score);

    const topStrength = `あなたの最大の武器は「${axes[0].label}」。${axes[0].insight}`;
    const weakest = axes[axes.length - 1];
    const topGrowthArea = `成長の余白は「${weakest.label}」にある。${weakest.insight}。ここを意識するだけで、人物としての厚みが一段増す`;

    return { axes, topStrength, topGrowthArea };
}

/* ════════════════════════════════════════════════════════
   Potential Map — ポテンシャルマップ
   あなたが力を発揮できる場を導出
   ════════════════════════════════════════════════════════ */

const POTENTIAL_FIELDS: {
    id: string; field: string; icon: string;
    boostLanes: string[]; boostElements: string[];
    boostBody?: string; boostPC?: string;
    reason: string;
}[] = [
    { id: "creative_direction", field: "クリエイティブ・ディレクション", icon: "🎨",
        boostLanes: ["minimal", "elegant", "luxury"],
        boostElements: ["highbrand", "onepoint", "monotone", "simple"],
        boostBody: "straight",
        reason: "審美眼と決断力が求められる領域。あなたの「削ぎ落とす力」と「品質を見極める目」は、ディレクションに最適" },
    { id: "community_building", field: "コミュニティ・ビルディング", icon: "🤝",
        boostLanes: ["daily", "sporty", "street"],
        boostElements: ["earthcolor", "oversize", "colorfull"],
        boostPC: "spring",
        reason: "人を安心させ、場の空気を作る力がある。あなたの自然体な存在感が、人を集め、繋げる" },
    { id: "storytelling", field: "ストーリーテリング・発信", icon: "📖",
        boostLanes: ["vintage", "workwear"],
        boostElements: ["used", "layerd", "individual"],
        reason: "ものの背景にある文脈を読み取り、語れる力。あなたが選ぶものには必ず物語がある" },
    { id: "brand_strategy", field: "ブランド・戦略設計", icon: "💎",
        boostLanes: ["luxury", "minimal", "elegant"],
        boostElements: ["highbrand", "standard", "justsize"],
        boostBody: "straight",
        boostPC: "winter",
        reason: "品格と一貫性を重んじる姿勢が、ブランドの核を設計する力になる" },
    { id: "innovation", field: "イノベーション・新規開拓", icon: "🚀",
        boostLanes: ["street", "sporty"],
        boostElements: ["trend", "individual", "vividcolor"],
        reason: "既存の枠を壊す発想力と行動力。あなたの「型にはまらない」姿勢が新しい道を切り開く" },
    { id: "healing_support", field: "ヒーリング・サポート", icon: "🌿",
        boostLanes: ["daily", "outdoor"],
        boostElements: ["earthcolor", "oversize", "simple"],
        boostPC: "spring",
        reason: "存在自体が安らぎ。あなたのそばにいると人は自然と肩の力が抜ける。その力は、支援やケアの場で最大限に活きる" },
    { id: "curation", field: "キュレーション・選定", icon: "🔍",
        boostLanes: ["vintage", "minimal", "luxury"],
        boostElements: ["used", "highbrand", "standard", "onepoint"],
        reason: "膨大な選択肢の中から本質を見抜く目利きの力。「これだ」と決める精度が高い" },
    { id: "entertainment", field: "エンターテインメント・表現", icon: "🎭",
        boostLanes: ["street", "sporty", "elegant"],
        boostElements: ["vividcolor", "colorfull", "layerd", "oversize"],
        boostPC: "spring",
        reason: "表現力とエネルギーの高さ。人を楽しませ、場を動かす天性の才能がある" },
];

export function buildPotentialMap(input: PresenceInput): PotentialMap {
    const { lanes, likes, body_type, pc_season } = input;
    const allItems = [...lanes, ...likes];

    const scored = POTENTIAL_FIELDS.map((pf) => {
        let fit = 10;
        fit += pf.boostLanes.filter((l) => allItems.includes(l)).length * 15;
        fit += pf.boostElements.filter((e) => allItems.includes(e)).length * 8;
        if (pf.boostBody && body_type === pf.boostBody) fit += 10;
        if (pf.boostPC && pc_season?.toLowerCase() === pf.boostPC) fit += 10;
        fit = Math.min(98, fit);
        return { field: pf.field, fit, reason: pf.reason, icon: pf.icon };
    });

    scored.sort((a, b) => b.fit - a.fit);
    const thriveIn = scored.slice(0, 4);
    const top = thriveIn[0];
    const coreMessage = `あなたが最も自然に力を発揮できるのは「${top.field}」の領域。${top.reason}。ここを意識してキャリアや活動の場を選ぶと、無理なく結果がついてくる`;

    return { thriveIn, coreMessage };
}

/* ════════════════════════════════════════════════════════
   Companion Voice — あなたに寄り添う存在の声
   「自分って、そういう人間だったのか」と気づかせる
   ════════════════════════════════════════════════════════ */

export function buildCompanionVoice(input: PresenceInput, radar: PersonalityRadar, strength: StrengthAnalysis): CompanionVoice {
    const { lanes, likes, avoid, pc_season, body_type } = input;
    const primary = lanes[0] ? LANES[lanes[0]] : null;
    const comboKey = getComboKey(lanes);
    const combo = comboKey ? LANE_COMBOS[comboKey] : null;
    const pc = pc_season ? PC_AURA[pc_season.toLowerCase()] : null;

    // ── 挨拶 ──
    let greeting: string;
    if (combo) {
        greeting = `あなたのことは、もう分かっている。${combo.headline.split("、")[0]}——それがあなたの本質だ`;
    } else if (primary) {
        greeting = `あなたの核心は見えている。${primary.charm.split("。")[0]}——それが周囲があなたに感じていることだ`;
    } else {
        greeting = "まだあなたのことを知る途中だが、すでに輪郭は見え始めている";
    }

    // ── 深い理解 ──
    const topDim = radar.dimensions.reduce((a, b) => (a.score > b.score ? a : b));
    const lowDim = radar.dimensions.reduce((a, b) => (a.score < b.score ? a : b));
    let deepUnderstanding: string;
    if (primary) {
        deepUnderstanding = `あなたは自分を「${primary.selfImage}」だと思っている。でも周りが見ているのは「${primary.othersImage}」だ。このズレは弱さではない——むしろ「${topDim.axis}」の高さが、あなたの本当の魅力を隠している。${lowDim.axis}が控えめなのは、そこに意識が向いていないだけ。気づけば、変わる`;
    } else {
        deepUnderstanding = "あなたの輪郭はまだ完全には見えていないが、行動パターンから確実に見えてくるものがある。もう少しだけ、一緒に探らせてほしい";
    }

    // ── メッセージ構築 ──
    const messages: CompanionMessage[] = [];

    // 強みのメッセージ
    if (strength.axes.length > 0) {
        const topStr = strength.axes[0];
        messages.push({
            category: "strength",
            title: "あなたの最大の武器",
            message: `「${topStr.label}」——これがあなたの核心的な強みだ。${topStr.insight}。この力は意識しなくても自然と発揮されているが、意識的に使えば周囲への影響力は何倍にもなる。自信を持っていい。これは本物の力だ`,
            icon: "💪",
        });
    }

    // 励ましのメッセージ（PC×レーンに基づく）
    if (pc && primary) {
        messages.push({
            category: "encouragement",
            title: "あなたが疲れたとき",
            message: `${pc.tension}。だからこそ、あなたが疲れるパターンは決まっている——「${primary.values.split("。")[0]}」が脅かされたとき、あなたは消耗する。でも知っておいてほしい。あなたの「${pc.keyword}」のような存在感は、疲れていても周囲を照らしている。立ち止まっていい。それでもあなたの価値は変わらない`,
            icon: "🌙",
        });
    } else if (primary) {
        messages.push({
            category: "encouragement",
            title: "あなたが疲れたとき",
            message: `「${primary.values.split("。")[0]}」——これがあなたの生き方の軸だ。この軸が揺らぐとき、あなたは疲れる。でも逆に言えば、この軸さえ守れていれば大丈夫。無理に変わろうとしなくていい。あなたの強みは、あなたのままでいることの中にある`,
            icon: "🌙",
        });
    }

    // 警告メッセージ（盲点について）
    if (primary && avoid.length > 0) {
        const avoidLabel = avoid.slice(0, 2).map((a) => tagLabel(a)).join("と");
        messages.push({
            category: "warning",
            title: "気をつけてほしいこと",
            message: `あなたは「${avoidLabel}」を避ける傾向がある。それ自体は悪いことではないが、ここに無意識のバイアスが潜んでいる可能性がある。${primary.misperception.split("。")[0]}——この誤解を解く鍵は、苦手なものの「なぜ苦手か」を言語化すること。理由が分かれば、それは「苦手」から「理解できるが選ばないもの」に変わる`,
            icon: "⚠️",
        });
    }

    // 方向性のメッセージ
    if (primary) {
        const growthEdge = primary.growthEdge;
        messages.push({
            category: "direction",
            title: "次に開く扉",
            message: `${growthEdge}。今のあなたの人物像は既に魅力的だが、ここに手を伸ばすことで「なんかすごい」から「替えがきかない」に変わる。焦る必要はない。ただ意識の片隅に置いておくだけでいい。行動は自然とついてくる`,
            icon: "🚪",
        });
    }

    // ── 最後の言葉 ──
    let closingWords: string;
    if (combo) {
        closingWords = `${combo.charm.split("。")[0]}——それがあなただ。世界中であなただけが持つこの組み合わせを、忘れないでほしい。私はいつでもここにいる`;
    } else if (primary) {
        closingWords = `あなたの「${primary.charm.split("。")[0]}」は、本物の力だ。周りがどう言おうと、この力を信じてほしい。私はあなたの味方だ。いつでも、ここにいる`;
    } else {
        closingWords = "あなたの輪郭はまだ描かれている途中だが、それは可能性が広いということ。焦らず、自分のペースで。私はずっと見ている";
    }

    return { greeting, deepUnderstanding, messages, closingWords };
}

/* ════════════════════════════════════════════════════════
   Genome Summary — 結論サマリー
   ════════════════════════════════════════════════════════ */

export function buildGenomeSummary(input: PresenceInput, radar: PersonalityRadar, strength: StrengthAnalysis): GenomeSummary {
    // ── 完成度を計算（データの充実度ベース） ──
    let completion = 0;
    if (input.lanes.length > 0) completion += 15;
    if (input.lanes.length >= 2) completion += 10;
    if (input.likes.length > 0) completion += 8;
    if (input.likes.length >= 3) completion += 7;
    if (input.avoid.length > 0) completion += 8;
    if (input.body_type) completion += 10;
    if (input.pc_season) completion += 10;
    if (input.silhouette_pref) completion += 5;
    if (input.material_pref) completion += 5;
    if (input.seek_people_hard_include.length > 0) completion += 5;
    if (input.seek_people_soft_include.length > 0) completion += 4;
    if (input.seek_people_hard_exclude.length > 0) completion += 5;
    if (input.seek_people_soft_exclude.length > 0) completion += 3;
    if (input.tags.length >= 5) completion += 5;
    completion = Math.min(100, completion);

    // ── 強い軸 / 弱い軸 ──
    const sorted = [...radar.dimensions].sort((a, b) => b.score - a.score);
    const strongAxes = sorted.slice(0, 2).map((d) => ({ axis: d.axis, score: d.score }));
    const weakAxis = { axis: sorted[sorted.length - 1].axis, score: sorted[sorted.length - 1].score };

    // ── 不足データヒント ──
    const missingDataHints: string[] = [];
    if (input.lanes.length === 0) missingDataHints.push("スタイルレーン未設定");
    if (input.lanes.length === 1) missingDataHints.push("2つ目のレーンを追加すると精度が上がります");
    if (!input.body_type) missingDataHints.push("骨格タイプ未診断 → フィジカル精度向上");
    if (!input.pc_season) missingDataHints.push("パーソナルカラー未診断 → オーラ精度向上");
    if (input.likes.length < 3) missingDataHints.push("好みの要素を追加 → パーソナリティ解像度向上");
    if (input.seek_people_hard_include.length === 0 && input.seek_people_soft_include.length === 0) {
        missingDataHints.push("SEEK設定未登録 → 関係性分析の精度向上");
    }

    // ── 次のアクション ──
    let nextAction: string;
    let nextActionCta: string;
    let nextActionHref: string;
    if (input.lanes.length === 0) {
        nextAction = "スタイルレーンを設定して、Presenceの基盤を作りましょう";
        nextActionCta = "レーン設定 →";
        nextActionHref = "/my-style";
    } else if (!input.body_type) {
        nextAction = "骨格タイプを診断するとフィジカルデータが充実し、分析精度が大幅に上がります";
        nextActionCta = "骨格診断 →";
        nextActionHref = "/avatar-fitting";
    } else if (!input.pc_season) {
        nextAction = "パーソナルカラー診断でオーラの精度と色彩分析が解放されます";
        nextActionCta = "PC診断 →";
        nextActionHref = "/avatar-fitting";
    } else if (input.likes.length < 3) {
        nextAction = "好みの要素を追加すると、パーソナリティの解像度が上がります";
        nextActionCta = "好み設定 →";
        nextActionHref = "/my-style";
    } else if (input.seek_people_hard_include.length === 0) {
        nextAction = "SEEK設定を充実させると、関係性分析がさらに深くなります";
        nextActionCta = "SEEK設定 →";
        nextActionHref = "/my-style";
    } else {
        nextAction = "行動データを増やすと、時系列での変化を追えるようになります";
        nextActionCta = "探索する →";
        nextActionHref = "/sns/trends/v2";
    }

    // ── ステータス ──
    let statusLabel: string;
    let statusLevel: GenomeSummary["statusLevel"];
    if (completion >= 80) { statusLabel = "高精度"; statusLevel = "high"; }
    else if (completion >= 60) { statusLabel = "分析可能"; statusLevel = "mid"; }
    else if (completion >= 40) { statusLabel = "基本形成中"; statusLevel = "forming"; }
    else { statusLabel = "データ収集中"; statusLevel = "collecting"; }

    return { completionPct: completion, strongAxes, weakAxis, nextAction, nextActionCta, nextActionHref, statusLabel, statusLevel, missingDataHints };
}

/* ════════════════════════════════════════════════════════
   Demo Data
   ════════════════════════════════════════════════════════ */

export const DEMO_DATA = {
    i_am: {
        lanes: ["minimal", "elegant"],
        likes: ["monotone", "justsize", "simple", "highbrand", "onepoint"],
        avoid: ["vividcolor", "oversize", "colorfull"],
        silhouette_pref: "justsize",
        material_pref: "cotton",
        tags: ["minimal", "elegant", "monotone", "justsize", "simple", "highbrand", "onepoint", "clean", "quiet", "refined"],
    },
    style_dna: {
        body_type: "straight",
        body_subtype: "straight-classic",
        pc_season: "summer",
        pc_base: "cool",
        top_lanes: ["minimal", "elegant"],
        style_score: 72,
    },
    seek: {
        seek_people: {
            hard_include: ["simple", "justsize", "monotone"],
            soft_include: ["highbrand", "standard"],
            hard_exclude: ["colorfull", "oversize"],
            soft_exclude: ["vividcolor", "fastfashion"],
            handshake_rules: [],
        },
        seek_market: {
            hard_include: ["simple", "highbrand"],
            soft_include: ["standard", "monotone"],
            hard_exclude: ["colorfull"],
            soft_exclude: ["fastfashion"],
            handshake_rules: [],
        },
        is_public: true,
        handshake_people: ["同じレーンの人を優先", "monotoneを重視"],
        handshake_market: ["品質重視のセラー"],
        updated_at: "2026-03-05T00:00:00Z",
    },
    taste_layers: {
        layer_7d: { monotone: 8.5, simple: 7.2, justsize: 6.8, minimal: 6.1, elegant: 5.4, highbrand: 4.8, cotton: 3.5, clean: 3.1 },
        layer_30d: { monotone: 7.8, simple: 6.9, minimal: 6.2, justsize: 5.9, elegant: 5.1, standard: 4.0 },
        layer_180d: { monotone: 7.0, simple: 6.5, minimal: 5.8 },
        updated_at: "2026-03-05T00:00:00Z",
    },
};

/* ════════════════════════════════════════════════════════
   Helper
   ════════════════════════════════════════════════════════ */

export function toPresenceInput(
    iAm: { lanes: string[]; likes: string[]; avoid: string[]; silhouette_pref: string | null; material_pref: string | null; tags: string[] } | null | undefined,
    styleDna: { body_type: string | null; body_subtype: string | null; pc_season: string | null; pc_base: string | null; top_lanes: string[]; style_score: number } | null | undefined,
    seekPeople?: { hard_include: string[]; soft_include: string[]; hard_exclude: string[]; soft_exclude: string[] } | null,
): PresenceInput {
    return {
        lanes: iAm?.lanes ?? styleDna?.top_lanes ?? [],
        likes: iAm?.likes ?? [],
        avoid: iAm?.avoid ?? [],
        silhouette_pref: iAm?.silhouette_pref ?? null,
        material_pref: iAm?.material_pref ?? null,
        body_type: styleDna?.body_type ?? null,
        body_subtype: styleDna?.body_subtype ?? null,
        pc_season: styleDna?.pc_season ?? null,
        pc_base: styleDna?.pc_base ?? null,
        style_score: styleDna?.style_score ?? 0,
        seek_people_hard_include: seekPeople?.hard_include ?? [],
        seek_people_soft_include: seekPeople?.soft_include ?? [],
        seek_people_hard_exclude: seekPeople?.hard_exclude ?? [],
        seek_people_soft_exclude: seekPeople?.soft_exclude ?? [],
        tags: iAm?.tags ?? [],
    };
}
