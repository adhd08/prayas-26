"""Assignment KPIs computed from the final feasible flows and their travel times."""

from collections.abc import Mapping

from .costs import finite
from .demand import ODPair, UnreachableOD
from .graph import City

type KPIValue = float | int | bool | None


def report(
    city: City,
    pairs: list[ODPair],
    flows: Mapping[str, float],
    times: Mapping[str, float],
    unreachable: list[UnreachableOD],
    total_cost: float,
) -> dict[str, KPIValue]:
    """Report period totals, accessibility of OD trips, capital, and congestion."""
    total = finite(sum(q for _, _, q in pairs), "Total demand")
    unserved = sum(pair["demand"] for pair in unreachable)
    served = total - unserved
    travel = finite(sum(flows[e.id] * times[e.id] for e in city.edges.values()), "Travel total")
    free_travel = sum(flows[e.id] * e.free_flow_time for e in city.edges.values())
    used = [e for e in city.edges.values() if flows[e.id] > 0]
    metrics: dict[str, KPIValue] = {
        "total_demand": total,
        "served_demand": served,
        "unserved_demand": unserved,
        "served_fraction": served / total if total else 1.0,
        "total_travel_time": travel,
        "average_travel_time": travel / served if served else None,
        "total_delay": max(0.0, travel - free_travel),
        "total_distance": sum(flows[e.id] * e.length for e in city.edges.values()),
        "total_generalized_cost": total_cost,
        "flow_weighted_environmental_penalty": sum(
            flows[e.id] * e.environmental_penalty for e in city.edges.values()
        ),
        "used_new_link_construction_cost": sum(e.construction_cost for e in used if not e.existing),
        "selected_new_link_construction_cost": sum(
            e.construction_cost for e in city.edges.values() if not e.existing
        ),
        "max_volume_capacity_ratio": max((flows[e.id] / e.capacity for e in used), default=0.0),
        "over_capacity_links": sum(flows[e.id] > e.capacity for e in used),
    }
    for name, value in metrics.items():
        if isinstance(value, (int, float)):
            finite(value, name)
    return metrics
