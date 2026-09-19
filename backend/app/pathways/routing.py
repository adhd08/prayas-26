"""Dijkstra and A* with a graph-derived admissible geometric heuristic."""

from dataclasses import dataclass
from heapq import heappop, heappush
from math import hypot, inf

from .models import City, Weights, nonnegative


@dataclass(frozen=True)
class Route:
    nodes: tuple[str, ...]
    edges: tuple[str, ...]
    cost: float


def shortest_path(
    city: City, source: str, target: str, *, weights=Weights(), times=None, algorithm="dijkstra"
) -> Route | None:
    if algorithm not in ("dijkstra", "astar"):
        raise ValueError("algorithm must be dijkstra or astar")
    if source not in city.nodes or target not in city.nodes:
        raise ValueError("Unknown routing endpoint")
    costs = {}
    for edge in city.edges.values():
        if edge.allowed:
            time = edge.free_flow_time if times is None else times[edge.id]
            nonnegative(time, "travel time")
            costs[edge.id] = weights.cost(edge, time)
            nonnegative(costs[edge.id], "generalized edge cost")

    def distance(a, b):
        a, b = city.nodes[a], city.nodes[b]
        return hypot(a.x - b.x, a.y - b.y)

    # Each edge cost >= rate * geometric distance: triangle inequality makes
    # this consistent. With missing/coincident coordinates it reduces to Dijkstra.
    rate = 0.0
    if algorithm == "astar":
        ratios = [
            costs[e.id] / distance(e.source, e.target)
            for e in city.edges.values()
            if e.allowed and distance(e.source, e.target) > 0
        ]
        rate = min(ratios, default=0.0)
    queue = [(rate * distance(source, target), 0.0, source)]
    best, previous = {source: 0.0}, {}
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
        for edge in city.adjacency[node]:
            candidate = cost + costs[edge.id]
            if candidate < best.get(edge.target, inf):
                best[edge.target] = candidate
                previous[edge.target] = (node, edge.id)
                heappush(
                    queue,
                    (candidate + rate * distance(edge.target, target), candidate, edge.target),
                )
    return None
