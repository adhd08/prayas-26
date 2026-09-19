# Rebuilding the raw + intermediate data

On 2026-09-19 the raw downloads and spatial intermediates were deleted after the
1km grid CSVs were extracted. 5.2 GB removed, ~13 MB kept. Everything deleted is
re-derivable from public sources by rerunning the pipeline in `scripts/`.

## What was kept

| path | what |
|---|---|
| `processed/city_grids/` | **the deliverable** - 10 CSVs, one row per 1km cell |
| `processed/graph/` | Neo4j bulk-import CSVs for City + GridCell (POI files removed) |
| `processed/city_level/` | per-city indicators, GHSL UCDB extract, Eurostat context |
| `processed/pilot/` | validation output |
| `boundaries/cities.parquet` | the 10 city boundary polygons - needed by every script |

`boundaries/cities.parquet` is the one small file the whole pipeline pivots on.
Do not delete it: every script slices its source layer by these polygons.

## What was deleted, and how to get it back

| path | size | source | rebuild |
|---|---|---|---|
| `raw/ghsl/GHS_POP_E2025_*.tif` | 250 MB | [GHSL GHS-POP R2023A](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_54009_1000/V1-0/) | `python scripts/population.py` |
| `raw/ghsl/GHS_UCDB_*.gpkg` | 272 MB | [GHSL UCDB R2024A](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/GHS_UCDB_GLOBE_R2024A/V1-2/) | `python scripts/prepare.py` |
| `raw/overture/` | 2.3 GB | [Overture STAC](https://stac.overturemaps.org/), release `2026-08-19.0` | `python scripts/pipeline.py` |
| `raw/osm/` | 13 MB | [Overpass](https://overpass-api.de/api/interpreter) | `python scripts/pipeline.py` |
| `raw/eurostat/` | 672 KB | Eurostat dissemination API | `python scripts/eurostat.py` |

`pipeline.py` is the orchestrator: it fetches Overture extracts, writes
`processed/spatial/` and `processed/poi_level/`, and caches every download.
Run `prepare.py` and `population.py` before it - both are needed to reselect
cities and rebuild the grid.
| `processed/spatial/` | 1.2 GB | derived from `raw/overture` | `python scripts/pipeline.py` |
| `processed/poi_level/` | 644 MB | derived from `raw/overture` places | `python scripts/pipeline.py` |
| `processed/graph/pois.csv`, `poi_located_in.csv` | 490 MB | derived from `poi_master.csv` | `python scripts/graph_export.py` |

Elevation was never stored locally - `graph_export.py` streams Copernicus GLO-30
COGs over `/vsicurl/` from `copernicus-dem-30m.s3.amazonaws.com` and keeps only
the sampled centroid values.

## Known gaps in the deleted data

Building footprints were missing for **Tokyo (ghsl_5929), Paris (ghsl_2878) and
New York City (ghsl_8099)** - their `type` column comes from land_use polygons,
flagged in `type_source`. Tokyo's download had failed and left two corrupt
`.tmp.parquet` files (805 MB, `Parquet magic bytes not found in footer`).
A rebuild should refetch buildings for those three city_ids.

## Full manifest

`deleted_files.txt` lists all 1,645 deleted paths.
