"""Static OD assignment using BPR travel times and successive averages (MSA)."""

from dataclasses import dataclass

from .accessibility import ServiceAccess, evaluate_accessibility
from .config import AccessibilityConfig, AssignmentConfig, Weights
from .costs import bpr, finite
from .demand import ODMatrix, ODPair, UnreachableOD, validate_od
from .graph import City
from .reporting import KPIValue, report
from .routing import Router


@dataclass(frozen=True)
class Assignment:
    """JSON-serializable evaluation; convergence is not a claim of network optimality."""

    flows: dict[str, float]
    travel_times: dict[str, float]
    kpis: dict[str, KPIValue]
    unreachable_od: list[UnreachableOD]
    history: list[dict[str, float | int]]
    accessibility: dict[str, ServiceAccess]
    blocked_edges: dict[str, str]


def _load(
    city: City, pairs: list[ODPair], router: Router
) -> tuple[dict[str, float], float, list[UnreachableOD]]:
    """All-or-nothing OD load with explicit accounting for disconnected pairs."""
    flows = dict.fromkeys(city.edges, 0.0)
    unreachable: list[UnreachableOD] = []
    shortest_total = 0.0
    for origin, destination, demand in pairs:
        route = router.route(city.zones[origin].node, city.zones[destination].node)
        if route is None:
            unreachable.append(UnreachableOD(origin=origin, destination=destination, demand=demand))
            continue
        shortest_total += demand * route.cost
        for edge_id in route.edges:
            flows[edge_id] = finite(flows[edge_id] + demand, "Assigned flow")
    return flows, finite(shortest_total, "Shortest-route cost total"), unreachable


def assign(
    city: City,
    od: ODMatrix,
    *,
    weights: Weights = Weights(),
    config: AssignmentConfig = AssignmentConfig(),
    accessibility: AccessibilityConfig = AccessibilityConfig(),
) -> Assignment:
    """Evaluate an explicit graph; network selection belongs to the design evaluator."""
    pairs = validate_od(od, city.zones)
    flows, _, unreachable = _load(
        city, pairs, Router(city, weights=weights, algorithm=config.algorithm)
    )
    history: list[dict[str, float | int]] = []
    # Begin with feasible flows. Recompute costs and gap for the exact returned
    # state, including at the iteration limit; MSA need not decrease monotonically.
    for iteration in range(1, config.max_iterations + 1):
        times = {e.id: bpr(e, flows[e.id], config.alpha, config.beta) for e in city.edges.values()}
        router = Router(city, weights=weights, times=times, algorithm=config.algorithm)
        auxiliary, shortest_total, _ = _load(city, pairs, router)
        total_cost = finite(
            sum(flows[key] * value for key, value in router.costs.items()), "Assigned cost total"
        )
        gap = max(0.0, (total_cost - shortest_total) / total_cost) if total_cost else 0.0
        history.append({"iteration": iteration, "relative_gap": gap})
        if gap <= config.tolerance or iteration == config.max_iterations:
            break
        step = 1 / (iteration + 1)
        flows = {key: value + step * (auxiliary[key] - value) for key, value in flows.items()}
    kpis = report(city, pairs, flows, times, unreachable, total_cost)
    kpis.update(iterations=iteration, relative_gap=gap, converged=gap <= config.tolerance)
    return Assignment(
        flows,
        times,
        kpis,
        unreachable,
        history,
        evaluate_accessibility(city, times, accessibility),
        dict(city.blocked_edges),
    )
