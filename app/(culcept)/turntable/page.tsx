"use client";

import React, { useState } from "react";
import Turntable360 from "@/app/components/Turntable360";

export default function TurntablePage() {
  const [reverse, setReverse] = useState(false);
  const [mirror, setMirror] = useState(false);

  return (
    <main className="p-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={reverse}
            onChange={(e) => setReverse(e.target.checked)}
          />
          reverse（回転方向反転）
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mirror}
            onChange={(e) => setMirror(e.target.checked)}
          />
          mirror（左右反転表示）
        </label>
      </div>

      <Turntable360
        basePath="/turntable/woman_360"
        frameCount={17} // ← ここをあなたの画像枚数に合わせて変える
        width={420}
        height={760}
        sensitivity={6}
        reverse={reverse}
        mirror={mirror}
        alt="woman 360"
        className="rounded-2xl border border-slate-200 bg-white"
      />
    </main>
  );
}

