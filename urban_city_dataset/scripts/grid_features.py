"""Reusable per-grid-cell spatial features that do not require raster inputs."""

import geopandas as gpd

CELL_AREA_M2 = 1000.0 * 1000.0


def building_density_pct(buildings, cells, crs):
    """Return unioned building-footprint coverage for each 1km cell.

    ``None`` means the building layer was unavailable, while an empty mapping
    means it was successfully read but contains no footprints. This distinction
    keeps missing source data from being silently written as zero density.
    """
    if buildings is None:
        return None
    if buildings.empty:
        return {}

    cell_geometries = cells[["cell_id", "geometry"]].to_crs(crs)
    footprint_geometries = buildings[["geometry"]].dropna().to_crs(crs)
    if footprint_geometries.empty:
        return {}

    candidates = gpd.sjoin(
        footprint_geometries,
        cell_geometries,
        predicate="intersects",
        how="inner",
    )
    if candidates.empty:
        return {}

    cell_for_piece = cell_geometries.geometry.loc[
        candidates["index_right"]
    ].reset_index(drop=True)
    pieces = gpd.GeoDataFrame(
        {"cell_id": candidates["cell_id"].to_numpy()},
        geometry=candidates.geometry.reset_index(drop=True).intersection(
            cell_for_piece
        ),
        crs=crs,
    )
    return {
        cell_id: round(min(100.0, 100 * geometries.union_all().area / CELL_AREA_M2), 4)
        for cell_id, geometries in pieces.groupby("cell_id").geometry
    }
