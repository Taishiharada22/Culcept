// lib/stargazer/paradoxDetector.ts
// 軸の組み合わせから「矛盾」を検出する
// 心理学的根拠: Jung（影の統合）、Haidt（象と騎手のギャップ）
// 「矛盾は弱さではない。両方を持っているからこそ深い理解に辿り着ける」

import { type TraitAxisKey, getAxisLabels } from "./traitAxes";

// ── Types ──

export interface Paradox {
  id: string;
  /** 詩的な名前 */
  name: string;
  /** 使用する2軸 */
  axes: [TraitAxisKey, TraitAxisKey];
  /** ユーザーの実際のスコア */
  scores: [number, number];
  /** パーソナライズされた洞察テキスト */
  insight: string;
  /** この矛盾が持つ正の意図（IFS: No bad parts） */
  gift: string;
  /** 矛盾の強度 0-1 */
  intensity: number;
  /** この矛盾が日常で現れる具体的シーン */
  scenario: string;
}

// ── Helpers ──

/** スコアを人間が読める日本語の程度表現に変換 */
function scoreLabel(score: number): string {
  const abs = Math.abs(score);
  if (abs >= 0.8) return "非常に強い";
  if (abs >= 0.6) return "かなり強い";
  if (abs >= 0.4) return "やや強い";
  if (abs >= 0.25) return "ある程度の";
  return "わずかな";
}

/** 0-1 のスコアを百分率的な表記にフォーマット */
function fmt(score: number): string {
  return (Math.abs(score) * 100).toFixed(0);
}

/** 強度に応じた接頭表現を返す */
function intensityPrefix(intensity: number): string {
  if (intensity >= 0.8) return "これは極めて顕著な矛盾です。";
  if (intensity >= 0.6) return "これはかなりはっきりした矛盾です。";
  if (intensity >= 0.4) return "この矛盾はあなたの中に確かに存在しています。";
  return "";
}

/** 強度に応じた補足表現を返す */
function intensitySuffix(intensity: number): string {
  if (intensity >= 0.7)
    return "この強い矛盾こそが、あなたを他の誰とも違う存在にしている核心です。";
  return "";
}

// ── Paradox Pattern Definitions ──

interface ParadoxPattern {
  id: string;
  name: string;
  axis1: TraitAxisKey;
  axis2: TraitAxisKey;
  /** axis1 の条件: "high" (> threshold), "low" (< -threshold) */
  cond1: "high" | "low";
  /** axis2 の条件 */
  cond2: "high" | "low";
  /** スコア閾値（デフォルト0.25） */
  threshold?: number;
  /** パーソナライズされた洞察を生成する関数 */
  generateInsight: (
    score1: number,
    score2: number,
    label1: { left: string; right: string },
    label2: { left: string; right: string },
    intensity: number,
  ) => string;
  /** この矛盾の贈り物 */
  gift: string;
  /** この矛盾が日常で現れる具体的なシーン */
  scenario: string;
}

