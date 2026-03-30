import Link from "next/link";

import BodyProfileWizard from "@/components/body/BodyProfileWizard";

export default function MyStyleBodyPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">My Style Body</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">体型入力（CFV14 + 人体計測）</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              2026年2月28日時点の「全身ガイド + 足ガイド」を基準に戻した専用フローです。
              比率は自動計算、推定はルール駆動で表示し、保存すると総合診断を更新します。
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">全身ガイド</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">足ガイド</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">平均との差分</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">JP3 / JP7 override</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/my-style/body/photo"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              全身撮影ガイド
            </Link>
            <Link
              href="/body-color/avatar"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              カラー診断へ
            </Link>
            <Link
              href="/my-style/diagnosis"
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
            >
              総合診断へ
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-white/60 bg-white/80 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Guide</div>
            <div className="mt-2 text-lg font-black text-slate-900">人体図で計測位置を確認</div>
            <div className="mt-2 text-sm text-slate-500">肩幅、胸囲、股下、足長まで視覚的に追えます。</div>
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/80 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Drift</div>
            <div className="mt-2 text-lg font-black text-slate-900">年齢・身長・体重基準の比較</div>
            <div className="mt-2 text-sm text-slate-500">平均との差分をその場で見て、丈感や余白のズレを拾います。</div>
          </div>
          <div className="rounded-3xl border border-white/60 bg-white/80 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Diagnosis</div>
            <div className="mt-2 text-lg font-black text-slate-900">骨格ラベルを即時プレビュー</div>
            <div className="mt-2 text-sm text-slate-500">保存前でも JP3 / JP7 の仮推定とスタイル指針を確認できます。</div>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <BodyProfileWizard />
      </div>
    </main>
  );
}
