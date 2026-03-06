"use client";

import {
    Component,
    ReactNode,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import { usePathname, useRouter } from "next/navigation";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

type ItemKey = "top" | "pants";
type TopModelKey = "longtee" | "shorttee";
type ViewMode = "gltf" | "svg" | "spin";
type SpinSource = "mp4" | "gif" | "poster";
type ProbeCode = number | "ERR" | "NA";
type ViewerClientProps = {
    initialModel?: TopModelKey;
};

type DimensionSpec = {
    id: string;
    label: string;
    from: string;
    to: string;
};

type AnchorMap = Record<string, [number, number, number]>;

type OverlayLine = {
    id: string;
    label: string;
    from: [number, number];
    to: [number, number];
    visible: boolean;
};

type ProbeResult = {
    ok: boolean;
    code: ProbeCode;
};

type AssetCheck = {
    glb: ProbeCode;
    svg: ProbeCode;
    mp4: ProbeCode;
    gif: ProbeCode;
    anchors: ProbeCode;
};

const ASSETS: Record<
    ItemKey,
    {
        label: string;
        glb?: string;
        svg?: string;
        spinMp4?: string;
        spinGif?: string;
        poster?: string;
        anchors?: string;
    }
> = {
    top: {
        label: "トップス",
        svg: "/patterns/tshirt_pattern.svg",
        spinMp4: "/spin/tshirt_short_sleeve_spin.mp4",
        spinGif: "/spin/tshirt_short_sleeve_spin.gif",
        poster: "/views/tshirt_short_sleeve_front.png",
    },
    pants: {
        label: "ズボン",
        glb: "/3d/pants_sample.glb",
        svg: "/patterns/pants_pattern.svg",
        spinMp4: "/spin/pants_spin.mp4",
        spinGif: "/spin/pants_spin.gif",
        poster: "/views/pants_front.png",
        anchors: "/anchors/anchors_pants_v2.json",
    },
};

const TOP_MODELS: Record<
    TopModelKey,
    {
        label: string;
        glb: string;
        anchors: string;
        spinMp4?: string;
        spinGif?: string;
        poster?: string;
    }
> = {
    longtee: {
        label: "長袖",
        glb: "/3d/tshirt_long_sleeve_template_v2.glb",
        anchors: "/anchors/anchors_tshirt_long_sleeve_v2.json",
        poster: "/cards/samples/longtee_white/views/front.png",
    },
    shorttee: {
        label: "半袖",
        glb: "/3d/tshirt_short_sleeve_sample.glb",
        anchors: "/anchors/anchors_tshirt_short_sleeve_v2.json",
        spinMp4: "/spin/tshirt_short_sleeve_spin.mp4",
        spinGif: "/spin/tshirt_short_sleeve_spin.gif",
        poster: "/views/tshirt_short_sleeve_front.png",
    },
};

const normalizeTopModel = (model: string | undefined): TopModelKey => {
    return model === "shorttee" ? "shorttee" : "longtee";
};

const DIMENSIONS: Record<ItemKey, DimensionSpec[]> = {
    top: [
        { id: "length", label: "着丈", from: "length_top", to: "length_bottom" },
        { id: "body", label: "身幅", from: "body_left", to: "body_right" },
        { id: "shoulder", label: "肩幅", from: "shoulder_left", to: "shoulder_right" },
        { id: "sleeve", label: "袖丈", from: "sleeve_inner", to: "sleeve_cuff" },
    ],
    pants: [
        { id: "outseam", label: "総丈", from: "total_top", to: "total_bottom" },
        { id: "inseam", label: "股下", from: "inseam_top", to: "inseam_bottom" },
        { id: "waist", label: "ウエスト", from: "waist_left", to: "waist_right" },
        { id: "hip", label: "ヒップ", from: "hip_left", to: "hip_right" },
    ],
};

const FALLBACK_OVERLAY: Record<ItemKey, OverlayLine[]> = {
    top: [
        { id: "length", label: "着丈", from: [0.4995, 0.2145], to: [0.4995, 0.8543], visible: true },
        { id: "body", label: "身幅", from: [0.346, 0.5426], to: [0.653, 0.5426], visible: true },
        { id: "shoulder", label: "肩幅", from: [0.3716, 0.3867], to: [0.6274, 0.3867], visible: true },
        { id: "sleeve", label: "袖丈", from: [0.6402, 0.4277], to: [0.7554, 0.3785], visible: true },
    ],
    pants: [
        { id: "outseam", label: "総丈", from: [0.6226, 0.1651], to: [0.589, 0.8706], visible: true },
        { id: "inseam", label: "股下", from: [0.4995, 0.6125], to: [0.4995, 0.8706], visible: true },
        { id: "waist", label: "ウエスト", from: [0.3876, 0.2168], to: [0.6114, 0.2168], visible: true },
        { id: "hip", label: "ヒップ", from: [0.3652, 0.32], to: [0.6338, 0.32], visible: true },
    ],
};

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
    gltf: "GLB",
    svg: "SVG",
    spin: "SPIN",
};

class ViewerErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { hasError: boolean }> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch() {
        this.props.onError();
    }

    render() {
        if (this.state.hasError) return null;
        return this.props.children;
    }
}

const probeAsset = async (url?: string): Promise<ProbeResult> => {
    if (!url) return { ok: false, code: "NA" };
    try {
        const head = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (head.ok || head.status === 404) return { ok: head.ok, code: head.status };
        const get = await fetch(url, { method: "GET", cache: "no-store" });
        return { ok: get.ok, code: get.status };
    } catch {
        return { ok: false, code: "ERR" };
    }
};

const AnchorProjector = ({
    model,
    anchors,
    dimensions,
    onProjected,
}: {
    model: THREE.Object3D | null;
    anchors: AnchorMap;
    dimensions: DimensionSpec[];
    onProjected: (lines: OverlayLine[]) => void;
}) => {
    const v1Ref = useRef(new THREE.Vector3());
    const v2Ref = useRef(new THREE.Vector3());

    useFrame(({ camera }) => {
        if (!model) return;
        model.updateWorldMatrix(true, true);
        const v1 = v1Ref.current;
        const v2 = v2Ref.current;

        const lines = dimensions.map((dimension) => {
            const from = anchors[dimension.from];
            const to = anchors[dimension.to];
            if (!from || !to) {
                return {
                    id: dimension.id,
                    label: dimension.label,
                    from: [0, 0] as [number, number],
                    to: [0, 0] as [number, number],
                    visible: false,
                };
            }

            v1.set(from[0], from[1], from[2]);
            v2.set(to[0], to[1], to[2]);
            model.localToWorld(v1);
            model.localToWorld(v2);
            v1.project(camera);
            v2.project(camera);

            const visible =
                Number.isFinite(v1.x) &&
                Number.isFinite(v1.y) &&
                Number.isFinite(v1.z) &&
                Number.isFinite(v2.x) &&
                Number.isFinite(v2.y) &&
                Number.isFinite(v2.z) &&
                v1.z >= -1 &&
                v1.z <= 1 &&
                v2.z >= -1 &&
                v2.z <= 1;

            return {
                id: dimension.id,
                label: dimension.label,
                from: [(v1.x + 1) / 2, (1 - v1.y) / 2] as [number, number],
                to: [(v2.x + 1) / 2, (1 - v2.y) / 2] as [number, number],
                visible,
            };
        });

        onProjected(lines);
    });

    return null;
};

const GltfModel = ({
    url,
    onSceneReady,
}: {
    url: string;
    onSceneReady: (scene: THREE.Object3D) => void;
}) => {
    const { scene } = useGLTF(url);
    useEffect(() => {
        onSceneReady(scene);
    }, [onSceneReady, scene]);
    return <primitive object={scene} />;
};

