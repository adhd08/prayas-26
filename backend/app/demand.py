"""Validate observed/estimated OD demand; do not infer trips from zone labels."""

from collections.abc import Mapping
from typing import TypedDict

from pydantic import TypeAdapter

from .errors import GraphError
from .models import Identifier, Nonnegative, Zone

type ODMatrix = dict[Identifier, dict[Identifier, Nonnegative]]
type ODPair = tuple[str, str, float]


class UnreachableOD(TypedDict):
    """Demand that cannot reach its destination in the selected network."""

    origin: str
    destination: str
    demand: float


_OD = TypeAdapter(ODMatrix)


def validate_od(od: ODMatrix, zones: Mapping[str, Zone]) -> list[ODPair]:
    """Validate even zero-demand references; absent cells are zero."""
    matrix = _OD.validate_python(od)
    pairs: list[ODPair] = []
    for origin, destinations in matrix.items():
        if origin not in zones:
            raise GraphError(f"Unknown origin zone: {origin}")
        for destination, demand in destinations.items():
            if destination not in zones:
                raise GraphError(f"Unknown destination zone: {destination}")
            if demand > 0:
                pairs.append((origin, destination, demand))
    return pairs
