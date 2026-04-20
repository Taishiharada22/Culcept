/**
 * Intent ミニ観測 — 質問定義 & スコアリング
 *
 * 11軸 × 2-3問（専用25問）+ クロスローディング5問 = 計30問
 *
 * 学術的基盤:
 * - 愛着: ECR-S (Wei et al., 2007), RQ (Bartholomew & Horowitz, 1991)
 * - 葛藤: ROCI-II (Rahim, 1983), TKI (Thomas & Kilmann, 1974)
 * - 感情調整: ERQ (Gross & John, 2003), DERS (Gratz & Roemer, 2004)
 * - 自己監視: Self-Monitoring Scale (Snyder, 1974; Lennox & Wolfe, 1984)
 * - 質問数: TIPI (Gosling et al., 2003) / BFI-2-XS (Soto & John, 2017) の
 *   2-3項目/構成概念で test-retest r≥0.65 を達成できる知見に基づく
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface QuestionOption {
  id: string;
  label: string;
}

export interface Question {
  id: string;
  text: string;
  options: QuestionOption[];
}

export interface AxisEffect {
  axis: string;
  delta: number;
  /** クロスローディング質問の場合 true（重み 0.6 に減衰） */
  isCrossLoading?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 質問定義（30問）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const QUESTIONS: Question[] = [
  // ── 軸1: direct_vs_diplomatic（直接的 vs 外交的）──────
  {
    id: "d1",
    text: "友人が髪型を変えて「どう思う？」と聞いてきた。正直あまり似合わないと思った。",
    options: [
      { id: "d1_a", label: "「前の方が好きだったかも」と正直に伝える" },
      { id: "d1_b", label: "「雰囲気変わったね！」と褒めつつ前の良さも伝える" },
      { id: "d1_c", label: "「似合ってるよ」と言っておく" },
      { id: "d1_d", label: "髪型には触れず、別の話題に切り替える" },
    ],
  },
  {
    id: "d2",
    text: "グループLINEで、1人だけ空気を読まない発言をしている。",
    options: [
      { id: "d2_a", label: "直接その人にDMで指摘する" },
      { id: "d2_b", label: "グループ内でやんわり軌道修正する" },
      { id: "d2_c", label: "他の人の反応を見てから判断する" },
      { id: "d2_d", label: "自分からは何もしない" },
    ],
  },

  // ── 軸2: attachment_style（愛着スタイル）──────
  {
    id: "at1",
    text: "親しい人と丸一日連絡が取れなかった。夜に「ごめん、忙しくて」と来た。",
    options: [
      { id: "at1_a", label: "「全然大丈夫。お疲れさま」と自然に返す" },
      { id: "at1_b", label: "少しほっとしつつ「心配してたよ」と伝える" },
      { id: "at1_c", label: "「なんで連絡くれなかったの？」と理由を聞きたくなる" },
      { id: "at1_d", label: "既読にしてすぐには返さない" },
    ],
  },
  {
    id: "at2",
    text: "大切な人との関係で一番怖いのは？",
    options: [
      { id: "at2_a", label: "相手に見捨てられること" },
      { id: "at2_b", label: "相手に依存しすぎること" },
    ],
  },
  {
    id: "at3",
    text: "落ち込んでいるとき、親しい人にはどうしてほしい？",
    options: [
      { id: "at3_a", label: "そばにいて話を聞いてほしい" },
      { id: "at3_b", label: "「大丈夫？」と一声かけてくれればいい" },
      { id: "at3_c", label: "特に何もしなくていい。自分で処理する" },
      { id: "at3_d", label: "しばらくそっとしておいてほしい" },
    ],
  },

  // ── 軸3: reassurance_need（安心確認の必要度）──────
  {
    id: "rn1",
    text: "メッセージを送った後、相手が既読にしたまま30分返信がない。",
    options: [
      { id: "rn1_a", label: "特に何も思わない" },
      { id: "rn1_b", label: "忙しいのだろうと気にしない" },
      { id: "rn1_c", label: "何か変なこと書いたか少し見返す" },
      { id: "rn1_d", label: "「さっきの変だったかな？」と送りたくなる" },
    ],
  },
  {
    id: "rn2",
    text: "友人に相談した後、「うん、わかった」とだけ返ってきた。",
    options: [
      { id: "rn2_a", label: "了解の意味だと受け取る" },
      { id: "rn2_b", label: "少し物足りないが気にしない" },
      { id: "rn2_c", label: "「怒ってない？」と確認したくなる" },
      { id: "rn2_d", label: "返事の短さが気になってしばらく考えてしまう" },
    ],
  },

  // ── 軸4: emotional_variability（感情の変動幅）──────
  {
    id: "ev1",
    text: "1週間を振り返ったとき、自分の気分の変化はどのくらい？",
    options: [
      { id: "ev1_a", label: "ほぼ一定。大きく変わることは少ない" },
      { id: "ev1_b", label: "多少の波はあるが、すぐ戻る" },
      { id: "ev1_c", label: "良い日と悪い日の差がはっきりある" },
      { id: "ev1_d", label: "1日の中でも気分がかなり変わることがある" },
    ],
  },
  {
    id: "ev2",
    text: "嬉しいことがあったとき、どのくらいテンションが上がる？",
    options: [
      { id: "ev2_a", label: "内心嬉しいが、態度はあまり変わらない" },
      { id: "ev2_b", label: "普通に嬉しくなる" },
      { id: "ev2_c", label: "かなりテンションが上がって、周りにもわかる" },
      { id: "ev2_d", label: "最高に盛り上がる。でもその後急に落ち着くこともある" },
    ],
  },

  // ── 軸5: conflict_style（葛藤への対処スタイル）──────
  {
    id: "cs1",
    text: "パートナーや親しい友人と約束の時間で意見が合わない。",
    options: [
      { id: "cs1_a", label: "自分の意見を主張して、落としどころを探る" },
      { id: "cs1_b", label: "理由を聞いた上で、どちらかに決める" },
      { id: "cs1_c", label: "相手に合わせる。自分が折れた方が早い" },
      { id: "cs1_d", label: "「どっちでもいいよ」と言って終わらせる" },
    ],
  },
  {
    id: "cs2",
    text: "SNSで知り合いが自分と反対の意見を投稿している。",
    options: [
      { id: "cs2_a", label: "コメントで自分の考えを伝える" },
      { id: "cs2_b", label: "いいねはしないが、心の中で反論する" },
      { id: "cs2_c", label: "気にせずスルーする" },
      { id: "cs2_d", label: "見なかったことにしてタイムラインを閉じる" },
    ],
  },
  {
    id: "cs3",
    text: "モヤモヤすることがあったとき、相手に伝えるまでにどのくらいかかる？",
    options: [
      { id: "cs3_a", label: "その場ですぐ伝える" },
      { id: "cs3_b", label: "少し時間を置いてから、整理して伝える" },
      { id: "cs3_c", label: "伝えようか迷いながら、結局言わないことが多い" },
      { id: "cs3_d", label: "モヤモヤ自体を自分の中で処理して終わらせる" },
    ],
  },

  // ── 軸6: public_private_gap（表出と内面のギャップ）──────
  {
    id: "pp1",
    text: "職場や学校で嫌なことがあった日。帰宅後、家族やパートナーにはどう見える？",
    options: [
      { id: "pp1_a", label: "見た通り不機嫌。隠さない" },
      { id: "pp1_b", label: "少し疲れてるように見えるかも" },
      { id: "pp1_c", label: "普通に振る舞う。聞かれたら話すかも" },
      { id: "pp1_d", label: "いつも通り元気に見えるようにする" },
    ],
  },
  {
    id: "pp2",
    text: "「本当の自分」と「人前の自分」は、どのくらい違う？",
    options: [
      { id: "pp2_a", label: "ほぼ同じ。裏表がない方だと思う" },
      { id: "pp2_b", label: "かなり違う。人には見せない面がある" },
    ],
  },

  // ── 軸7: boundary_awareness（境界線の意識）──────
  {
    id: "ba1",
    text: "友人に「今度の休日一緒に出かけない？」と誘われた。本当は1人で過ごしたい。",
    options: [
      { id: "ba1_a", label: "「ごめん、今回は1人で過ごしたい」とはっきり断る" },
      { id: "ba1_b", label: "「その日はちょっと...」と予定があるふりをする" },
      { id: "ba1_c", label: "断りきれず「いいよ」と答える" },
      { id: "ba1_d", label: "曖昧に返事して、当日ドタキャンしてしまうかも" },
    ],
  },
  {
    id: "ba2",
    text: "友人が頻繁にあなたに愚痴を言ってくる。正直少し重たい。",
    options: [
      { id: "ba2_a", label: "「毎回だと少しきついかも」と正直に伝える" },
      { id: "ba2_b", label: "返信を遅くして、聞く頻度を減らす" },
      { id: "ba2_c", label: "自分も話したい話があるときは切り出す" },
      { id: "ba2_d", label: "相手のために聞き続ける。断るのは悪い気がする" },
    ],
  },

  // ── 軸8: intimacy_pace（親密化のペース）──────
  {
    id: "ip1",
    text: "新しく知り合った人と意気投合した。次に会うのはいつがいい？",
    options: [
      { id: "ip1_a", label: "明日でも来週でも、すぐに会いたい" },
      { id: "ip1_b", label: "1〜2週間後くらいがちょうどいい" },
      { id: "ip1_c", label: "月1くらいのペースでゆっくり" },
      { id: "ip1_d", label: "自然な流れで、また機会があれば" },
    ],
  },
  {
    id: "ip2",
    text: "知り合って間もない人から「今度2人でごはん行こう」と誘われた。",
    options: [
      { id: "ip2_a", label: "嬉しい。すぐ行きたい" },
      { id: "ip2_b", label: "少し考えて、行ってみようと思う" },
      { id: "ip2_c", label: "もう少しグループで会ってからの方が安心" },
      { id: "ip2_d", label: "まだ早い気がして、やんわり断る" },
    ],
  },

  // ── 軸9: self_disclosure_depth（自己開示の深さ）──────
  {
    id: "sd1",
    text: "仲良くなりたい相手との会話。どのあたりまで話す？",
    options: [
      { id: "sd1_a", label: "家族の話、過去の失敗、コンプレックスも話せる" },
      { id: "sd1_b", label: "価値観や将来の夢くらいなら話す" },
      { id: "sd1_c", label: "趣味や好きなものの話が中心" },
      { id: "sd1_d", label: "自分のことはあまり話さない。聞き役が多い" },
    ],
  },
  {
    id: "sd2",
    text: "つらいことがあったとき、それを誰かに話す？",
    options: [
      { id: "sd2_a", label: "信頼できる人には詳しく話す" },
      { id: "sd2_b", label: "概要だけ話して、詳細は省く" },
      { id: "sd2_c", label: "「ちょっと疲れてて」くらいは言う" },
      { id: "sd2_d", label: "基本的に誰にも話さない" },
    ],
  },

  // ── 軸10: emotional_regulation（感情調整力）──────
  {
    id: "er1",
    text: "イライラしているとき、それをどう処理する？",
    options: [
      { id: "er1_a", label: "原因を考えて、納得できる解釈を見つける" },
      { id: "er1_b", label: "深呼吸や散歩など、気分転換を試みる" },
      { id: "er1_c", label: "ぐっと我慢して、時間が経つのを待つ" },
      { id: "er1_d", label: "誰かに話したりSNSに書いて発散する" },
    ],
  },
  {
    id: "er2",
    text: "感情的になりそうな場面で、自分をコントロールできる方？",
    options: [
      { id: "er2_a", label: "かなりできる方だと思う" },
      { id: "er2_b", label: "だいたいはできるが、たまに難しい" },
      { id: "er2_c", label: "状況による。相手や話題によっては崩れる" },
      { id: "er2_d", label: "正直、感情的になりやすい方だ" },
    ],
  },
  {
    id: "er3",
    text: "友人との会話中、傷つく一言を言われた。その瞬間は？",
    options: [
      { id: "er3_a", label: "「それ、ちょっと傷つくよ」とその場で伝える" },
      { id: "er3_b", label: "表情には出さないが、後で1人で考える" },
      { id: "er3_c", label: "一瞬固まって、空気が変わるのがわかる" },
      { id: "er3_d", label: "感情が顔に出てしまい、場が気まずくなる" },
    ],
  },

  // ── 軸11: relational_investment（関係への投資度）──────
  {
    id: "ri1",
    text: "友人の誕生日。どのくらい準備する？",
    options: [
      { id: "ri1_a", label: "サプライズやその人に合ったプレゼントを探す" },
      { id: "ri1_b", label: "プレゼントを用意してメッセージも送る" },
      { id: "ri1_c", label: "LINEで「おめでとう」を送る" },
      { id: "ri1_d", label: "特に何もしないかも。覚えていれば送る" },
    ],
  },
  {
    id: "ri2",
    text: "しばらく連絡を取っていない友人がいる。自分からはどうする？",
    options: [
      { id: "ri2_a", label: "思い出したらすぐ連絡する。関係を維持したい" },
      { id: "ri2_b", label: "たまに「元気？」くらいは送る" },
      { id: "ri2_c", label: "相手から来たら返すが、自分からは滅多に連絡しない" },
      { id: "ri2_d", label: "自然に離れるなら、それでいいと思う" },
    ],
  },

  // ── クロスローディング質問（5問）──────
  {
    id: "cl1",
    text: "恋人と喧嘩した翌日。まだモヤモヤしているが、相手から「昨日はごめん」とLINEが来た。",
    options: [
      { id: "cl1_a", label: "「こっちこそ。直接会って話そう」" },
      { id: "cl1_b", label: "「ありがとう。少し時間もらっていい？」" },
      { id: "cl1_c", label: "「いいよ」とだけ返す" },
      { id: "cl1_d", label: "既読スルーする" },
    ],
  },
  {
    id: "cl2",
    text: "初めて会った人から「今度プライベートの相談に乗ってほしい」と言われた。",
    options: [
      { id: "cl2_a", label: "「もちろん。いつでも」" },
      { id: "cl2_b", label: "「どんな内容か教えてもらえたら」" },
      { id: "cl2_c", label: "「まだそこまでの関係じゃないかな」" },
      { id: "cl2_d", label: "引き受けるが、内心は少し困っている" },
    ],
  },
  {
    id: "cl3",
    text: "友人グループでの旅行計画。あなただけ希望の日程が合わない。",
    options: [
      { id: "cl3_a", label: "「その日は無理。別の日にしない？」と提案する" },
      { id: "cl3_b", label: "無理して合わせる" },
      { id: "cl3_c", label: "「行けなくても大丈夫。楽しんできて」と引く" },
      { id: "cl3_d", label: "日程が合わないことを言えず、返事を先延ばしにする" },
    ],
  },
  {
    id: "cl4",
    text: "親しい友人が明らかに間違った決断をしようとしている。",
    options: [
      { id: "cl4_a", label: "「それは違うと思う」とはっきり止める" },
      { id: "cl4_b", label: "「こういうリスクもあるよ」と情報だけ伝える" },
      { id: "cl4_c", label: "心配だけど、本人の人生だから見守る" },
      { id: "cl4_d", label: "本人には言わず、共通の友人に相談する" },
    ],
  },
  {
    id: "cl5",
    text: "落ち込んでいるとき、パートナーが「何かあった？」と聞いてきた。",
    options: [
      { id: "cl5_a", label: "全部話す。聞いてもらえると楽になる" },
      { id: "cl5_b", label: "大まかに話して、アドバイスはいらないと伝える" },
      { id: "cl5_c", label: "「大丈夫」と言って話題を変える" },
      { id: "cl5_d", label: "「1人にしてほしい」と距離を取る" },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スコアリングマッピング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const OPTION_EFFECTS: Record<string, AxisEffect[]> = {
  // ── direct_vs_diplomatic ──
  d1_a: [{ axis: "direct_vs_diplomatic", delta: -0.7 }],
  d1_b: [{ axis: "direct_vs_diplomatic", delta: -0.2 }],
  d1_c: [{ axis: "direct_vs_diplomatic", delta: 0.3 }],
  d1_d: [{ axis: "direct_vs_diplomatic", delta: 0.7 }],
  d2_a: [{ axis: "direct_vs_diplomatic", delta: -0.7 }],
  d2_b: [{ axis: "direct_vs_diplomatic", delta: -0.2 }],
  d2_c: [{ axis: "direct_vs_diplomatic", delta: 0.3 }],
  d2_d: [{ axis: "direct_vs_diplomatic", delta: 0.7 }],

  // ── attachment_style ──
  at1_a: [{ axis: "attachment_style", delta: -0.6 }],
  at1_b: [{ axis: "attachment_style", delta: 0.2 }],
  at1_c: [{ axis: "attachment_style", delta: 0.6 }],
  at1_d: [{ axis: "attachment_style", delta: -0.4 }],
  at2_a: [{ axis: "attachment_style", delta: 0.7 }],
  at2_b: [{ axis: "attachment_style", delta: -0.7 }],
  at3_a: [{ axis: "attachment_style", delta: 0.5 }],
  at3_b: [{ axis: "attachment_style", delta: 0.1 }],
  at3_c: [{ axis: "attachment_style", delta: -0.5 }],
  at3_d: [{ axis: "attachment_style", delta: -0.7 }],

  // ── reassurance_need ──
  rn1_a: [{ axis: "reassurance_need", delta: -0.7 }],
  rn1_b: [{ axis: "reassurance_need", delta: -0.3 }],
  rn1_c: [{ axis: "reassurance_need", delta: 0.4 }],
  rn1_d: [{ axis: "reassurance_need", delta: 0.7 }],
  rn2_a: [{ axis: "reassurance_need", delta: -0.6 }],
  rn2_b: [{ axis: "reassurance_need", delta: -0.1 }],
  rn2_c: [{ axis: "reassurance_need", delta: 0.5 }],
  rn2_d: [{ axis: "reassurance_need", delta: 0.7 }],

  // ── emotional_variability ──
  ev1_a: [{ axis: "emotional_variability", delta: -0.7 }],
  ev1_b: [{ axis: "emotional_variability", delta: -0.2 }],
  ev1_c: [{ axis: "emotional_variability", delta: 0.4 }],
  ev1_d: [{ axis: "emotional_variability", delta: 0.7 }],
  ev2_a: [{ axis: "emotional_variability", delta: -0.5 }],
  ev2_b: [{ axis: "emotional_variability", delta: -0.1 }],
  ev2_c: [{ axis: "emotional_variability", delta: 0.4 }],
  ev2_d: [{ axis: "emotional_variability", delta: 0.7 }],

  // ── conflict_style ──
  cs1_a: [{ axis: "conflict_style", delta: 0.6 }],
  cs1_b: [{ axis: "conflict_style", delta: 0.2 }],
  cs1_c: [{ axis: "conflict_style", delta: -0.3 }],
  cs1_d: [{ axis: "conflict_style", delta: -0.7 }],
  cs2_a: [{ axis: "conflict_style", delta: 0.7 }],
  cs2_b: [{ axis: "conflict_style", delta: 0.1 }],
  cs2_c: [{ axis: "conflict_style", delta: -0.4 }],
  cs2_d: [{ axis: "conflict_style", delta: -0.7 }],
  cs3_a: [{ axis: "conflict_style", delta: 0.7 }],
  cs3_b: [{ axis: "conflict_style", delta: 0.3 }],
  cs3_c: [{ axis: "conflict_style", delta: -0.4 }],
  cs3_d: [{ axis: "conflict_style", delta: -0.7 }],

  // ── public_private_gap ──
  pp1_a: [{ axis: "public_private_gap", delta: -0.7 }],
  pp1_b: [{ axis: "public_private_gap", delta: -0.2 }],
  pp1_c: [{ axis: "public_private_gap", delta: 0.3 }],
  pp1_d: [{ axis: "public_private_gap", delta: 0.7 }],
  pp2_a: [{ axis: "public_private_gap", delta: -0.7 }],
  pp2_b: [{ axis: "public_private_gap", delta: 0.7 }],

  // ── boundary_awareness ──
  ba1_a: [{ axis: "boundary_awareness", delta: 0.7 }],
  ba1_b: [{ axis: "boundary_awareness", delta: 0.2 }],
  ba1_c: [{ axis: "boundary_awareness", delta: -0.4 }],
  ba1_d: [{ axis: "boundary_awareness", delta: -0.7 }],
  ba2_a: [{ axis: "boundary_awareness", delta: 0.7 }],
  ba2_b: [{ axis: "boundary_awareness", delta: 0.2 }],
  ba2_c: [{ axis: "boundary_awareness", delta: -0.1 }],
  ba2_d: [{ axis: "boundary_awareness", delta: -0.7 }],

  // ── intimacy_pace ──
  ip1_a: [{ axis: "intimacy_pace", delta: 0.7 }],
  ip1_b: [{ axis: "intimacy_pace", delta: 0.2 }],
  ip1_c: [{ axis: "intimacy_pace", delta: -0.3 }],
  ip1_d: [{ axis: "intimacy_pace", delta: -0.7 }],
  ip2_a: [{ axis: "intimacy_pace", delta: 0.7 }],
  ip2_b: [{ axis: "intimacy_pace", delta: 0.2 }],
  ip2_c: [{ axis: "intimacy_pace", delta: -0.4 }],
  ip2_d: [{ axis: "intimacy_pace", delta: -0.7 }],

  // ── self_disclosure_depth ──
  sd1_a: [{ axis: "self_disclosure_depth", delta: 0.7 }],
  sd1_b: [{ axis: "self_disclosure_depth", delta: 0.3 }],
  sd1_c: [{ axis: "self_disclosure_depth", delta: -0.3 }],
  sd1_d: [{ axis: "self_disclosure_depth", delta: -0.7 }],
  sd2_a: [{ axis: "self_disclosure_depth", delta: 0.6 }],
  sd2_b: [{ axis: "self_disclosure_depth", delta: 0.1 }],
  sd2_c: [{ axis: "self_disclosure_depth", delta: -0.3 }],
  sd2_d: [{ axis: "self_disclosure_depth", delta: -0.7 }],

  // ── emotional_regulation ──
  er1_a: [{ axis: "emotional_regulation", delta: 0.7 }],
  er1_b: [{ axis: "emotional_regulation", delta: 0.3 }],
  er1_c: [{ axis: "emotional_regulation", delta: -0.2 }],
  er1_d: [{ axis: "emotional_regulation", delta: -0.5 }],
  er2_a: [{ axis: "emotional_regulation", delta: 0.7 }],
  er2_b: [{ axis: "emotional_regulation", delta: 0.2 }],
  er2_c: [{ axis: "emotional_regulation", delta: -0.3 }],
  er2_d: [{ axis: "emotional_regulation", delta: -0.7 }],
  er3_a: [{ axis: "emotional_regulation", delta: 0.4 }],
  er3_b: [{ axis: "emotional_regulation", delta: 0.1 }],
  er3_c: [{ axis: "emotional_regulation", delta: -0.4 }],
  er3_d: [{ axis: "emotional_regulation", delta: -0.7 }],

  // ── relational_investment ──
  ri1_a: [{ axis: "relational_investment", delta: 0.7 }],
  ri1_b: [{ axis: "relational_investment", delta: 0.2 }],
  ri1_c: [{ axis: "relational_investment", delta: -0.3 }],
  ri1_d: [{ axis: "relational_investment", delta: -0.7 }],
  ri2_a: [{ axis: "relational_investment", delta: 0.7 }],
  ri2_b: [{ axis: "relational_investment", delta: 0.2 }],
  ri2_c: [{ axis: "relational_investment", delta: -0.4 }],
  ri2_d: [{ axis: "relational_investment", delta: -0.7 }],

  // ── クロスローディング ──
  cl1_a: [
    { axis: "conflict_style", delta: 0.5, isCrossLoading: true },
    { axis: "direct_vs_diplomatic", delta: -0.4, isCrossLoading: true },
    { axis: "intimacy_pace", delta: 0.3, isCrossLoading: true },
  ],
  cl1_b: [
    { axis: "conflict_style", delta: -0.2, isCrossLoading: true },
    { axis: "emotional_regulation", delta: 0.4, isCrossLoading: true },
    { axis: "boundary_awareness", delta: 0.3, isCrossLoading: true },
  ],
  cl1_c: [
    { axis: "public_private_gap", delta: 0.4, isCrossLoading: true },
    { axis: "conflict_style", delta: -0.4, isCrossLoading: true },
    { axis: "self_disclosure_depth", delta: -0.3, isCrossLoading: true },
  ],
  cl1_d: [
    { axis: "attachment_style", delta: -0.5, isCrossLoading: true },
    { axis: "conflict_style", delta: -0.6, isCrossLoading: true },
    { axis: "emotional_regulation", delta: -0.3, isCrossLoading: true },
  ],

  cl2_a: [
    { axis: "intimacy_pace", delta: 0.5, isCrossLoading: true },
    { axis: "relational_investment", delta: 0.4, isCrossLoading: true },
    { axis: "boundary_awareness", delta: -0.5, isCrossLoading: true },
  ],
  cl2_b: [
    { axis: "boundary_awareness", delta: 0.3, isCrossLoading: true },
    { axis: "self_disclosure_depth", delta: 0.2, isCrossLoading: true },
    { axis: "direct_vs_diplomatic", delta: -0.2, isCrossLoading: true },
  ],
  cl2_c: [
    { axis: "boundary_awareness", delta: 0.7, isCrossLoading: true },
    { axis: "intimacy_pace", delta: -0.6, isCrossLoading: true },
    { axis: "direct_vs_diplomatic", delta: -0.5, isCrossLoading: true },
  ],
  cl2_d: [
    { axis: "public_private_gap", delta: 0.5, isCrossLoading: true },
    { axis: "boundary_awareness", delta: -0.4, isCrossLoading: true },
    { axis: "reassurance_need", delta: 0.2, isCrossLoading: true },
  ],

  cl3_a: [
    { axis: "direct_vs_diplomatic", delta: -0.5, isCrossLoading: true },
    { axis: "boundary_awareness", delta: 0.4, isCrossLoading: true },
    { axis: "conflict_style", delta: 0.3, isCrossLoading: true },
  ],
  cl3_b: [
    { axis: "boundary_awareness", delta: -0.5, isCrossLoading: true },
    { axis: "relational_investment", delta: 0.3, isCrossLoading: true },
    { axis: "public_private_gap", delta: 0.3, isCrossLoading: true },
  ],
  cl3_c: [
    { axis: "conflict_style", delta: -0.4, isCrossLoading: true },
    { axis: "relational_investment", delta: -0.2, isCrossLoading: true },
    { axis: "boundary_awareness", delta: 0.2, isCrossLoading: true },
  ],
  cl3_d: [
    { axis: "direct_vs_diplomatic", delta: 0.6, isCrossLoading: true },
    { axis: "emotional_regulation", delta: -0.3, isCrossLoading: true },
    { axis: "public_private_gap", delta: 0.4, isCrossLoading: true },
  ],

  cl4_a: [
    { axis: "direct_vs_diplomatic", delta: -0.7, isCrossLoading: true },
    { axis: "relational_investment", delta: 0.4, isCrossLoading: true },
    { axis: "conflict_style", delta: 0.4, isCrossLoading: true },
  ],
  cl4_b: [
    { axis: "direct_vs_diplomatic", delta: -0.3, isCrossLoading: true },
    { axis: "emotional_regulation", delta: 0.3, isCrossLoading: true },
  ],
  cl4_c: [
    { axis: "boundary_awareness", delta: 0.4, isCrossLoading: true },
    { axis: "conflict_style", delta: -0.3, isCrossLoading: true },
    { axis: "relational_investment", delta: -0.2, isCrossLoading: true },
  ],
  cl4_d: [
    { axis: "public_private_gap", delta: 0.3, isCrossLoading: true },
    { axis: "direct_vs_diplomatic", delta: 0.5, isCrossLoading: true },
    { axis: "reassurance_need", delta: 0.3, isCrossLoading: true },
  ],

  cl5_a: [
    { axis: "self_disclosure_depth", delta: 0.7, isCrossLoading: true },
    { axis: "attachment_style", delta: 0.3, isCrossLoading: true },
    { axis: "reassurance_need", delta: 0.3, isCrossLoading: true },
  ],
  cl5_b: [
    { axis: "self_disclosure_depth", delta: 0.2, isCrossLoading: true },
    { axis: "boundary_awareness", delta: 0.4, isCrossLoading: true },
    { axis: "emotional_regulation", delta: 0.2, isCrossLoading: true },
  ],
  cl5_c: [
    { axis: "public_private_gap", delta: 0.5, isCrossLoading: true },
    { axis: "self_disclosure_depth", delta: -0.5, isCrossLoading: true },
    { axis: "attachment_style", delta: -0.3, isCrossLoading: true },
  ],
  cl5_d: [
    { axis: "attachment_style", delta: -0.7, isCrossLoading: true },
    { axis: "boundary_awareness", delta: 0.3, isCrossLoading: true },
    { axis: "self_disclosure_depth", delta: -0.6, isCrossLoading: true },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スコアリングエンジン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CL_WEIGHT = 0.6;

export interface AxisResult {
  axis: string;
  score: number;       // -1.0 ~ +1.0
  confidence: number;  // 0.0 ~ 1.0
  itemCount: number;
}

/**
 * 回答配列から11軸のスコアを算出する。
 * クロスローディング質問は重み 0.6 で加算。
 */
export function computeScores(
  answers: Array<{ questionId: string; optionId: string }>,
): AxisResult[] {
  // 軸ごとに direct / cross のスコアを分離して蓄積
  const direct: Record<string, number[]> = {};
  const cross: Record<string, number[]> = {};

  const ALL_AXES = [
    "direct_vs_diplomatic", "attachment_style", "reassurance_need",
    "emotional_variability", "conflict_style", "public_private_gap",
    "boundary_awareness", "intimacy_pace", "self_disclosure_depth",
    "emotional_regulation", "relational_investment",
  ];

  for (const axis of ALL_AXES) {
    direct[axis] = [];
    cross[axis] = [];
  }

  for (const answer of answers) {
    const effects = OPTION_EFFECTS[answer.optionId];
    if (!effects) continue;
    for (const { axis, delta, isCrossLoading } of effects) {
      if (isCrossLoading) {
        cross[axis]?.push(delta);
      } else {
        direct[axis]?.push(delta);
      }
    }
  }

  // 軸ごとに加重平均を算出
  return ALL_AXES.map(axis => {
    const d = direct[axis];
    const c = cross[axis];

    if (d.length === 0 && c.length === 0) {
      return { axis, score: 0, confidence: 0, itemCount: 0 };
    }

    // direct の平均
    const dMean = d.length > 0 ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    const dSign = Math.sign(dMean);

    // cross の加重値を計算（direct と同方向なら 0.6、逆方向なら 0.3）
    let weightedSum = d.reduce((a, b) => a + b, 0);
    let totalWeight = d.length;

    for (const cv of c) {
      const w = (d.length === 0 || Math.sign(cv) === dSign) ? CL_WEIGHT : 0.3;
      weightedSum += cv * w;
      totalWeight += w;
    }

    const score = totalWeight > 0
      ? Math.max(-1, Math.min(1, weightedSum / totalWeight))
      : 0;

    const itemCount = d.length + c.length;

    // Confidence: 項目数ベース + 一貫性ボーナス
    const allValues = [...d, ...c];
    const signs = allValues.map(Math.sign);
    const consistent = signs.length > 1
      ? signs.filter(s => s === signs[0]).length / signs.length
      : 0.5;

    const baseLine = Math.min(1.0, itemCount * 0.22);
    const consistencyBonus = consistent * 0.15;
    const confidence = Math.min(0.78, baseLine + consistencyBonus);

    return { axis, score, confidence, itemCount };
  });
}
