import type {
    CareCode,
    CategoryMain,
    DrapeCode,
    FormalityCode,
    KnitGaugeCode,
    KnitTypeCode,
    PatternCode,
    SeasonCode,
    SilhouetteCode,
    StretchCode,
    ThicknessCode,
    TransparencyCode,
    WaterCode,
} from "./taxonomy";

export const SEEK_CONTEXT_KEYS = ["romance", "friend", "cocreation", "orbiter"] as const;

export type SeekContextKey = (typeof SEEK_CONTEXT_KEYS)[number];

export type SimilarityPreference = "similar" | "slightly-different" | "very-different" | "mixed";

export type StyleLaneCode =
    | "minimal"
    | "clean"
    | "smart-casual"
    | "elegant"
    | "luxury"
    | "mode"
    | "street"
    | "vintage"
    | "americancasual"
    | "workwear"
    | "outdoor"
    | "sporty"
    | "techwear"
    | "trad"
    | "preppy"
    | "frenchcasual"
    | "westcoast"
    | "koreanclean"
    | "feminine"
    | "mannish"
    | "conservative"
    | "officecasual"
    | "natural"
    | "resort"
    | "rock"
    | "classic";

export type StyleDepthBucket = "core" | "rare" | "secret";

export type SelectedStyleLane = {
    laneCode: StyleLaneCode;
    bucket: StyleDepthBucket;
    priority: number;
    note?: string;
    createdAt: string;
};

export type UnexpectedStyleLane = {
    laneCode: StyleLaneCode;
    priority: number;
    note?: string;
    createdAt: string;
};

export type PreferenceTagGroup =
    | "silhouette"
    | "color"
    | "texture"
    | "mood"
    | "impression"
    | "composition"
    | "detail"
    | "worldview"
    | "tension"
    | "become-trigger"
    | "become-result";

export type PreferenceTag = {
    code: string;
    label: string;
    group: PreferenceTagGroup;
    description?: string;
};

export type SelectedPreferenceTag = {
    code: string;
    group: PreferenceTagGroup;
    priority: number;
    note?: string;
    createdAt: string;
};

export type WardrobeItem = {
    id: string;
    name: string;
    category: "tops" | "bottoms" | "outerwear" | "shoes" | "accessories" | "hat" | "other";
    categoryMain?: CategoryMain;
    subcategory?: string;
    color: string;
    colorName?: string;
    colorHex?: string;
    imageUrl?: string;
    season?: SeasonCode;
    thickness?: ThicknessCode;
    formality?: FormalityCode;
    materialFamily?: string[];
    surfaceFinish?: string[];
    drape?: DrapeCode;
    silhouette?: SilhouetteCode;
    pattern?: PatternCode;
    knitProfile?: {
        gauge?: KnitGaugeCode;
        type?: KnitTypeCode;
    };
    attributes?: {
        stretch?: StretchCode;
        warmth?: 1 | 2 | 3;
        water?: WaterCode;
        transparency?: TransparencyCode;
        care?: CareCode;
    };
    memo?: string;
    qualityScore?: number;
    missingBadges?: string[];
    addedAt?: string;
};

export type ColorPrefs = {
    dominant: Array<{ value: string; hex: string; count: number }>;
};

export type IAmState = {
    likedTags: SelectedPreferenceTag[];
    dislikedTags: SelectedPreferenceTag[];
    desiredImpressions: SelectedPreferenceTag[];
    naturalSelfTags: SelectedPreferenceTag[];
    memo?: string;
};

export type ISeekState = {
    attractedWorldviews: SelectedPreferenceTag[];
    attractedElements: SelectedPreferenceTag[];
    unexpectedPulls: SelectedPreferenceTag[];
    avoidedElements: SelectedPreferenceTag[];
    memo?: string;
};

export type BecomePair = {
    id: string;
    triggerTags: SelectedPreferenceTag[];
    resultTags: SelectedPreferenceTag[];
    note?: string;
    priority: number;
    createdAt: string;
};

export type IBecomeState = {
    pairs: BecomePair[];
};

export type SetupMoodCode =
    | "calm"
    | "bold"
    | "soft"
    | "clean"
    | "natural"
    | "sharp"
    | "composed"
    | "playful";

export type SetupMemory = {
    note: string;
    moodTags: SetupMoodCode[];
    createdAt: string;
};

export type SavedSetup = {
    id: string;
    title: string;
    itemIds: string[];
    moodTags: SetupMoodCode[];
    impressionTags: string[];
    memory?: SetupMemory;
    createdAt: string;
    updatedAt: string;
};

