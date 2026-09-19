"""Routing, cost snapshots, OD conservation, and congestion regression coverage."""

from dataclasses import asdict

import networkx as nx
import pytest
from pydantic import ValidationError

from app.pathways import (
    AssignmentConfig,
    City,
    Edge,
    Node,
    Router,
    Weights,
    Zone,
    assign,
    shortest_path,
)
from app.pathways.costs import bpr, edge_cost
from app.pathways.errors import GraphError, NumericalError, PathwayError


@pytest.fixture
def city() -> City:
    return City(
        [Node("a", 0, 0), Node("b", 1, 0)],
        [
            Edge("fast", "a", "b", 1, 100),
            Edge("slow", "a", "b", 2, 1000),
            Edge("park", "a", "b", 0.1, 5000, protected=True),
            Edge("closed", "a", "b", 0.1, 5000, forbidden=True),
        ],
        [Zone("R", "a"), Zone("C", "b")],
    )


@pytest.mark.parametrize("algorithm", ["dijkstra", "astar"])
def test_routes_constraints_direction_and_identity(city: City, algorithm: str) -> None:
    router = Router(city, algorithm=algorithm)
    assert router.route("a", "b").edges == ("fast",)
    assert router.route("a", "b").cost == 1
    assert router.route("b", "a") is None
    assert router.route("a", "a").edges == ()
    with pytest.raises(GraphError, match="endpoint"):
        router.route("missing", "b")


def test_astar_multihop_matches_networkx() -> None:
    graph = City(
        [Node("a"), Node("b", 100, 1), Node("c", 1, 0), Node("d", 2, 0)],
        [
            Edge("ab", "a", "b", 1, 100),
            Edge("bc", "b", "c", 1, 100),
            Edge("ac", "a", "c", 5, 100),
            Edge("cd", "c", "d", 1, 100),
            Edge("ad", "a", "d", 8, 100),
        ],
        [],
    )
    oracle = nx.DiGraph()
    oracle.add_nodes_from(graph.nodes)
    for edge in graph.allowed_edges:
        oracle.add_edge(edge.source, edge.target, weight=edge.free_flow_time)
    for source in graph.nodes:
        for target in graph.nodes:
            dijkstra = shortest_path(graph, source, target)
            assert shortest_path(graph, source, target, algorithm="astar") == dijkstra
            if nx.has_path(oracle, source, target):
                assert dijkstra.cost == nx.shortest_path_length(oracle, source, target, "weight")
            else:
                assert dijkstra is None
    assert shortest_path(graph, "a", "d").edges == ("ab", "bc", "cd")


def test_configurable_costs_and_congestion_weight() -> None:
    graph = City(
        [Node("a"), Node("b")],
        [
            Edge("fast", "a", "b", 1, 100, construction_cost=100),
            Edge("green", "a", "b", 2, 100, environmental_penalty=10),
        ],
        [],
    )
    assert shortest_path(
        graph, "a", "b", weights=Weights(construction_cost=1, construction_scale=10)
    ).edges == ("green",)
    assert shortest_path(graph, "a", "b", weights=Weights(environmental_penalty=1)).edges == (
        "fast",
    )
    assert edge_cost(graph.edges["fast"], 3, Weights(congestion=2)) == 7


def test_zero_weight_cost_astar_and_parallel_tie(city: City) -> None:
    weights = Weights(travel_time=0, construction_cost=1)
    assert shortest_path(city, "a", "b", weights=weights, algorithm="astar").cost == 0


def test_bpr_assignment_equilibrium_and_returned_state(city: City) -> None:
    config = AssignmentConfig(max_iterations=3000, tolerance=0.001)
    result = assign(city, {"R": {"C": 300}}, config=config)
    assert bpr(city.edges["fast"], 100) == pytest.approx(1.15)
    assert result.kpis["converged"]
    assert sum(result.flows.values()) == pytest.approx(300)
    assert result.flows["slow"] > 0
    assert result.flows["park"] == result.flows["closed"] == 0
    assert abs(result.travel_times["fast"] - result.travel_times["slow"]) < 0.01
    for key, flow in result.flows.items():
        assert result.travel_times[key] == pytest.approx(bpr(city.edges[key], flow))
    astar = assign(city, {"R": {"C": 300}}, config=config.model_copy(update={"algorithm": "astar"}))
    assert astar.flows == result.flows
    assert result.kpis["total_travel_time"] == pytest.approx(
        sum(result.flows[k] * result.travel_times[k] for k in city.edges)
    )


def test_iteration_limit_gap_matches_flow(city: City) -> None:
    result = assign(city, {"R": {"C": 300}}, config=AssignmentConfig(max_iterations=1))
    assert not result.kpis["converged"]
    assert result.flows["fast"] == 300
    expected = (bpr(city.edges["fast"], 300) - 2) / bpr(city.edges["fast"], 300)
    assert result.kpis["relative_gap"] == pytest.approx(expected)


def test_disconnected_empty_and_intrazonal_od(city: City) -> None:
    result = assign(
        city, {"C": {"R": 30}, "R": {"R": 10, "C": 20}}, config=AssignmentConfig(alpha=0)
    )
    assert result.kpis["served_demand"] == 30
    assert result.kpis["unserved_demand"] == 30
    assert result.kpis["average_travel_time"] == pytest.approx(20 / 30)
    assert result.unreachable_od == [{"origin": "C", "destination": "R", "demand": 30}]
    empty = assign(city, {})
    assert empty.kpis["total_travel_time"] == 0
    assert empty.kpis["average_travel_time"] is None
    assert empty.kpis["served_fraction"] == 1
    assert asdict(empty)["accessibility"] == {}


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), True, "30"])
def test_invalid_od(city: City, value: object) -> None:
    with pytest.raises(ValidationError):
        assign(city, {"R": {"C": value}})


def test_unknown_zero_demand_reference(city: City) -> None:
    with pytest.raises(GraphError, match="destination"):
        assign(city, {"R": {"missing": 0}})


@pytest.mark.parametrize(
    "settings",
    [
        {"max_iterations": 0},
        {"max_iterations": 1.2},
        {"max_iterations": True},
        {"alpha": -1},
        {"beta": 0},
        {"tolerance": -1},
        {"algorithm": "wrong"},
        {"typo": 1},
    ],
)
def test_invalid_assignment_settings(settings: dict) -> None:
    with pytest.raises(ValidationError):
        AssignmentConfig(**settings)


def test_travel_time_validation_and_overflow(city: City) -> None:
    with pytest.raises(PathwayError, match="Missing travel time"):
        Router(city, times={})
    with pytest.raises(PathwayError, match="finite"):
        Router(city, times={"fast": float("nan"), "slow": 2})
    with pytest.raises(NumericalError):
        bpr(city.edges["fast"], 1e300)
    assert bpr(city.edges["fast"], 1e300, alpha=0) == 1
