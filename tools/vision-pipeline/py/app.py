import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import remove


def save_png_rgba(arr_rgba: np.ndarray, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr_rgba).save(out_path)


def pil_to_rgba_np(img: Image.Image) -> np.ndarray:
    return np.array(img.convert("RGBA"))


def rgba_np_to_bgr(arr_rgba: np.ndarray) -> np.ndarray:
    # OpenCV uses BGR, drop alpha
    return cv2.cvtColor(arr_rgba[:, :, :3], cv2.COLOR_RGB2BGR)


def alpha_mask(arr_rgba: np.ndarray) -> np.ndarray:
    # 0..255 uint8
    return arr_rgba[:, :, 3]


def clean_mask(mask: np.ndarray) -> np.ndarray:
    # Morphological cleaning
    k = max(3, int(min(mask.shape[:2]) * 0.01) | 1)  # odd kernel
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    m = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
    # Slight blur edge
    m = cv2.GaussianBlur(m, (k | 1, k | 1), 0)
    return m


def largest_component(mask: np.ndarray) -> np.ndarray:
    # Keep largest connected component
    _, thr = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
    num, labels, stats, _ = cv2.connectedComponentsWithStats(thr, connectivity=8)
    if num <= 1:
        return mask
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    out = np.where(labels == largest, 255, 0).astype(np.uint8)
    return out


def extract_clothes(person_rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Heuristic clothes extraction:
    - Start from person alpha
    - Remove head region by using upper-body geometry heuristics
    - Remove hands by skin-color suppression (optional mild)
    This is a practical baseline; later replace with SAM2 clothing mask.
    """
    h, w = person_rgba.shape[:2]
    person_alpha = alpha_mask(person_rgba)
    person_mask = clean_mask(person_alpha)
    person_mask = largest_component(person_mask)

    # Bounding box of person mask
    ys, xs = np.where(person_mask > 10)
    if len(xs) == 0:
        return np.zeros((h, w), np.uint8), np.zeros((h, w, 4), np.uint8)
    x1, x2 = xs.min(), xs.max()
    y1, y2 = ys.min(), ys.max()

    # Heuristic: remove top "head" slice (e.g., top 18% of person bbox)
    head_cut = int((y2 - y1) * 0.18)
    clothes_mask = person_mask.copy()
    clothes_mask[y1: y1 + head_cut, :] = 0

    # Heuristic: keep central torso/legs more strongly, suppress far sides (arms)
    # Use a soft center ellipse
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    rx = (x2 - x1) * 0.42
    ry = (y2 - y1) * 0.55

    yy, xx = np.mgrid[0:h, 0:w]
    ellipse = (((xx - cx) / (rx + 1e-6)) ** 2 + ((yy - cy) / (ry + 1e-6)) ** 2) <= 1.0
    ellipse = ellipse.astype(np.uint8) * 255

    # Combine: prioritize ellipse region but still allow skirt/flare etc.
    # Keep pixels where either inside ellipse or in lower half of bbox
    lower_half = np.zeros((h, w), np.uint8)
    lower_half[int(y1 + (y2 - y1) * 0.35): y2 + 1, x1: x2 + 1] = 255

    combined = cv2.bitwise_and(clothes_mask, cv2.bitwise_or(ellipse, lower_half))
    combined = clean_mask(combined)
    combined = largest_component(combined)

    # Build RGBA clothes
    clothes_rgba = person_rgba.copy()
    clothes_rgba[:, :, 3] = np.clip(combined, 0, 255).astype(np.uint8)

    # Optional: tighten edges
    clothes_rgba[:, :, 3] = clean_mask(clothes_rgba[:, :, 3])

    return clothes_rgba[:, :, 3], clothes_rgba


def make_turntable_gif(clothes_rgba: np.ndarray, out_gif: Path, frames=18):
    """
    Cheap 'pseudo-3D': perspective warp + slight shading shift.
    This is not true 3D, but sells rotation for catalog UI.
    """
    out_gif.parent.mkdir(parents=True, exist_ok=True)
    imgs = []
    h, w = clothes_rgba.shape[:2]

    rgba = clothes_rgba.copy()
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3].astype(np.float32)

    for i in range(frames):
        t = (i / (frames - 1)) * 2 - 1  # -1..1
        # Horizontal "yaw" warp
        yaw = 0.18 * t
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = np.float32([
            [w * yaw, 0],
            [w - w * yaw, 0],
            [w - w * (-yaw), h],
            [w * (-yaw), h],
        ])
        mtx = cv2.getPerspectiveTransform(src, dst)
        warped_rgb = cv2.warpPerspective(
            rgb,
            mtx,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )
        warped_a = cv2.warpPerspective(
            alpha,
            mtx,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0,
        )

        # Slight lighting shift
        shade = 1.0 - 0.12 * t
        warped_rgb = np.clip(warped_rgb * shade, 0, 255).astype(np.uint8)
        warped_rgba = np.dstack([warped_rgb, warped_a.astype(np.uint8)])

        imgs.append(Image.fromarray(warped_rgba, mode="RGBA"))

    imgs[0].save(out_gif, save_all=True, append_images=imgs[1:], duration=60, loop=0, disposal=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="input full-body photo path")
    ap.add_argument("--outdir", required=True, help="output dir")
    args = ap.parse_args()

    inp = Path(args.inp)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # Load input
    img = Image.open(inp).convert("RGBA")

    # 1) Background removal (person cutout)
    person_rgba = pil_to_rgba_np(remove(img))  # returns RGBA
    save_png_rgba(person_rgba, outdir / "person_rgba.png")

    # 2) Clothes extraction baseline
    mask, clothes_rgba = extract_clothes(person_rgba)
    Image.fromarray(mask).save(outdir / "mask_clothes.png")
    save_png_rgba(clothes_rgba, outdir / "clothes_rgba.png")

    # 3) Pseudo 3D preview
    make_turntable_gif(clothes_rgba, outdir / "preview_turntable.gif")

    print("DONE:", outdir)


if __name__ == "__main__":
    main()
