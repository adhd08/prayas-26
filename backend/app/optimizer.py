"""Synchronous computation entry point for a future durable worker."""

from dataclasses import asdict

from app.pathways.assignment import assign
from app.pathways.models import City, Weights


def optimize(parameters: dict) -> dict:
    """Evaluate fixed upstream zoning with no database or API side effects."""
    city = City.from_dict(parameters["city"])
    return asdict(
        assign(
            city,
            parameters["od"],
            weights=Weights(**parameters.get("weights", {})),
            **parameters.get("assignment", {}),
        )
    )
