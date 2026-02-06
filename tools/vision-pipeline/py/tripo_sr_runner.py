import argparse
import os
import shlex
import subprocess
from pathlib import Path


def run_external(cmd: str, inp: Path, out: Path):
    if "{input}" in cmd or "{output}" in cmd:
        cmd = cmd.format(input=str(inp), output=str(out))
        args = shlex.split(cmd)
    else:
        args = shlex.split(cmd) + [str(inp), str(out)]

    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(
            "TripoSR CLI failed: "
            + (result.stderr.strip() or result.stdout.strip() or "unknown error")
        )
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True, help="input clothes_rgba.png path")
    ap.add_argument("--out", dest="out", required=True, help="output mesh.glb path")
    args = ap.parse_args()

    inp = Path(args.inp)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    if not inp.exists():
        raise SystemExit(f"Input not found: {inp}")

    cmd = os.getenv("TRIPOSR_CMD", "").strip()
    if cmd:
        run_external(cmd, inp, out)
        print("DONE:", out)
        return

    try:
        import tripo_sr  # type: ignore
    except Exception as exc:
        raise SystemExit(
            "TripoSR is not installed. Set TRIPOSR_CMD or install tripo_sr. "
            f"import error: {exc}"
        )

    # NOTE: TripoSR API may differ by version.
    if hasattr(tripo_sr, "infer"):
        tripo_sr.infer(str(inp), str(out))
    else:
        raise SystemExit("TripoSR API not found. Please wire your local TripoSR entrypoint.")

    print("DONE:", out)


if __name__ == "__main__":
    main()
