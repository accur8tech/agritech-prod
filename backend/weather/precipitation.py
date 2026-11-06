# backend/weather/precipitation.py

import ee
import pandas as pd
from datetime import datetime, timedelta
from countries import (
    get_geodataframe,
    validate_location as validate_country_location,
    get_all_provinces,
    get_districts_for_province,
    get_communes_for_district,
    province_to_filename,
    to_climate_column_name,
)

# CHIRPS v3 daily precipitation (IMERG satellite disaggregation).
# Band is still "precipitation" in mm/day at ~0.05°.
CHIRPS_DAILY_COLLECTION = "UCSB-CHC/CHIRPS/V3/DAILY_SAT"

def get_date_batches(start_date: str, end_date: str, batch_years: int = 10):
    """Split date range into batches of specified years."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    batches = []
    current_start = start
    
    while current_start < end:
        # Calculate batch end date (exclusive)
        batch_end = min(
            current_start + timedelta(days=365 * batch_years),
            end
        )
        batches.append((
            current_start.strftime("%Y-%m-%d"),
            batch_end.strftime("%Y-%m-%d")
        ))
        # Set next batch start to current batch end (no need to add one day)
        current_start = batch_end
    
    return batches

def retrieve_precipitation_data(province_gdf, start_date: str, end_date: str, country: str = "Cambodia"):
    """
    Retrieve daily precipitation data for all communes within the specified province.
    Args:
    - province_gdf: GeoDataFrame containing the commune geometries.
    - start_date: The start date in the format 'YYYY-MM-DD'.
    - end_date: The end date in the format 'YYYY-MM-DD'.
    """
    result_df = pd.DataFrame()
    
    # Split date range into batches
    date_batches = get_date_batches(start_date, end_date)
    print(f"[INFO] Processing {len(date_batches)} date batches")

    # Iterate through each district in the province
    unique_districts = province_gdf["NAME_2"].unique()
    total_districts = len(unique_districts)
    
    for district_idx, district in enumerate(unique_districts, 1):
        print(f"[INFO] Processing district {district_idx}/{total_districts}: {district}")

        # Filter for communes within the current district
        district_communes = province_gdf[province_gdf["NAME_2"] == district]
        total_communes = len(district_communes)
        
        # Retrieve precipitation data for each commune in the district
        for commune_idx, (_, commune) in enumerate(district_communes.iterrows(), 1):
            commune_name = commune["NAME_3"]
            district_name = commune["NAME_2"]
            print(f"[INFO] Processing commune {commune_idx}/{total_communes}: {commune_name} in district {district_name}")
            commune_data = pd.DataFrame()

            # Process each date batch
            for batch_idx, (batch_start, batch_end) in enumerate(date_batches, 1):
                print(f"[INFO] Processing batch {batch_idx}/{len(date_batches)}: {batch_start} to {batch_end}")

                # GEE filterDate uses exclusive end; add one day so the batch end date is included
                batch_end_dt = datetime.strptime(batch_end, "%Y-%m-%d")
                batch_end_gee = (batch_end_dt + timedelta(days=1)).strftime("%Y-%m-%d")

                # Define the geometry (GeoPandas yields Shapely geometries)
                geom = commune["geometry"]
                if geom.geom_type == "MultiPolygon":
                    polygons = [
                        ee.Geometry.Polygon(list(poly.exterior.coords))
                        for poly in geom.geoms
                    ]
                    commune_geometry = ee.Geometry.MultiPolygon(polygons)
                elif geom.geom_type == "Polygon":
                    commune_geometry = ee.Geometry.Polygon(list(geom.exterior.coords))
                else:
                    raise ValueError(f"Unsupported geometry type: {geom.geom_type}")

                # Fetch CHIRPS v3 daily satellite precipitation for the commune polygon
                chirps = (
                    ee.ImageCollection(CHIRPS_DAILY_COLLECTION)
                    .filterDate(batch_start, batch_end_gee)
                    .select("precipitation")
                )

                # Add a 'date' property to each image
                chirps = chirps.map(
                    lambda image: image.set("date", image.date().format("YYYY-MM-dd"))
                )

                # Extract the data for each date using `reduceRegion`
                def extract_daily_data(image):
                    mean_precipitation = image.reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=commune_geometry,
                        scale=5000,
                        maxPixels=1e13,
                    )
                    return image.set(
                        "mean_precipitation", mean_precipitation.get("precipitation")
                    )

                # Apply the `extract_daily_data` function
                time_series = chirps.map(extract_daily_data).getInfo()

                # Convert to a DataFrame
                # Use district_commune format for column name
                column_name = to_climate_column_name(country, district_name, commune_name)
                daily_data = {
                    entry["properties"]["date"]: entry["properties"]["mean_precipitation"]
                    for entry in time_series["features"]
                    if "mean_precipitation" in entry["properties"]
                }
                batch_df = pd.DataFrame(
                    list(daily_data.items()), columns=["Date", column_name]
                )

                # Merge with existing data for this commune
                commune_data = pd.concat([commune_data, batch_df], ignore_index=True)

            # Merge results with the main DataFrame
            if result_df.empty:
                result_df = commune_data
            else:
                result_df = pd.merge(result_df, commune_data, on="Date", how="outer")

    return result_df
