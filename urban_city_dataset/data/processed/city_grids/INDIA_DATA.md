# Indian city-grid data

`india_city_grids.py` produces the files below with the same columns as the
other city-grid CSVs in this folder.

| Output | Spatial definition | Boundary source |
| --- | --- | --- |
| `mumbai_ghsl_7599.csv` | Mumbai urban centre | GHSL UCDB R2024A fixed 2025 boundary, ID 7599 |
| `bengaluru_ghsl_9558.csv` | Bengaluru urban centre | GHSL UCDB R2024A fixed 2025 boundary, ID 9558 |

## Field sources

- Boundaries: [GHSL UCDB R2024A](https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php), fixed 2025 urban-centre geometries.
- `population`: [GHSL GHS-POP R2023A](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_54009_1000/V1-0/), epoch 2025, 1 km World Mollweide pixel.
- `type`, `type_source`, `green_cover_pct`: [Overture Maps](https://docs.overturemaps.org/getting-data/duckdb/) land-use and building records for the configured release. `type_source` makes a building-derived, land-use-derived, or final fallback classification visible.
- `building_density_pct`: unioned Overture building-footprint area within the
  full 1 km cell divided by 1 km2. It is not a count and does not double-count
  overlapping footprints.
- `elevation_m`: [Copernicus DEM GLO-30](https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model) at the cell centroid.
- `dist_to_boundary_m`: calculated from that centroid to the GHSL boundary.

The builder refuses to write a CSV if population, green cover, building density,
or elevation are unavailable. This keeps a missing source distinct from a real
zero measurement.