const SvgModel = ({ url }: { url: string }) => {
    const data = useLoader(SVGLoader, url);
    const shapes = useMemo(() => {
        const collected: THREE.Shape[] = [];
        data.paths.forEach((path) => {
            path.toShapes(true).forEach((shape) => collected.push(shape));
        });
        return collected;
    }, [data]);

    const geometries = useMemo(() => {
        return shapes.map(
            (shape) =>
                new THREE.ExtrudeGeometry(shape, {
                    depth: 6,
                    bevelEnabled: false,
                }),
        );
    }, [shapes]);

    useEffect(() => {
        return () => {
            geometries.forEach((geometry) => geometry.dispose());
        };
    }, [geometries]);

    return (
        <group scale={[0.01, -0.01, 0.01]}>
            {geometries.map((geometry, index) => (
                <mesh key={index} geometry={geometry}>
                    <meshStandardMaterial color="#dbe7f6" roughness={0.62} metalness={0.08} />
                </mesh>
            ))}
        </group>
    );
};

const ModelStage = ({
    mode,
    glbUrl,
    svgUrl,
    anchors,
    dimensions,
    onProjected,
}: {
    mode: ViewMode;
    glbUrl?: string;
    svgUrl?: string;
    anchors: AnchorMap;
    dimensions: DimensionSpec[];
    onProjected: (lines: OverlayLine[]) => void;
}) => {
    const [model, setModel] = useState<THREE.Object3D | null>(null);
    const handleSceneReady = useCallback((scene: THREE.Object3D) => {
        setModel(scene);
    }, []);

    useEffect(() => {
        if (mode !== "gltf") {
            onProjected([]);
        }
    }, [mode, onProjected]);

    return (
        <Canvas className="absolute inset-0" dpr={[1, 2]} camera={{ position: [0, 0.3, 2.5], fov: 40 }}>
            <color attach="background" args={["#080d17"]} />
            <ambientLight intensity={0.75} />
            <directionalLight position={[4, 4, 6]} intensity={0.9} />
            <directionalLight position={[-4, -3, 6]} intensity={0.4} color="#94a3b8" />

            <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.2}>
                    {mode === "gltf" && glbUrl ? <GltfModel url={glbUrl} onSceneReady={handleSceneReady} /> : null}
                    {mode === "svg" && svgUrl ? <SvgModel url={svgUrl} /> : null}
                </Bounds>
                {mode === "gltf" ? (
                    <AnchorProjector
                        model={model}
                        anchors={anchors}
                        dimensions={dimensions}
                        onProjected={onProjected}
                    />
                ) : null}
            </Suspense>

            <OrbitControls
                enablePan={false}
                enableDamping
                dampingFactor={0.08}
                minDistance={1.3}
                maxDistance={4.5}
                minPolarAngle={Math.PI / 2}
                maxPolarAngle={Math.PI / 2}
            />
        </Canvas>
    );
};

