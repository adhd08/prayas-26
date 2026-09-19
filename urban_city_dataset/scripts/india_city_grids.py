"""Create source-backed 1 km grids for Mumbai and Bengaluru.

Both cities use the GHSL urban-centre boundaries distributed with this
repository.

Run from ``urban_city_dataset/scripts`` after installing requirements:

    python india_city_grids.py

The command downloads only the GHSL population raster and the Overture
buildings/land-use data intersecting these boundaries. It writes CSVs
with the same schema as the existing ``data/processed/city_grids`` files.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys

import geopandas as gpd
import pandas as pd

from city_grid_csv import COLUMNS
from common import BOUND, OUT, ROOT, setup_logging
from features import clip
from graph_export import SPATIAL, city_cells
from overture import extract
from population import download_population


CITY_SPECS = (
    ("ghsl_7599", "Mumbai", "mumbai_ghsl_7599.csv"),
    ("ghsl_9558", "Bengaluru", "bengaluru_ghsl_9558.csv"),
)
GRID_OUT = OUT / "city_grids"


def boundary_for(city_id: str):
    """Load the retained GHSL boundary for a requested city."""
    path = BOUND / f"{city_id}.geojson"
    if not path.exists():
        raise FileNotFoundError(f"Missing retained GHSL boundary: {path}")
    boundary = gpd.read_file(path)
    if len(boundary) != 1:
        raise ValueError(f"Expected exactly one feature in {path}, found {len(boundary)}")
    return boundary.geometry.iloc[0]


def cache_spatial_layers(city_id: str, boundary, release: str) -> None:
    """Fetch, clip, and cache only the Overture layers required for grid fields."""
    for dataset in ("buildings", "land_use"):
        source, _ = extract(city_id, boundary, dataset, release, timeout=1800)
        clipped, _ = clip(gpd.read_parquet(source), boundary)
        if clipped.empty and dataset == "buildings":
            # An empty observed layer is valid and produces zero density; a missing
            # layer is not silently treated as zero by ``city_cells``.
            clipped = gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
        destination = SPATIAL / f"{city_id}_{dataset}.parquet"
        destination.parent.mkdir(parents=True, exist_ok=True)
        clipped.to_parquet(destination, index=False, compression="zstd")


def validate_grid(grid: pd.DataFrame, city_name: str) -> None:
    """Reject incomplete files instead of publishing fabricated or partial fields."""
    if grid.empty:
        raise ValueError(f"{city_name}: no GHSL population cells intersect the boundary")
    missing = [column for column in COLUMNS if column not in grid]
    if missing:
        raise ValueError(f"{city_name}: exporter omitted columns {missing}")
    required = ["population", "green_cover_pct", "building_density_pct", "elevation_m"]
    unavailable = [column for column in required if grid[column].isna().any()]
    if unavailable:
        raise ValueError(f"{city_name}: unavailable required measurements: {unavailable}")
    if not grid["building_density_pct"].between(0, 100).all():
        raise ValueError(f"{city_name}: building density must be between 0 and 100")
    if not grid["green_cover_pct"].between(0, 100).all():
        raise ValueError(f"{city_name}: green cover must be between 0 and 100")


def main(city_ids=None) -> None:
    setup_logging()
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    download_population()
    GRID_OUT.mkdir(parents=True, exist_ok=True)
    for city_id, city_name, filename in CITY_SPECS:
        if city_ids and city_id not in city_ids:
            continue
        boundary = boundary_for(city_id)
        cache_spatial_layers(city_id, boundary, config["overture_release"])
        grid = city_cells(city_id, boundary).drop(columns="geometry")
        validate_grid(grid, city_name)
        grid = grid.sort_values(["y", "x"])[COLUMNS]
        path = GRID_OUT / filename
        grid.to_csv(path, index=False)
        print(f"{city_name}: {len(grid):,} cells -> {path}")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
