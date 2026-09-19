"""Dataset-schema contracts for the separate city-zoning training component."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "city_plan_computing"))

from config import ZONE_TO_ID, normalize_zone_type  # noqa: E402
from graph.features import CONTINUOUS_FEATURES, extract_static_matrix  # noqa: E402


def test_dataset_land_use_labels_have_stable_model_classes():
    assert normalize_zone_type("Residential") == "residential"
    assert normalize_zone_type("Office") == "office"
    assert normalize_zone_type("Unbuilt") == "unbuilt"
    assert normalize_zone_type("unexpected label") == "other"
    assert all(value in ZONE_TO_ID for value in ("residential", "office", "unbuilt", "other"))


def test_building_density_has_an_observed_flag_for_legacy_grid_cells():
    matrix = extract_static_matrix(
        [
            {
                "population": 100,
                "green_cover": 5,
                "building_density": None,
                "elevation": 10,
                "distance_to_boundary": 50,
            },
            {
                "population": 100,
                "green_cover": 5,
                "building_density": 12.5,
                "elevation": 10,
                "distance_to_boundary": 50,
            },
        ]
    )

    assert CONTINUOUS_FEATURES.index("building_density") == 2
    assert matrix[:, 2].tolist() == [0.0, 12.5]
    assert matrix[:, 3].tolist() == [0.0, 1.0]
