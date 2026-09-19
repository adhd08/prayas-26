"""Export cities_master / poi_master / a uniform 1km grid into Neo4j bulk-import CSVs.

GridCell = one GHS-POP raster pixel (1000m x 1000m, exact square in the native
Mollweide/ESRI:54009 grid) touching the city boundary - a true uniform tiling,
not just the nonzero-population subset. Each cell carries:
  population        - GHS-POP 2025, floored at 0
  type              - dominant land use in the cell (Residential/Commercial/Office/
                       Industrial/Utility/Civic/Agricultural/Green/Unbuilt/Other),
                       from building footprints where available, else land_use
                       polygons, else a population-density heuristic
  type_source       - 'buildings' | 'land_use' | 'heuristic' (confidence signal)
  green_cover_pct   - % of cell area covered by vegetation/park/farmland polygons
  elevation_m       - Copernicus GLO-30 DEM, sampled at cell centroid
  dist_to_boundary_m - distance from cell centroid to the city boundary edge

Node files: cities.csv, grid_cells.csv, pois.csv
Relationship files: city_contains.csv, grid_connected.csv, poi_located_in.csv
"""
from pathlib import Path
import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask
from shapely.geometry import box
from pyproj import CRS

from common import ROOT, OUT, BOUND
from population import POP_FILE

SPATIAL = OUT / 'spatial'
GRAPH_OUT = OUT / 'graph'
POI_MASTER = ROOT / 'poi_master.csv'
CITIES_MASTER = ROOT / 'cities_master.csv'

CITY_COLS = [
    'city_id', 'city_name', 'country', 'region', 'income_group',
    'area_km2', 'population', 'population_year',
    'latitude', 'longitude', 'built_up_area_km2',
]

CELL_AREA_M2 = 1000.0 * 1000.0
GREEN_TYPE_MIN_PCT = 40.0  # green land use must actually cover the cell before it becomes the cell Type
DEM_TEMPLATE = (
    '/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/'
    'Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/'
    'Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif'
)

BUILDING_CLASS_TYPE = {
    'residential': 'Residential', 'house': 'Residential', 'apartments': 'Residential',
    'terrace': 'Residential', 'semidetached_house': 'Residential', 'detached': 'Residential',
    'dormitory': 'Residential', 'bungalow': 'Residential',
    'commercial': 'Commercial', 'retail': 'Commercial', 'hotel': 'Commercial', 'supermarket': 'Commercial', 'kiosk': 'Commercial',
    'office': 'Office',
    'industrial': 'Industrial', 'warehouse': 'Industrial', 'manufacture': 'Industrial',
    'train_station': 'Utility', 'transportation': 'Utility', 'parking': 'Utility', 'service': 'Utility',
    'public': 'Utility', 'government': 'Utility', 'fire_station': 'Utility', 'post_office': 'Utility',
    'toilets': 'Utility', 'guardhouse': 'Utility', 'bridge_structure': 'Utility',
    'school': 'Civic', 'university': 'Civic', 'college': 'Civic', 'kindergarten': 'Civic', 'library': 'Civic',
    'hospital': 'Civic', 'church': 'Civic', 'temple': 'Civic', 'mosque': 'Civic', 'synagogue': 'Civic',
    'chapel': 'Civic', 'shrine': 'Civic', 'religious': 'Civic', 'monastery': 'Civic', 'civic': 'Civic',
    'sports_centre': 'Civic', 'sports_hall': 'Civic', 'stadium': 'Civic', 'grandstand': 'Civic', 'pavilion': 'Civic',
    'greenhouse': 'Agricultural', 'stable': 'Agricultural', 'farm_auxiliary': 'Agricultural',
    'shed': 'Other', 'hut': 'Other', 'carport': 'Other', 'roof': 'Other', 'garage': 'Other',
}
BUILDING_SUBTYPE_TYPE = {
    'residential': 'Residential', 'commercial': 'Commercial', 'industrial': 'Industrial',
    'civic': 'Civic', 'transportation': 'Utility', 'education': 'Civic', 'religious': 'Civic',
    'service': 'Utility', 'entertainment': 'Commercial', 'medical': 'Civic',
    'agricultural': 'Agricultural', 'outbuilding': 'Other',
}
LANDUSE_CLASS_TYPE = {
    'residential': 'Residential', 'commercial': 'Commercial', 'retail': 'Commercial', 'works': 'Industrial',
    'industrial': 'Industrial', 'school': 'Civic', 'college': 'Civic', 'university': 'Civic',
    'kindergarten': 'Civic', 'hospital': 'Civic', 'clinic': 'Civic', 'religious': 'Civic', 'institutional': 'Civic',
    'military': 'Utility', 'bunker': 'Utility', 'base': 'Utility', 'railway': 'Utility', 'garages': 'Utility',
    'park': 'Green', 'grass': 'Green', 'playground': 'Green', 'pitch': 'Green', 'garden': 'Green',
    'meadow': 'Green', 'golf_course': 'Green', 'fairway': 'Green', 'tee': 'Green', 'rough': 'Green',
    'green': 'Green', 'greenfield': 'Green', 'nature_reserve': 'Green', 'farmland': 'Green',
    'village_green': 'Green', 'allotments': 'Green', 'plant_nursery': 'Green', 'dog_park': 'Green',
    'cemetery': 'Green', 'recreation_ground': 'Green', 'greenhouse_horticulture': 'Green',
}
GREEN_CLASSES = {c for c, t in LANDUSE_CLASS_TYPE.items() if t == 'Green'}


