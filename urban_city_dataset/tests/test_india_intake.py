import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from convert_india_intake import convert  # noqa: E402


def test_india_metadata_becomes_a_graph_city_row_without_inventing_spatial_values(
    tmp_path: Path,
):
    (tmp_path / "cities_master_india.csv").write_text(
        "city_id,city_name,country,state_or_ut,boundary_definition,area_km2,elevation_m,population,population_year,population_source,area_elevation_source,retrieved_date\n"
        "in_test,Test City,India,Test State,municipal,12,45,1234,2011,census,municipal,2026-09-19\n"
    )
    (tmp_path / "city_sources_india.csv").write_text(
        "city_id,field,source_name,source_url,retrieved_date,license_note,derivation_note\n"
        "in_test,population,Census,https://example.test,2026-09-19,public,reported\n"
    )
    output = tmp_path / "out"

    convert(tmp_path, output)

    with (output / "cities.csv").open(newline="") as source:
        city = next(csv.DictReader(source))
    with (output / "city_sources.csv").open(newline="") as source:
        provenance = next(csv.DictReader(source))
    assert city["city_id:ID(City)"] == "in_test"
    assert city["area_km2"] == "12"
    assert city["latitude"] == ""
    assert city["built_up_area_km2"] == ""
    assert provenance["field_or_dataset"] == "population"
