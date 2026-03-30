"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PRESENCE_API_FALLBACK } from "../_lib/presenceDefaults";
import { uniq } from "../_lib/presenceConstants";
import type {
    Tab,
    EvidenceShape,
    SeekResponse,
    PulseResponse,
    MomentResponse,
    DepthResponse,
    MetamorphosisResponse,
    RelationsResponse,
    SelfResponse,
} from "../_lib/presenceTypes";

/* ── State ── */

type State = {
    loading: boolean;
    error: string | null;
    payload: SeekResponse | null;
    pulseData: PulseResponse | null;
    momentData: MomentResponse | null;
    depthData: DepthResponse | null;
    metaData: MetamorphosisResponse | null;
    relationsData: RelationsResponse | null;
    selfData: SelfResponse | null;
};

type Action =
    | { type: "FETCH_START" }
    | { type: "FETCH_SUCCESS"; payload: SeekResponse }
    | { type: "FETCH_ERROR"; error: string }
    | { type: "SET_PULSE"; data: PulseResponse }
    | { type: "SET_MOMENT"; data: MomentResponse }
    | { type: "SET_DEPTH"; data: DepthResponse }
    | { type: "SET_META"; data: MetamorphosisResponse }
    | { type: "SET_RELATIONS"; data: RelationsResponse }
    | { type: "SET_SELF"; data: SelfResponse };

const initialState: State = {
    loading: true,
    error: null,
    payload: null,
    pulseData: null,
    momentData: null,
    depthData: null,
    metaData: null,
    relationsData: null,
    selfData: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case "FETCH_START":
            return { ...state, loading: true, error: null };
        case "FETCH_SUCCESS":
            return { ...state, loading: false, payload: action.payload };
        case "FETCH_ERROR":
            return { ...state, loading: false, error: action.error };
        case "SET_PULSE":
            return { ...state, pulseData: action.data };
        case "SET_MOMENT":
            return { ...state, momentData: action.data };
        case "SET_DEPTH":
            return { ...state, depthData: action.data };
        case "SET_META":
            return { ...state, metaData: action.data };
        case "SET_RELATIONS":
            return { ...state, relationsData: action.data };
        case "SET_SELF":
            return { ...state, selfData: action.data };
        default:
            return state;
    }
}

/* ── Dual-Layer Cache (memory + localStorage) ── */

const MEMORY_TTL = 5 * 60 * 1000;    // 5 minutes
const PERSIST_TTL = 24 * 60 * 60 * 1000; // 24 hours
const LS_PREFIX = "presence_cache_";

type CacheEntry = { data: unknown; ts: number };

function lsGet<T>(url: string): T | null {
    try {
        const raw = localStorage.getItem(`${LS_PREFIX}${url}`);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.ts > PERSIST_TTL) {
            localStorage.removeItem(`${LS_PREFIX}${url}`);
            return null;
        }
        return entry.data as T;
    } catch {
        return null;
    }
}

function lsSet(url: string, data: unknown) {
    try {
        localStorage.setItem(`${LS_PREFIX}${url}`, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
}

function createCache() {
    const store = new Map<string, CacheEntry>();

    return {
        get<T>(url: string): T | null {
            // Memory cache first
            const mem = store.get(url);
            if (mem && Date.now() - mem.ts <= MEMORY_TTL) return mem.data as T;
            // localStorage fallback
            const persisted = lsGet<T>(url);
            if (persisted) {
                store.set(url, { data: persisted, ts: Date.now() });
                return persisted;
            }
            return null;
        },
        set(url: string, data: unknown) {
            store.set(url, { data, ts: Date.now() });
            lsSet(url, data);
        },
        getLastUpdateTime(): string | null {
            try {
                let latest = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith(LS_PREFIX)) {
                        const raw = localStorage.getItem(key);
                        if (raw) {
                            const { ts } = JSON.parse(raw);
                            if (ts > latest) latest = ts;
                        }
                    }
                }
                if (latest === 0) return null;
                return new Date(latest).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            } catch {
                return null;
            }
        },
    };
}

/* ── Hook ── */

