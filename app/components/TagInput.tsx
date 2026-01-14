"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function normalizeTag(s: string) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export default function TagInput({
    name,
    defaultTags = [],
    placeholder = "tag を入力して Enter（カンマでもOK）",
    maxTags = 15,
}: {
    name: string;
    defaultTags?: string[];
    placeholder?: string;
    maxTags?: number;
}) {
    const [tags, setTags] = React.useState<string[]>(
        Array.from(new Set(defaultTags.map(normalizeTag))).filter(Boolean)
    );
    const [value, setValue] = React.useState("");
    const [suggestions, setSuggestions] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(false);
    const listId = React.useId();

    const addTag = React.useCallback(
        (raw: string) => {
            const t = normalizeTag(raw);
            if (!t) return;
            setTags((prev) => {
                if (prev.includes(t)) return prev;
                if (prev.length >= maxTags) return prev;
                return [...prev, t];
            });
        },
        [maxTags]
    );

    const removeTag = React.useCallback((t: string) => {
        setTags((prev) => prev.filter((x) => x !== t));
    }, []);

    React.useEffect(() => {
        const q = normalizeTag(value);
        if (!q) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/tags?q=${encodeURIComponent(q)}`);
                const json = await res.json();
                const opts = Array.isArray(json?.tags) ? json.tags : [];
                const cleaned = opts.map(normalizeTag).filter((t: string) => t && !tags.includes(t));
                setSuggestions(cleaned.slice(0, 12));
            } finally {
                setLoading(false);
            }
        }, 180);

        return () => clearTimeout(timer);
    }, [value, tags]);

    return (
        <div className="grid gap-3">
            <input type="hidden" name={name} value={JSON.stringify(tags)} />

            <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                    <Badge key={t} className="gap-2">
                        {t}
                        <button
                            type="button"
                            onClick={() => removeTag(t)}
                            className="rounded-full border border-red-200 px-2 py-0.5 text-[11px] font-extrabold text-red-700 hover:bg-red-50"
                        >
                            x
                        </button>
                    </Badge>
                ))}
            </div>

            <div className="grid gap-2">
                <Input
                    value={value}
                    placeholder={placeholder}
                    list={listId}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addTag(value);
                            setValue("");
                        }
                        if (e.key === "Backspace" && !value && tags.length > 0) {
                            removeTag(tags[tags.length - 1]);
                        }
                    }}
                />

                <datalist id={listId}>
                    {suggestions.map((s) => (
                        <option key={s} value={s} />
                    ))}
                </datalist>

                <div className="flex items-center justify-between text-xs text-zinc-600">
                    <span>{loading ? "候補を検索中…" : " "}</span>
                    <span className="font-semibold">
                        {tags.length}/{maxTags}
                    </span>
                </div>

                {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 8).map((s) => (
                            <Button
                                key={s}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    addTag(s);
                                    setValue("");
                                }}
                            >
                                + {s}
                            </Button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
