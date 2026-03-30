import { safeLSSet } from "@/lib/safeLocalStorage";

export type TribeFeaturedItem = {
  id: string;
  image_url: string;
};

export type CustomTribe = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  tags: string[];
  prompt: string;
  members: number;
  posts: number;
  joined: boolean;
  createdAt: string;
  featured_items: TribeFeaturedItem[];
  kind: "custom";
};

export const CUSTOM_TRIBES_KEY = "culcept_custom_tribes_v1";
export const CUSTOM_TRIBE_JOINS_KEY = "culcept_custom_tribe_joins_v1";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isBrowser() {
  return typeof window !== "undefined";
}

export function readCustomTribes(): CustomTribe[] {
  if (!isBrowser()) return [];
  return safeParse<CustomTribe[]>(window.localStorage.getItem(CUSTOM_TRIBES_KEY), []);
}

export function writeCustomTribes(items: CustomTribe[]) {
  if (!isBrowser()) return;
  safeLSSet(CUSTOM_TRIBES_KEY, JSON.stringify(items));
}

export function readCustomJoinedIds(): string[] {
  if (!isBrowser()) return [];
  return safeParse<string[]>(window.localStorage.getItem(CUSTOM_TRIBE_JOINS_KEY), []);
}

export function writeCustomJoinedIds(ids: string[]) {
  if (!isBrowser()) return;
  safeLSSet(CUSTOM_TRIBE_JOINS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

export function createCustomTribe(input: {
  name: string;
  description: string;
  icon: string;
  accent: string;
  tags: string[];
  prompt?: string;
}): CustomTribe {
  const stamp = Date.now().toString(36);
  const base = slugify(input.name) || "community";
  const tags = input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 6);

  return {
    id: `custom-${base}-${stamp}`,
    name: input.name.trim(),
    description: input.description.trim(),
    icon: input.icon.trim() || "🫶",
    accent: input.accent,
    tags,
    prompt: input.prompt?.trim() || `${input.name.trim()}で共有したい観点をまとめるスペース`,
    members: 1,
    posts: 0,
    joined: true,
    createdAt: new Date().toISOString(),
    featured_items: [],
    kind: "custom",
  };
}

export function customTopicKey(tribeId: string) {
  return `culcept_custom_tribe_topics_v1:${tribeId}`;
}

export type CustomTribeTopic = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export function readCustomTopics(tribeId: string): CustomTribeTopic[] {
  if (!isBrowser()) return [];
  return safeParse<CustomTribeTopic[]>(window.localStorage.getItem(customTopicKey(tribeId)), []);
}

export function writeCustomTopics(tribeId: string, topics: CustomTribeTopic[]) {
  if (!isBrowser()) return;
  safeLSSet(customTopicKey(tribeId), JSON.stringify(topics));
}

export function createCustomTopic(input: { title: string; body: string }): CustomTribeTopic {
  return {
    id: `topic-${Date.now().toString(36)}`,
    title: input.title.trim(),
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
}