const DimensionOverlay = ({ lines, visible }: { lines: OverlayLine[]; visible: boolean }) => {
    return (
        <svg
            className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"
                }`}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            <defs>
                <marker
                    id="dimArrow"
                    viewBox="0 0 8 8"
                    refX="4"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M0,0 L8,4 L0,8 z" fill="#22d3ee" />
                </marker>
            </defs>

            {lines.map((line) => {
                if (!line.visible) return null;
                const [x1, y1] = line.from;
                const [x2, y2] = line.to;
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const offset = 0.034;

                return (
                    <g key={line.id}>
                        <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#22d3ee"
                            strokeWidth={0.006}
                            markerStart="url(#dimArrow)"
                            markerEnd="url(#dimArrow)"
                        />
                        <circle cx={x1} cy={y1} r={0.009} fill="#a5f3fc" />
                        <circle cx={x2} cy={y2} r={0.009} fill="#a5f3fc" />
                        <text
                            x={midX + nx * offset}
                            y={midY + ny * offset}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={0.035}
                            fill="#f8fafc"
                            stroke="#020617"
                            strokeWidth={0.01}
                            paintOrder="stroke"
                        >
                            {line.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

const SpinViewer = ({
    mp4,
    gif,
    poster,
    alt,
    preferred,
}: {
    mp4?: string;
    gif?: string;
    poster?: string;
    alt: string;
    preferred: SpinSource;
}) => {
    const [fallbackImage, setFallbackImage] = useState(preferred !== "mp4");

    useEffect(() => {
        setFallbackImage(preferred !== "mp4");
    }, [preferred]);

    const fallbackSrc = gif ?? poster ?? mp4;

    if (preferred !== "mp4" || fallbackImage) {
        if (!fallbackSrc) {
            return <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">素材なし</div>;
        }
        return <img src={fallbackSrc} alt={alt} className="absolute inset-0 h-full w-full object-contain" />;
    }

    return (
        <video
            className="absolute inset-0 h-full w-full object-contain"
            src={mp4}
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            onError={() => setFallbackImage(true)}
        />
    );
};

useGLTF.preload(TOP_MODELS.longtee.glb);
useGLTF.preload(TOP_MODELS.shorttee.glb);
if (ASSETS.pants.glb) useGLTF.preload(ASSETS.pants.glb);

export default function ViewerClient({ initialModel = "longtee" }: ViewerClientProps) {
    const router = useRouter();
    const pathname = usePathname();

    const [item, setItem] = useState<ItemKey>("top");
    const [selectedTopModel, setSelectedTopModel] = useState<TopModelKey>(normalizeTopModel(initialModel));
    const [overlay, setOverlay] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>("spin");
    const [spinSource, setSpinSource] = useState<SpinSource>("mp4");
    const [checks, setChecks] = useState<AssetCheck>({
        glb: "NA",
        svg: "NA",
        mp4: "NA",
        gif: "NA",
        anchors: "NA",
    });
    const [checking, setChecking] = useState(true);
    const [anchors, setAnchors] = useState<AnchorMap>({});
    const [projectedLines, setProjectedLines] = useState<OverlayLine[]>([]);

    useEffect(() => {
        setSelectedTopModel(normalizeTopModel(initialModel));
    }, [initialModel]);

    const handleTopModelChange = useCallback(
        (nextModel: TopModelKey) => {
            setSelectedTopModel(nextModel);
            const params = new URLSearchParams(window.location.search);
            params.set("model", nextModel);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router],
    );

    const asset = useMemo(() => {
        if (item === "top") {
            const topModel = TOP_MODELS[selectedTopModel];
            return {
                ...ASSETS.top,
                label: `トップス（${topModel.label}）`,
                glb: topModel.glb,
                anchors: topModel.anchors,
                spinMp4: topModel.spinMp4 ?? ASSETS.top.spinMp4,
                spinGif: topModel.spinGif ?? ASSETS.top.spinGif,
                poster: topModel.poster ?? ASSETS.top.poster,
            };
        }
        return ASSETS.pants;
    }, [item, selectedTopModel]);

    const dimensions = DIMENSIONS[item];

    useEffect(() => {
        let cancelled = false;

        const resolveMode = async () => {
            setChecking(true);
            setProjectedLines([]);

            const [glb, svg, mp4, gif, anchorCheck] = await Promise.all([
                probeAsset(asset.glb),
                probeAsset(asset.svg),
                probeAsset(asset.spinMp4),
                probeAsset(asset.spinGif),
                probeAsset(asset.anchors),
            ]);
            if (cancelled) return;

            setChecks({
                glb: glb.code,
                svg: svg.code,
                mp4: mp4.code,
                gif: gif.code,
                anchors: anchorCheck.code,
            });

            setViewMode(glb.ok ? "gltf" : svg.ok ? "svg" : "spin");
            setSpinSource(mp4.ok ? "mp4" : gif.ok ? "gif" : "poster");

            if (anchorCheck.ok && asset.anchors) {
                try {
                    const res = await fetch(asset.anchors, { cache: "no-store" });
                    const json = (await res.json()) as { anchors?: AnchorMap };
                    if (!cancelled) {
                        setAnchors(json.anchors ?? {});
                    }
                } catch {
                    if (!cancelled) setAnchors({});
                }
            } else {
                setAnchors({});
            }

            if (!cancelled) setChecking(false);
        };

        resolveMode();
        return () => {
            cancelled = true;
        };
    }, [asset]);

    const lines = viewMode === "gltf" ? projectedLines : FALLBACK_OVERLAY[item];
    const glbStatusText = checks.glb === "NA" ? "NA" : checks.glb === "ERR" ? "ERR" : String(checks.glb);
    const statusText = checking
        ? "CHECKING"
        : viewMode === "gltf"
            ? "USING_GLB"
            : viewMode === "svg"
                ? "FALLBACK_SVG"
                : spinSource === "mp4"
                    ? "FALLBACK_SPIN_MP4"
                    : spinSource === "gif"
                        ? "FALLBACK_SPIN_GIF"
                        : "FALLBACK_POSTER";

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_42%),_radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),_transparent_40%),_#020617] text-slate-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-xl font-semibold text-slate-50">3D表示 + 寸法オーバーレイ</h1>
                    <button
                        type="button"
                        onClick={() => setOverlay((prev) => !prev)}
                        className={`rounded-full border px-4 py-2 text-xs font-semibold ${overlay
                                ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100"
                                : "border-slate-700 bg-slate-900/70 text-slate-300"
                            }`}
                    >
                        寸法 {overlay ? "ON" : "OFF"}
                    </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 p-1">
                        {(["top", "pants"] as ItemKey[]).map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setItem(key)}
                                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${item === key ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800/60"
                                    }`}
                            >
                                {ASSETS[key].label}
                            </button>
                        ))}
                    </div>
                    <div className="text-xs text-slate-400">左右ドラッグ回転 / ホイールズーム</div>
                </div>

                {item === "top" ? (
                    <div className="flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 p-1 w-fit">
                        {(["longtee", "shorttee"] as TopModelKey[]).map((modelKey) => (
                            <button
                                key={modelKey}
                                type="button"
                                onClick={() => handleTopModelChange(modelKey)}
                                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${selectedTopModel === modelKey
                                        ? "bg-cyan-200 text-slate-900"
                                        : "text-slate-300 hover:bg-slate-800/60"
                                    }`}
                            >
                                {TOP_MODELS[modelKey].label}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="relative overflow-hidden rounded-[26px] border border-slate-800/70 bg-slate-950/70">
                    <div className="absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-md border border-slate-700/70 bg-slate-950/85 px-3 py-2 text-[11px] text-slate-200">
                        <div>SELECTED MODEL: {selectedTopModel}</div>
                        <div>MODE: {VIEW_MODE_LABEL[viewMode]}</div>
                        <div>STATUS: {statusText}</div>
                        <div>GLB URL: {asset.glb ?? "N/A"}</div>
                        <div>GLB STATUS: {glbStatusText}</div>
                    </div>

                    <div className="relative aspect-[4/3] w-full">
                        {viewMode === "spin" ? (
                            <SpinViewer
                                mp4={asset.spinMp4}
                                gif={asset.spinGif}
                                poster={asset.poster}
                                alt={`${asset.label} spin`}
                                preferred={spinSource}
                            />
                        ) : (
                            <ViewerErrorBoundary key={`${item}-${viewMode}`} onError={() => setViewMode("spin")}>
                                <ModelStage
                                    mode={viewMode}
                                    glbUrl={asset.glb}
                                    svgUrl={asset.svg}
                                    anchors={anchors}
                                    dimensions={dimensions}
                                    onProjected={setProjectedLines}
                                />
                            </ViewerErrorBoundary>
                        )}

                        <DimensionOverlay lines={lines} visible={overlay} />

                        {checking ? (
                            <div className="absolute inset-0 z-30 grid place-items-center text-sm text-slate-200 backdrop-blur-[1px]">
                                アセット確認中...
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
