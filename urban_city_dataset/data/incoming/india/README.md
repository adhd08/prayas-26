# India city metadata intake

These files are a normalized copy of the user-supplied India city metadata.
`cities.csv` uses the exact `City` header expected by the Neo4j bulk import.
`city_sources.csv` uses the repository's source-record header, while
`city_metadata.csv` preserves fields that do not belong to the City node.

The supplied archive contains no spatial boundaries, latitude/longitude values,
GHS-POP grid cells, Overture building footprints, or built-up area. Therefore
the blank fields in `cities.csv` remain blank, no GridCell files are produced,
and the records must not be bulk-imported into `urban` yet.

To add one of these cities fully, obtain a documented boundary, process the
matching GHS-POP grid, and run the normal Overture pipeline. The updated
`graph_export.py` then writes `building_density_pct` per cell from the unioned
building-footprint coverage; it leaves the value blank when the footprint layer
is unavailable.
