"""Prayas job envelope, upstream zoning, candidate selection, and service access."""

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.pathway_optimizer import optimize
from app.pathways import (
    AccessibilityConfig,
    AssignmentConfig,
    City,
    Edge,
    Node,
    PathwayParameters,
    Weights,
    Zone,
    assign,
    shortest_path,
)
from app.pathways.config import ConstraintConfig, DesignWeights
from app.pathways.design import evaluate_design
from app.pathways.errors import ConstraintError, GraphError, PathwayError
from app.schemas import JobRequest

DEMO = Path(__file__).parents[1] / "examples/pathways/city.json"


@pytest.fixture
def parameters() -> dict:
    return json.loads(DEMO.read_text())


def test_job_envelope_roundtrip_and_demo(parameters: dict) -> None:
    before = deepcopy(parameters)
    job = JobRequest(parameters=parameters)
    restored = JobRequest.model_validate_json(job.model_dump_json())
    result = optimize(restored.parameters)
    assert parameters == before
    assert result["kpis"]["served_demand"] == 1000
    assert result["kpis"]["unserved_demand"] == 25
    assert result["kpis"]["converged"]
    assert result["kpis"]["design_feasible"] is False
    assert result["kpis"]["design_objective"] is None
    assert result["flows"]["park_shortcut"] == result["flows"]["forbidden_link"] == 0
    assert "G" in result["blocked_edges"]["park_shortcut"]
    assert result["kpis"]["used_new_link_construction_cost"] == 100
    assert result["accessibility"]["healthcare"]["coverage_fraction"] == pytest.approx(2000 / 2100)
    assert result["accessibility"]["healthcare"]["zone_travel_times"]["I"] is None
    assert result["accessibility"]["education"]["coverage_fraction"] == 0
    graph = PathwayParameters.model_validate(parameters).city.to_graph()
    for node in ("junction", "bypass"):
        incoming = sum(result["flows"][e.id] for e in graph.edges.values() if e.target == node)
        outgoing = sum(result["flows"][e.id] for e in graph.edges.values() if e.source == node)
        assert incoming == pytest.approx(outgoing)
    json.dumps(result, allow_nan=False)


def test_default_excludes_candidates(parameters: dict) -> None:
    parameters.pop("selected_candidates")
    result = optimize(parameters)
    assert "bypass1" not in result["flows"]
    assert result["kpis"]["selected_new_link_construction_cost"] == 0


@pytest.mark.parametrize(
    "edit",
    [
        {"selected_candidates": ["missing"]},
        {"selected_candidates": ["main1"]},
        {"selected_candidates": ["bypass1", "bypass1"]},
        {"budget": 99},
        {"budget": True},
        {"weights": {"time_scale": 0}},
        {"weights": {"travel_time": 0}},
        {"assignment": {"algoritm": "astar"}},
        {"unexpected": 1},
        {"od": {"R": {"C": True}}},
        {"od": {"R": {"C": "3"}}},
        {"od": {"R": {"missing": 0}}},
    ],
)
def test_worker_validation(parameters: dict, edit: dict) -> None:
    parameters.update(edit)
    with pytest.raises((ValidationError, PathwayError)):
        optimize(parameters)


@pytest.mark.parametrize(
    "record",
    [
        {"id": "bad", "source": "a", "target": "b", "free_flow_time": 1, "capacity": 0},
        {
            "id": "bad",
            "source": "a",
            "target": "b",
            "free_flow_time": 1,
            "capacity": 1,
            "protected": "false",
        },
    ],
)
def test_strict_records(record: dict) -> None:
    with pytest.raises(ValidationError):
        Edge(**record)


def test_invalid_graphs_and_read_only_snapshot() -> None:
    with pytest.raises(GraphError, match="Duplicate"):
        City([Node("a"), Node("a")], [], [])
    with pytest.raises(GraphError, match="Unknown node"):
        City([Node("a")], [], [Zone("R", "missing")])
    with pytest.raises(GraphError, match="endpoint"):
        City([Node("a")], [Edge("x", "a", "missing", 1, 100)], [])
    with pytest.raises(GraphError, match="intersected"):
        City([Node("a")], [Edge("x", "a", "a", 1, 100, zone_ids=("missing",))], [])
    graph = City([Node("a")], [], [])
    with pytest.raises(TypeError):
        graph.nodes["b"] = Node("b")


@pytest.mark.parametrize(
    "protected,green,forbid_green,blocked",
    [
        (True, False, False, True),
        (True, True, False, True),
        (False, True, True, True),
        (False, True, False, False),
    ],
)
def test_crossed_and_endpoint_zone_constraints(
    protected: bool,
    green: bool,
    forbid_green: bool,
    blocked: bool,
) -> None:
    graph = City(
        [Node("a"), Node("b"), Node("g")],
        [
            Edge("cross", "a", "b", 1, 10, zone_ids=("G",)),
            Edge("endpoint", "a", "g", 1, 10),
            Edge("candidate", "a", "b", 1, 10, existing=False, zone_ids=("G",)),
        ],
        [Zone("R", "a"), Zone("C", "b"), Zone("G", "g", protected=protected, green=green)],
        ConstraintConfig(forbid_green=forbid_green),
    )
    assert (shortest_path(graph, "a", "b") is None) is blocked
    assert (shortest_path(graph, "a", "g") is None) is blocked
    if blocked:
        with pytest.raises(ConstraintError, match="restricted"):
            evaluate_design(graph, {}, {"candidate"})


