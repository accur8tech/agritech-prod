"""
Claims weather fetch via Google Earth Engine.

Reuses retrieve_precipitation_data / retrieve_temperature_data with a
single-commune GeoDataFrame. Precipitation is CHIRPS v3 daily satellite
(UCSB-CHC/CHIRPS/V3/DAILY_SAT). Does not touch weather_downloads or Excel export.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

from countries import (
    get_geodataframe,
    province_to_filename,
    to_climate_column_name,
    validate_location,
)
from weather.precipitation import CHIRPS_DAILY_COLLECTION, retrieve_precipitation_data
from weather.temperature import retrieve_temperature_data


PRECIP_PERILS = {"LRI", "ERI"}
TEMP_PERILS = {"LTI", "HTI"}


def _require_commune_location(
    country: str, province: str, district: str, commune: str
) -> None:
    if not all(
        [
            country and country.strip(),
            province and province.strip(),
            district and district.strip(),
            commune and commune.strip(),
        ]
    ):
        raise ValueError(
            "Claims evaluation requires country, province, district, and commune."
        )

    # Nigeria boundaries are state/LGA; commune may equal LGA when wards are unused.
    if country == "Nigeria" and commune == district:
        if not validate_location(country, province, district):
            raise ValueError(
                f"Invalid location: {country} / {province} / {district}"
            )
        return

    if not validate_location(country, province, district, commune):
        raise ValueError(
            f"Invalid location: {country} / {province} / {district} / {commune}"
        )


def get_single_commune_gdf(
    country: str, province: str, district: str, commune: str
) -> pd.DataFrame:
    """Return a GeoDataFrame with exactly one commune row for GEE retrieve_*."""
    _require_commune_location(country, province, district, commune)

    gdf = get_geodataframe(country)
    normalized_province = province_to_filename(country, province)
    filtered = gdf[gdf["normalized_NAME_1"] == normalized_province]
    filtered = filtered[filtered["NAME_2"] == district]

    if country == "Nigeria":
        # Nigeria boundary rows are typically state/LGA; NAME_3 often equals LGA.
        # Prefer exact NAME_3 match; fall back to district-only single row.
        by_commune = filtered[filtered["NAME_3"] == commune]
        if by_commune.empty and commune == district:
            by_commune = filtered
        filtered = by_commune
    else:
        filtered = filtered[filtered["NAME_3"] == commune]

    if filtered.empty:
        raise ValueError(
            f"No geometry found for commune '{commune}' in {district}, {province} ({country})"
        )

    if len(filtered) > 1:
        filtered = filtered.iloc[[0]]

    return filtered.copy()


def datasets_for_perils(peril_types: Set[str]) -> List[str]:
    datasets: List[str] = []
    if peril_types & PRECIP_PERILS:
        datasets.append("precipitation")
    if peril_types & TEMP_PERILS:
        datasets.append("temperature")
    return datasets


def fetch_claims_weather(
    country: str,
    province: str,
    district: str,
    commune: str,
    date_start: str,
    date_end: str,
    datasets: List[str],
) -> Tuple[Dict[str, pd.DataFrame], Dict[str, Any]]:
    """
    Fetch daily weather for one commune via GEE.

    Returns:
        series_by_dataset: { "precipitation"|"temperature": DataFrame with Date + value column }
        snapshot_meta: provenance for weather_snapshot
    """
    if date_start > date_end:
        raise ValueError("evaluation_start must be on or before evaluation_end")

    commune_gdf = get_single_commune_gdf(country, province, district, commune)
    column_name = to_climate_column_name(country, district, commune)
    series_by_dataset: Dict[str, pd.DataFrame] = {}
    gee_datasets: List[str] = []

    for dataset in datasets:
        if dataset == "precipitation":
            raw = retrieve_precipitation_data(
                commune_gdf, date_start, date_end, country
            )
            gee_datasets.append("CHIRPS")
            # Match weather-download formatting lightly for consistency
            if not raw.empty:
                value_cols = [c for c in raw.columns if c != "Date"]
                for col in value_cols:
                    raw[col] = raw[col].apply(
                        lambda x: 0.0
                        if pd.notna(x) and float(x) < 1.0
                        else round(float(x), 2)
                        if pd.notna(x)
                        else x
                    )
        elif dataset == "temperature":
            raw = retrieve_temperature_data(
                commune_gdf, date_start, date_end, country
            )
            gee_datasets.append("ERA5_LAND")
            if not raw.empty:
                value_cols = [c for c in raw.columns if c != "Date"]
                for col in value_cols:
                    raw[col] = raw[col].apply(
                        lambda x: round(float(x), 1) if pd.notna(x) else x
                    )
        else:
            raise ValueError(f"Unsupported dataset: {dataset}")

        if raw is None or raw.empty:
            raise ValueError(
                f"No {dataset} data returned from GEE for "
                f"{commune}, {district}, {province} ({date_start} to {date_end})"
            )

        # Normalize to Date + series column named consistently
        if "Date" not in raw.columns:
            raise ValueError(f"GEE {dataset} response missing Date column")

        raw = raw.copy()
        raw["Date"] = pd.to_datetime(raw["Date"])
        raw = raw.sort_values("Date")

        value_cols = [c for c in raw.columns if c != "Date"]
        if not value_cols:
            raise ValueError(f"GEE {dataset} response has no value columns")

        # Prefer expected column name; otherwise first value column
        value_col = column_name if column_name in value_cols else value_cols[0]
        tidy = raw[["Date", value_col]].rename(columns={value_col: "value"})
        # Drop sentinel missing temps
        if dataset == "temperature":
            tidy = tidy[tidy["value"] != -999]
        series_by_dataset[dataset] = tidy.reset_index(drop=True)

    # Availability summary
    last_dates = {
        ds: (
            series_by_dataset[ds]["Date"].max().strftime("%Y-%m-%d")
            if not series_by_dataset[ds].empty
            else None
        )
        for ds in series_by_dataset
    }
    first_dates = {
        ds: (
            series_by_dataset[ds]["Date"].min().strftime("%Y-%m-%d")
            if not series_by_dataset[ds].empty
            else None
        )
        for ds in series_by_dataset
    }

    snapshot_meta = {
        "source": "gee",
        "datasets": gee_datasets,
        # Provenance only. Callers still key rainfall off datasets == "CHIRPS".
        **(
            {"chirps_collection": CHIRPS_DAILY_COLLECTION}
            if "CHIRPS" in gee_datasets
            else {}
        ),
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "location": {
            "country": country,
            "province": province,
            "district": district,
            "commune": commune,
        },
        "date_start": date_start,
        "date_end": date_end,
        "series_summary": {
            ds: {
                "observations": int(len(series_by_dataset[ds])),
                "first_date": first_dates.get(ds),
                "last_date": last_dates.get(ds),
                "min": float(series_by_dataset[ds]["value"].min())
                if len(series_by_dataset[ds])
                else None,
                "max": float(series_by_dataset[ds]["value"].max())
                if len(series_by_dataset[ds])
                else None,
                "sum": float(series_by_dataset[ds]["value"].sum())
                if len(series_by_dataset[ds])
                else None,
            }
            for ds in series_by_dataset
        },
    }

    return series_by_dataset, snapshot_meta


def compact_daily_series(
    series_by_dataset: Dict[str, pd.DataFrame], max_points: int = 400
) -> Dict[str, List[Dict[str, Any]]]:
    """Optional compact daily evidence for weather_snapshot (truncated if long)."""
    daily: Dict[str, List[Dict[str, Any]]] = {}
    for ds, df in series_by_dataset.items():
        rows = [
            {
                "date": row["Date"].strftime("%Y-%m-%d"),
                "value": None if pd.isna(row["value"]) else float(row["value"]),
            }
            for _, row in df.iterrows()
        ]
        if len(rows) > max_points:
            step = max(1, len(rows) // max_points)
            rows = rows[::step][:max_points]
            daily[ds] = rows
            daily[f"{ds}_truncated"] = True  # type: ignore
        else:
            daily[ds] = rows
    return daily
