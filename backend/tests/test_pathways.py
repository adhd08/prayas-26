import json
import unittest
from pathlib import Path

from app.optimizer import optimize
from app.pathways import City, Edge, Node, Weights, Zone, assign, shortest_path
from app.pathways.assignment import bpr
from app.pathways.design import evaluate_design


def parallel():
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


class PathwayTests(unittest.TestCase):
    def test_astar_matches_dijkstra_on_multihop_graph(self):
        city = City(
            [Node("a", 0, 0), Node("b", 100, 1), Node("c", 1, 0), Node("d", 2, 0)],
            [
                Edge("ab", "a", "b", 1, 100),
                Edge("bc", "b", "c", 1, 100),
                Edge("ac", "a", "c", 5, 100),
                Edge("cd", "c", "d", 1, 100),
                Edge("ad", "a", "d", 8, 100),
            ],
            [],
        )
        # A naive unscaled geometric heuristic would miss the cheap detour via b.
        for origin in city.nodes:
            for destination in city.nodes:
                self.assertEqual(
                    shortest_path(city, origin, destination, algorithm="astar"),
                    shortest_path(city, origin, destination),
                )
        self.assertEqual(shortest_path(city, "a", "d").edges, ("ab", "bc", "cd"))

    def test_routing_constraints_direction_and_identity(self):
        city = parallel()
        for algorithm in ("dijkstra", "astar"):
            route = shortest_path(city, "a", "b", algorithm=algorithm)
            self.assertEqual(route.edges, ("fast",))
            self.assertEqual(route.cost, 1)
            self.assertIsNone(shortest_path(city, "b", "a", algorithm=algorithm))
            self.assertEqual(shortest_path(city, "a", "a", algorithm=algorithm).edges, ())

    def test_multiobjective_routing(self):
        city = City(
            [Node("a"), Node("b")],
            [
                Edge("fast", "a", "b", 1, 100, construction_cost=100),
                Edge("green", "a", "b", 2, 100, environmental_penalty=10),
            ],
            [],
        )
        weights = Weights(construction_cost=1, construction_scale=10)
        self.assertEqual(shortest_path(city, "a", "b", weights=weights).edges, ("green",))
        weights = Weights(environmental_penalty=1)
        self.assertEqual(shortest_path(city, "a", "b", weights=weights).edges, ("fast",))

    def test_bpr_and_assignment_equilibrium(self):
        city = parallel()
        self.assertAlmostEqual(bpr(city.edges["fast"], 100), 1.15)
        result = assign(city, {"R": {"C": 300}}, max_iterations=3000, tolerance=0.001)
        self.assertTrue(result.kpis["converged"])
        self.assertAlmostEqual(sum(result.flows.values()), 300)
        self.assertGreater(result.flows["slow"], 0)
        self.assertEqual(result.flows["park"], 0)
        self.assertEqual(result.flows["closed"], 0)
        self.assertLess(abs(result.travel_times["fast"] - result.travel_times["slow"]), 0.01)
        for key, flow in result.flows.items():
            self.assertAlmostEqual(result.travel_times[key], bpr(city.edges[key], flow))
        astar = assign(
            city, {"R": {"C": 300}}, algorithm="astar", max_iterations=3000, tolerance=0.001
        )
        self.assertEqual(astar.flows, result.flows)

    def test_iteration_limit_reports_returned_flow_gap(self):
        result = assign(parallel(), {"R": {"C": 300}}, max_iterations=1)
        self.assertFalse(result.kpis["converged"])
        self.assertGreater(result.kpis["relative_gap"], 0)
        self.assertEqual(result.flows["fast"], 300)

    def test_unreachable_empty_and_intrazonal_demand(self):
        city = parallel()
        result = assign(city, {"C": {"R": 30}, "R": {"R": 10, "C": 20}}, alpha=0)
        self.assertEqual(result.kpis["served_demand"], 30)
        self.assertEqual(result.kpis["unserved_demand"], 30)
        self.assertEqual(result.kpis["served_fraction"], 0.5)
        self.assertAlmostEqual(result.kpis["average_travel_time"], 20 / 30)
        self.assertEqual(len(result.unreachable_od), 1)
        empty = assign(city, {})
        self.assertEqual(empty.kpis["total_travel_time"], 0)
        self.assertIsNone(empty.kpis["average_travel_time"])
        self.assertEqual(empty.kpis["served_fraction"], 1)

    def test_input_validation(self):
        for value in (-1, float("nan"), float("inf"), True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                assign(parallel(), {"R": {"C": value}})
        for options in (
            {"max_iterations": 0},
            {"max_iterations": 1.2},
            {"alpha": -1},
            {"beta": 0},
            {"tolerance": -1},
            {"algorithm": "wrong"},
        ):
            with self.subTest(options=options), self.assertRaises(ValueError):
                assign(parallel(), {}, **options)
        with self.assertRaises(ValueError):
            assign(parallel(), {"missing": {"C": 1}})
        with self.assertRaises(ValueError):
            Weights(time_scale=0)
        with self.assertRaises(ValueError):
            Weights(travel_time=0)
        for edge in (
            Edge("bad", "a", "b", 1, 0),
            Edge("bad", "a", "x", 1, 1),
            Edge("bad", "a", "b", 1, 1, protected="false"),
        ):
            with self.assertRaises(ValueError):
                City([Node("a"), Node("b")], [edge], [])
        with self.assertRaises(ValueError):
            City([Node("a"), Node("a")], [], [])
        with self.assertRaises(ValueError):
            City([Node("a")], [], [Zone("R", "missing")])

    def test_demo_conservation_and_design_constraints(self):
        data = json.loads((Path(__file__).parents[1] / "examples/pathways/city.json").read_text())
        result = optimize(data)
        city = City.from_dict(data["city"])
        self.assertEqual(result["kpis"]["served_demand"], 1000)
        self.assertEqual(result["kpis"]["unserved_demand"], 25)
        for node in ("junction", "bypass"):
            incoming = sum(result["flows"][e.id] for e in city.edges.values() if e.target == node)
            outgoing = sum(result["flows"][e.id] for e in city.edges.values() if e.source == node)
            self.assertAlmostEqual(incoming, outgoing)
        self.assertEqual(result["kpis"]["used_new_link_construction_cost"], 100)
        base = evaluate_design(city, data["od"], set())
        self.assertNotIn("bypass1", base.flows)
        for selected in ({"park_shortcut"}, {"forbidden_link"}, {"missing"}):
            with self.assertRaises(ValueError):
                evaluate_design(city, data["od"], selected)
        with self.assertRaises(ValueError):
            evaluate_design(city, data["od"], {"bypass1", "bypass2"}, budget=99)
        design = evaluate_design(city, data["od"], {"bypass1", "bypass2"}, budget=100)
        self.assertLess(design.kpis["total_travel_time"], base.kpis["total_travel_time"])
        json.dumps(result, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
