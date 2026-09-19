"""Essential-service access at assigned travel times, independent of OD trip totals."""

from collections.abc import Mapping
from typing import TypedDict

from .config import AccessibilityConfig, Weights
from .costs import finite
from .graph import City
from .routing import Router


class ServiceAccess(TypedDict):
    """Population-weighted coverage and nearest-service times for one service type."""

    total_population: float
    reachable_population: float
    population_within_threshold: float
    coverage_fraction: float | None
    average_reachable_travel_time: float | None
    zone_travel_times: dict[str, float | None]


def evaluate_accessibility(
    city: City, times: Mapping[str, float], config: AccessibilityConfig
) -> dict[str, ServiceAccess]:
    """Measure actual minimum travel time, not generalized routing preference cost.

    Missing services and disconnected zones contribute zero coverage. With no
    population, fractions and means are null rather than claiming universal access.
    """
    if not config.required_services:
        return {}
    router = Router(city, times=times, weights=Weights())
    result: dict[str, ServiceAccess] = {}
    populated = [zone for zone in city.zones.values() if zone.population > 0]
    population = finite(sum(zone.population for zone in populated), "Accessibility population")
    for service in config.required_services:
        facilities = [zone for zone in city.zones.values() if service in zone.services]
        zone_times: dict[str, float | None] = {}
        reachable = covered = travel = 0.0
        for zone in populated:
            routes = [router.route(zone.node, facility.node) for facility in facilities]
            nearest = min((r.cost for r in routes if r is not None), default=None)
            zone_times[zone.id] = nearest
            if nearest is not None:
                reachable += zone.population
                travel = finite(travel + zone.population * nearest, "Population-weighted travel")
                if nearest <= config.max_travel_time:
                    covered += zone.population
        result[service] = ServiceAccess(
            total_population=population,
            reachable_population=reachable,
            population_within_threshold=covered,
            coverage_fraction=covered / population if population else None,
            average_reachable_travel_time=travel / reachable if reachable else None,
            zone_travel_times=zone_times,
        )
    return result
