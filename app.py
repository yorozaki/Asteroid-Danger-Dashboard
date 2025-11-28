import os
import json
import datetime as dt
from flask import Flask, render_template
import requests

app = Flask(__name__)

NASA_API_URL = "https://api.nasa.gov/neo/rest/v1/feed"


def fetch_neo_data():
    api_key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    today = dt.date.today()

    params = {
        "start_date": today.isoformat(),
        "end_date": today.isoformat(),
        "api_key": api_key,
    }

    resp = requests.get(NASA_API_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    neos = []

    for _, objects in data.get("near_earth_objects", {}).items():
        for neo in objects:
            if not neo.get("close_approach_data"):
                continue

            cad = neo["close_approach_data"][0]

            dmin = neo["estimated_diameter"]["kilometers"]["estimated_diameter_min"]
            dmax = neo["estimated_diameter"]["kilometers"]["estimated_diameter_max"]
            diameter = (dmin + dmax) / 2.0

            neos.append(
                {
                    "name": neo["name"],
                    "diameter_km": round(diameter, 3),
                    "speed_kms": float(
                        cad["relative_velocity"]["kilometers_per_second"]
                    ),
                    "miss_distance_km": float(cad["miss_distance"]["kilometers"]),
                    "closest_approach": cad.get("close_approach_date_full")
                    or cad.get("close_approach_date"),
                    # Real epoch ms for countdown
                    "close_epoch_ms": int(cad.get("epoch_date_close_approach", 0)),
                    "hazardous": bool(
                        neo["is_potentially_hazardous_asteroid"]
                    ),
                }
            )

    # sort by closest miss distance
    neos.sort(key=lambda x: x["miss_distance_km"])
    return neos


@app.route("/")
def index():
    try:
        asteroids = fetch_neo_data()
    except Exception as e:
        print("NASA API ERROR:", e)
        asteroids = [
            {
                "name": "(Dummy 2025 A)",
                "diameter_km": 0.1,
                "speed_kms": 15.2,
                "miss_distance_km": 800000,
                "closest_approach": "2025-Jan-01 12:00",
                "close_epoch_ms": 0,
                "hazardous": False,
            }
        ]

    return render_template(
        "index.html",
        asteroids=asteroids,
        asteroids_json=json.dumps(asteroids),
        featured=asteroids[0] if asteroids else None,
    )


if __name__ == "__main__":
    app.run(debug=True)
