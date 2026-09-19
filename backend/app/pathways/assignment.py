"""Static assignment using all-or-nothing loading and successive averages (MSA)."""

from dataclasses import dataclass

from .models import City, Weights, nonnegative
from .routing import shortest_path


def bpr(edge, flow, alpha=0.15, beta=4.0):
    nonnegative(flow, "flow")
    nonnegative(alpha, "alpha")
    nonnegative(beta, "beta", positive=True)
    time = edge.free_flow_time * (1 + alpha * (flow / edge.capacity) ** beta)
    nonnegative(time, "BPR travel time")
    return time


@dataclass(frozen=True)
class Assignment:
    flows: dict[str, float]
    travel_times: dict[str, float]
    kpis: dict[str, float | int | bool | None]
    unreachable_od: list[dict]
    history: list[dict]


def assign(
    city: City,
    od: dict[str, dict[str, float]],
    *,
    weights=Weights(),
    algorithm="dijkstra",
    max_iterations=200,
    tolerance=1e-4,
    alpha=0.15,
    beta=4.0,
) -> Assignment:
    city.validate_od(od)
    if algorithm not in ("dijkstra", "astar"):
        raise ValueError("algorithm must be dijkstra or astar")
    if (
        isinstance(max_iterations, bool)
        or not isinstance(max_iterations, int)
        or max_iterations < 1
    ):
        raise ValueError("max_iterations must be a positive integer")
    nonnegative(tolerance, "tolerance")
    nonnegative(alpha, "alpha")
    nonnegative(beta, "beta", positive=True)
    pairs = [(o, d, q) for o, row in od.items() for d, q in row.items() if q > 0]

    def load(times):
        flows = dict.fromkeys(city.edges, 0.0)
        unreachable, shortest_total = [], 0.0
        for origin, destination, demand in pairs:
            route = shortest_path(
                city,
                city.zones[origin].node,
                city.zones[destination].node,
                weights=weights,
                times=times,
                algorithm=algorithm,
            )
            if route is None:
                unreachable.append({"origin": origin, "destination": destination, "demand": demand})
                continue
            shortest_total += demand * route.cost
            for edge_id in route.edges:
                flows[edge_id] += demand
        return flows, shortest_total, unreachable

    free_times = {e.id: e.free_flow_time for e in city.edges.values()}
    flows, _, unreachable = load(free_times)
    history = []
    # Start with a feasible assignment, not zero flow; assess convergence using
    # costs at the same flow returned to the caller, including the last iteration.
    for iteration in range(1, max_iterations + 1):
        times = {e.id: bpr(e, flows[e.id], alpha, beta) for e in city.edges.values()}
        auxiliary, shortest_total, _ = load(times)
        total_cost = sum(flows[e.id] * weights.cost(e, times[e.id]) for e in city.edges.values())
        gap = max(0.0, (total_cost - shortest_total) / total_cost) if total_cost else 0.0
        history.append({"iteration": iteration, "relative_gap": gap})
        if gap <= tolerance or iteration == max_iterations:
            break
        step = 1 / (iteration + 1)
        flows = {key: value + step * (auxiliary[key] - value) for key, value in flows.items()}

    from .reporting import report

    kpis = report(city, pairs, flows, times, unreachable, total_cost)
    kpis.update(iterations=iteration, relative_gap=gap, converged=gap <= tolerance)
    return Assignment(flows, times, kpis, unreachable, history)
