"""Candidate-network evaluation shared by manual planning and future ACO/GA search."""

from typing import Protocol

from .assignment import Assignment, assign
from .config import AccessibilityConfig, AssignmentConfig, DesignWeights, Weights
from .costs import finite
from .demand import ODMatrix
from .errors import PathwayError
from .graph import City, build_graph


class NetworkDesigner(Protocol):
    """A future search proposes edge IDs; this module enforces validity and scores them."""

    def propose(self, city: City, od: ODMatrix) -> set[str]:
        """Return new candidate IDs; existing roads remain active."""
        ...


def evaluate_design(
    city: City,
    od: ODMatrix,
    selected: set[str],
    *,
    budget: float | None = None,
    weights: Weights = Weights(),
    config: AssignmentConfig = AssignmentConfig(),
    accessibility: AccessibilityConfig = AccessibilityConfig(),
    objectives: DesignWeights = DesignWeights(),
) -> Assignment:
    """Validate a candidate set and evaluate five network-level planning objectives.

    Unserved OD or unconverged assignment yields no comparable design score.
    Search implementations must respect design_feasible before comparing scores.
    """
    if objectives.accessibility and (
        not accessibility.required_services or not any(z.population for z in city.zones.values())
    ):
        raise PathwayError("Accessibility scoring requires service types and positive population")
    network = build_graph(city, selected, budget)
    result = assign(network, od, weights=weights, config=config, accessibility=accessibility)
    coverage = [
        a["coverage_fraction"]
        for a in result.accessibility.values()
        if a["coverage_fraction"] is not None
    ]
    access_deficit = sum(1 - value for value in coverage) / len(coverage) if coverage else None
    kpis = result.kpis
    score = (
        objectives.travel_time * float(kpis["total_travel_time"])
        + objectives.congestion * float(kpis["total_delay"])
        + objectives.construction_cost * float(kpis["selected_new_link_construction_cost"])
        + objectives.environmental_impact * float(kpis["flow_weighted_environmental_penalty"])
        + objectives.accessibility * (access_deficit or 0.0)
    )
    feasible = kpis["unserved_demand"] == 0 and bool(kpis["converged"])
    kpis.update(
        accessibility_deficit=access_deficit,
        design_feasible=feasible,
        design_objective=finite(score, "Design score") if feasible else None,
    )
    return result
