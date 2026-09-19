# Prayas pathway module

This is a backend module of Prayas, entered through
[app/pathway_optimizer.py](../backend/app/pathway_optimizer.py).
Upstream ML/regression owns zoning; the pathway module consumes its output and
evaluates a transport network. It does not classify land or relocate zones.

## Repository integration

The repository was checked against fetched main commit `8109d04` and the
`ml_stuff` branch at `23c3913`. The latter contains a placeholder
`backend/city_plan_computing/scripts/generator.py` with no prediction interface.
The separate frontend lockfile branch changes packaging, not the planning contract.
There is no committed zoning schema or trained-model output to adapt yet.

The existing architecture is:

1. Next.js uses `frontend/src/lib/api/client.ts` and generated OpenAPI types.
2. FastAPI authenticates requests through Supabase and accepts the generic
   `JobRequest.parameters` JSON envelope.
3. The reserved `public.jobs.parameters` JSONB field carries that same object.
   Job endpoints still return 501; no queue or worker execution is wired.
4. A future worker obtains fixed zoning from the upstream model, constructs
   `PathwayParameters`, then calls `app.pathway_optimizer.optimize`.
5. The result is JSON-safe and can later be stored in private `plan-assets`
   under the user's prefix and referenced by `JobStatus.result_path`.

This change uses the backend's existing Pydantic validation conventions, Python
3.12, pytest and Ruff. It introduces no dependency or public API schema change.
The typed worker contract lives in `app/pathways/inputs.py`; the generic job
envelope remains available for other planning jobs. Authenticating, storing and
claiming jobs remains the responsibility of the API and future durable worker.

## Run inside the existing backend

From the repository root:

```bash
uv sync --directory backend --locked
uv run --directory backend python -m app.pathways examples/pathways/city.json
uv run --directory backend python -m app.pathways examples/pathways/city.json --algorithm astar --output result.json
uv run --directory backend pytest
uv run --directory backend ruff check .
```

Or activate the backend's Python 3.12 environment and run the same Python module
from `backend/`. This module now uses Pydantic already installed by the backend;
it is not a separate dependency-free project.

## Connect the zoning model

The following example runs from `backend/`:

```python
import json
from pathlib import Path

from app.pathway_optimizer import optimize
from app.pathways import PathwayParameters
from app.schemas import JobRequest

# Replace this fixture with the upstream model's adapter when its output is defined.
raw = json.loads(Path("examples/pathways/city.json").read_text())
parameters = PathwayParameters.model_validate(raw)

# Preserve the existing JSON job envelope for persistence/worker handoff.
job = JobRequest(parameters=parameters.model_dump(mode="json"))
result = optimize(job.parameters)
print(result["kpis"])
print(result["accessibility"])
```

The model-to-pathway adapter must supply:

| Input | Required interpretation |
| --- | --- |
| `city.nodes` | Stable intersection/connector IDs; optional finite planar x/y |
| `city.zones` | Fixed zone ID, connector node, land_use, population; optional services, protected, green |
| `city.existing_roads` | Directed edges with existing=true (the edge default) |
| `city.candidate_pathways` | Directed edges explicitly marked existing=false |
| `od` | Sparse zone-to-zone trips in the assignment period |
| `selected_candidates` | New link IDs to evaluate; default empty activates none |
| `budget` | Optional maximum total capital cost of selected new links |

Each edge has an ID, source, target, positive free_flow_time and capacity.
Optional length, construction_cost and environmental_penalty are nonnegative.
Optional zone_ids lists every zone intersected by the link geometry, even when
neither endpoint lies in that zone. All references must resolve. Duplicate IDs,
role mismatches, unknown settings, negative/nonfinite numbers, string numbers,
and booleans in numeric fields fail validation.

Use the same demand period for OD and capacity; the demo uses trips/hour,
minutes and km. Construction currency and environmental units are caller-defined.
All coordinates must share a planar CRS. Roads are directed; create two records
for bidirectional roads and allocate a shared construction cost between them.
Parallel edges retain unique IDs.

