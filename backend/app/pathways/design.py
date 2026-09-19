"""Extension boundary for future ACO/GA network search; no search is implemented."""

from typing import Protocol

from .assignment import Assignment, assign
from .models import City


class NetworkDesigner(Protocol):
    def propose(self, city: City, od: dict[str, dict[str, float]]) -> set[str]:
        """Return candidate edge IDs to activate; existing allowed links stay active."""
        ...


def evaluate_design(
    city: City,
    od: dict[str, dict[str, float]],
    selected: set[str],
    *,
    budget: float | None = None,
    **assignment_options,
) -> Assignment:
    """Validate hard constraints/budget, then reuse the fixed-network evaluator."""
    from .models import nonnegative

    if not selected <= city.edges.keys():
        raise ValueError("Unknown candidate link")
    if any(not city.edges[key].allowed for key in selected):
        raise ValueError("Protected/forbidden links cannot be selected")
    construction = sum(
        city.edges[key].construction_cost for key in selected if not city.edges[key].existing
    )
    if budget is not None:
        nonnegative(budget, "budget")
        if construction > budget:
            raise ValueError("Construction budget exceeded")
    edges = [e for e in city.edges.values() if e.existing or e.id in selected]
    network = City(list(city.nodes.values()), edges, list(city.zones.values()))
    return assign(network, od, **assignment_options)
