"""Optional image-to-3D generation for visual planning assets.

This package is intentionally independent from the API process. TripoSR needs
a model checkout and a GPU-oriented dependency set, while the planning API must
remain lightweight and deployable without either.
"""

from app.three_d.engine import TripoSRReconstructor
from app.three_d.models import GenerationResult, ThreeDRequest
from app.three_d.service import ThreeDGenerationService

__all__ = ["GenerationResult", "ThreeDGenerationService", "ThreeDRequest", "TripoSRReconstructor"]
