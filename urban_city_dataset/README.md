# Urban city dataset

A local, rerunnable Python pipeline for comparing population, infrastructure and urban outcomes across real GHSL urban centres. **No city observations are invented or imputed.** Synthetic geometries exist only in unit tests.

## Deliverables

The four CSVs at the project root link to their canonical copies:

| File | Contents |
|---|---|
| `cities_master.csv` | One row per processed city; population, normalized infrastructure metrics, spatial accessibility, and recent GHSL indicators |
| `poi_master.csv` | One row per retained POI, including city, coordinates, category and source identifier |
| `city_sources.csv` | Per-city, per-field/dataset source URL, retrieval timestamp, license and derivation notes |
| `data_quality.csv` | Retrieval status, observed record counts, missing fields and limitations |
| `data/boundaries/cities.geojson` | All selected GHSL urban-centre polygons, WGS84 |
| `data/processed/city_grids/` | One CSV per city, one row per 1 km GHS-POP grid cell: `x`/`y` local grid coordinates, population, dominant land-use `type` (+ `type_source`), `green_cover_pct`, `building_density_pct` (+ source), `elevation_m`, `dist_to_boundary_m` |
| `data/processed/graph/` | Neo4j `neo4j-admin database import` CSVs for City/GridCell nodes and their relationships (`import.sh`, `post_import.cypher`) |
| `data/processed/city_level/ghsl_all_indicators.csv` | Full GHSL time series and themes for selected cities |
| `data/processed/city_level/ghsl_indicator_dictionary.csv` | Official indicator descriptions, units and upstream sources extracted from the downloaded GHSL technical report |
| `data/processed/city_level/feature_dictionary.csv` | Exported field meanings and calculation methods |
| `data/processed/city_level/eurostat_context.csv` | Separate Urban Audit administrative-city observations; **not merged into GHSL-boundary features** |
| `data/processed/pilot/` | Preserved three-city milestone outputs and validation report |

Raw downloads and per-city spatial/POI intermediates (`data/raw/`, `data/processed/spatial/`, `data/processed/poi_level/`, `poi_master.csv`, run logs) are **not kept in this repo** — they're multi-gigabyte and fully re-derivable. `data/REBUILD.md` lists every removed path, its upstream source and the script that regenerates it; `data/deleted_files.txt` has the full manifest. WorldPop is unused because the matching GHSL population grid is available. Raw Overture extracts keep contributing source metadata and original geometry; processed geometries are clipped.

## Run

Python 3.12 was used. From this project folder:

```bash
python3 -m venv ../.venv
../.venv/bin/python -m pip install -r requirements.txt
../.venv/bin/python scripts/prepare.py --target 50
../.venv/bin/python scripts/population.py
../.venv/bin/python scripts/pipeline.py --phase pilot
../.venv/bin/python scripts/pipeline.py --phase all
../.venv/bin/python scripts/eurostat.py
../.venv/bin/python scripts/report.py
../.venv/bin/python -m pytest tests -q
../.venv/bin/python scripts/graph_export.py    # Neo4j import CSVs -> data/processed/graph/
../.venv/bin/python scripts/city_grid_csv.py    # per-city 1km grid CSVs -> data/processed/city_grids/
```

The `all` phase requires a passing saved pilot validation. Cached successful city processing is reused. `--recompute` recalculates a phase using cached raw files; it also retries missing raw extracts. `--no-osm` disables new OSM supplementation. Overture queries have a configurable `--timeout` (seconds). Errors become quality rows rather than fabricated zero counts. A failed three-city validation prevents scale-up.

The selected cities and pinned source releases are in `config.json`. `prepare.py` recreates that file and selection deterministically. For a new Overture release, edit `overture_release` after checking the official STAC catalogue, then use `--recompute`; raw caches are partitioned by release. To refresh OSM, archive the relevant city's `.json.gz` and `.meta.json` before rerunning. Keep both files together. Do not silently combine old processed files with changed releases.

## Sources and geographic scope

