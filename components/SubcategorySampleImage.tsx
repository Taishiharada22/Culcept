// components/SubcategorySampleImage.tsx
"use client";

import Image, { type ImageProps } from "next/image";
import { useMemo, useState } from "react";
import {
    type SubcategorySlug,
    getOriginalSrc,
    getTransparentSrc,
} from "@/lib/subcategorySamples";

type Props = Omit<ImageProps, "src" | "alt"> & {
    slug: SubcategorySlug;
    alt?: string;
};

export default function SubcategorySampleImage({
    slug,
    alt,
    width = 256,
    height = 256,
    ...rest
}: Props) {
    const original = useMemo(() => getOriginalSrc(slug), [slug]);
    const transparent = useMemo(() => getTransparentSrc(slug), [slug]);

    const [src, setSrc] = useState<string>(transparent);
    const [failedOnce, setFailedOnce] = useState(false);

    return (
        <Image
            {...rest}
            src={src}
            alt={alt ?? slug}
            width={width}
            height={height}
            onError={() => {
                if (!failedOnce) {
                    setFailedOnce(true);
                    setSrc(original); // 透過が無ければオリジナルへ
                }
            }}
        />
    );
}
