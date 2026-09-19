#!/usr/bin/env bash
# Bulk-load the exported CSVs into a fresh Neo4j database named 'urban'.
# Stop Neo4j first if it's running - neo4j-admin import writes directly to the store.
#
# POI nodes are not included: pois.csv / poi_located_in.csv (490 MB) were deleted
# with the rest of the intermediates. Regenerate them with scripts/graph_export.py
# after restoring poi_master.csv - see data/REBUILD.md.
set -euo pipefail
cd "$(dirname "$0")"

neo4j-admin database import full \
  --nodes=City=cities.csv \
  --nodes=GridCell=grid_cells.csv \
  --relationships=CONTAINS=city_contains.csv \
  --relationships=CONNECTED_TO=grid_connected.csv \
  --overwrite-destination \
  urban

echo "import done. start neo4j, then run post_import.cypher (cypher-shell -f post_import.cypher)"
