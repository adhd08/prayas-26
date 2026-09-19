"""Pure BPR travel times and normalized generalized routing costs."""

from collections.abc import Mapping
from math import isfinite

from .config import Weights
from .errors import NumericalError, PathwayError
from .graph import City
from .models import Edge


def finite(value: float, label: str) -> float:
    """Fail explicitly on arithmetic overflow rather than emitting invalid JSON."""
    if not isfinite(value):
        raise NumericalError(f"{label} is not finite; rescale input values")
    return value


def bpr(edge: Edge, flow: float, alpha: float = 0.15, beta: float = 4.0) -> float:
    """Static travel time t0 * (1 + alpha * (flow/capacity)**beta)."""
    if (
        not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v)
            for v in (flow, alpha, beta)
        )
        or flow < 0
        or alpha < 0
        or beta <= 0
    ):
        raise PathwayError("BPR requires finite flow >= 0, alpha >= 0, and beta > 0")
    if alpha == 0:
        return edge.free_flow_time
    try:
        return finite(
            edge.free_flow_time * (1 + alpha * (flow / edge.capacity) ** beta),
            f"BPR time for {edge.id}",
        )
    except OverflowError as exc:
        raise NumericalError(f"BPR overflow for {edge.id}; rescale flow/capacity") from exc


def edge_cost(edge: Edge, time: float, weights: Weights) -> float:
    """Construction is a routing preference proxy; design capital is evaluated separately."""
    return finite(
        weights.travel_time * time / weights.time_scale
        + weights.congestion * max(0.0, time - edge.free_flow_time) / weights.time_scale
        + weights.construction_cost * edge.construction_cost / weights.construction_scale
        + weights.environmental_penalty * edge.environmental_penalty / weights.environment_scale,
        f"Generalized cost for {edge.id}",
    )


def routing_costs(
    city: City, weights: Weights, times: Mapping[str, float] | None = None
) -> dict[str, float]:
    """Prepare allowed-link costs once per routing snapshot, never per OD pair."""
    result: dict[str, float] = {}
    for edge in city.allowed_edges:
        if times is not None and edge.id not in times:
            raise PathwayError(f"Missing travel time for allowed edge {edge.id}")
        time = edge.free_flow_time if times is None else times[edge.id]
        if (
            not isinstance(time, (int, float))
            or isinstance(time, bool)
            or not isfinite(time)
            or time < 0
        ):
            raise PathwayError(f"Travel time for {edge.id} must be finite and nonnegative")
        result[edge.id] = edge_cost(edge, time, weights)
    return result
