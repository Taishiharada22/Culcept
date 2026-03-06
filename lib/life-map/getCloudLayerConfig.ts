// lib/life-map/getCloudLayerConfig.ts
// Static cloud layer presets used by CloudLayer for subtle parallax animation.

export type CloudLayerConfig = {
  id: string;
  src: string;
  width: number;
  height: number;
  baseX: number;
  baseY: number;
  opacity: number;
  driftSpeed: number;
  driftRadius: number;
  panFactorX: number;
  panFactorY: number;
};

const CLOUD_LAYERS: CloudLayerConfig[] = [
  {
    id: "cloud-01",
    src: "/life-map/clouds/cloud-layer-01.webp",
    width: 980,
    height: 540,
    baseX: -120,
    baseY: -80,
    opacity: 0.26,
    driftSpeed: 0.045,
    driftRadius: 16,
    panFactorX: 0.12,
    panFactorY: 0.08,
  },
  {
    id: "cloud-02",
    src: "/life-map/clouds/cloud-layer-02.webp",
    width: 1260,
    height: 680,
    baseX: 260,
    baseY: 40,
    opacity: 0.2,
    driftSpeed: 0.035,
    driftRadius: 22,
    panFactorX: 0.08,
    panFactorY: 0.06,
  },
  {
    id: "cloud-03",
    src: "/life-map/clouds/cloud-layer-03.webp",
    width: 1120,
    height: 620,
    baseX: 660,
    baseY: 360,
    opacity: 0.18,
    driftSpeed: 0.028,
    driftRadius: 28,
    panFactorX: 0.05,
    panFactorY: 0.04,
  },
];

export function getCloudLayerConfig(): CloudLayerConfig[] {
  return CLOUD_LAYERS;
}
