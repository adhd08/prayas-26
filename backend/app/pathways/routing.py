"""Reusable cost snapshots for Dijkstra and A* on the constrained city graph."""

from collections.abc import Mapping
from dataclasses import dataclass
from heapq import heappop, heappush
from math import hypot, inf

from .config import Weights
from .costs import finite, routing_costs
from .errors import GraphError, PathwayError
from .graph import City


@dataclass(frozen=True)
class Route:
    """Ordered nodes and edge IDs, preserving parallel-link identity."""

    nodes: tuple[str, ...]
    edges: tuple[str, ...]
    cost: float


class Router:
    """Prepare costs and an admissible heuristic once for many OD queries."""

    def __init__(
        self,
        city: City,
        *,
        weights: Weights = Weights(),
        times: Mapping[str, float] | None = None,
        algorithm: str = "dijkstra",
    ) -> None:
        if algorithm not in ("dijkstra", "astar"):
            raise PathwayError("algorithm must be dijkstra or astar")
        self.city = city
        self.costs = routing_costs(city, weights, times)
        self.rate = 0.0
        if algorithm == "astar":
            self.rate = min(
                (
                    self.costs[e.id] / self.distance(e.source, e.target)
                    for e in city.allowed_edges
                    if self.distance(e.source, e.target) > 0
                ),
                default=0.0,
            )

    def distance(self, source: str, target: str) -> float:
        """Planar straight-line distance in the caller's common coordinate units."""
        a, b = self.city.nodes[source], self.city.nodes[target]
        return finite(hypot(a.x - b.x, a.y - b.y), "Coordinate distance")

    def route(self, source: str, target: str) -> Route | None:
        """Return a minimum-cost allowed route, or None for disconnected nodes."""
        if source not in self.city.nodes or target not in self.city.nodes:
            raise GraphError(f"Unknown routing endpoint: {source} -> {target}")
        queue = [(self.rate * self.distance(source, target), 0.0, source)]
        best: dict[str, float] = {source: 0.0}
        previous: dict[str, tuple[str, str]] = {}
        while queue:
            _, cost, node = heappop(queue)
            if cost > best[node]:
                continue
            if node == target:
                nodes, edges = [target], []
                while nodes[-1] != source:
                    parent, edge_id = previous[nodes[-1]]
                    nodes.append(parent)
                    edges.append(edge_id)
                return Route(tuple(reversed(nodes)), tuple(reversed(edges)), cost)
            for edge in self.city.adjacency[node]:
                candidate = finite(cost + self.costs[edge.id], "Route cost")
                if candidate < best.get(edge.target, inf):
                    best[edge.target] = candidate
                    previous[edge.target] = (node, edge.id)
                    heappush(
                        queue,
                        (
                            candidate + self.rate * self.distance(edge.target, target),
                            candidate,
                            edge.target,
                        ),
                    )
        return None


def shortest_path(
    city: City,
    source: str,
    target: str,
    *,
    weights: Weights = Weights(),
    times: Mapping[str, float] | None = None,
    algorithm: str = "dijkstra",
) -> Route | None:
    """One-off routing helper. Reuse Router for repeated queries at the same costs."""
    return Router(city, weights=weights, times=times, algorithm=algorithm).route(source, target)