Population is preserved for service-access evaluation; it does not automatically
generate trips. OD estimation remains upstream and must be calibrated separately.
Land-use labels are metadata, not a substitute for an OD model. Essential-service
categories are arbitrary explicit strings such as healthcare or education, not
deduced from a land-use label.

The adapter must resolve geometry and connectors (for example with the already
installed GeoPandas/Shapely/OSMnx stack), intersect link geometries with restricted
zones, and populate zone_ids. This module does not guess a GIS format or claim
to integrate with an ML interface that has not been committed.

## Protection and candidate construction

`graph.py` builds one constrained adjacency used by routing, assignment and
service accessibility. It excludes:

- links with forbidden=true or protected=true;
- links crossing protected zones, including zones at either endpoint;
- links crossing green zones when constraints.forbid_green=true (the default).

Setting forbid_green=false allows green-zone traversal where the planner permits
it; protected=true remains an unconditional restriction. Green/protected status
must be supplied explicitly by upstream zoning/GIS rather than inferred from
unstandardized text labels. Environmental costs never override these exclusions.

Selecting a restricted, missing, or already-existing link raises a useful error.
Unselected new links are absent from the evaluated graph. All selected capital
counts against the budget, including selected links that carry zero traffic.
The low-level `assign(City(...), od)` evaluates all allowed links in an explicitly
constructed graph; `optimize` and `evaluate_design` enforce candidate selection.

## Separate responsibilities

| Module | Responsibility |
| --- | --- |
| `models.py` | Immutable validated node, edge and upstream zone records |
| `inputs.py` | Typed JSON parameters and cross-reference validation |
| `config.py` | Routing weights, solver options, protection, accessibility and design weights |
| `graph.py` | Constrained graph construction and candidate/budget checks |
| `demand.py` | OD validation and unreachable-demand records |
| `costs.py` | BPR times, finite arithmetic checks, normalized edge costs |
| `routing.py` | Dijkstra/A* over one reusable cost snapshot |
| `assignment.py` | All-or-nothing OD loading and successive-average iterations |
| `accessibility.py` | Population-weighted nearest-service access |
| `reporting.py` | Travel, congestion, cost and environmental KPIs |
| `design.py` | Candidate evaluation and future NetworkDesigner protocol |
| `pathway_optimizer.py` | Prayas worker computation entry point |

## Weights and computation

Change JSON fields or instantiate the corresponding Pydantic configuration model.
Misspelled options fail rather than silently using a default.

Routing generalized cost is:

```text
travel_time_weight * current_time / time_scale
+ congestion_weight * max(0, current_time - free_flow_time) / time_scale
+ construction_weight * construction_cost / construction_scale
+ environmental_weight * environmental_penalty / environment_scale
```

The exact JSON names are `weights.travel_time`, `weights.congestion`,
`weights.construction_cost`, `weights.environmental_penalty`,
`weights.time_scale`, `weights.construction_scale`, and
`weights.environment_scale`. Scales must be positive. Weights are nonnegative;
at least one routing objective must be active.

A* derives an admissible cost-per-coordinate-distance lower bound across allowed
links. With zero-cost or coincident-coordinate bounds it becomes Dijkstra.
A Router prepares costs once for a whole OD loading iteration, avoiding the former
per-pair cost rebuilding. Further per-origin tree caching is future work.

BPR uses `t = t0 * (1 + alpha * (flow/capacity)**beta)`; defaults are alpha=0.15,
beta=4. Capacity is a congestion scale, not a hard flow limit. Assignment starts
with feasible free-flow shortest-path flows and blends successive shortest-path
loads with steps 1/(iteration+1). It stops at tolerance or max_iterations.

Relative gap compares current flow-weighted cost to demand-weighted shortest
current-cost routes, for reachable demand. Times, history, gap and KPIs refer
to the returned flow. A limit hit reports converged=false; the gap need not
decrease monotonically. This is static generalized-cost user assignment, not
system-optimal traffic assignment or dynamic queuing.

