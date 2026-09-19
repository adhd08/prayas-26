"""Provider-neutral orchestration for image-to-3D reconstruction."""

from typing import Protocol

from app.three_d.models import GenerationResult, ThreeDRequest


class ImageToThreeDProvider(Protocol):
    """A replaceable image-to-3D implementation used by the worker."""

    def reconstruct(self, request: ThreeDRequest) -> GenerationResult:
        """Build and store a mesh for one validated request."""


class ThreeDGenerationService:
    """Validate a job once, then delegate model-specific work to a provider."""

    def __init__(self, provider: ImageToThreeDProvider) -> None:
        self._provider = provider

    def generate(self, request: ThreeDRequest) -> GenerationResult:
        """Generate a mesh without exposing provider details to a job worker."""
        request.validate()
        return self._provider.reconstruct(request)