const PATTERNS: ParadoxPattern[] = [
  // ── 1. 頭と心の矛盾 ──
  {
    id: "logic_storm",
    name: "論理の鎧、感情の嵐",
    axis1: "analytical_vs_intuitive",
    cond1: "low", // analytical
    axis2: "emotional_variability",
    cond2: "high", // variable
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `あなたの分析力は${fmt(s1)}%と${scoreLabel(s1)}。しかし感情の揺れ幅も${fmt(s2)}%と${scoreLabel(s2)}。世界を論理で整理しようとするほど、整理できない感情に出会ったとき、考えれば考えるほど感情が逆に暴れ出す。論理を手放すのが怖いのは、それがあなたの安全装置だから。`;
      return intensity >= 0.7
        ? `${base}この二つの力が極端に強い分、「頭では分かっているのに気持ちが追いつかない」という体験が、他の人より遥かに鮮烈なはず。`
        : base;
    },
    gift: "論理と感情の両方を持っているからこそ、他の人には見えない深い理解に辿り着ける。",
    scenario:
      "仕事で理路整然とプレゼンした直後、帰り道にふと言葉にできない感情が溢れて、涙が出そうになる。あるいは、友人の相談に冷静にアドバイスしながら、内側では相手以上に動揺している。",
  },
  // ── 2. 社交と消耗の矛盾 ──
  {
    id: "connector_dissolve",
    name: "つながる力、溶ける境界",
    axis1: "social_initiative",
    cond1: "high",
    axis2: "boundary_awareness",
    cond2: "low", // 境界が柔軟
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `社交の主導性が${fmt(s1)}%、一方で境界意識は${fmt(s2)}%と柔軟。あなたは人と繋がる力がある。でも気づくと相手の感情を背負い、自分がどこまでで相手がどこからかわからなくなる。`;
      return intensity >= 0.7
        ? `${base}この矛盾が非常に強いあなたは、人といる時間の後に「自分に戻る」作業が必要なはず。それは弱さではなく、あなたの共感力の代償。`
        : `${base}Yesと言った後で「本当にそう思ってた？」と自分に聞くことがあるはず。`;
    },
    gift: "深い共感力は稀有な才能。境界を意識する練習をすれば、共感力を保ったまま自分を守れるようになる。",
    scenario:
      "友人の悩みを聞いた後、家に帰っても相手のことが頭から離れず、自分の気分まで沈んでしまう。あるいは、飲み会で場を盛り上げた翌日、一日中ベッドから出たくなくなる。",
  },
  // ── 3. 準備された冒険 ──
  {
    id: "prepared_adventurer",
    name: "準備された冒険者",
    axis1: "cautious_vs_bold",
    cond1: "high", // bold
    axis2: "plan_vs_spontaneous",
    cond2: "low", // plan
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `大胆さ${fmt(s1)}%、計画性${fmt(s2)}%。他人から見ると大胆に見える。でもあなたは十分に準備した上で踏み出している。あなたの冒険は衝動ではなく、計算された勇気。`;
      return intensity >= 0.7
        ? `${base}「大胆な人ですね」と言われるたび、強い違和感を感じているはず。あなたほど入念に準備してから飛ぶ人はいない。`
        : `${base}「大胆な人ですね」と言われるたび、少し違和感を感じているかもしれない。`;
    },
    gift: "計画性と大胆さの両立は珍しい。リスクを取れるのに暴走しない。信頼されるリーダーの資質。",
    scenario:
      "転職や引っ越しなど大きな決断を「勢いでやった」ように見せるが、実は何ヶ月も前からスプレッドシートでリスクを洗い出していた。旅行先でも即興に見えて、実は夜中にルートを調べている。",
  },
  // ── 4. 自由を愛する計画者 ──
  {
    id: "structured_freedom",
    name: "自由を愛する計画者",
    axis1: "change_embrace_vs_resist",
    cond1: "low", // 変化歓迎
    axis2: "plan_vs_spontaneous",
    cond2: "low", // 計画的
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `変化への開放性が${fmt(s1)}%ありながら、計画性も${fmt(s2)}%。変化は好き。でも計画がないと不安になる。自由を愛しながら構造を求める。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたは、「自由にしていいよ」と言われるとかえって動けなくなる経験があるはず。あなたにとっての本当の自由は「枠のある自由」。`
        : `${base}この一見矛盾する欲求に、あなたは気づいているだろうか。`;
    },
    gift: "「枠のある自由」を設計できる人。ルーティンの中に冒険を組み込む天才になれる。",
    scenario:
      "旅行計画を立てる時、綿密なスケジュール表を作りつつ「フリータイム」の枠を確保する。仕事では新しいプロジェクトにワクワクするが、最初にやることはTodoリスト作成。",
  },
  // ── 5. 穏やかな仮面 ──
  {
    id: "calm_mask",
    name: "穏やかな水面、深い海流",
    axis1: "emotional_regulation",
    cond1: "high", // 調整上手
    axis2: "public_private_gap",
    cond2: "high", // ギャップ大
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `感情の調整力${fmt(s1)}%、しかし表裏のギャップは${fmt(s2)}%。表面は穏やかで安定している。でも内側では、もっと多くのことを感じている。この距離を保つのにどれだけのエネルギーが要るか、周りの人は知らない。`;
      return intensity >= 0.7
        ? `${base}あなたのエネルギー消費の大部分は、この「翻訳作業」に使われている。たまには翻訳をサボってもいい。`
        : `${base}あなた自身も、それが当たり前だと思っているかもしれない。`;
    },
    gift: "感情の嵐を受け止めながら冷静でいられる力は、周囲の安心感を生む。ただし、たまには嵐を外に出すことも、あなたには必要。",
    scenario:
      "職場で理不尽な指示を受けても冷静に対応し、同僚から「メンタル強いね」と言われる。でも帰宅後、一人になった途端にどっと疲れが出て、何もする気力が湧かない。",
  },
  // ── 6. 選択的社交 ──
  {
    id: "selective_extrovert",
    name: "選ばれた人だけの外向性",
    axis1: "introvert_vs_extrovert",
    cond1: "low", // 内向
    axis2: "social_initiative",
    cond2: "high",
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `内向性${fmt(s1)}%でありながら、社交の主導性は${fmt(s2)}%。ひとりの時間が必要。でも、この人と決めたら自分から動ける。あなたの社交性はスイッチ式。`;
      return intensity >= 0.7
        ? `${base}この矛盾がとても強いあなたは、「人見知りなんです」と「え、あなたが？」というやりとりを何百回も経験しているはず。全員に開くのではなく、選んだ相手にだけ深く繋がる。それがあなたの人間関係の流儀。`
        : `${base}全員に開くのではなく、選んだ相手にだけ深く繋がる。「人見知りなんです」と言いながら、特定の場では驚くほど積極的。`;
    },
    gift: "量より質の人間関係を築ける。あなたが選んだ相手は、本当に深い繋がりを得る。",
    scenario:
      "初対面が多い大人数の飲み会では隅で静かにしているのに、親友と二人きりになった途端、機関銃のように話し始める。新しいコミュニティでは最初の1ヶ月は観察に徹し、その後いきなりキーパーソンになる。",
  },
  // ── 7. 大胆な不安 ──
  {
    id: "bold_with_doubt",
    name: "走りながら振り返る",
    axis1: "cautious_vs_bold",
    cond1: "high", // bold
    axis2: "reassurance_need",
    cond2: "high",
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `大胆さ${fmt(s1)}%、でも安心確認の必要度も${fmt(s2)}%。前に進む力はある。でも「これで良かったのか」という確認がいつも追いかけてくる。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強烈なあなたは、大胆に決断した直後に、ほぼ毎回「大丈夫だよ」と言ってくれる人を探している。矛盾しているようだが、これがあなたのエンジンとブレーキ。両方あるから安全に速く走れる。`
        : `${base}大胆に決断した直後に、誰かに「大丈夫だよ」と言ってほしくなる。矛盾しているようだが、これがあなたの自然なリズム。`;
    },
    gift: "行動力がありながら慎重さも持つ。暴走しない勇気。他者の安心を確認できるリーダー。",
    scenario:
      "起業やプロジェクト立ち上げなど大胆なことを始めた直後、深夜に親友やパートナーに「ねえ、これで合ってると思う？」とLINEする。決めたはずなのに、確認したい。確認できたら、また走り出す。",
  },
  // ── 8. 完璧と前進の板挟み ──
  {
    id: "perfect_vs_go",
    name: "完璧と前進の板挟み",
    axis1: "perfectionist_vs_pragmatic",
    cond1: "low", // 完璧主義
    axis2: "cautious_vs_bold",
    cond2: "high", // 大胆
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `完成度へのこだわり${fmt(s1)}%、しかし大胆さも${fmt(s2)}%。やりたい気持ちと、ちゃんとやりたい気持ちが同時にある。`;
      return intensity >= 0.7
        ? `${base}この矛盾が非常に強いあなたは、「とりあえずやってみよう」と「いや、もっと練ってから」が脳内で毎日戦っている。走り出した後に「もっとちゃんとやるべきだった」と振り返り、次は準備しすぎて動けなくなる。このループを自覚することが第一歩。`
        : `${base}走り出したいのに「まだ準備が...」と足が止まる。あるいは、走り出した後に「もっとちゃんとやるべきだった」と振り返る。`;
    },
    gift: "質と速度の両方を追える。完璧主義が暴走しなければ、高い基準を保ちながら前に進める稀有なバランス。",
    scenario:
      "プレゼン資料を「70%でいい」と思って作り始めるが、気づくとフォントや行間にこだわって深夜まで作業している。締切ギリギリにようやく「完璧じゃないけど出す」と決断する、毎回同じパターン。",
  },
  // ── 9. 独立と調和 ──
  {
    id: "solo_harmony",
    name: "ひとりで立つ、みんなで歩く",
    axis1: "independence_vs_harmony",
    cond1: "low", // 独立
    axis2: "individual_vs_social",
    cond2: "high", // 集団
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `独立性${fmt(s1)}%、しかし集団志向も${fmt(s2)}%。自分の意見は譲らない。でも人と一緒にいたい。孤高を気取るつもりはないが、妥協するつもりもない。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたは、「自分を保ったまま人と共にいる」というかなり高度なバランスを、常に意識的に取り続けている。それは相当な精神的エネルギーを使う行為だと認めていい。`
        : `${base}この「自分を保ったまま人と共にいる」バランスを、あなたは無意識に取り続けている。`;
    },
    gift: "集団の中で自分を見失わない強さ。チームに独自の視点を持ち込める。",
    scenario:
      "チームミーティングで「みんなの意見に合わせよう」と思いつつ、自分が納得できない方向に進みそうになると黙っていられなくなる。飲み会は好きだけど、二次会のカラオケは「ひとりで歌いたい曲がある」から断る。",
  },
  // ── 10. 変化への二面性 ──
  {
    id: "change_paradox",
    name: "変わりたい、変わりたくない",
    axis1: "change_embrace_vs_resist",
    cond1: "high", // 安定維持
    axis2: "tradition_vs_novelty",
    cond2: "high", // 新規性
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `安定志向${fmt(s1)}%、しかし新規性への魅力は${fmt(s2)}%。新しいものに惹かれる。でも根本的な変化には抵抗がある。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたにとって、「安全な場所から冒険を眺める」のが最も心地よい。新しいカフェは試すが、いつもの席に座りたい。そういう人。`
        : `${base}新しい刺激は欲しいが、足場は動かしたくない。あなたは「安全な場所から冒険を眺める」のが実は一番心地よいかもしれない。`;
    },
    gift: "革新と安定の橋渡しができる。急進的すぎず保守的すぎない、絶妙な判断ができる。",
    scenario:
      "最新のガジェットは買うが、スマホケースはずっと同じもの。新しいレストランは開拓するが、注文するのはいつもと似たメニュー。引っ越しは好きだが、部屋のレイアウトは再現する。",
  },
  // ── 11. 率直さと安心 ──
  {
    id: "direct_yet_careful",
    name: "本音で話す、でも傷つけたくない",
    axis1: "direct_vs_diplomatic",
    cond1: "low", // 率直
    axis2: "boundary_awareness",
    cond2: "high", // 境界意識高い
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `率直さ${fmt(s1)}%、しかし境界意識も${fmt(s2)}%。思ったことを言える。でも同時に、相手の反応が気になる。`;
      return intensity >= 0.7
        ? `${base}この矛盾が非常に強いあなたは、発言した直後に相手の表情を読むクセがあるはず。「言いすぎたかな」と後から何度も反芻する。その繊細さこそが、あなたの率直さを暴力ではなく誠実さにしている。`
        : `${base}「言いすぎたかな」と後から気にするのは、率直さと繊細さの両方があるから。`;
    },
    gift: "誠実さと思いやりの共存。信頼される人間関係を築ける。",
    scenario:
      "会議で「それは違うと思います」とはっきり言った後、休憩時間に「さっきの言い方、きつくなかったかな」と気になって、相手にさりげなくフォローを入れに行く。",
  },
  // ── 12. 質と冒険 ──
  {
    id: "deep_broad",
    name: "深く潜りたい、広く飛びたい",
    axis1: "quality_vs_quantity",
    cond1: "low", // 質重視
    axis2: "change_embrace_vs_resist",
    cond2: "low", // 変化歓迎
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `質へのこだわりが${fmt(s1)}%、変化への開放性も${fmt(s2)}%。一つのことを深く掘りたい。でも新しいことにも目移りする。`;
      return intensity >= 0.7
        ? `${base}この矛盾が特に強いあなたは、本棚に読みかけの本が何冊も並んでいるはず。でもどの本も「ちゃんと読みたい」と思って買った本。深さと広さの両方を求めるあなたは、どちらかを選べと言われると本気で困る。`
        : `${base}深さと広さ、どちらかを選べと言われると困る。両方欲しいのがあなた。`;
    },
    gift: "深い専門性と幅広い好奇心の両立。分野を超えた接続点を見つけられる人。",
    scenario:
      "プログラミング言語をひとつ極めようとした矢先に新しい言語が気になり、結局3つ同時に学び始める。読書も「今月はこれだけ読む」と決めたのに、書店で別のジャンルの本を衝動買いする。",
  },

  // ══════════════════════════════════════════════
  //  新規パターン 13-20
  // ══════════════════════════════════════════════

  // ── 13. ストレス時の孤独な社交家 ──
  {
    id: "stress_social_split",
    name: "傷を隠して人に会う",
    axis1: "stress_isolation_vs_social",
    cond1: "low", // 一人で整理
    axis2: "introvert_vs_extrovert",
    cond2: "high", // 外向的
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `普段は外向性${fmt(s2)}%で人と過ごすことにエネルギーを得る。しかしストレス時の孤立傾向は${fmt(s1)}%と強い。つまり、普段は人と一緒にいたいのに、つらい時ほど一人になりたくなる。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたは、最もサポートが必要な時にこそ、人から離れてしまう。「大丈夫？」と聞かれても「大丈夫」と答えてしまう。周囲が心配するほど、あなたは笑顔を作れてしまう。`
        : `${base}「どうしたの？」と聞かれると「何でもない」と答えてしまう自分に、気づいているだろうか。`;
    },
    gift: "自分で回復する力がありながら人を惹きつける魅力も持つ。信頼できる一人に「実は」と言えるようになると、回復速度が格段に上がる。",
    scenario:
      "仕事で大きなミスをした日、同僚のランチの誘いを断って一人でコンビニ弁当を食べる。でも翌日には何事もなかったように明るく振る舞い、誰もあなたが昨日つらかったことに気づかない。",
  },
  // ── 14. 機能と表現の対立 ──
  {
    id: "functional_artist",
    name: "合理的な芸術家",
    axis1: "function_vs_expression",
    cond1: "low", // 機能・合理
    axis2: "minimal_vs_maximal",
    cond2: "high", // マキシマル
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `合理性重視が${fmt(s1)}%なのに、表現のマキシマル度は${fmt(s2)}%。「無駄なものは要らない」と言いながら、気づくと装飾的なものに手を伸ばしている。`;
      return intensity >= 0.7
        ? `${base}この矛盾が極端に強いあなたの部屋は、おそらく機能的に整頓されているのに、どこか一角だけ異常にこだわった空間がある。効率を愛しながら美を捨てられない、それがあなた。`
        : `${base}あなたの中には「効率を追う自分」と「美しさに惹かれる自分」が共存している。`;
    },
    gift: "機能美を生み出せる人。「使いやすくて美しい」ものを直感的に選べる審美眼。",
    scenario:
      "スマホケースは「薄くて軽い」で選んだはずが、最終的に手触りの良いレザーケースを買っている。キッチンは合理的に整理するが、お気に入りのマグカップだけは見せる収納。",
  },
  // ── 15. 親密さのペースと主導権 ──
  {
    id: "slow_leader",
    name: "ゆっくり近づく主導者",
    axis1: "intimacy_pace",
    cond1: "low", // ゆっくり
    axis2: "social_initiative",
    cond2: "high", // 自分から動く
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `距離を縮めるペースはゆっくり（${fmt(s1)}%）だが、社交の主導性は${fmt(s2)}%と高い。あなたは自分から人に近づく。でも心の距離は簡単に縮めない。行動では積極的なのに、内面では慎重にブレーキを踏んでいる。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたは、相手からすると「誘ってくれるのに、本当の話はしてくれない」と感じるかもしれない。親しくなるまでに相手が求める以上の時間が必要。でもその時間を経た関係は、驚くほど深くなる。`
        : `${base}「誘ったのは自分なのに、踏み込まれると引いてしまう」という経験があるかもしれない。`;
    },
    gift: "関係構築を自分のペースでコントロールできる力。急ぎすぎない人間関係は、結果的に長続きする。",
    scenario:
      "自分から食事に誘うのに、会話が深い話に向かいそうになると話題を変えてしまう。3回目のデートでもまだ敬語。でも相手が去ろうとすると、自分から次の約束を提案する。",
  },
  // ── 16. コントロールと調和 ──
  {
    id: "conductor_diplomat",
    name: "指揮者のジレンマ",
    axis1: "control_tendency",
    cond1: "high", // コントロール欲高い
    axis2: "independence_vs_harmony",
    cond2: "high", // 調和
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `コントロール傾向が${fmt(s1)}%、しかし調和志向も${fmt(s2)}%。場を仕切りたい欲求がある。でも同時に、みんなが気持ちよくいることも同じくらい大事。`;
      return intensity >= 0.7
        ? `${base}この矛盾が激しいあなたは、「自分が仕切った方がうまくいく」と分かっていながら「でも押し付けたくない」と葛藤する日常を送っている。結果として、周囲を巧みに誘導しながら「みんなで決めたこと」にする高度な技術を無意識に使っている。`
        : `${base}主導権を握りつつ合意形成もしたい。このバランスを取ることに、実は相当なエネルギーを使っている。`;
    },
    gift: "チームを導きながら民主的でいられる。独裁的にならないリーダーシップ。メンバーは「自分で決めた」と感じられる。",
    scenario:
      "グループ旅行の行き先を実質的に決めているのに、「みんなで決めよう」という形式は崩さない。会議でも落とし所は最初から見えているが、全員が発言するまで待ってから提案する。",
  },
  // ── 17. 拒否への成熟と安心確認 ──
  {
    id: "mature_yet_anxious",
    name: "大人の顔、子供の不安",
    axis1: "rejection_response_maturity",
    cond1: "high", // 成熟に受容
    axis2: "reassurance_need",
    cond2: "high", // 安心確認を必要とする
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `拒否への成熟度は${fmt(s1)}%と高い。しかし安心確認の必要性も${fmt(s2)}%と高い。表面上は「断られても大丈夫」と受け止められる。でも内側では、もっと確認したい、安心したい気持ちが渦巻いている。`;
      return intensity >= 0.7
        ? `${base}あなたの大人としての対応力は本物。でもその裏で、拒否のたびに小さく傷ついている自分がいることも本当のこと。「大丈夫だよ」と自分に言い聞かせる回数が多いほど、この矛盾は強く働いている。`
        : `${base}「大丈夫」と微笑む自分と、「本当に大丈夫？」と確認したい自分の間に、小さな隙間がある。`;
    },
    gift: "感情的な未熟さを見せずに対処できる力と、人間としての柔らかさの共存。信頼と親しみの両方を感じさせる人。",
    scenario:
      "告白を断られても「ありがとう、気にしないで」と穏やかに返せる。でもその夜、共通の友人にさりげなく「あの人、怒ってなかったかな」と聞いてしまう。断られたことより、関係が壊れていないかの方が気になる。",
  },
  // ── 18. クラシックとトレンドの越境者 ──
  {
    id: "timeless_trendhunter",
    name: "不変を愛するトレンドハンター",
    axis1: "classic_vs_trendy",
    cond1: "low", // クラシック
    axis2: "tradition_vs_novelty",
    cond2: "high", // 新規性
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `クラシック志向が${fmt(s1)}%、しかし新規性への関心は${fmt(s2)}%。定番を愛しながら、最先端にアンテナを張っている。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたのクローゼットには、10年選手のコートと今季の注目アイテムが同居しているはず。「変わらないもの」の中に「新しいもの」を一つだけ混ぜる、それがあなたの美学。`
        : `${base}「いいものは変わらない」と言いながら、新しいものへの好奇心も止められない。`;
    },
    gift: "流行に流されないのに時代遅れにもならない。トレンドの中から「残るもの」を見抜く審美眼。",
    scenario:
      "ファッション誌は毎月チェックするが、実際に買うのは定番アイテムのアップデート版。Spotifyでは新譜を聴き漁りつつ、プレイリストのトップは10年前の名盤。",
  },
  // ── 19. 関係モードの分裂と一貫性 ──
  {
    id: "mode_switcher",
    name: "千の顔を持つ一貫した人",
    axis1: "relationship_mode_split",
    cond1: "high", // 文脈で変化
    axis2: "intent_stability",
    cond2: "high", // 意図は一貫
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `関係モードの文脈変化が${fmt(s1)}%と高いのに、意図の一貫性も${fmt(s2)}%と高い。状況によって見せる顔は変わる。でもあなたの核にある意図はブレていない。`;
      return intensity >= 0.7
        ? `${base}この矛盾が非常に強いあなたは、「あの人って場所によって全然違う人に見える」と言われた経験があるはず。でも自分の中では全く矛盾していない。すべての顔に同じ「自分」がいる。この自覚があるかどうかで、この矛盾は強みにも弱みにもなる。`
        : `${base}職場の自分と親友の前の自分は別人に見えるかもしれない。でも根っこは同じ。`;
    },
    gift: "場に応じた最適な自分を出せる適応力と、芯のブレなさの共存。多様な環境で信頼される人。",
    scenario:
      "上司の前では冷静沈着、親友の前ではおちゃらけ、恋人の前では甘えん坊。どれも演技ではなく本当の自分。「どの顔が本当のあなた？」と聞かれると、「全部」と即答できる。",
  },
  // ── 20. 合意と圧力 ──
  {
    id: "consent_with_pressure",
    name: "丁寧な力学",
    axis1: "consent_maturity",
    cond1: "high", // 明確な合意を重視
    axis2: "exclusivity_pressure",
    cond2: "high", // 排他的圧力が出やすい
    generateInsight: (s1, s2, _l1, _l2, intensity) => {
      const base = `合意への成熟度が${fmt(s1)}%と高い一方、排他的な圧力傾向も${fmt(s2)}%。相手の意思を尊重したい。でも同時に、大切な関係を独占したい気持ちもある。`;
      return intensity >= 0.7
        ? `${base}この矛盾が強いあなたは、「あなたの自由を尊重する」と言いながら、心の中では「でも自分だけを見てほしい」と感じている。この二つの感情をどちらも否定せず持っていられることが、実は成熟の証。`
        : `${base}「尊重」と「独占欲」の間で揺れること自体は、悪いことではない。どちらの気持ちも本物だから。`;
    },
    gift: "関係に真剣に向き合える人。独占欲を自覚しているからこそ、暴走せずにコントロールできる。",
    scenario:
      "パートナーが異性の友人と出かけると聞いて「楽しんできてね」と笑顔で送り出す。でも内心ではモヤモヤしていて、帰ってきた時に「どうだった？」と聞く声のトーンが微妙に違う。自分でもその矛盾に気づいている。",
  },
];

