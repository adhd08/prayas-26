"""Dataset-schema contracts for the separate city-zoning training component."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "city_plan_computing"))

from config import ZONE_TO_ID, normalize_zone_type  # noqa: E402


def test_dataset_land_use_labels_have_stable_model_classes():
    assert normalize_zone_type("Residential") == "residential"
    assert normalize_zone_type("Office") == "office"
    assert normalize_zone_type("Unbuilt") == "unbuilt"
    assert normalize_zone_type("unexpected label") == "other"
    assert all(value in ZONE_TO_ID for value in ("residential", "office", "unbuilt", "other"))
