"""Domain exceptions for optional image-to-3D generation."""


class ThreeDGenerationError(RuntimeError):
    """Base exception raised when an image cannot become a planning asset."""


class InvalidThreeDRequestError(ThreeDGenerationError):
    """Raised when a request cannot safely be processed."""


class TripoSRUnavailableError(ThreeDGenerationError):
    """Raised when the dedicated TripoSR runtime has not been installed."""