export function usePresenceData(isDemo: boolean) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [isOffline, setIsOffline] = useState(false);
    const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
    const cacheRef = useRef(createCache());
    const fetchingRef = useRef(new Set<string>());

    // Online/offline detection
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => {
            setIsOffline(true);
            setLastUpdateTime(cacheRef.current.getLastUpdateTime());
        };
        if (typeof window !== "undefined") {
            setIsOffline(!navigator.onLine);
            window.addEventListener("online", handleOnline);
            window.addEventListener("offline", handleOffline);
            return () => {
                window.removeEventListener("online", handleOnline);
                window.removeEventListener("offline", handleOffline);
            };
        }
    }, []);

    const fetchWithCache = useCallback(async <T>(url: string): Promise<T | null> => {
        // Check cache (memory + localStorage)
        const cached = cacheRef.current.get<T>(url);
        if (cached) return cached;

        // Offline — no network available
        if (typeof navigator !== "undefined" && !navigator.onLine) return null;

        // Prevent duplicate in-flight requests
        if (fetchingRef.current.has(url)) return null;
        fetchingRef.current.add(url);

        try {
            const res = await fetch(url, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (json) cacheRef.current.set(url, json); // saves to both memory + localStorage
            return json as T;
        } catch {
            // Network error — try localStorage as last resort
            return lsGet<T>(url);
        } finally {
            fetchingRef.current.delete(url);
        }
    }, []);

    // Initial load
    const loadProfile = useCallback(async () => {
        dispatch({ type: "FETCH_START" });

        if (isDemo) {
            dispatch({ type: "FETCH_SUCCESS", payload: PRESENCE_API_FALLBACK });
            return;
        }

        try {
            const response = await fetch("/api/sns/insights/seek", { cache: "no-store" });
            const json: SeekResponse = await response.json().catch(() => ({}));

            if (!response.ok || !json?.ok) {
                throw new Error("presence_fetch_failed");
            }

            lsSet("/api/sns/insights/seek", json); // persist
            dispatch({ type: "FETCH_SUCCESS", payload: json });
        } catch {
            // Try localStorage fallback
            const cached = lsGet<SeekResponse>("/api/sns/insights/seek");
            if (cached) {
                setLastUpdateTime(cacheRef.current.getLastUpdateTime());
                dispatch({ type: "FETCH_SUCCESS", payload: cached });
            } else {
                dispatch({ type: "FETCH_ERROR", error: "プロフィールの取得に失敗しました" });
            }
        }
    }, [isDemo]);

    // Load on mount + fetch pulse/moment in parallel
    useEffect(() => {
        void loadProfile();
        if (!isDemo) {
            void fetchWithCache<PulseResponse>("/api/sns/presence/pulse").then((d) => d && dispatch({ type: "SET_PULSE", data: d }));
            void fetchWithCache<MomentResponse>("/api/sns/presence/moment").then((d) => d && dispatch({ type: "SET_MOMENT", data: d }));
        }
    }, [loadProfile, isDemo, fetchWithCache]);

    // Lazy tab data loader
    const loadTabData = useCallback(
        (tab: Tab) => {
            if (isDemo) return;

            if (tab === "depth" && !state.depthData) {
                void fetchWithCache<DepthResponse>("/api/sns/presence/depth").then((d) => d && dispatch({ type: "SET_DEPTH", data: d }));
            }
            if (tab === "change" && !state.metaData) {
                void fetchWithCache<MetamorphosisResponse>("/api/sns/presence/metamorphosis").then((d) => d && dispatch({ type: "SET_META", data: d }));
            }
            if ((tab === "relations" || tab === "self") && !state.relationsData) {
                void fetchWithCache<RelationsResponse>("/api/sns/presence/relations").then((d) => d && dispatch({ type: "SET_RELATIONS", data: d }));
            }
            if ((tab === "relations" || tab === "self") && !state.selfData) {
                void fetchWithCache<SelfResponse>("/api/sns/presence/self").then((d) => d && dispatch({ type: "SET_SELF", data: d }));
            }
        },
        [isDemo, state.depthData, state.metaData, state.relationsData, state.selfData, fetchWithCache]
    );

    const resolvedPayload = state.payload ?? PRESENCE_API_FALLBACK;

    const evidence = useMemo<EvidenceShape>(() => {
        const iAm = resolvedPayload.i_am ?? PRESENCE_API_FALLBACK.i_am;
        const seek = resolvedPayload.seek ?? PRESENCE_API_FALLBACK.seek;

        return {
            lanes: uniq(iAm.lanes.length ? iAm.lanes : PRESENCE_API_FALLBACK.i_am.lanes),
            likes: uniq(iAm.likes.length ? iAm.likes : PRESENCE_API_FALLBACK.i_am.likes),
            avoid: uniq(iAm.avoid.length ? iAm.avoid : PRESENCE_API_FALLBACK.i_am.avoid),
            tags: uniq(iAm.tags.length ? iAm.tags : PRESENCE_API_FALLBACK.i_am.tags),
            people: seek.seek_people ?? PRESENCE_API_FALLBACK.seek.seek_people,
            market: seek.seek_market ?? PRESENCE_API_FALLBACK.seek.seek_market,
            isPublic: seek.is_public ?? PRESENCE_API_FALLBACK.seek.is_public,
        };
    }, [resolvedPayload]);

    return {
        ...state,
        resolvedPayload,
        evidence,
        isOffline,
        lastUpdateTime,
        reload: loadProfile,
        loadTabData,
    };
}
