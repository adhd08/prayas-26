"""Validated post-zoning records; population and land use are never predicted here."""

from typing import Annotated

from pydantic import ConfigDict, Field, StrictBool
from pydantic.dataclasses import dataclass

Identifier = Annotated[str, Field(strict=True, min_length=1)]
Nonnegative = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
Positive = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
Coordinate = Annotated[float, Field(strict=True, allow_inf_nan=False)]
RECORD_CONFIG = ConfigDict(extra="forbid", validate_default=True)


@dataclass(frozen=True, config=RECORD_CONFIG)
class Node:
    """Intersection or explicit zone connector; coordinates use one planar CRS."""

    id: Identifier
    x: Coordinate = 0.0
    y: Coordinate = 0.0


@dataclass(frozen=True, config=RECORD_CONFIG)
class Zone:
    """Fixed upstream zoning with population, services, and traversal restrictions."""

    id: Identifier
    node: Identifier
    land_use: Identifier = "unspecified"
    population: Nonnegative = 0.0
    services: tuple[Identifier, ...] = ()
    protected: StrictBool = False
    green: StrictBool = False


@dataclass(frozen=True, config=RECORD_CONFIG)
class Edge:
    """Directed link. zone_ids contains ALL intersected zones from upstream GIS."""

    id: Identifier
    source: Identifier
    target: Identifier
    free_flow_time: Positive
    capacity: Positive
    length: Nonnegative = 0.0
    construction_cost: Nonnegative = 0.0
    environmental_penalty: Nonnegative = 0.0
    protected: StrictBool = False
    forbidden: StrictBool = False
    existing: StrictBool = True
    zone_ids: tuple[Identifier, ...] = ()
