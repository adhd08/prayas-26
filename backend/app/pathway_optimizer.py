"""Prayas worker computation entry point, downstream of zoning prediction."""

from dataclasses import asdict
from typing import Any

from app.pathways.design import evaluate_design
from app.pathways.inputs import PathwayParameters


def optimize(parameters: dict[str, Any] | PathwayParameters) -> dict[str, Any]:
    """Validate JobRequest.parameters and evaluate its explicit pathway selection.

    Upstream ML must supply zone IDs, population, land use and road connectors.
    No inference, cloud access, job persistence or API execution happens here.
    """
    request = (
        parameters
        if isinstance(parameters, PathwayParameters)
        else PathwayParameters.model_validate(parameters)
    )
    return asdict(
        evaluate_design(
            request.city.to_graph(request.constraints),
            request.od,
            set(request.selected_candidates),
            budget=request.budget,
            weights=request.weights,
            config=request.assignment,
            accessibility=request.accessibility,
            objectives=request.objectives,
        )
    )