Network design uses `objectives` coefficients for travel_time, congestion (delay),
construction_cost (selected capital once), environmental_impact (flow-weighted
environmental penalty), and accessibility (the mean service coverage deficit).
These coefficients have inverse KPI units and require caller calibration.
Routing construction cost is only a preference proxy; it is not actual per-trip
capital spending. The environmental metric is an input proxy, not calibrated
vehicle emissions or a construction lifecycle model.

The candidate evaluator returns design_feasible=false and design_objective=null
if any OD demand is unserved or assignment has not converged. Future ACO/GA code
must enforce this feasibility condition before comparing objective values, so
disconnecting people cannot falsely look like a cheap improvement.
Accessibility scoring requires service categories and positive population.

## KPIs and accessibility

The result contains flows, travel_times, history, blocked_edges (with reasons),
unreachable_od, accessibility and kpis.

KPIs include served/unserved demand, served fraction, total/average travel time,
delay, distance, generalized cost, flow-weighted environmental penalty,
used and selected new-link capital, maximum volume/capacity ratio,
over-capacity links, convergence, and candidate-design feasibility/score.

For each configured service category, every populated zone is evaluated against
its nearest facility using actual final congested travel times, independent of
construction/environment route preferences. Reported values include per-zone
travel time, reachable population, population within accessibility.max_travel_time,
coverage fraction, and mean travel time among the reachable population.
Missing facilities and disconnected zones count as zero coverage; their travel
times are null. With no population, coverage and means are null. Unconfigured
accessibility has no reported service entries and accessibility_deficit=null.

Intrazonal/co-located trips are served at zero travel time. Unreachable OD is
never silently dropped. Empty OD has served_fraction=1 and average_travel_time=null;
service access can still be evaluated independently if population is supplied.

## Synthetic end-to-end fixture

[city.json](../backend/examples/pathways/city.json) has a constrained main corridor,
two explicitly selected bypass links, a protected park crossing, a forbidden
industrial link, fixed residential/commercial/civic/industrial zoning, population
and healthcare metadata. The education category intentionally has no facility.

Both algorithms serve 1,000 of 1,025 trips and produce identical results. Protected
and forbidden flows are zero. The main corridor carries about 554 trips and the
bypass 446; average served-trip travel time is about 6.23 minutes. Assignment
converges in 65 evaluations at gap 0.000732. Healthcare threshold coverage is
2,000/2,100 people; education coverage is zero. The unreachable industrial demand
makes the design infeasible for scoring, while all diagnostic KPIs remain available.

Tests cover Pydantic/job-envelope roundtrips, routes against a NetworkX oracle,
parallel/directed links, constrained crossings/endpoints, zero/invalid/unreachable
OD, flow conservation, BPR equilibrium/overflow, returned-state gap, candidate
selection/budgets, service thresholds, unused capital, and both CLI algorithms.

## Migration from the initial pathway PR

- Rename imports from `app.optimizer` to `app.pathway_optimizer`; no duplicate
  legacy optimizer implementation is retained.
- Split `city.edges` into existing_roads and candidate_pathways. Mark candidates
  existing=false and explicitly list selected_candidates.
- Use `PathwayParameters.model_validate(raw).city.to_graph()` instead of
  `City.from_dict`.
- Pass `AssignmentConfig(...)` via `assign(..., config=...)` instead of spreading
  algorithm/alpha/beta/iteration options across calls. JSON assignment settings
  remain grouped under the same assignment key.
- Import configuration from `app.pathways.config` (common types are also exported
  by `app.pathways`). Numerical BPR lives in `app.pathways.costs`.

## Remaining boundaries

There is no trained zoning model, GIS adapter, OD estimator, ACO/GA implementation,
real emissions model, multimodal capacity model, facility capacity, service opening
hours, resilience analysis, or cloud execution pipeline in this change.
NetworkDesigner lets future search propose candidate IDs and reuse this evaluator.
The map currently accepts deck.gl layers but has no domain renderer; this refactor
does not invent a frontend API or expose computation through an in-memory job queue.

