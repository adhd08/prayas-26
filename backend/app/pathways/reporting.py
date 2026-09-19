"""KPIs for the returned assignment, with explicit unreachable demand accounting."""


def report(city, pairs, flows, times, unreachable, total_cost):
    total = sum(q for _, _, q in pairs)
    unserved = sum(pair["demand"] for pair in unreachable)
    served = total - unserved
    travel = sum(flows[e.id] * times[e.id] for e in city.edges.values())
    free_travel = sum(flows[e.id] * e.free_flow_time for e in city.edges.values())
    used = [e for e in city.edges.values() if flows[e.id] > 0]
    return {
        "total_demand": total,
        "served_demand": served,
        "unserved_demand": unserved,
        "served_fraction": served / total if total else 1.0,
        "total_travel_time": travel,
        "average_travel_time": travel / served if served else None,
        "total_delay": travel - free_travel,
        "total_distance": sum(flows[e.id] * e.length for e in city.edges.values()),
        "total_generalized_cost": total_cost,
        "flow_weighted_environmental_penalty": sum(
            flows[e.id] * e.environmental_penalty for e in city.edges.values()
        ),
        "used_new_link_construction_cost": sum(e.construction_cost for e in used if not e.existing),
        "max_volume_capacity_ratio": max((flows[e.id] / e.capacity for e in used), default=0.0),
        "over_capacity_links": sum(flows[e.id] > e.capacity for e in used),
    }
