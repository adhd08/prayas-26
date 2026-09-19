// Run once after neo4j-admin import, against the new 'urban' database.
// POI statements are omitted - POI CSVs were deleted with the intermediates.

MATCH (c:City) SET c.location = point({latitude: toFloat(c.latitude), longitude: toFloat(c.longitude)});
MATCH (g:GridCell) SET g.location = point({latitude: g.centroid_lat, longitude: g.centroid_lon});

CREATE INDEX city_id_index IF NOT EXISTS FOR (c:City) ON (c.city_id);
CREATE INDEX grid_city_id_index IF NOT EXISTS FOR (g:GridCell) ON (g.city_id);
CREATE INDEX grid_type_index IF NOT EXISTS FOR (g:GridCell) ON (g.type);
CREATE INDEX grid_building_density_index IF NOT EXISTS FOR (g:GridCell) ON (g.building_density_pct);

CREATE POINT INDEX grid_location_index IF NOT EXISTS FOR (g:GridCell) ON (g.location);
