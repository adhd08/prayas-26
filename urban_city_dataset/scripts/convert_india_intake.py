"""Convert user-supplied India city metadata to the project's intake schema.

The input archive is city-level metadata only. This script does not fabricate
boundaries, coordinates, built-up area, grid cells, or building density. Those
are produced only after the normal GHSL-boundary and Overture-footprint steps.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

GRAPH_CITY_COLUMNS = [
    "city_id:ID(City)",
    "city_name",
    "country",
    "region",
    "income_group",
    "area_km2",
    "population",
    "population_year",
    "latitude",
    "longitude",
    "built_up_area_km2",
]
SOURCE_COLUMNS = [
    "city_id",
    "field_or_dataset",
    "source_name",
    "source_url",
    "download_date",
    "license",
    "notes",
]
METADATA_COLUMNS = [
    "city_id",
    "state_or_ut",
    "boundary_definition",
    "elevation_m",
    "population_source",
    "area_elevation_source",
    "retrieved_date",
]
QUALITY_COLUMNS = ["city_id", "status", "missing_fields", "notes"]


def _read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source))


def convert(input_dir: Path, output_dir: Path) -> None:
    """Write metadata, sources, and an explicit spatial-data gap report."""
    city_rows = _read_rows(input_dir / "cities_master_india.csv")
    source_rows = _read_rows(input_dir / "city_sources_india.csv")
    output_dir.mkdir(parents=True, exist_ok=True)

    graph_rows = []
    metadata_rows = []
    quality_rows = []
    for city in city_rows:
        graph_rows.append(
            {
                "city_id:ID(City)": city["city_id"],
                "city_name": city["city_name"],
                "country": city["country"],
                # The supplied files have no documented values for these fields.
                "region": "",
                "income_group": "",
                "area_km2": city["area_km2"],
                "population": city["population"],
                "population_year": city["population_year"],
                "latitude": "",
                "longitude": "",
                "built_up_area_km2": "",
            }
        )
        metadata_rows.append(
            {column: city.get(column, "") for column in METADATA_COLUMNS}
        )
        quality_rows.append(
            {
                "city_id": city["city_id"],
                "status": "metadata_only",
                "missing_fields": "region;income_group;latitude;longitude;built_up_area_km2;boundary;grid_cells;building_footprints",
                "notes": "Do not run the Neo4j import for this city until boundary, population-grid, and building-footprint inputs have been processed.",
            }
        )

    normalized_sources = [
        {
            "city_id": row["city_id"],
            "field_or_dataset": row["field"],
            "source_name": row["source_name"],
            "source_url": row["source_url"],
            "download_date": row["retrieved_date"],
            "license": row["license_note"],
            "notes": row["derivation_note"],
        }
        for row in source_rows
    ]
    _write_rows(output_dir / "cities.csv", GRAPH_CITY_COLUMNS, graph_rows)
    _write_rows(output_dir / "city_sources.csv", SOURCE_COLUMNS, normalized_sources)
    _write_rows(output_dir / "city_metadata.csv", METADATA_COLUMNS, metadata_rows)
    _write_rows(output_dir / "data_quality.csv", QUALITY_COLUMNS, quality_rows)


def _write_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize India city metadata for the urban dataset."
    )
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    convert(args.input_dir, args.output_dir)


if __name__ == "__main__":
    main()
