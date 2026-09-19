import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from grid_features import building_density_pct  # noqa: E402


def test_grid_building_density_unions_overlapping_footprints():
    cells = gpd.GeoDataFrame(
        {"cell_id": ["cell-a"]},
        geometry=[box(0, 0, 1000, 1000)],
        crs=3857,
    )
    buildings = gpd.GeoDataFrame(
        geometry=[box(0, 0, 100, 100), box(50, 0, 150, 100)],
        crs=3857,
    )

    density = building_density_pct(buildings, cells, 3857)

    assert density == {"cell-a": 1.5}
    assert building_density_pct(None, cells, 3857) is None
