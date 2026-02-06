export type CFVAxis =
    | "vertical_line"
    | "shoulder_width"
    | "shoulder_slope"
    | "ribcage_width"
    | "torso_depth"
    | "pelvis_width"
    | "joint_size"
    | "bone_sharpness"
    | "leg_ratio"
    | "arm_ratio"
    | "waist_position"
    | "posture_round_shoulders"
    | "pelvic_tilt"
    | "mobility_upper";

export type CFV = Record<CFVAxis, number>;

export type BodyMeasurements = {
    stature?: number;
    neck_circ?: number;
    shoulder_breadth?: number;
    shoulder?: number;
    chest_circ?: number;
    chest?: number;
    waist_circ?: number;
    waist?: number;
    hip_circ?: number;
    hip?: number;
    back_length?: number;
    sleeve_length?: number;
    sleeve?: number;
    inseam?: number;
    rise?: number;
    thigh_circ?: number;
    thigh?: number;
    calf_circ?: number;
    calf?: number;
    armhole_depth?: number;
    torso_depth?: number;
};

export type UserBodyProfile = {
    user_id: string;
    cfv: Partial<CFV>;
    display_labels: Record<string, any>;
    confidence: Record<string, any>;
    updated_at?: string | null;
};

export type UserBodyMeasurement = {
    id: string;
    user_id: string;
    measurements: BodyMeasurements;
    measured_at: string;
};

export type IntendedFit = "slim" | "regular" | "relaxed" | "oversized";
export type FabricScale = 0 | 1 | 2;

export type GarmentFitPattern = {
    shoulder_cm?: number;
    chest_cm?: number;
    waist_cm?: number;
    hip_cm?: number;
    length_cm?: number;
    sleeve_cm?: number;
    armhole?: number;
    rise_cm?: number;
    inseam_cm?: number;
    thigh_cm?: number;
};

export type GarmentFabricProfile = {
    stretch?: FabricScale;
    rigidity?: FabricScale;
    drape?: FabricScale;
};

export type GarmentFitProfile = {
    product_id: string;
    category?: string | null;
    intended_fit?: IntendedFit | null;
    pattern: GarmentFitPattern;
    fabric: GarmentFabricProfile;
    updated_at?: string | null;
};

export type Season4 = "spring" | "summer" | "autumn" | "winter";
export type Season12 =
    | "light_spring"
    | "true_spring"
    | "bright_spring"
    | "light_summer"
    | "true_summer"
    | "soft_summer"
    | "soft_autumn"
    | "true_autumn"
    | "deep_autumn"
    | "bright_winter"
    | "true_winter"
    | "deep_winter";
export type Season16 =
    | "light_spring"
    | "warm_spring"
    | "bright_spring"
    | "light_summer"
    | "cool_summer"
    | "soft_summer"
    | "soft_autumn"
    | "warm_autumn"
    | "deep_autumn"
    | "bright_winter"
    | "cool_winter"
    | "deep_winter"
    | "clear_winter"
    | "muted_summer"
    | "muted_autumn"
    | "light_autumn";

export type LabColor = { L: number; a: number; b: number };
export type LchColor = { L: number; C: number; h: number };

export type CPV = {
    undertone?: number;
    value_L?: number;
    chroma_C?: number;
    clarity?: number;
    depth?: number;
    contrast?: number;
    skin_redness_a?: number;
    skin_yellowness_b?: number;
    temperature_stability?: number;
    confidence?: number;
};

export type UserPersonalColorProfile = {
    user_id: string;
    cpv: CPV;
    labels: { season4?: Season4; season12?: Season12; season16?: Season16 };
    palette: {
        preferred_lab_centroids?: LabColor[];
        avoid_lab_centroids?: LabColor[];
    };
    updated_at?: string | null;
};

export type GarmentColorProfile = {
    product_id: string;
    dominant_colors: {
        rgb?: string;
        lab?: LabColor;
        lch?: LchColor;
        coverage?: number;
    }[];
    updated_at?: string | null;
};

export type UserBodyAvatarProfile = {
    user_id: string;
    views?: Record<string, string>;
    person_cutout_url?: string | null;
    clothes_cutout_url?: string | null;
    mask_clothes_url?: string | null;
    turntable_gif_url?: string | null;
    mesh_glb_url?: string | null;
    updated_at?: string | null;
};
