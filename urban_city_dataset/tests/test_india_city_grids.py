"""Tests for the source-backed Indian city-grid export guardrails."""

from pathlib import Path
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from city_grid_csv import COLUMNS  # noqa: E402
from india_city_grids import validate_grid  # noqa: E402


def complete_grid() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "cell_id": "ghsl_7599_cell_00000",
                "x": 0,
                "y": 0,
                "centroid_lat": 19.0,
                "centroid_lon": 72.8,
                "population": 100.0,
                "type": "Residential",
                "type_source": "buildings",
                "green_cover_pct": 20.0,
                "building_density_pct": 30.0,
                "building_density_source": "overture_buildings",
                "elevation_m": 5.0,
                "dist_to_boundary_m": 500.0,
            }
        ],
        columns=COLUMNS,
    )


def test_valid_grid_has_every_requested_measurement():
    validate_grid(complete_grid(), "Mumbai")


def test_missing_observation_is_not_written_as_a_complete_grid():
    grid = complete_grid()
    grid.loc[0, "building_density_pct"] = None
    with pytest.raises(ValueError, match="building_density_pct"):
        validate_grid(grid, "Mumbai")