def local_metric_crs(boundary):
    c = boundary.centroid
    return CRS.from_proj4(f'+proj=aeqd +lat_0={c.y} +lon_0={c.x} +datum=WGS84 +units=m +no_defs')


def load_boundaries():
    return gpd.read_parquet(BOUND / 'cities.parquet').set_index('city_id')


def build_grid(city_id, boundary):
    """One node per GHS-POP pixel (exact 1km x 1km square) touching the boundary."""
    with rasterio.open(POP_FILE) as src:
        geom = gpd.GeoSeries([boundary], crs=4326).to_crs(src.crs).iloc[0]
        arr, transform = mask(src, [geom], crop=True, filled=False, all_touched=True)
        a = arr[0]
        valid = ~np.ma.getmaskarray(a) & np.isfinite(a.data)
        rr, cc = np.where(valid)
        pop = np.clip(a.data[rr, cc].astype(float), 0, None)
        cells = []
        for r, c in zip(rr, cc):
            x0, y0 = transform * (c, r)
            x1, y1 = transform * (c + 1, r + 1)
            cells.append(box(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
        gdf = gpd.GeoDataFrame({'population': pop, 'row': rr, 'col': cc}, geometry=cells, crs=src.crs)
    gdf = gdf.to_crs(4326)
    gdf = gdf[gdf.intersects(boundary)].reset_index(drop=True)
    gdf['cell_id'] = [f'{city_id}_cell_{i:05d}' for i in range(len(gdf))]
    gdf['centroid_lon'] = gdf.geometry.centroid.x
    gdf['centroid_lat'] = gdf.geometry.centroid.y
    return gdf


def dominant_type(polygons, class_col, class_map, subtype_col, subtype_map, cells, crs):
    """Area-weighted dominant Type per cell from a footprint layer (buildings or land_use)."""
    if polygons is None or polygons.empty:
        return {}
    p = polygons.copy()
    mapped = p[class_col].map(class_map) if class_col in p else pd.Series(index=p.index, dtype=object)
    if subtype_col in p:
        mapped = mapped.fillna(p[subtype_col].map(subtype_map))
    # Untagged footprints and junk classes (sheds, roofs, garages) don't get a vote -
    # most Overture buildings carry no class, and counting them would drown out the real signal.
    p['type'] = mapped
    p = p[p['type'].notna() & (p['type'] != 'Other')]
    if p.empty:
        return {}
    p['area_m2'] = p.to_crs(crs).area
    pts = p.copy()
    pts['geometry'] = p.geometry.representative_point()
    joined = gpd.sjoin(pts[['type', 'area_m2', 'geometry']], cells[['cell_id', 'geometry']], predicate='within', how='inner')
    by_cell_type = joined.groupby(['cell_id', 'type'])['area_m2'].sum()
    return by_cell_type.groupby('cell_id').idxmax().map(lambda t: t[1]).to_dict()


def green_cover_pct(land_use, cells, crs):
    if land_use is None or land_use.empty or 'class' not in land_use:
        return {}
    green = land_use[land_use['class'].isin(GREEN_CLASSES)].copy()
    if green.empty:
        return {}
    green['area_m2'] = green.to_crs(crs).area
    pts = green.copy()
    pts['geometry'] = green.geometry.representative_point()
    joined = gpd.sjoin(pts[['area_m2', 'geometry']], cells[['cell_id', 'geometry']], predicate='within', how='inner')
    area_per_cell = joined.groupby('cell_id')['area_m2'].sum()
    return (area_per_cell / CELL_AREA_M2 * 100).clip(upper=100).to_dict()


_dem_cache = {}


def dem_tile(lat_floor, lon_floor):
    key = (lat_floor, lon_floor)
    if key not in _dem_cache:
        ns = 'N' if lat_floor >= 0 else 'S'
        ew = 'E' if lon_floor >= 0 else 'W'
        url = DEM_TEMPLATE.format(ns=ns, lat=abs(lat_floor), ew=ew, lon=abs(lon_floor))
        try:
            _dem_cache[key] = rasterio.open(url)
        except Exception:
            _dem_cache[key] = None
    return _dem_cache[key]


def sample_elevation(lons, lats):
    tiles = pd.DataFrame({'lon': lons, 'lat': lats})
    tiles['lat_floor'] = np.floor(tiles['lat']).astype(int)
    tiles['lon_floor'] = np.floor(tiles['lon']).astype(int)
    out = np.full(len(tiles), np.nan)
    for (latf, lonf), idx in tiles.groupby(['lat_floor', 'lon_floor']).groups.items():
        ds = dem_tile(latf, lonf)
        if ds is None:
            continue
        rows = tiles.loc[idx]
        vals = [v[0] for v in ds.sample(zip(rows['lon'], rows['lat']))]
        out[rows.index.to_numpy()] = vals
    return out


def dist_to_boundary_m(cells, boundary, crs):
    boundary_line = gpd.GeoSeries([boundary.boundary], crs=4326).to_crs(crs).iloc[0]
    centroids_m = cells.geometry.centroid.to_crs(crs)
    return centroids_m.distance(boundary_line)


def export_cities():
    cities = pd.read_csv(CITIES_MASTER, usecols=CITY_COLS)
    cities.rename(columns={'city_id': 'city_id:ID(City)'}).to_csv(GRAPH_OUT / 'cities.csv', index=False)
    return pd.read_csv(CITIES_MASTER, usecols=['city_id', 'latitude', 'longitude'])


def grid_neighbors(cells):
    """Exact 8-connected adjacency from the raster row/col indices - no distance search needed."""
    lookup = {(r, c): cid for r, c, cid in zip(cells['row'], cells['col'], cells['cell_id'])}
    edges = []
    for (r, c), cid in lookup.items():
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nb = lookup.get((r + dr, c + dc))
                if nb is not None:
                    dist = 1000.0 if (dr == 0 or dc == 0) else 1414.2
                    edges.append((cid, nb, dist))
    return edges


def city_cells(city_id, boundary):
    """Every 1km cell of one city, with population, type, green cover, elevation, boundary distance."""
    crs = local_metric_crs(boundary)
    cells = build_grid(city_id, boundary)

    buildings_path = SPATIAL / f'{city_id}_buildings.parquet'
    landuse_path = SPATIAL / f'{city_id}_land_use.parquet'
    buildings = gpd.read_parquet(buildings_path) if buildings_path.exists() else None
    land_use = gpd.read_parquet(landuse_path) if landuse_path.exists() else None

    building_type = dominant_type(buildings, 'class', BUILDING_CLASS_TYPE, 'subtype', BUILDING_SUBTYPE_TYPE, cells, crs)
    landuse_type = dominant_type(land_use, 'class', LANDUSE_CLASS_TYPE, None, {}, cells, crs)
    built_land_use = land_use[~land_use['class'].isin(GREEN_CLASSES)] if land_use is not None else None
    landuse_built_type = dominant_type(built_land_use, 'class', LANDUSE_CLASS_TYPE, None, {}, cells, crs)
    green_pct = green_cover_pct(land_use, cells, crs)
    dist_bound = dist_to_boundary_m(cells, boundary, crs)
    elevation = sample_elevation(cells['centroid_lon'].to_numpy(), cells['centroid_lat'].to_numpy())

    cell_type, type_source = [], []
    for cid, pop in zip(cells['cell_id'], cells['population']):
        lu = landuse_type.get(cid)
        if cid in building_type:
            cell_type.append(building_type[cid]); type_source.append('buildings')
        elif lu is not None and lu != 'Green':
            cell_type.append(lu); type_source.append('land_use')
        elif lu == 'Green' and green_pct.get(cid, 0.0) >= GREEN_TYPE_MIN_PCT:
            cell_type.append('Green'); type_source.append('land_use')
        elif cid in landuse_built_type:
            # A single mapped park must not type a built-up cell - Overture land_use
            # over-represents recreation polygons where building footprints are missing.
            cell_type.append(landuse_built_type[cid]); type_source.append('land_use')
        else:
            cell_type.append('Unbuilt' if pop == 0 else 'Residential'); type_source.append('heuristic')

    cells['type'] = cell_type
    cells['type_source'] = type_source
    cells['green_cover_pct'] = [round(float(green_pct.get(cid, 0.0)), 1) for cid in cells['cell_id']]
    cells['elevation_m'] = np.round(elevation, 1)
    cells['dist_to_boundary_m'] = np.round(dist_bound.to_numpy(), 1)
    cells['city_id'] = city_id
    # Grid coordinates local to this city: x east, y south from the north edge, both 0-based,
    # so the rows reshape straight into a (y_max+1, x_max+1) raster.
    cells['x'] = cells['col'] - cells['col'].min()
    cells['y'] = cells['row'] - cells['row'].min()
    return cells


def export_grid_cells(city_centroids):
    boundaries = load_boundaries()
    contains_rows, connected_rows = [], []
    all_cells = {}

    for _, row in city_centroids.iterrows():
        city_id = row['city_id']
        if city_id not in boundaries.index:
            continue
        cells = city_cells(city_id, boundaries.loc[city_id, 'geometry'])
        type_source = cells['type_source']

        all_cells[city_id] = cells
        connected_rows.extend(grid_neighbors(cells))
        for cid in cells['cell_id']:
            contains_rows.append((city_id, cid))

        print(f'{city_id}: {len(cells)} cells  '
              f'(type source: {pd.Series(type_source).value_counts().to_dict()})')

    grid_df = pd.concat(all_cells.values(), ignore_index=True)
    out = grid_df.rename(columns={
        'cell_id': 'cell_id:ID(GridCell)',
        'population': 'population:float',
        'centroid_lat': 'centroid_lat:float',
        'centroid_lon': 'centroid_lon:float',
        'green_cover_pct': 'green_cover_pct:float',
        'elevation_m': 'elevation_m:float',
        'dist_to_boundary_m': 'dist_to_boundary_m:float',
    })[['cell_id:ID(GridCell)', 'city_id', 'population:float', 'type', 'type_source',
        'green_cover_pct:float', 'elevation_m:float', 'dist_to_boundary_m:float',
        'centroid_lat:float', 'centroid_lon:float']]
    out.to_csv(GRAPH_OUT / 'grid_cells.csv', index=False)

    pd.DataFrame(contains_rows, columns=[':START_ID(City)', ':END_ID(GridCell)']).to_csv(GRAPH_OUT / 'city_contains.csv', index=False)
    pd.DataFrame(connected_rows, columns=[':START_ID(GridCell)', ':END_ID(GridCell)', 'distance_m:float']).to_csv(GRAPH_OUT / 'grid_connected.csv', index=False)

    print(f'grid_cells: {len(out)}  city_contains: {len(contains_rows)}  grid_connected: {len(connected_rows)}')
    return grid_df[['cell_id', 'city_id', 'centroid_lat', 'centroid_lon', 'geometry']]


def export_pois(city_centroids, grid_geo):
    con = duckdb.connect()
    pois_out, located_out = [], []

    for city_id in city_centroids['city_id']:
        city_pois = con.execute(
            "select poi_id, poi_name, poi_category, poi_subcategory, latitude, longitude "
            "from read_csv_auto(?) where city_id = ?",
            [str(POI_MASTER), city_id],
        ).df()
        if city_pois.empty:
            continue
        city_pois.insert(1, 'city_id', city_id)
        pois_out.append(city_pois)

        cells = grid_geo[grid_geo['city_id'] == city_id]
        if cells.empty:
            continue
        poi_pts = gpd.GeoDataFrame(
            {'poi_id': city_pois['poi_id']},
            geometry=gpd.points_from_xy(city_pois['longitude'], city_pois['latitude']),
            crs=4326,
        )
        joined = gpd.sjoin(poi_pts, cells[['cell_id', 'geometry']], predicate='within', how='left')
        joined = joined.drop_duplicates('poi_id')
        missing = joined['cell_id'].isna()
        if missing.any():
            crs = local_metric_crs(cells.geometry.union_all())
            unmatched = joined[missing]
            miss_xy = poi_pts.set_index('poi_id').loc[unmatched['poi_id']].to_crs(crs)
            cell_xy = cells.set_geometry(cells.geometry.centroid).to_crs(crs)
            from scipy.spatial import cKDTree
            tree = cKDTree(np.c_[cell_xy.geometry.x, cell_xy.geometry.y])
            _, idx = tree.query(np.c_[miss_xy.geometry.x, miss_xy.geometry.y])
            joined.loc[missing, 'cell_id'] = cells['cell_id'].to_numpy()[idx]

        for poi_id, cell_id in zip(joined['poi_id'], joined['cell_id']):
            located_out.append((poi_id, cell_id))

        print(f'{city_id}: {len(city_pois)} pois located')

    pois_df = pd.concat(pois_out, ignore_index=True)
    pois_df = pois_df.rename(columns={
        'poi_id': 'poi_id:ID(POI)',
        'latitude': 'latitude:float',
        'longitude': 'longitude:float',
    })
    pois_df.to_csv(GRAPH_OUT / 'pois.csv', index=False)

    located_df = pd.DataFrame(located_out, columns=[':START_ID(POI)', ':END_ID(GridCell)'])
    located_df.to_csv(GRAPH_OUT / 'poi_located_in.csv', index=False)

    print(f'pois: {len(pois_df)}  poi_located_in: {len(located_df)}')


def main():
    GRAPH_OUT.mkdir(parents=True, exist_ok=True)
    city_centroids = export_cities()
    grid_geo = export_grid_cells(city_centroids)
    export_pois(city_centroids, grid_geo)
    for ds in _dem_cache.values():
        if ds is not None:
            ds.close()
    print('done ->', GRAPH_OUT)


if __name__ == '__main__':
    main()