export type StyleTimelineSnapshot = {
    id: string;
    periodKey: string;
    primaryLanes: StyleLaneCode[];
    coreLanes: StyleLaneCode[];
    rareLanes: StyleLaneCode[];
    secretLanes: StyleLaneCode[];
    topColors: string[];
    topImpressions: string[];
    topUnexpectedPulls: string[];
    topBecomeResults: string[];
    dominantMoodTags: string[];
    summary: string;
    createdAt: string;
};

export type SeekContextProfile = {
    preferredLanes: StyleLaneCode[];
    preferredElements: string[];
    avoidedElements: string[];
    similarityPreference: SimilarityPreference;
    colorPalette?: Array<{ value: string; hex: string }>;
    keyItemIds?: string[];
    memo: string;
};

export type MyStyleSelfProfile = {
    primaryLanes: StyleLaneCode[];
    coreLanes: StyleLaneCode[];
    rareLanes: StyleLaneCode[];
    secretLanes: StyleLaneCode[];
    unexpectedPulls: string[];
    desiredImpressions: string[];
    attractedWorldviews: string[];
    repeatedBecomeResults: string[];
    wardrobeSignals: string[];
    outfitSignals: string[];
    timelineSignals: string[];
};

export type MyStyleProfile = {
    self: {
        primaryLanes: StyleLaneCode[];
        secondaryLanes: StyleLaneCode[];
        coreLanes: StyleLaneCode[];
        rareLanes: StyleLaneCode[];
        secretLanes: StyleLaneCode[];
        unexpectedPulls: string[];
        likedElements: string[];
        dislikedElements: string[];
        desiredImpressions: string[];
        naturalSelfTags: string[];
        attractedWorldviews: string[];
        repeatedBecomeResults: string[];
        wardrobeSignals: string[];
        outfitSignals: string[];
        timelineSignals: string[];
    };
    seek: Record<SeekContextKey, SeekContextProfile>;
    identity: {
        iam: IAmState;
        iseek: ISeekState;
        ibecome: IBecomeState;
    };
    evidence: {
        wardrobeStrength: number;
        outfitStrength: number;
        selectionStrength: number;
        memoStrength: number;
    };
    exportProfile: MyStyleSelfProfile;
};

/* ── Outfit Intelligence types ── */

export type CompatibilityScore = {
    total: number;
    colorHarmony: number;
    formalityMatch: number;
    seasonMatch: number;
    materialMatch: number;
    silhouetteBalance: number;
};

export type WearRecord = {
    count: number;
    lastWornAt: string;
    setupIds: string[];
};

export type OutfitConstraints = {
    season?: SeasonCode;
    formality?: FormalityCode;
    mood?: SetupMoodCode;
    mustIncludeIds?: string[];
    excludeIds?: string[];
};

export type SuggestedOutfit = {
    itemIds: string[];
    score: number;
    reasoning: string;
    breakdown: CompatibilityScore;
};

export type StyleSnapshot = {
    timestamp: string;
    styleSelections: SelectedStyleLane[];
    wardrobeCount: number;
    memo?: string;
};

export type WardrobeGap = {
    category: CategoryMain;
    subcategory?: string;
    description: string;
    impact: string;
    priority: number;
};

export type SavedState = {
    wardrobe: WardrobeItem[];
    setups: SavedSetup[];
    styleSelections: SelectedStyleLane[];
    unexpectedStyleLanes: UnexpectedStyleLane[];
    iam: IAmState;
    iseek: ISeekState;
    ibecome: IBecomeState;
    timelineSnapshots: StyleTimelineSnapshot[];
    colorPrefs: ColorPrefs;
    seek?: Record<SeekContextKey, SeekContextProfile>;
    stylePrefs?: Record<string, number>;
    wearHistory?: Record<string, WearRecord>;
    styleSnapshots?: StyleSnapshot[];
    memo?: string;
    // Legacy compatibility
    styles?: StyleLaneCode[];
    primaryLanes?: StyleLaneCode[];
    secondaryLanes?: StyleLaneCode[];
    exploringLanes?: StyleLaneCode[];
    iAmLanes?: StyleLaneCode[];
    favoriteElements?: string[];
    avoidElements?: string[];
    likedElements?: string[];
    dislikedElements?: string[];
    moodKeywords?: string[];
    silhouettePrefs?: string[];
    colorTones?: string[];
    materialPrefs?: string[];
    desiredImpressions?: string[];
    iAmNote?: string;
    iSeekNote?: string;
    seekPersonas?: string[];
    seekCategories?: string[];
    seekSubcategories?: string[];
};
