import Link from "next/link";

export default function DropCard({ d }: { d: any }) {
    return (
        <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <Link href={`/drops/${d.id}`} className="block no-underline">
                <div className="aspect-[4/3] w-full bg-zinc-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {d.cover_image_url ? (
                        <img src={d.cover_image_url} alt={d.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                </div>

                <div className="grid gap-1 p-4">
                    <div className="text-sm font-black text-zinc-950 line-clamp-2">{d.title}</div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-zinc-600">
                        {d.brand ? <span>{d.brand}</span> : null}
                        {d.size ? <span>{d.size}</span> : null}
                        {d.condition ? <span>{d.condition}</span> : null}
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3">
                        <div className="text-sm font-extrabold text-zinc-900">
                            {d.price != null ? `¥${d.price}` : "—"}
                        </div>
                        {d.purchase_url ? (
                            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-extrabold text-white">
                                Buy
                            </span>
                        ) : null}
                    </div>
                </div>
            </Link>
        </li>
    );
}
