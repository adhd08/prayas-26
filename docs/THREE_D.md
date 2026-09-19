# 2D image to 3D planning assets

Prayas can use TripoSR to turn one **trusted reference image** into an OBJ or
GLB mesh. This is for visualising a proposed building, facility, streetscape,
or design option beside the 2D planner. It does not infer surveyed geometry,
legal setbacks, building height, utility clearances, or accessibility. Those
remain inputs to the planning and pathway modules.

## Where it fits

```text
zoning model -> fixed land use -> 2D planning scenario / design reference
                                      |
                                      v
                         private image staged by a GPU worker
                                      |
                                      v
                         app.three_d -> TripoSR -> OBJ / GLB
                                      |
                                      v
                      private object storage -> future 3D viewer
```

`app.three_d` deliberately owns only image-to-mesh reconstruction. It does not
depend on zoning, routing, or Neo4j. The small `ImageToThreeDProvider` protocol
lets us replace TripoSR later without changing job payload validation, object
storage, or the future viewer.

## Install the optional worker runtime

Do this in a dedicated GPU environment, not in `backend`'s API environment:

```bash
git clone https://github.com/VAST-AI-Research/TripoSR.git external/TripoSR
cd external/TripoSR
pip install -r requirements.txt
```

Install PyTorch for the worker's CUDA version before the TripoSR requirements.
The official project documents its CUDA-enabled setup and notes that a typical
single-image run uses about 6 GB of VRAM. Its model name defaults to
`stabilityai/TripoSR`.

Set these variables for the worker:

```bash
TRIPOSR_REPOSITORY_PATH=/absolute/path/to/external/TripoSR
TRIPOSR_MODEL=stabilityai/TripoSR
```

## Run one staged asset

From `backend/`, after a trusted worker has downloaded an image from private
storage:

```bash
python -m app.three_d /staging/clinic-reference.png \
  --asset-id clinic-west-01 \
  --output-dir /staging/output \
  --format glb
```

The worker writes `/staging/output/clinic-west-01/mesh.glb` and prints a JSON
descriptor. Upload that file to private storage, record its storage key against
the planning scenario, and return a signed URL only to the scenario owner.

The current API intentionally does not accept browser file paths or run a model
inside FastAPI. Its job persistence and worker queue are still scaffolds. When
they are implemented, add a durable `three_d_generation` job that: verifies the
input object belongs to the user, stages it locally, calls
`ThreeDGenerationService`, uploads the mesh, and records the result.

## Tests

The backend tests cover request validation, deterministic output paths, provider
substitution, and missing-runtime errors. They do not download model weights or
require a GPU.
