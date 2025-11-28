# Asteroid Danger Dashboard

A real-time visualization of Near-Earth Objects (NEOs) using NASA’s NeoWs API.

## Features
- Real-time asteroid trajectory simulation (true physical timing)
- Real Earth rotation and Moon orbit (sidereal + lunar periods)
- Time-warp slider for accelerated visualization
- Interactive 2.5D orbital viewer:
  - Zoom (mouse wheel + pinch)
  - Rotate camera (left drag)
  - Tilt / altitude (Shift + drag)
  - Pan camera (right drag)
- Visual asteroid trails, labels, and closest-approach highlighting
- Backend built with Python + Flask
- Front-end uses HTML5 Canvas + custom orbital physics engine

## API Integration
Data is sourced from:
**NASA Near-Earth Object Web Service (NeoWs)**  
https://api.nasa.gov/

The API key is securely stored as a server-side environment variable 
and is **never exposed on the frontend**.

## Project Structure
/app.py
/templates/index.html
/static/style.css
/static/app.js


## How to Run Locally
1. Install dependencies:
	-pip install -r requirements.txt
2. Run the server:
	-http://127.0.0.1:5000



## Author
**Yorozaki**  
This project was developed as an academic assignment demonstrating API integration, data visualization, and custom real-time physics rendering.

