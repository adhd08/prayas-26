"""Validated directed graph inputs. Zoning is supplied by an upstream model."""

from dataclasses import dataclass, fields
from math import isfinite


def nonnegative(value, name, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be numeric")
    if not isfinite(value) or value < 0 or (positive and value == 0):
        raise ValueError(f"{name} must be finite and {'positive' if positive else 'nonnegative'}")


@dataclass(frozen=True)
class Node:
    id: str
    x: float = 0.0
    y: float = 0.0


@dataclass(frozen=True)
class Zone:
    id: str
    node: str
    land_use: str = "unspecified"


@dataclass(frozen=True)
class Edge:
    id: str
    source: str
    target: str
    free_flow_time: float
    capacity: float
    length: float = 0.0
    construction_cost: float = 0.0
    environmental_penalty: float = 0.0
    protected: bool = False
    forbidden: bool = False
    existing: bool = True

    @property
    def allowed(self):
        return not (self.protected or self.forbidden)


@dataclass(frozen=True)
class Weights:
    travel_time: float = 1.0
    construction_cost: float = 0.0
    environmental_penalty: float = 0.0
    time_scale: float = 1.0
    construction_scale: float = 1.0
    environment_scale: float = 1.0

    def __post_init__(self):
        for field in fields(self):
            nonnegative(
                getattr(self, field.name), field.name, positive=field.name.endswith("scale")
            )
        if self.travel_time + self.construction_cost + self.environmental_penalty == 0:
            raise ValueError("At least one objective weight must be positive")

    def cost(self, edge, time):
        return (
            self.travel_time * time / self.time_scale
            + self.construction_cost * edge.construction_cost / self.construction_scale
            + self.environmental_penalty * edge.environmental_penalty / self.environment_scale
        )


class City:
    def __init__(self, nodes: list[Node], edges: list[Edge], zones: list[Zone]):
        for collection in (nodes, edges, zones):
            ids = [item.id for item in collection]
            if any(not isinstance(key, str) or not key for key in ids):
                raise ValueError("IDs must be nonempty strings")
            if len(set(ids)) != len(ids):
                raise ValueError("Duplicate IDs")
        self.nodes = {n.id: n for n in nodes}
        self.edges = {e.id: e for e in edges}
        self.zones = {z.id: z for z in zones}
        self.adjacency = {n.id: [] for n in nodes}
        for node in nodes:
            for coord in (node.x, node.y):
                if isinstance(coord, bool) or not isinstance(coord, (int, float)):
                    raise ValueError("Coordinates must be numeric")
                if not isfinite(coord):
                    raise ValueError("Coordinates must be finite")
        for zone in zones:
            if zone.node not in self.nodes:
                raise ValueError(f"Unknown node for zone {zone.id}")
        for edge in edges:
            if edge.source not in self.nodes or edge.target not in self.nodes:
                raise ValueError(f"Unknown endpoint for edge {edge.id}")
            for name in (
                "free_flow_time",
                "capacity",
                "length",
                "construction_cost",
                "environmental_penalty",
            ):
                nonnegative(
                    getattr(edge, name), name, positive=name in ("free_flow_time", "capacity")
                )
            for name in ("protected", "forbidden", "existing"):
                if not isinstance(getattr(edge, name), bool):
                    raise ValueError(f"{name} must be boolean")
            if edge.allowed:
                self.adjacency[edge.source].append(edge)

    @classmethod
    def from_dict(cls, data):
        return cls(
            [Node(**n) for n in data["nodes"]],
            [Edge(**e) for e in data["edges"]],
            [Zone(**z) for z in data["zones"]],
        )

    def validate_od(self, od):
        for origin, destinations in od.items():
            if origin not in self.zones:
                raise ValueError(f"Unknown origin zone: {origin}")
            for destination, trips in destinations.items():
                if destination not in self.zones:
                    raise ValueError(f"Unknown destination zone: {destination}")
                nonnegative(trips, "OD demand")
