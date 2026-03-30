"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { getArchetypeFigureSrc } from "@/lib/stargazer/archetypeFigure";

interface Props {
  englishName?: string | null;
  emoji?: string | null;
  alt: string;
  containerClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  priority?: boolean;
  sizes?: string;
}

export default function ArchetypeFigure({
  englishName,
  emoji,
  alt,
  containerClassName,
  imageClassName,
  fallbackClassName,
  priority = false,
  sizes = "100vw",
}: Props) {
  const src = useMemo(() => getArchetypeFigureSrc(englishName), [englishName]);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = !src || failedSrc === src;

  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center",
        containerClassName,
      )}
    >
      {src && !showFallback ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={clsx("object-contain", imageClassName)}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          className={clsx(
            "flex h-full w-full items-center justify-center leading-none",
            fallbackClassName,
          )}
        >
          {emoji ?? "✦"}
        </span>
      )}
    </span>
  );
}
