"""Write one CSV per city - one row per 1km grid cell, with x/y grid position.

Same cell definition and attributes as the Neo4j export (see graph_export.py):
a cell is one GHS-POP pixel, exactly 1km x 1km, and `population` is that single
pixel's own population - never a city mean.

x/y are 0-based grid coordinates local to the city: x increases east, y increases
south (image convention), so the rows reshape into a (y.max()+1, x.max()+1) array
with holes only where the city boundary doesn't reach.

Usage:
  python city_grid_csv.py                 # every city
  python city_grid_csv.py ghsl_178 ...    # named cities only
"""
import sys
import pandas as pd

from common import ROOT, OUT
from graph_export import CITIES_MASTER, city_cells, load_boundaries

GRID_OUT = OUT / 'city_grids'

COLUMNS = [
    'cell_id', 'x', 'y', 'centroid_lat', 'centroid_lon',
    'population', 'type', 'type_source',
    'green_cover_pct', 'elevation_m', 'dist_to_boundary_m',
]


def slug(name):
    return ''.join(c.lower() if c.isalnum() else '_' for c in name).strip('_')


def export_city(city_id, city_name, boundary):
    cells = city_cells(city_id, boundary)
    df = pd.DataFrame(cells.drop(columns='geometry'))
    df['population'] = df['population'].round(1)
    df = df.sort_values(['y', 'x'])[COLUMNS]

    path = GRID_OUT / f'{slug(city_name)}_{city_id}.csv'
    df.to_csv(path, index=False)
    print(f'{city_name} ({city_id}): {len(df)} cells  '
          f'grid {df["x"].max() + 1}x{df["y"].max() + 1}  '
          f'pop {df["population"].sum():,.0f}  -> {path.name}')
    return df


def main(city_ids=None):
    GRID_OUT.mkdir(parents=True, exist_ok=True)
    cities = pd.read_csv(CITIES_MASTER, usecols=['city_id', 'city_name'])
    boundaries = load_boundaries()
    if city_ids:
        cities = cities[cities['city_id'].isin(city_ids)]

    for _, row in cities.iterrows():
        if row['city_id'] not in boundaries.index:
            print(f'{row["city_id"]}: no boundary, skipped')
            continue
        export_city(row['city_id'], row['city_name'], boundaries.loc[row['city_id'], 'geometry'])


if __name__ == '__main__':
    main(sys.argv[1:] or None)
