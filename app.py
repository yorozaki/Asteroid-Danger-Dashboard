from flask import Flask, render_template, jsonify
import requests
import json
import os
from datetime import datetime

# IMPORTANT FIX 👇
app = Flask(__name__, static_folder='static', template_folder='templates')


@app.route("/")
def index():
    api_key = os.environ.get("NASA_API_KEY", "DEMO_KEY")

    today = datetime.utcnow().strftime("%Y-%m-%d")
    url = (
        f"https://api.nasa.gov/neo/rest/v1/feed?"
        f"start_date={today}&end_date={today}&api_key={api_key}"
    )

    try:
        response = requests.get(url)
        data = response.json()
    except Exception as e:
        print("Error fetching NASA NEO data:", e)
        data = {"near_earth_objects": {today: []}}

    asteroids = data.get("near_earth_objects", {}).get(today, [])

    return render_template(
        "index.html",
        asteroids=asteroids,
        asteroids_json=json.dumps(asteroids),
        featured=asteroids[0] if asteroids else None,
    )


@app.route("/api/neos")
def get_neos():
    api_key = os.environ.get("NASA_API_KEY", "DEMO_KEY")

    today = datetime.utcnow().strftime("%Y-%m-%d")
    url = (
        f"https://api.nasa.gov/neo/rest/v1/feed?"
        f"start_date={today}&end_date={today}&api_key={api_key}"
    )

    try:
        r = requests.get(url)
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)})


if __name__ == "__main__":
    app.run(debug=True)