// ── Detection Engine ──

/**
 * ユーザーの軸スコアから矛盾パターンを検出する
 * 検出条件: 両軸のスコアが閾値を超え、パターンの条件に合致
 */
export function detectParadoxes(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): Paradox[] {
  const results: Paradox[] = [];

  for (const pattern of PATTERNS) {
    const score1 = axisScores[pattern.axis1];
    const score2 = axisScores[pattern.axis2];
    if (score1 === undefined || score2 === undefined) continue;

    const threshold = pattern.threshold ?? 0.25;

    const match1 =
      pattern.cond1 === "high" ? score1 > threshold : score1 < -threshold;
    const match2 =
      pattern.cond2 === "high" ? score2 > threshold : score2 < -threshold;

    if (!match1 || !match2) continue;

    // Intensity = average of how far both scores exceed their thresholds
    const excess1 = Math.abs(score1) - threshold;
    const excess2 = Math.abs(score2) - threshold;
    const intensity = Math.min((excess1 + excess2) / 2 / 0.5, 1);

    const label1 = getAxisLabels(pattern.axis1) ?? {
      left: pattern.axis1,
      right: pattern.axis1,
    };
    const label2 = getAxisLabels(pattern.axis2) ?? {
      left: pattern.axis2,
      right: pattern.axis2,
    };

    const rawInsight = pattern.generateInsight(
      score1,
      score2,
      label1,
      label2,
      intensity,
    );

    // Compose final insight with intensity-based framing
    const prefix = intensityPrefix(intensity);
    const suffix = intensitySuffix(intensity);
    const insight = [prefix, rawInsight, suffix].filter(Boolean).join(" ");

    results.push({
      id: pattern.id,
      name: pattern.name,
      axes: [pattern.axis1, pattern.axis2],
      scores: [score1, score2],
      insight,
      gift: pattern.gift,
      intensity,
      scenario: pattern.scenario,
    });
  }

  // Sort by intensity descending, return top 3
  return results.sort((a, b) => b.intensity - a.intensity).slice(0, 3);
}
