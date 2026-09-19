"""Typed input and output contracts for image-to-3D workers."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.three_d.errors import InvalidThreeDRequestError

MeshFormat = Literal["obj", "glb"]

_SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
_SUPPORTED_MESH_FORMATS = {"obj", "glb"}


@dataclass(frozen=True, slots=True)
class ThreeDRequest:
    """A single trusted image staged by a worker for 3D reconstruction.

    ``source_image`` is a worker-local file, not a browser-provided path. A
    future job worker should download a verified private-storage object to a
    temporary directory before constructing this request.
    """

    asset_id: str
    source_image: Path
    output_dir: Path
    output_format: MeshFormat = "glb"
    device: str = "cuda:0"
    remove_background: bool = True
    foreground_ratio: float = 0.85
    mesh_resolution: int = 256
    chunk_size: int = 8192

    def validate(self) -> None:
        """Reject unsupported images and unsafe or impractical settings."""
        if not self.asset_id or not self.asset_id.replace("-", "").replace("_", "").isalnum():
            raise InvalidThreeDRequestError(
                "asset_id must contain only letters, numbers, hyphens, and underscores"
            )
        if not self.source_image.is_file():
            raise InvalidThreeDRequestError(f"Input image does not exist: {self.source_image}")
        if self.source_image.suffix.lower() not in _SUPPORTED_IMAGE_SUFFIXES:
            extensions = ", ".join(sorted(_SUPPORTED_IMAGE_SUFFIXES))
            raise InvalidThreeDRequestError(f"Input image must be one of: {extensions}")
        if self.output_format not in _SUPPORTED_MESH_FORMATS:
            raise InvalidThreeDRequestError("output_format must be 'obj' or 'glb'")
        if not 0 < self.foreground_ratio <= 1:
            raise InvalidThreeDRequestError("foreground_ratio must be greater than 0 and at most 1")
        if not 16 <= self.mesh_resolution <= 512:
            raise InvalidThreeDRequestError("mesh_resolution must be between 16 and 512")
        if self.chunk_size < 0:
            raise InvalidThreeDRequestError("chunk_size cannot be negative")

    @property
    def asset_directory(self) -> Path:
        """Directory reserved for this asset's mesh and optional previews."""
        return self.output_dir / self.asset_id

    @property
    def mesh_path(self) -> Path:
        """Stable mesh path, suitable for uploading to private object storage."""
        return self.asset_directory / f"mesh.{self.output_format}"


@dataclass(frozen=True, slots=True)
class GenerationResult:
    """The artifact produced by a 3D provider."""

    asset_id: str
    mesh_path: Path
    output_format: MeshFormat
    device: str
    elapsed_seconds: float
