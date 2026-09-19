"""Pydantic contract carried inside the repository's existing JobRequest.parameters."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .config import (
    AccessibilityConfig,
    AssignmentConfig,
    ConstraintConfig,
    DesignWeights,
    Weights,
)
from .demand import ODMatrix, validate_od
from .errors import GraphError
from .graph import City, build_graph
from .models import Edge, Identifier, Node, Nonnegative, Zone


class CityInput(BaseModel):
    """Upstream zones plus explicitly separated existing and possible infrastructure."""

    model_config = ConfigDict(extra="forbid")
    nodes: list[Node]
    zones: list[Zone]
    existing_roads: list[Edge] = Field(default_factory=list)
    candidate_pathways: list[Edge] = Field(default_factory=list)

    @model_validator(mode="after")
    def link_roles(self) -> Self:
        if any(not e.existing for e in self.existing_roads):
            raise ValueError("existing_roads must have existing=true")
        if any(e.existing for e in self.candidate_pathways):
            raise ValueError("candidate_pathways must explicitly have existing=false")
        return self

    def to_graph(self, constraints: ConstraintConfig = ConstraintConfig()) -> City:
        """Construct a candidate graph while preserving upstream IDs and restrictions."""
        return City(
            self.nodes, [*self.existing_roads, *self.candidate_pathways], self.zones, constraints
        )


class PathwayParameters(BaseModel):
    """Typed worker parameters; zoning is already fixed before these are constructed."""

    model_config = ConfigDict(extra="forbid")
    city: CityInput
    od: ODMatrix
    selected_candidates: list[Identifier] = Field(default_factory=list)
    budget: Nonnegative | None = None
    weights: Weights = Field(default_factory=Weights)
    assignment: AssignmentConfig = Field(default_factory=AssignmentConfig)
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    accessibility: AccessibilityConfig = Field(default_factory=AccessibilityConfig)
    objectives: DesignWeights = Field(default_factory=DesignWeights)

    @model_validator(mode="after")
    def references(self) -> Self:
        if len(set(self.selected_candidates)) != len(self.selected_candidates):
            raise GraphError("Duplicate selected candidate IDs")
        graph = self.city.to_graph(self.constraints)
        validate_od(self.od, graph.zones)
        build_graph(graph, set(self.selected_candidates), self.budget)
        return self
