"""Future worker entry point; no planning algorithm is implemented yet.

Available libraries: geopandas, shapely, networkx, osmnx, sklearn, ortools.
Run CPU-heavy work in a separate worker process, never inside a Next.js route.
"""


def optimize(parameters: dict) -> dict:
    raise NotImplementedError("Define planning inputs and implement the optimizer first")
