"""Command-line entry point for the isolated TripoSR worker."""

import argparse
import json
import os
from pathlib import Path

from app.three_d.engine import TripoSRReconstructor
from app.three_d.models import ThreeDRequest
from app.three_d.service import ThreeDGenerationService


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate a 3D planning asset from one image with TripoSR."
    )
    parser.add_argument("input", type=Path, help="Trusted local JPG, PNG, or WebP image")
    parser.add_argument(
        "--asset-id", required=True, help="Stable identifier used in the output path"
    )
    parser.add_argument("--output-dir", type=Path, default=Path("output/three_d"))
    parser.add_argument("--format", choices=("obj", "glb"), default="glb")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--mesh-resolution", type=int, default=256)
    parser.add_argument("--keep-background", action="store_true")
    return parser


def main() -> None:
    """Run a single worker job and print a storage-ready artifact descriptor."""
    args = _parser().parse_args()
    repository_path = os.environ.get("TRIPOSR_REPOSITORY_PATH")
    if not repository_path:
        raise SystemExit("TRIPOSR_REPOSITORY_PATH must point to a local TripoSR checkout")

    request = ThreeDRequest(
        asset_id=args.asset_id,
        source_image=args.input,
        output_dir=args.output_dir,
        output_format=args.format,
        device=args.device,
        remove_background=not args.keep_background,
        mesh_resolution=args.mesh_resolution,
    )
    result = ThreeDGenerationService(
        TripoSRReconstructor(
            Path(repository_path),
            model_name=os.environ.get("TRIPOSR_MODEL", "stabilityai/TripoSR"),
        )
    ).generate(request)
    print(
        json.dumps(
            {
                "asset_id": result.asset_id,
                "mesh_path": str(result.mesh_path),
                "format": result.output_format,
                "device": result.device,
                "elapsed_seconds": round(result.elapsed_seconds, 3),
            }
        )
    )


if __name__ == "__main__":
    main()
