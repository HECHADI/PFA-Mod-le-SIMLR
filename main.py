from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np

app = FastAPI(title="SIMLR API - ENSEM")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

URL_CAS_CONFIRMES = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv"
URL_DECES = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv"
URL_RECOVERED = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_recovered_global.csv"


def run_sir_model(S0: float, I0: float, R0_val: float, N: float, beta: float, gamma: float, days: int):
    """
    Run the discrete SIR model for `days` steps.
    Returns lists of S, I, R values.
    """
    S, I, R = S0, I0, R0_val
    results = []
    for _ in range(days):
        new_infected = beta * S * I / N
        new_recovered = gamma * I
        S = max(0, S - new_infected)
        I = max(0, I + new_infected - new_recovered)
        R = R + new_recovered
        results.append((round(S), round(I), round(R)))
    return results


@app.get("/api/epidemic/{country}")
async def get_data(
    country: str,
    beta: float = Query(default=0.3, ge=0.01, le=1.0, description="Taux de transmission β"),
    gamma: float = Query(default=0.05, ge=0.001, le=0.5, description="Taux de guérison γ"),
):
    try:
        df_confirmed = pd.read_csv(URL_CAS_CONFIRMES)
        df_deaths = pd.read_csv(URL_DECES)

        country_mapping = {
            "Morocco": "Morocco",
            "France": "France",
            "USA": "US"
        }
        jhu_country_name = country_mapping.get(country, country)

        country_data_c = df_confirmed[df_confirmed['Country/Region'] == jhu_country_name]
        country_data_d = df_deaths[df_deaths['Country/Region'] == jhu_country_name]

        if country_data_c.empty:
            raise HTTPException(status_code=404, detail="Pays non trouvé dans la base JHU")

        # Aggregate provinces
        time_series_c = country_data_c.iloc[:, 4:].sum(axis=0)
        time_series_d = country_data_d.iloc[:, 4:].sum(axis=0)

        N_pop = {
            "Morocco": 37_000_000,
            "France": 68_000_000,
            "USA": 330_000_000
        }.get(country, 10_000_000)

        dates = time_series_c.index

        # Use all data (no artificial 60-day limit — let frontend handle zoom)
        formatted_data = []
        for idx in range(len(dates)):
            date_str = dates[idx]
            cum_infected = int(time_series_c.iloc[idx])
            cum_deaths = int(time_series_d.iloc[idx])

            if cum_infected == 0:
                continue  # Skip empty leading rows

            recovered_estimated = int(cum_infected * 0.94)
            infected_active = max(1, cum_infected - cum_deaths - recovered_estimated)
            susceptible = max(0, N_pop - infected_active - recovered_estimated - cum_deaths)

            try:
                clean_date = pd.to_datetime(date_str).strftime('%Y-%m-%d')
            except Exception:
                clean_date = date_str

            formatted_data.append({
                "date": clean_date,
                "susceptible": susceptible,
                "infected": infected_active,
                "recovered": recovered_estimated,
                "deaths": cum_deaths,
            })

        if not formatted_data:
            raise HTTPException(status_code=404, detail="Pas de données pour ce pays")

        # ---------- SIR model projection ----------
        # Seed from the last known data point
        last = formatted_data[-1]
        I0 = max(1, last["infected"])
        R0_val = last["recovered"]
        S0 = last["susceptible"]

        projection_days = 90
        sir_results = run_sir_model(S0, I0, R0_val, N_pop, beta, gamma, projection_days)

        last_date = pd.to_datetime(formatted_data[-1]["date"])
        projection_data = []
        for i, (s, inf, r) in enumerate(sir_results):
            proj_date = (last_date + pd.Timedelta(days=i + 1)).strftime('%Y-%m-%d')
            projection_data.append({
                "date": proj_date,
                "susceptible": s,
                "infected": inf,
                "recovered": r,
                "is_projection": True,
            })

        # Compute R0 = beta / gamma
        basic_reproduction_number = round(beta / gamma, 2)

        return {
            "historical": formatted_data,
            "projection": projection_data,
            "meta": {
                "country": country,
                "population": N_pop,
                "beta": beta,
                "gamma": gamma,
                "R0": basic_reproduction_number,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
