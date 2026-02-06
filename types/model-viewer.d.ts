import type * as React from "react";

declare global {
    namespace JSX {
        interface IntrinsicElements {
            "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                src?: string;
                poster?: string;
                alt?: string;
                "auto-rotate"?: boolean | string;
                "camera-controls"?: boolean | string;
                "shadow-intensity"?: number | string;
                exposure?: number | string;
                "environment-image"?: string;
                "ar"?: boolean | string;
                "ar-modes"?: string;
                "camera-orbit"?: string;
                "min-camera-orbit"?: string;
                "max-camera-orbit"?: string;
                "field-of-view"?: string;
                "interaction-prompt"?: string;
            };
        }
    }
}

export {};