def test_service_threshold_uses_congested_time_and_population() -> None:
    graph = City(
        [Node("a"), Node("b"), Node("c")],
        [Edge("ab", "a", "b", 10, 10), Edge("bc", "b", "c", 2, 100)],
        [
            Zone("R", "a", population=80),
            Zone("R2", "b", population=20),
            Zone("H", "c", services=("healthcare",)),
        ],
    )
    result = assign(
        graph,
        {"R": {"H": 20}},
        accessibility=AccessibilityConfig(required_services=("healthcare",), max_travel_time=15),
    )
    service = result.accessibility["healthcare"]
    assert service["zone_travel_times"]["R"] > 15
    assert service["coverage_fraction"] == pytest.approx(0.2)
    assert service["reachable_population"] == 100


def test_design_score_accounts_for_unused_capital_and_access() -> None:
    graph = City(
        [Node("a"), Node("b")],
        [
            Edge("slow", "a", "b", 20, 100),
            Edge("fast", "a", "b", 1, 100, existing=False, construction_cost=5),
            Edge("unused", "b", "a", 1, 100, existing=False, construction_cost=7),
        ],
        [Zone("R", "a", population=100), Zone("H", "b", services=("healthcare",))],
    )
    options = {
        "config": AssignmentConfig(alpha=0),
        "accessibility": AccessibilityConfig(required_services=("healthcare",), max_travel_time=10),
        "objectives": DesignWeights(travel_time=1, construction_cost=1, accessibility=100),
    }
    base = evaluate_design(graph, {"R": {"H": 1}}, set(), **options)
    design = evaluate_design(graph, {"R": {"H": 1}}, {"fast", "unused"}, budget=12, **options)
    assert design.kpis["selected_new_link_construction_cost"] == 12
    assert design.kpis["used_new_link_construction_cost"] == 5
    assert design.kpis["design_objective"] == pytest.approx(13)
    assert base.kpis["design_objective"] == pytest.approx(120)
    assert design.kpis["design_objective"] < base.kpis["design_objective"]
    with pytest.raises(ConstraintError):
        evaluate_design(graph, {}, {"fast", "unused"}, budget=11)
    with pytest.raises(PathwayError, match="service types"):
        evaluate_design(graph, {}, set(), objectives=DesignWeights(accessibility=1))


def test_service_routing_ignores_construction_preferences() -> None:
    graph = City(
        [Node("a"), Node("b")],
        [Edge("fast", "a", "b", 1, 100, construction_cost=100), Edge("slow", "a", "b", 20, 100)],
        [Zone("R", "a", population=100), Zone("H", "b", services=("healthcare",))],
    )
    result = assign(
        graph,
        {"R": {"H": 1}},
        weights=Weights(construction_cost=1),
        config=AssignmentConfig(alpha=0),
        accessibility=AccessibilityConfig(required_services=("healthcare",)),
    )
    assert result.flows["slow"] == 1
    assert result.accessibility["healthcare"]["zone_travel_times"]["R"] == 1


def test_zero_population_does_not_claim_service_coverage() -> None:
    graph = City([Node("a")], [], [Zone("R", "a")])
    config = AccessibilityConfig(required_services=("healthcare",))
    result = evaluate_design(graph, {}, set(), accessibility=config)
    assert result.accessibility["healthcare"]["coverage_fraction"] is None
    assert result.accessibility["healthcare"]["average_reachable_travel_time"] is None
    assert result.kpis["accessibility_deficit"] is None
    with pytest.raises(PathwayError, match="positive population"):
        evaluate_design(
            graph, {}, set(), accessibility=config, objectives=DesignWeights(accessibility=1)
        )


def test_unconverged_design_has_no_comparable_score() -> None:
    graph = City(
        [Node("a"), Node("b")],
        [Edge("fast", "a", "b", 1, 100), Edge("slow", "a", "b", 2, 1000)],
        [Zone("R", "a"), Zone("C", "b")],
    )
    result = evaluate_design(
        graph, {"R": {"C": 300}}, set(), config=AssignmentConfig(max_iterations=1)
    )
    assert result.kpis["served_demand"] == 300
    assert result.kpis["design_feasible"] is False
    assert result.kpis["design_objective"] is None


@pytest.mark.parametrize(
    "group,existing", [("existing_roads", False), ("candidate_pathways", True)]
)
def test_input_link_role_mismatch(parameters: dict, group: str, existing: bool) -> None:
    parameters["city"][group][0]["existing"] = existing
    with pytest.raises(ValidationError, match=group):
        optimize(parameters)


@pytest.mark.parametrize("algorithm", ["dijkstra", "astar"])
def test_cli_demo(algorithm: str, tmp_path: Path) -> None:
    output = tmp_path / "result.json"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "app.pathways",
            str(DEMO),
            "--algorithm",
            algorithm,
            "--output",
            str(output),
        ],
        check=True,
        cwd=DEMO.parents[2],
        capture_output=True,
        text=True,
    )
    actual = json.loads(output.read_text())
    expected = optimize(json.loads(DEMO.read_text()))
    assert actual == expected


def test_cli_bad_input(tmp_path: Path) -> None:
    source = tmp_path / "bad.json"
    source.write_text('{"city": {}}')
    result = subprocess.run(
        [sys.executable, "-m", "app.pathways", str(source)],
        cwd=DEMO.parents[2],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "error:" in result.stderr
    assert "Traceback" not in result.stderr
