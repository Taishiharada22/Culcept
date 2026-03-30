import type { UserBodyAvatarProfile } from "@/types/body-color";
import type { FacePhenotypeData } from "@/types/face-phenotype";

export type ViewId = "dashboard" | "face" | "body" | "color";
export type AvatarTab = "sns" | "face" | "hair" | "body" | "color" | "color_fusion" | "advanced" | "evolution";
export type AvatarFaceSubTab = "eye" | "face" | "brow" | "nose" | "mouth";
export type AvatarProfileRecord = UserBodyAvatarProfile & Record<string, any>;
export type EyeProfileRecord = {
    eye_type?: string | null;
    eye_color?: string | null;
    updated_at?: string | null;
} | null;
export type FacePhenotypeRecord = {
    phenotype?: FacePhenotypeData | null;
    completed_categories?: string[] | null;
    updated_at?: string | null;
} | null;
export type UndertoneChoice = "warm" | "cool" | "neutral";
export type SeasonChoice = "spring" | "summer" | "autumn" | "winter";
export type ColorPaletteInputs = {
    selectedHex: string;
    hairHex: string;
    irisHex: string;
};
export type ColorSwatch = {
    name: string;
    hex: string;
};
export type ColorSubtypeOption = {
    id: string;
    season12Id: string;
    label: string;
    nameJa: string;
    subtitle: string;
    description: string;
    keywords: string[];
    avoid: string[];
    swatches: ColorSwatch[];
};
export type FusedColorSource = {
    name: string;
    season: SeasonChoice;
    confidence: number;
    undertone: UndertoneChoice;
    detail: string;
};
export type FusedColorResult = {
    season: SeasonChoice;
    season16: string | null;
    undertone: UndertoneChoice;
    confidence: number;
    summary: string;
    recommendedColors: string[];
    avoidColors: string[];
    sources: FusedColorSource[];
    axes: {
        undertone: number;
        value_L: number;
        chroma_C: number;
        contrast: number;
    };
};
export type FusionHistoryEntry = {
    id: string;
    recordedAt: string;
    imageUrl: string | null;
    result: FusedColorResult;
};
