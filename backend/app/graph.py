"""Build immutable directed graphs and enforce upstream spatial restrictions."""

from collections.abc import Iterable, Mapping
from math import isfinite
from types import MappingProxyType

from pydantic import TypeAdapter

from .config import ConstraintConfig
from .errors import ConstraintError, GraphError, NumericalError
from .models import Edge, Node, Nonnegative, Zone


def _index[T: (Node, Edge, Zone)](records: Iterable[T], label: str) -> dict[str, T]:
    result: dict[str, T] = {}
    for record in records:
        if record.id in result:
            raise GraphError(f"Duplicate {label} ID: {record.id}")
        result[record.id] = record
    return result


class City:
    """Validated graph snapshot; all routing uses the same filtered adjacency."""

    def __init__(
        self,
        nodes: Iterable[Node],
        edges: Iterable[Edge],
        zones: Iterable[Zone],
        constraints: ConstraintConfig = ConstraintConfig(),
    ) -> None:
        self.nodes: Mapping[str, Node] = MappingProxyType(_index(nodes, "node"))
        self.edges: Mapping[str, Edge] = MappingProxyType(_index(edges, "edge"))
        self.zones: Mapping[str, Zone] = MappingProxyType(_index(zones, "zone"))
        self.constraints = constraints
        endpoint_zones: dict[str, set[str]] = {key: set() for key in self.nodes}
        for zone in self.zones.values():
            if zone.node not in self.nodes:
                raise GraphError(f"Unknown node {zone.node} for zone {zone.id}")
            endpoint_zones[zone.node].add(zone.id)
        blocked: dict[str, str] = {}
        adjacency: dict[str, list[Edge]] = {key: [] for key in self.nodes}
        for edge in self.edges.values():
            if edge.source not in self.nodes or edge.target not in self.nodes:
                raise GraphError(f"Unknown endpoint for edge {edge.id}")
            if unknown := set(edge.zone_ids) - self.zones.keys():
                raise GraphError(f"Unknown intersected zones for {edge.id}: {sorted(unknown)}")
            crossed = set(edge.zone_ids) | endpoint_zones[edge.source] | endpoint_zones[edge.target]
            restricted = sorted(
                z
                for z in crossed
                if self.zones[z].protected or (constraints.forbid_green and self.zones[z].green)
            )
            if edge.forbidden or edge.protected:
                blocked[edge.id] = "forbidden" if edge.forbidden else "protected link"
            elif restricted:
                blocked[edge.id] = f"restricted zones: {', '.join(restricted)}"
            else:
                adjacency[edge.source].append(edge)
        self.blocked_edges: Mapping[str, str] = MappingProxyType(blocked)
        self.adjacency: Mapping[str, tuple[Edge, ...]] = MappingProxyType(
            {key: tuple(value) for key, value in adjacency.items()}
        )
        self.allowed_edges: tuple[Edge, ...] = tuple(
            e for e in self.edges.values() if e.id not in blocked
        )


def build_graph(city: City, selected: set[str], budget: float | None = None) -> City:
    """Keep existing links and explicitly selected candidates; reject illegal selections."""
    if unknown := selected - city.edges.keys():
        raise GraphError(f"Unknown candidate links: {sorted(unknown)}")
    for key in sorted(selected):
        if city.edges[key].existing:
            raise ConstraintError(f"Selected link {key} is an existing road, not a candidate")
        if key in city.blocked_edges:
            raise ConstraintError(f"Cannot select {key}: {city.blocked_edges[key]}")
    capital = sum(city.edges[key].construction_cost for key in selected)
    if not isfinite(capital):
        raise NumericalError("Selected construction cost is not finite")
    if budget is not None:
        TypeAdapter(Nonnegative).validate_python(budget)
    if budget is not None and capital > budget:
        raise ConstraintError(f"Selected construction cost {capital} exceeds budget {budget}")
    return City(
        city.nodes.values(),
        (e for e in city.edges.values() if e.existing or e.id in selected),
        city.zones.values(),
        city.constraints,
    )
