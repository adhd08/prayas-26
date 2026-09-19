# Pathway optimization prototype

Zoning is a fixed input from upstream regression/ML. This module evaluates a
specified directed road/pathway network; it does not predict zoning or claim to
find an optimal road network. It runs without cloud credentials or third-party
Python packages. The repository backend supports Python 3.12.

## Run

From `backend/`:

```bash
python -m app.pathways examples/pathways/city.json
python -m app.pathways examples/pathways/city.json --algorithm astar --output result.json
python -m unittest discover -s tests -p test_pathways.py -v
```

For the full locked backend environment, from the repository root:

```bash
uv sync --directory backend --locked
uv run --directory backend pytest
uv run --directory backend ruff check .
```

Python integration (from `backend/`):

```python
import json
from pathlib import Path
from app.optimizer import optimize
from app.pathways import City, shortest_path
from app.pathways.design import evaluate_design

parameters = json.loads(Path("examples/pathways/city.json").read_text())
result = optimize(parameters)
city = City.from_dict(parameters["city"])
route = shortest_path(city, "homes", "clinic", algorithm="astar")
base = evaluate_design(city, parameters["od"], set())
bypass = evaluate_design(city, parameters["od"], {"bypass1", "bypass2"}, budget=100)
print(result["kpis"])
print(base.kpis["total_travel_time"], bypass.kpis["total_travel_time"])
```

## Input contract

See [city.json](../backend/examples/pathways/city.json) for a complete synthetic input.

| Field | Meaning |
| --- | --- |
| `city.nodes` | Unique string IDs, optional finite planar `x`, `y` coordinates |
| `city.zones` | Unique zone IDs, connector `node`, upstream `land_use` metadata |
| `city.edges` | Unique directed link IDs, `source`, `target`, positive `free_flow_time` and `capacity` |
| Edge attributes | Nonnegative `length`, `construction_cost`, `environmental_penalty` (default 0) |
| Hard constraints | Boolean `protected` or `forbidden` excludes a link from all routing |
| `existing` | Defaults true; false identifies a construction candidate for network design |
| `od` | Sparse matrix `{origin_zone: {destination_zone: trips}}`; omitted cells are zero |
| `weights` | Nonnegative objective weights and positive normalization scales |
| `assignment` | `algorithm`, `max_iterations`, `tolerance`, BPR `alpha`, `beta` |

All quantities must be finite. Demand must be nonnegative. IDs/endpoints must
resolve. Parallel edges are supported; two-way roads require two explicit directed
links. Give each direction its own capacity. Construction cost is per directed
link, so allocate a shared physical road's cost between directions to avoid double
counting. Use minutes, km, and trips/hour in this example; OD and capacities must
refer to the same assignment period. Construction currency and environmental
penalty units are caller-defined and require calibration. Coordinates are planar,
not longitude/latitude distance calculations.

A zone maps to one network connector. Intrazonal/co-located trips have zero route
cost and count as served. Disconnected trips count as unserved and appear in
`unreachable_od`; they never silently disappear into travel-time averages.
Protection must be supplied by upstream GIS intersection checks. `protected=true`
means no traversal even for an existing link; it is not merely a soft green penalty.

## Routing and congestion

Generalized link cost is

```text
w_time * time / time_scale
+ w_construction * construction_cost / construction_scale
+ w_environment * environmental_penalty / environment_scale
```

Defaults optimize travel time alone; the demo supplies all three weights. The
construction term is a route-preference proxy, not capital expenditure charged
per trip. The KPI for construction counts each used new link once. A design budget
counts every selected new link, including unused ones.

Dijkstra and A* use identical nonnegative costs. A* derives a cost-per-coordinate-
distance lower bound from allowed links, giving a consistent straight-line heuristic;
it safely becomes Dijkstra with absent/coincident coordinates or a zero bound.

Assignment starts with a feasible all-or-nothing free-flow load, updates travel
times using `t = t0 * (1 + alpha * (flow/capacity)**beta)`, then loads shortest
paths and blends flows with successive-average steps `1/(iteration+1)`. Defaults
are `alpha=0.15`, `beta=4`. Capacity is a congestion scale, not a hard flow limit.

Relative gap is `(sum(flow * current_cost) - sum(demand * shortest_current_cost))
/ sum(flow * current_cost)` for reachable demand, or zero when the denominator is
zero. Stop at tolerance or the iteration limit. Reported costs, gap, and KPIs all
refer to the returned flow. `converged=false` explicitly marks a limit hit without
meeting tolerance. Convergence only concerns served demand; inspect accessibility
as well. MSA gap need not decrease monotonically. This is static generalized-cost
user assignment, not system-optimal routing or a dynamic queue simulation.

## Outputs and demo expectations

The result contains per-edge flows and travel times, convergence history,
unreachable OD entries, and KPIs: served/unserved demand, served fraction, total
and average travel time, delay relative to free flow on assigned links, distance,
generalized cost, flow-weighted environmental penalty, used new-link construction
cost, maximum volume/capacity ratio, and number of over-capacity links.

The demo serves 1,000 of 1,025 trips. Both prohibited links carry zero flow, and
25 trips to the isolated industrial zone remain unserved. With the supplied
weights it converges in 65 evaluations at a relative gap of about 0.000732;
about 554 trips use the main corridor and 446 use the bypass. Mean served-trip
travel time is about 6.23 minutes. Values are synthetic, not planning forecasts.
Empty demand has served fraction 1 and average travel time null.

## Architecture and future work

- `models.py`: validated zones, graph, and configurable objective weights.
- `routing.py`: shortest routes with stable edge IDs, including parallel links.
- `assignment.py`: BPR/MSA evaluation with explicit convergence status.
- `reporting.py`: assignment KPIs; `optimizer.py` is a synchronous worker boundary.
- `design.py`: `NetworkDesigner` protocol and candidate-network evaluator.

Direct `assign`/`optimize` treats every allowed input edge as active, including new
links. `evaluate_design` retains existing links and activates only selected new
links; it enforces protection and optional budget before assignment. Future ACO
or genetic algorithms can propose edge subsets through `NetworkDesigner` and use
this evaluator for fitness. Their fitness must penalize unserved demand explicitly:
lower total travel time from disconnecting people is not an improvement.

Next steps: GIS-derived candidate generation/protection, calibrated OD estimation
from fixed zones, centroid connectors, multimodal travel, capital-budget and
accessibility objectives, resilience/equity KPIs, and ACO/GA search with seeded
baselines. Cache shortest-path work per origin for larger networks. No ACO/GA,
zoning ML, network-design optimality, map UI, or durable worker is implemented.
The API job endpoints remain 501 until the durable execution pipeline is added.
