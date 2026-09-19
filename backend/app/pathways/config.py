"""Per-evaluation settings, independent of deployment credentials and environment."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from .models import Identifier, Nonnegative, Positive


class Configuration(BaseModel):
    """Reject misspelled options and mutable/unchecked configuration changes."""

    model_config = ConfigDict(extra="forbid", frozen=True, validate_default=True)


class Weights(Configuration):
    """Routing preferences; positive scales convert inputs into comparable units."""

    travel_time: Nonnegative = 1.0
    congestion: Nonnegative = 0.0
    construction_cost: Nonnegative = 0.0
    environmental_penalty: Nonnegative = 0.0
    time_scale: Positive = 1.0
    construction_scale: Positive = 1.0
    environment_scale: Positive = 1.0

    @model_validator(mode="after")
    def meaningful_objective(self) -> Self:
        if not any(
            (self.travel_time, self.congestion, self.construction_cost, self.environmental_penalty)
        ):
            raise ValueError("At least one routing objective weight must be positive")
        return self


class AssignmentConfig(Configuration):
    """MSA solver settings; demand and capacity must use the same time period."""

    algorithm: Literal["dijkstra", "astar"] = "dijkstra"
    max_iterations: int = Field(default=200, strict=True, ge=1)
    tolerance: Nonnegative = 1e-4
    alpha: Nonnegative = 0.15
    beta: Positive = 4.0


class ConstraintConfig(Configuration):
    """Protected zones are always excluded; green-zone policy is explicit."""

    forbid_green: StrictBool = True


class AccessibilityConfig(Configuration):
    """Nearest-service reachability, evaluated with final congested travel times."""

    required_services: tuple[Identifier, ...] = ()
    max_travel_time: Positive = 15.0


class DesignWeights(Configuration):
    """Network-level objective coefficients, each in inverse KPI units.

    Capital is charged once per selected new link. Accessibility is the mean
    population-weighted coverage deficit across the configured service types.
    """

    travel_time: Nonnegative = 1.0
    congestion: Nonnegative = 0.0
    construction_cost: Nonnegative = 0.0
    environmental_impact: Nonnegative = 0.0
    accessibility: Nonnegative = 0.0
