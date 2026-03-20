import os
import pandas as pd
from typing import List, Dict, Any
from datetime import datetime, timedelta
from countries.cambodia import (
    province_to_filename,
    to_climate_column_name,
    validate_location,
    from_climate_column_name
)

# Helper: Map index type
INDEX_TYPE_MAP = {
    "LRI": "Low Rainfall Index", 
    "ERI": "Excess Rainfall Index",
    "LTI": "Low Temperature Index",
    "HTI": "High Temperature Index"
}

# Standardized loading percentages for premium calculation
# Change these values in one place to update throughout the system
DEFAULT_ADMIN_LOADING = 0.15  # 15% admin cost loading
DEFAULT_PROFIT_LOADING = 0.15  # 7.5% profit loading

# Module-level cache for weather data
_weather_data_cache = {}

def clear_weather_data_cache():
    """Clear the in-memory weather data cache."""
    _weather_data_cache.clear()

def _get_weather_data(province, data_type):
    # Validate province exists in canonical location data (e.g., "Banteay Meanchey")
    if not validate_location(province):
        from countries.cambodia import get_all_provinces
        available_provinces = get_all_provinces()
        raise ValueError(
            f"Invalid province: '{province}'. "
            f"Province must be in canonical format (e.g., 'Banteay Meanchey'). "
            f"Available provinces: {available_provinces}"
        )
    
    # Convert canonical province name to filename format
    normalized_province = province_to_filename(province)
    
    key = (normalized_province, data_type)
    if key in _weather_data_cache:
        return _weather_data_cache[key]
    print(f"Loading weather data from disk for {province} (normalized: {normalized_province}), {data_type}")
    
    # Try Parquet first (new format)
    parquet_path = os.path.join(os.getcwd(), "climate_data", data_type, "Cambodia", f"{normalized_province}.parquet")
    if os.path.exists(parquet_path):
        print(f"Loading Parquet file: {parquet_path}")
        df = pd.read_parquet(parquet_path)
        _weather_data_cache[key] = df
        return df
    
    # Fallback to Excel (old format)
    excel_path = os.path.join(os.getcwd(), "files", data_type, "Cambodia", f"{normalized_province}.xlsx")
    if os.path.exists(excel_path):
        print(f"Loading Excel file (fallback): {excel_path}")
        df = pd.read_excel(excel_path, parse_dates=['Date'])
        _weather_data_cache[key] = df
        return df
    
    raise FileNotFoundError(f"No weather data file found for {province} (normalized: {normalized_province}). Tried: {parquet_path} and {excel_path}")


def get_historical_period_aggregates(
    province: str,
    district: str,
    commune: str,
    start_day: int,
    end_day: int,
    data_type: str = "precipitation",
    weather_data_period: int = 30,
) -> List[float]:
    """
    Return annual aggregate values (e.g. total rainfall) for the given period.
    Used by the optimizer to compute trigger bounds from historical data.
    Does not perform any statistical analysis; returns raw data only.

    Args:
        province: Province name in canonical format.
        district: District name in canonical format.
        commune: Commune name in canonical format.
        start_day: Start day of period (0-indexed day of year).
        end_day: End day of period (0-indexed; may exceed 365 for cross-year periods).
        data_type: "precipitation" or "temperature".
        weather_data_period: Number of years to include (default 30).

    Returns:
        List of aggregate values, one per year, in chronological order.
        For precipitation: sum of daily values in the period each year.
        Empty list if location invalid or insufficient data.
    """
    try:
        if not validate_location(province, district, commune):
            return []
        df = _get_weather_data(province, data_type)
        commune_column = to_climate_column_name(district, commune)
        if commune_column not in df.columns:
            return []
    except (ValueError, FileNotFoundError):
        return []

    years = sorted(df["Date"].dt.year.unique())[-weather_data_period:]
    if len(years) < 2:
        return []

    aggregates = []
    for year in years:
        year_start = datetime(year, 1, 1) + timedelta(days=start_day)
        year_end = datetime(year, 1, 1) + timedelta(days=end_day)
        period_data = df[(df["Date"] >= year_start) & (df["Date"] <= year_end)][commune_column]
        if data_type == "temperature":
            period_data = period_data[period_data != -999]
        if len(period_data) == 0:
            continue
        total = float(period_data.sum())
        aggregates.append(total)
    return aggregates


# Main function

