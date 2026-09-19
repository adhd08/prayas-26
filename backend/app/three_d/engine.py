"""Lazy TripoSR adapter used only by the dedicated GPU worker."""

from __future__ import annotations

import importlib
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.three_d.errors import TripoSRUnavailableError
from app.three_d.models import GenerationResult, ThreeDRequest


@dataclass(frozen=True, slots=True)
class _TripoSRRuntime:
    """Imports supplied by the separately installed TripoSR environment."""

    image: Any
    numpy: Any
    rembg: Any
    torch: Any
    tsr: Any
    remove_background: Any
    resize_foreground: Any


class TripoSRReconstructor:
    """Create an OBJ or GLB mesh with the official local TripoSR checkout.

    Imports are delayed until work starts. This makes the planning API and its
    tests independent from CUDA, PyTorch, and the upstream model repository.
    """

    def __init__(self, repository_path: Path, model_name: str = "stabilityai/TripoSR") -> None:
        self._repository_path = repository_path
        self._model_name = model_name
        self._runtime: _TripoSRRuntime | None = None
        self._model: Any | None = None
        self._model_device: str | None = None

    def reconstruct(self, request: ThreeDRequest) -> GenerationResult:
        """Run the official preprocessing, inference, marching cubes, and export steps."""
        request.validate()
        runtime = self._load_runtime()
        device = self._select_device(runtime.torch, request.device)
        model = self._load_model(runtime, device, request.chunk_size)
        image = self._prepare_image(runtime, request)

        started_at = time.monotonic()
        with runtime.torch.no_grad():
            scene_codes = model([image], device=device)
        meshes = model.extract_mesh(scene_codes, True, resolution=request.mesh_resolution)

        request.asset_directory.mkdir(parents=True, exist_ok=True)
        meshes[0].export(request.mesh_path)
        return GenerationResult(
            asset_id=request.asset_id,
            mesh_path=request.mesh_path,
            output_format=request.output_format,
            device=device,
            elapsed_seconds=time.monotonic() - started_at,
        )

    def _load_runtime(self) -> _TripoSRRuntime:
        if self._runtime is not None:
            return self._runtime
        package_root = self._repository_path / "tsr"
        if not (package_root / "system.py").is_file():
            raise TripoSRUnavailableError(
                "TripoSR was not found. Clone VAST-AI-Research/TripoSR and set "
                "TRIPOSR_REPOSITORY_PATH to that checkout."
            )

        repository = str(self._repository_path.resolve())
        if repository not in sys.path:
            sys.path.insert(0, repository)
        try:
            numpy = importlib.import_module("numpy")
            rembg = importlib.import_module("rembg")
            torch = importlib.import_module("torch")
            image = importlib.import_module("PIL.Image")
            tsr = importlib.import_module("tsr.system").TSR
            utils = importlib.import_module("tsr.utils")
        except ImportError as error:
            raise TripoSRUnavailableError(
                "The TripoSR environment is incomplete. Install the official TripoSR "
                "requirements in the dedicated GPU worker environment."
            ) from error

        self._runtime = _TripoSRRuntime(
            image=image,
            numpy=numpy,
            rembg=rembg,
            torch=torch,
            tsr=tsr,
            remove_background=utils.remove_background,
            resize_foreground=utils.resize_foreground,
        )
        return self._runtime

    def _load_model(self, runtime: _TripoSRRuntime, device: str, chunk_size: int) -> Any:
        if self._model is None or self._model_device != device:
            model = runtime.tsr.from_pretrained(
                self._model_name,
                config_name="config.yaml",
                weight_name="model.ckpt",
            )
            self._model = model.to(device)
            self._model_device = device
        self._model.renderer.set_chunk_size(chunk_size)
        return self._model

    @staticmethod
    def _select_device(torch: Any, requested_device: str) -> str:
        if requested_device.startswith("cuda") and not torch.cuda.is_available():
            return "cpu"
        return requested_device

    @staticmethod
    def _prepare_image(runtime: _TripoSRRuntime, request: ThreeDRequest) -> Any:
        source = runtime.image.open(request.source_image)
        if request.remove_background:
            image = runtime.remove_background(source, runtime.rembg.new_session())
            image = runtime.resize_foreground(image, request.foreground_ratio)
        else:
            image = source.convert("RGB")

        pixels = runtime.numpy.array(image).astype(runtime.numpy.float32) / 255.0
        if pixels.shape[-1] == 4:
            pixels = pixels[:, :, :3] * pixels[:, :, 3:4] + (1 - pixels[:, :, 3:4]) * 0.5
        return runtime.image.fromarray((pixels * 255.0).astype(runtime.numpy.uint8))
