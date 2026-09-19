"""Synthetic fixtures exercise math/geometry only; never exported to training data."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import geopandas as gpd
import pandas as pd
import numpy as np
from shapely.geometry import Point, Polygon, LineString, box
from features import clip, category, dedup, road_features, building_features, make_pois, metric_crs
from overture import overlap

def test_category_does_not_count_equipment_as_hospital_or_driving_as_school():
    assert category('hospital')=='hospital'
    assert category('hospital_equipment_and_supplies')=='other'
    assert category('driving_school')=='other'
    assert category('gas_station')=='other'
    assert category('train_station')=='transit_station'
    assert category(None)=='uncategorized'

def test_crossing_road_is_clipped_not_discarded():
    g=gpd.GeoDataFrame({'id':['a','b'],'geometry':[LineString([(-1,0.5),(2,0.5)]),Point(3,3)]},crs=4326)
    result,stats=clip(g,box(0,0,1,1))
    assert len(result)==1
    assert np.allclose(result.total_bounds,[0,.5,1,.5])
    assert stats['outside_boundary']==1

def test_duplicate_names_only_merge_within_distance_and_category():
    g=gpd.GeoDataFrame({'poi_id':['a','b','c','d','e'],'poi_name':['Hospital','Hospital','Hospital','Hospital',None],'poi_category':['hospital','hospital','hospital','clinic','hospital'],'geometry':[Point(0,0),Point(20,0),Point(100,0),Point(20,0),Point(20,0)]},crs=3857)
    result,n=dedup(g,3857)
    assert n==1 and set(result.poi_id)=={'a','c','d','e'}

def test_intersection_endpoint_degree_and_length():
    g=gpd.GeoDataFrame({'id':['a','b','c'],'geometry':[LineString([(0,0),(1000,0)]),LineString([(0,0),(0,1000)]),LineString([(0,0),(-1000,0)])]},crs=3857)
    f=road_features(g,3857,2)
    assert f['road_length_km']==3
    assert f['road_density']==1.5
    assert f['intersection_count_approx']==1
    assert f['road_network_mean_degree_approx']==1.5

def test_building_union_avoids_overlap_double_counting():
    g=gpd.GeoDataFrame({'id':['a','b'],'geometry':[box(0,0,100,100),box(50,0,150,100)]},crs=3857)
    f=building_features(g,3857,1)
    assert f['building_footprint_area_km2']==.02
    assert f['building_footprint_union_area_km2']==.015
    assert f['built_area_pct']==1.5

def test_missing_datasets_not_zero():
    assert building_features(None,3857,1)=={}
    assert road_features(None,3857,1)=={}
    empty=gpd.GeoDataFrame({'id':[],'geometry':[]},crs=3857)
    assert building_features(empty,3857,1)['building_count']==0

def test_bbox_overlap_includes_boundary_crossing():
    assert overlap((-1,0,2,1),(0,0,1,1))
    assert not overlap((2,2,3,3),(0,0,1,1))
