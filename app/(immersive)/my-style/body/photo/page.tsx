import Link from "next/link";

const SHOT_GUIDES = [
  {
    title: "正面",
    desc: "肩幅、胸囲、ウエスト位置、脚比率の基準になります。",
    bullets: ["頭頂から足先まで入れる", "腕は体から少し離す", "骨盤を正面に向ける"],
  },
  {
    title: "側面",
    desc: "肩傾斜、骨盤傾き、胴の厚みを見るためのカットです。",
    bullets: ["耳・肩・骨盤・くるぶしが見える", "猫背にならない", "髪や上着で腰線を隠さない"],
  },
  {
    title: "足元",
    desc: "足長、足囲、足幅の確認用です。",
    bullets: ["かかとからつま先まで真上で撮る", "足の外周が見える明るさにする", "靴下は薄手か素足"],
  },
];

const PREP_CHECKLIST = [
  "体のラインが見える服を選ぶ。厚手アウターは外す。",
  "鏡撮りより、三脚か壁置きで歪みを減らす。",
  "スマホは胸〜腰の高さ、広角補正が強すぎない位置に置く。",
  "背景は無地に近い壁で、逆光を避ける。",
];

export default function MyStyleBodyPhotoPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <section className="rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-amber-50 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Body Photo Guide</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">全身撮影ガイド</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              `/my-style/body` の精度を上げるための撮影準備ページです。正面、側面、足元が揃うと、
              全身ガイドと足ガイドの判定精度が安定します。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/my-style/body"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              体型入力へ戻る
            </Link>
            <Link
              href="/body-color/avatar/capture"
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
            >
              撮影を開始
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Before Shoot</div>
        <div className="mt-1 text-lg font-black text-slate-900">撮影前チェック</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {PREP_CHECKLIST.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {SHOT_GUIDES.map((shot) => (
          <article key={shot.title} className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{shot.title}</div>
            <div className="mt-2 text-xl font-black text-slate-900">{shot.title}カット</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{shot.desc}</div>
            <div className="mt-4 space-y-2">
              {shot.bullets.map((bullet) => (
                <div key={bullet} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {bullet}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-cyan-200 bg-cyan-50 p-6">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">After Capture</div>
        <div className="mt-1 text-lg font-black text-cyan-950">次の流れ</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-4 text-sm text-cyan-900">
            1. `/body-color/avatar/capture` で素材を確定
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-4 text-sm text-cyan-900">
            2. `/my-style/body` で CFV14 と人体計測を保存
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-4 text-sm text-cyan-900">
            3. `/my-style/diagnosis` で骨格×カラー総合診断を確認
          </div>
        </div>
      </section>
    </main>
  );
}