1. **[GHSL UCDB R2024A V1.2](https://human-settlement.emergency.copernicus.eu/download.php?ds=ucdb)**, European Commission JRC. Fixed 2025 urban-centre boundaries, split by country; 15 thematic tables. The downloaded official report and license/readme are retained under `data/raw/ghsl`. Archive members are retrieved with HTTP ranges, avoiding the redundant global Excel file. Population comes from `GC_POP_TOT_2025`; built-up surface from `GH_BUS_TOT_2025` (m², divided by one million). Reuse requires source acknowledgement. DOI: [10.2905/1a338be6-7eaf-480c-9664-3a8ade88cbcd](https://doi.org/10.2905/1a338be6-7eaf-480c-9664-3a8ade88cbcd).
2. **[Overture Maps](https://docs.overturemaps.org/getting-data/duckdb/)**, pinned `2026-08-19.0` release. Places, road segments, building footprints, land use. Every small STAC item manifest is cached; each item's own bounding box selects candidate files. DuckDB applies bbox predicates and column projection against remote GeoParquet. Exact polygon clipping follows locally. No global Overture data download. [Licenses vary by theme and contributing source](https://docs.overturemaps.org/attribution/); feature-level `sources_json` is retained. Places include CDLA-Permissive-2.0 sources; OSM-derived themes can carry ODbL requirements. This dataset is not relicensed under a single permissive license.
3. **[OpenStreetMap / Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API)**. One bbox query per city, serial requests with at least five seconds between requests, compressed cache, bounded timeout and one fallback endpoint. Full feature geometry and tags are retained. Attribution: © OpenStreetMap contributors, ODbL 1.0.
4. **[GHSL population grid R2023A, 2025, 1 km](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_54009_1000/V1-0/)**. This matches the population release used by UCDB. The global compressed GeoTIFF is cached once; processing reads city windows. Grid cells selected by their centres inside the original boundary. Grid sums are compared with UCDB totals. These are modelled population estimates, not a new 2025 census.
5. **[Eurostat Urban Audit](https://ec.europa.eu/eurostat/cache/metadata/en/urb_esms.htm)**. Population, transport, environment, education and living conditions since 2015 for matched European city codes. Response city labels are verified. Administrative-city/greater-city boundaries do not equal GHSL polygons, so observations remain in a separate context table with `boundary_compatible_with_ghsl=False`. Missing observations are not converted into zero. Source URLs, years, indicator labels and status flags are retained.
6. **[Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/)**, ESA/Copernicus Programme, distributed as Cloud-Optimized GeoTIFFs on the public `copernicus-dem-30m` AWS bucket. `scripts/graph_export.py` reads each grid cell's elevation with a ranged HTTP request via GDAL's `/vsicurl/` (grouped by 1° tile, one open per tile), so no DEM file is downloaded or stored locally. Free for general use under the [COP-DEM licence](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

All city-level metrics use the **same GHSL urban-centre polygon for that city**, not municipal boundaries or arbitrary circles. Consequently, “Tokyo,” “London,” “New York City,” etc. represent their GHSL urban centres and must not be compared directly with municipal population statistics. Hong Kong's selected urban centre does not cover its entire administrative territory. Population and area are never borrowed from a different boundary. Boundaries are retained in GeoJSON/GeoParquet; their source remains in the original Mollweide GeoPackage.

## City selection

Current final run is intentionally limited to the ten requested cities: Tokyo, Singapore, Copenhagen, Amsterdam, Barcelona, Zurich, Stockholm, London, Paris and New York City. Earlier cached extracts for other candidates are excluded from final CSVs. No sustainability or quality-of-life score is used to rank these cities. Selection reason, income group and region are recorded.

## Facility definitions and source choice

The Singapore pilot exposed substantial disagreement between Overture's business-place `hospital` category and explicit OSM hospital tags. Therefore the unified facility dataset prefers **OSM explicitly tagged hospitals, clinics, schools, universities, pharmacies, police, fire stations, parks and transit when that city/category has mapped OSM records**. Overture supplies other POIs and falls back for any category without observed OSM records. This is a documented supplementary-source choice, not a claim that OSM is complete. Both source-specific hospital/school/clinic/park/station counts are retained as diagnostics where available.

Overture classifications use exact reviewed category sets for critical facilities. Hospital suppliers do not become hospitals; driving/language/dance schools do not become general schools; petrol stations do not become transit stations. Permanently closed Overture businesses are excluded; unknown operating status is retained. School counts exclude preschools and vocational/specialist business categories unless explicitly tagged as schools by OSM. A park category includes mapped gardens and nature reserves. Categories and source IDs remain inspectable in POI/raw files.

Deduplication first uses source IDs, then normalized equal names within the same category within 50 metres. Unnamed POIs and distinct names are retained. This cannot reliably consolidate every hospital department, campus, station platform or cross-source duplicate; **counts describe mapped features, not audited service capacity**. A facility count alone does not reveal beds, staff, opening hours, quality or catchment capacity. Mapped stop/platform distinctions and both directions of a bus route can create multiple stop features.

## Calculations

- Area: original equal-area Mollweide GHSL polygon, km². Display coordinates: projected-boundary centroid transformed to WGS84. Distances, road lengths and footprint areas: local azimuthal equidistant metric projection centred on each city. Small projection distortions remain.
- Population density: population / city area. Built-up population density: population / GHSL built-up area.
- Counts per 100,000: observed count × 100,000 / GHSL 2025 population. Densities: observed count / city area in km². Real-world mapping completeness is unknown; an observed zero does not establish absence.
- Roads: all Overture transportation segments with `subtype=road`, including mapped pedestrian/cycle/service ways. Sum the lengths of clipped lines. Divided carriageways remain separate mapped segments.
- Intersection density: number of rounded (0.1 m) road endpoints with degree ≥3 / city area. Mean degree is 2E/V; edge/node ratio is E/V. These are **endpoint-topology approximations**, not routable connectivity: interior geometric crossings are not added, grade separation is not resolved, restrictions are not applied and boundary clipping creates artificial endpoints.
- Buildings: count intersecting source footprints; area uses clipped geometry. Summed footprint area may double-count overlaps. Union area and `built_area_pct` remove overlap where there are ≤200,000 clipped footprints; for larger cities these two expensive union-derived values are null, with `building_union_status` explaining why. Summed area, footprint-sum percentage, count and density remain available. `GridCell.building_density_pct` is calculated separately as the unioned Overture building-footprint area divided by a cell's full 1 km² area. It is zero only when a building layer was observed and has no footprint in the cell; it is blank when that layer was unavailable. GHSL built-up area is independently sourced and is not substituted for Overture footprint union.
- Parks: union area of clipped OSM park/garden/nature-reserve polygons, with Overture land-use park polygons as fallback. `mapped_park_area_pct` describes mapped park parcels, which can include pavement/buildings. It is not an exhaustive vegetation measurement. GHSL's original greenness fields describe vegetation conditions around built-up areas; they must not be relabelled as public park percentage. `green_space_pct` remains null unless a defensible city-wide vegetation layer is explicitly calculated.
- Accessibility: straight-line distance from each populated 1 km GHSL cell centre to the nearest retained hospital/school/park/transit-station POI. Mean and median are population weighted. Percentages within 1/3/5 km divide covered cell population by the selected grid population. Park polygons use representative points, not entrances or distance to park edges. Only facilities within the city boundary are considered, so edge access can be underestimated. There is no road-network routing, barrier model or capacity weighting. A cell-centre approximation has substantial uncertainty at the 1 km threshold.
- If a population grid is unavailable, use a regular interior area grid (about 500 m spacing, coarsened for large cities). `accessibility_weighting=area_grid`; coverage uses `area_grid_within_*` fields. Population-coverage fields remain null. Uniform area coverage is never labelled population coverage.
- POI diversity: Shannon entropy `-Σ p(category) ln p(category)`, in nats, including `other` and `uncategorized`. Category rules and source coverage influence the result.

`ghsl_*` fields in the main table retain the original source names and their measurement years. The newest available column for each indicator family up to 2025 is included; full historical/future columns remain only in `ghsl_all_indicators.csv`. Consult the official per-indicator dictionary before selecting outcomes. Some GHSL socioeconomic attributes derive from national/subnational models rather than independent city measurements.

## Quality, caching and limitations

Raw files have metadata sidecars containing source URL, retrieval time, checksum and query details. Overture caches are keyed by release, city and dataset, with a boundary hash. A failed or incomplete Overpass response is not accepted as a valid empty dataset. GeoJSON polygons and GeoParquet layers are clipped; raw extracts deliberately retain bbox candidates for reproducibility.

GHSL's Natural Systems theme has duplicate source IDs for 11 urban centres. Agreeing duplicate cells are retained; conflicting cells become null. The original duplicate rows are saved under `data/raw/ghsl` for inspection. No average or arbitrary row selection is applied.

Validation checks unique city/POI IDs, coordinate ranges, polygon containment, positive population/area, percentage ranges, nonempty core pilot features, and population-grid consistency. Logs record failures and missing fields. Synthetic tests validate clipping, conservative deduplication, count/length/area formulas, absent-versus-empty inputs, and class exclusions.

These observations mix source years: population/boundaries are 2025, Overture is 2026, OSM is the retrieved snapshot, and GHSL outcomes have explicit earlier measurement years. They support exploratory comparisons. **Do not treat current infrastructure as causally predicting earlier outcomes**, silently mix geographic units, or train/test on duplicated urban centres. Avoid target leakage when choosing GHSL indicators and normalize model validation by country/region where possible. Fifty city rows are a starting dataset, not enough to establish a reliable universal facility-placement policy. High-resolution placement models will need grid-level labels, facility capacity, travel networks and local validation.