def calculate_insure_smart_premium(
    commune: str,
    province: str,
    district: str,
    periods: List[Dict[str, Any]],
    sum_insured: float,
    weather_data_period: int = 30,
    data_type: str = "precipitation",
    admin_loading: float = None,
    profit_loading: float = None
) -> Dict[str, Any]:
    """
    Calculate premium and risk metrics for Insure Smart optimization.
    
    All location parameters must be in canonical format (with spaces preserved).
    Example: province="Banteay Meanchey", district="Mongkol Borei", commune="Banteay Neang"
    
    Args:
        commune: Commune name in canonical format (e.g., "Banteay Neang")
        province: Province name in canonical format (e.g., "Banteay Meanchey")
        district: District name in canonical format (e.g., "Mongkol Borei") - required when commune is provided
        periods: List of dicts, each with keys:
            - peril_type ("LRI", "ERI", "LTI", or "HTI")
            - trigger (float)
            - duration (int)
            - unit_payout (float)
            - max_payout (float)
            - allocated_si (float)
            - start_day (int, optional)
            - end_day (int, optional)
        sum_insured: Product-level sum insured (cap on total payout per year)
        weather_data_period: Number of years (default 30)
        data_type: "precipitation" or "temperature" (default "precipitation")
        admin_loading: Admin cost loading (defaults to DEFAULT_ADMIN_LOADING if None)
        profit_loading: Profit loading (defaults to DEFAULT_PROFIT_LOADING if None)
    Returns:
        Dict with all metrics needed for scoring and constraints
    """
    # Use default loading values if not provided
    if admin_loading is None:
        admin_loading = DEFAULT_ADMIN_LOADING
    if profit_loading is None:
        profit_loading = DEFAULT_PROFIT_LOADING
    
    # Validate location using canonical format (e.g., "Banteay Meanchey", "Mongkol Borei", "Banteay Neang")
    if not validate_location(province, district, commune):
        from countries.cambodia import get_all_provinces, get_districts_for_province, get_communes_for_district
        # Provide helpful error message with suggestions
        if not validate_location(province):
            available_provinces = get_all_provinces()
            raise ValueError(
                f"Invalid province: '{province}'. "
                f"Province must be in canonical format (e.g., 'Banteay Meanchey'). "
                f"Available provinces: {available_provinces}"
            )
        elif not validate_location(province, district):
            available_districts = get_districts_for_province(province)
            raise ValueError(
                f"Invalid district: '{district}' in province '{province}'. "
                f"District must be in canonical format. "
                f"Available districts for {province}: {available_districts}"
            )
        else:
            available_communes = get_communes_for_district(province, district)
            raise ValueError(
                f"Invalid commune: '{commune}' in district '{district}', province '{province}'. "
                f"Commune must be in canonical format. "
                f"Available communes for {district}, {province}: {available_communes}"
            )
    
    # 1. Load weather data
    # Province name normalization is handled in _get_weather_data()
    df = _get_weather_data(province, data_type)
    
    # Convert district and commune to climate data column format
    commune_column = to_climate_column_name(district, commune)
    
    if commune_column not in df.columns:
        raise ValueError(f"Commune '{commune}' in district '{district}' (column: '{commune_column}') not found in data. Available columns: {df.columns.tolist()}")

    # 2. Get available years
    years = sorted(df['Date'].dt.year.unique())[-weather_data_period:]
    if len(years) < weather_data_period:
        raise ValueError(f"Not enough years of data for {commune} in {province}.")

    # 3. For each year, for each period, calculate payout
    yearly_results = []
    for year in years:
        year_result = {"year": year, "periods": [], "total_payout": 0.0}
        period_idx = 0
        while period_idx < len(periods):
            # Group all perils for this period
            base_period = periods[period_idx]
            # Find all perils for this period (could be 1 or 2)
            perils = []
            # Always at least one peril per period
            for peril_offset in range(2):
                idx = period_idx + peril_offset
                if idx < len(periods):
                    p = periods[idx]
                    # If start_day and end_day match, it's the same period (multi-peril)
                    if p.get("start_day", 0) == base_period.get("start_day", 0) and p.get("end_day", 364) == base_period.get("end_day", 364):
                        # Get period window (start_day, end_day) or use full year
                        start_day = p.get("start_day", 0)
                        end_day = p.get("end_day", 364)
                        year_start = datetime(year, 1, 1) + timedelta(days=start_day)
                        year_end = datetime(year, 1, 1) + timedelta(days=end_day)
                        period_data = df[(df['Date'] >= year_start) & (df['Date'] <= year_end)][commune_column]
                        
                        # Add temperature data validation (filter out -999 values)
                        if data_type == "temperature":
                            period_data = period_data[period_data != -999]
                        
                        if len(period_data) < p["duration"]:
                            payout = 0.0
                            trigger_met = False
                            actual_value = None
                        else:
                            import numpy as np
                            rolling_sums = np.convolve(period_data.values, np.ones(p["duration"]), mode='valid')
                            if p["peril_type"] == "LRI":
                                min_rain = rolling_sums.min()
                                actual_value = float(min_rain)
                                trigger_met = min_rain < p["trigger"]
                                if trigger_met:
                                    payout = min((p["trigger"] - min_rain) * p["unit_payout"], p["max_payout"], p["allocated_si"])
                                else:
                                    payout = 0.0
                            elif p["peril_type"] == "ERI":
                                max_rain = rolling_sums.max()
                                actual_value = float(max_rain)
                                trigger_met = max_rain > p["trigger"]
                                if trigger_met:
                                    payout = min((max_rain - p["trigger"]) * p["unit_payout"], p["max_payout"], p["allocated_si"])
                                else:
                                    payout = 0.0
                            elif p["peril_type"] == "LTI":
                                # For temperature, use rolling averages instead of sums
                                rolling_avg = np.convolve(period_data.values, np.ones(p["duration"])/p["duration"], mode='valid')
                                min_temp = rolling_avg.min()
                                actual_value = float(min_temp)
                                trigger_met = min_temp < p["trigger"]
                                if trigger_met:
                                    payout = min((p["trigger"] - min_temp) * p["unit_payout"], p["max_payout"], p["allocated_si"])
                                else:
                                    payout = 0.0
                            elif p["peril_type"] == "HTI":
                                # For temperature, use rolling averages instead of sums
                                rolling_avg = np.convolve(period_data.values, np.ones(p["duration"])/p["duration"], mode='valid')
                                max_temp = rolling_avg.max()
                                actual_value = float(max_temp)
                                trigger_met = max_temp > p["trigger"]
                                if trigger_met:
                                    payout = min((max_temp - p["trigger"]) * p["unit_payout"], p["max_payout"], p["allocated_si"])
                                else:
                                    payout = 0.0
                        perils.append({
                            "peril_type": p["peril_type"],
                            "trigger": p["trigger"],
                            "duration": p["duration"],
                            "unit_payout": p["unit_payout"],
                            "max_payout": p["max_payout"],
                            "allocated_si": p["allocated_si"],
                            "trigger_met": trigger_met,
                            "payout": payout,
                            "actual_value": actual_value
                        })
                    else:
                        break
                else:
                    break
            # Add period with all perils
            year_result["periods"].append({
                "start_day": base_period.get("start_day", 0),
                "end_day": base_period.get("end_day", 364),
                "perils": perils
            })
            # Add payouts for all perils in this period
            year_result["total_payout"] += sum(peril["payout"] for peril in perils)
            period_idx += len(perils)
        yearly_results.append(year_result)

    # 4. Summarize payouts and calculate metrics
    yearly_total_payouts = [min(y["total_payout"], sum_insured) for y in yearly_results]
    Etotal = sum(yearly_total_payouts) / len(yearly_total_payouts) if yearly_total_payouts else 0.0
    max_payout_across_years = max(yearly_total_payouts) if yearly_total_payouts else 0.0
    payout_years = sum(1 for p in yearly_total_payouts if p > 0)
    coverage_score = payout_years / len(yearly_total_payouts) if yearly_total_payouts else 0.0
    payout_stability = pd.Series(yearly_total_payouts).std() if len(yearly_total_payouts) > 1 else 0.0
    
    # Premium calculation: expected payout as % of sum insured
    loaded_premium = Etotal * (1 + admin_loading + profit_loading)
    premium_rate = loaded_premium / sum_insured if sum_insured > 0 else 0.0
    loss_ratio = Etotal / loaded_premium if loaded_premium > 0 else 0.0
    
    # 5. Prepare breakdowns
    period_breakdown = []
    for idx, period in enumerate(periods):
        period_payouts = []
        for y in yearly_results:
            matching = next(
                (p for p in y["periods"] if p["start_day"] == period.get("start_day", 0) and p["end_day"] == period.get("end_day", 364)),
                None
            )
            if matching:
                period_payouts.append(sum(peril["payout"] for peril in matching["perils"]))
            else:
                period_payouts.append(0.0)
        period_avg = sum(period_payouts) / len(period_payouts)
        period_breakdown.append({
            "peril_type": period["peril_type"],
            "trigger": period["trigger"],
            "duration": period["duration"],
            "unit_payout": period["unit_payout"],
            "max_payout": period["max_payout"],
            "allocated_si": period["allocated_si"],
            "avg_payout": period_avg,
            "payout_years": sum(1 for p in period_payouts if p > 0)
        })

    # 6. Return all metrics
    # Calculate coverage penalty for periods with no payouts
    coverage_penalty = 0.0
    periods_with_no_payouts = 0
    total_periods = len(period_breakdown)
    
    for period in period_breakdown:
        if period["payout_years"] == 0:
            periods_with_no_payouts += 1
    
    # Coverage penalty: heavily penalize configurations with periods that never trigger
    if periods_with_no_payouts > 0:
        coverage_penalty = periods_with_no_payouts / total_periods
    
    return {
        "premium_rate": premium_rate,  # This is the pure premium as a fraction of total SI
        "avg_payout": Etotal,
        "max_payout": max_payout_across_years,
        "payout_years": payout_years,
        "coverage_score": coverage_score,
        "payout_stability_score": 1.0 / (1.0 + payout_stability),
        "period_breakdown": period_breakdown,
        "yearly_results": yearly_results,
        "valid": True,  # Remove strict validation - let scoring handle it
        "message": "OK",
        "loaded_premium": loaded_premium,
        "loss_ratio": loss_ratio,
        "coverage_penalty": coverage_penalty,
        "periods_with_no_payouts": periods_with_no_payouts
    } 