// Deterministic random so asteroid layout is stable across reloads
function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("spaceCanvas");
    const ctx = canvas.getContext("2d");

    const slider = document.getElementById("timeSlider");
    const timeLabel = document.getElementById("time-label");
    const countdownEl = document.getElementById("countdown");

    const neoListEl = document.getElementById("neo-list");

    const mName = document.getElementById("m-name");
    const mDiameter = document.getElementById("m-diameter");
    const mSpeed = document.getElementById("m-speed");
    const mMiss = document.getElementById("m-miss");
    const mApproach = document.getElementById("m-approach");
    const mHazard = document.getElementById("m-hazard");

    let selectedIndex = 0;

    /* ----------------------------- LIST UI ----------------------------- */
    ASTEROID_DATA.forEach((a, i) => {
        const div = document.createElement("div");
        div.className = "neo-item";
        div.dataset.index = i;

        div.innerHTML = `
      <div class="neo-name">${a.name}</div>
      <div class="neo-line"><span>Diameter</span><span>${a.diameter_km} km</span></div>
      <div class="neo-line"><span>Speed</span><span>${a.speed_kms} km/s</span></div>
      <div class="neo-line"><span>Miss</span><span>${a.miss_distance_km.toLocaleString()} km</span></div>
      <div class="neo-line"><span>Hazard</span><span>${a.hazardous ? "Yes" : "No"}</span></div>
    `;

        div.addEventListener("click", () => {
            selectedIndex = i;
            updateMetrics(i);
            updateListSelection();
            updateCountdown();
        });

        neoListEl.appendChild(div);
    });

    function updateListSelection() {
        neoListEl.querySelectorAll(".neo-item").forEach((el) => {
            el.classList.toggle("active", Number(el.dataset.index) === selectedIndex);
        });
    }

    /* ----------------------------- METRICS ----------------------------- */
    function updateMetrics(i) {
        const a = ASTEROID_DATA[i];
        mName.textContent = a.name;
        mDiameter.textContent = `${a.diameter_km} km`;
        mSpeed.textContent = `${a.speed_kms} km/s`;
        mMiss.textContent = `${a.miss_distance_km.toLocaleString()} km`;
        mApproach.textContent = a.closest_approach;
        mHazard.textContent = a.hazardous ? "Hazardous" : "Not Hazardous";
        mHazard.style.color = a.hazardous ? "#ff5c66" : "#4fa3ff";
    }

    updateMetrics(0);
    updateListSelection();

    /* ----------------------------- COUNTDOWN (real-world) ----------------------------- */
    function formatCountdown(msDiff) {
        const sign = msDiff >= 0 ? "-" : "+";
        const abs = Math.abs(msDiff);
        const days = Math.floor(abs / (1000 * 60 * 60 * 24));
        const hours = Math.floor(abs / (1000 * 60 * 60)) % 24;
        const mins = Math.floor(abs / (1000 * 60)) % 60;
        return `T${sign} ${days}d ${hours}h ${mins}m to closest approach`;
    }

    function updateCountdown() {
        const a = ASTEROID_DATA[selectedIndex];
        if (!a || !a.close_epoch_ms) {
            countdownEl.textContent = "";
            return;
        }
        const now = Date.now();
        const diff = a.close_epoch_ms - now;
        countdownEl.textContent = formatCountdown(diff);
    }

    updateCountdown();
    setInterval(updateCountdown, 60_000);

    /* ----------------------------- ASTEROID MODEL (real-time) ----------------------------- */

    // We build a simple physically-plausible fly-by:
    // distance^2 = d_min^2 + (v * Δt)^2
    // (straight-line trajectory with miss distance d_min and speed v)
    let maxSpeed = Math.max(...ASTEROID_DATA.map(a => a.speed_kms || 0));
    if (!isFinite(maxSpeed) || maxSpeed <= 0) maxSpeed = 1;

    const asteroids = ASTEROID_DATA.map((a, i) => {
        const seed = i * 1733 + a.miss_distance_km;
        const angle = seededRandom(seed) * Math.PI * 2;  // orientation in plane

        let epochMs = a.close_epoch_ms || Date.now();
        // normalize weird zeros
        if (epochMs < 1e9) epochMs *= 1000;

        return {
            data: a,
            angle,
            dMin: a.miss_distance_km,      // km
            speed: a.speed_kms,            // km/s
            epochClose: epochMs,           // ms
            trail: [],
        };
    });

    /* ----------------------------- CANVAS SETUP ----------------------------- */
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.width * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    /* ----------------------------- CAMERA ROTATION ----------------------------- */
    let viewAngle = 0;
    let dragging = false;
    let lastX = 0;

    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        lastX = e.clientX;
    });
    window.addEventListener("mouseup", () => (dragging = false));
    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        viewAngle += dx * 0.004; // rotate slowly
    });

    /* ----------------------------- CAMERA ZOOM ----------------------------- */
    // 1.0 = normal view. Allow zoom 0.5x to 5x
    let zoom = 1.0;
    const ZOOM_MIN = 0.35;
    const ZOOM_MAX = 5.0;
    const ZOOM_SPEED = 0.0016;

    // Mouse wheel zoom
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();

        // scroll up → zoom in ; scroll down → zoom out
        zoom -= e.deltaY * ZOOM_SPEED;

        if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
        if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
    }, { passive: false });

    // Pinch zoom for touchpads
    let lastTouchDist = null;

    canvas.addEventListener("touchmove", (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (lastTouchDist !== null) {
                const diff = dist - lastTouchDist;
                zoom += diff * 0.003;
                if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
                if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
            }
            lastTouchDist = dist;
        }
    });

    canvas.addEventListener("touchend", () => {
        lastTouchDist = null;
    });

    /* ----------------------------- TIME & WARP ----------------------------- */
    // simTimeMs tracks a "virtual now". At warp=1, it stays synced to real time.
    let simTimeMs = Date.now();
    let lastRealTs = performance.now();

    // Slider: center (50) = 1x real; edges warp exponentially: 0.25x .. 4x
    function getWarp() {
        const normalized = (slider.value - 50) / 25; // -2 .. 2
        return Math.pow(2, normalized);              // 0.25 .. 4
    }

    slider.addEventListener("input", () => {
        timeLabel.textContent = `x${getWarp().toFixed(2)}`;
    });
    timeLabel.textContent = "x1.00";

    /* ----------------------------- DRAW HELPERS ----------------------------- */
    function drawEarth(cx, cy, r, simTimeSec) {
        // Earth rotation angle (sidereal day ~86164 s)
        const earthPeriod = 86164; // seconds
        const rotAngle = (simTimeSec / earthPeriod) * Math.PI * 2;

        // Move highlight point around equator to suggest rotation
        const hx = cx + r * 0.4 * Math.cos(rotAngle);
        const hy = cy - r * 0.4 * Math.sin(rotAngle);

        const g = ctx.createRadialGradient(hx, hy, r * 0.2, cx, cy, r);
        g.addColorStop(0, "#f8fbff");
        g.addColorStop(0.25, "#a1d0ff");
        g.addColorStop(0.6, "#225f9f");
        g.addColorStop(1, "#001020");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Simple atmospheric glow
        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.7);
        glow.addColorStop(0, "rgba(80,160,255,0.26)");
        glow.addColorStop(1, "rgba(80,160,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawMoon(cx, cy, orbitR, simTimeSec, earthR) {
        const moonPeriod = 27.3217 * 24 * 3600; // seconds
        const angle = (simTimeSec / moonPeriod) * Math.PI * 2 + viewAngle;

        const mx = cx + orbitR * Math.cos(angle);
        const my = cy + orbitR * Math.sin(angle);
        const moonR = earthR * 0.27; // realistic radius ratio

        // orbit path
        ctx.save();
        ctx.strokeStyle = "#1f2a3f";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // moon body
        const m = ctx.createRadialGradient(
            mx - moonR * 0.3,
            my - moonR * 0.3,
            moonR * 0.1,
            mx,
            my,
            moonR
        );
        m.addColorStop(0, "#ffffff");
        m.addColorStop(0.5, "#dcdcdc");
        m.addColorStop(1, "#7b7b7b");

        ctx.fillStyle = m;
        ctx.beginPath();
        ctx.arc(mx, my, moonR, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawAsteroid(x, y, radius, fillColor, strokeColor, label) {
        ctx.save();

        if (radius > 10) {
            ctx.shadowBlur = 18;
            ctx.shadowColor = fillColor;
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.lineWidth = 1.4;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.font = "11px Space Grotesk";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "#a6c9ff";
        ctx.fillText(label, x, y - radius - 6);

        ctx.restore();
    }

    function drawTrail(trail, cx, cy) {
        if (trail.length < 2) return;

        const last = trail[trail.length - 1];
        const dLast = Math.hypot(last.x - cx, last.y - cy);

        // Only keep points "behind" the asteroid (farther from Earth)
        const pts = trail.filter(p => Math.hypot(p.x - cx, p.y - cy) > dLast);
        if (pts.length < 2) return;

        ctx.lineWidth = 2;
        for (let i = 0; i < pts.length - 1; i++) {
            const alpha = (i + 1) / pts.length;
            ctx.strokeStyle = `rgba(77,163,255,${alpha * 0.45})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
            ctx.stroke();
        }
    }

    /* ----------------------------- ANIMATION LOOP (REAL TIME BASE) ----------------------------- */
    function animate() {
        const realNow = performance.now();
        const dtReal = (realNow - lastRealTs) / 1000; // seconds
        lastRealTs = realNow;

        const warp = getWarp(); // 1.0 = real time
        simTimeMs += dtReal * 1000 * warp;

        const simTimeSec = simTimeMs / 1000;

        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.width;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = "#1a2435";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = w / 10;
        for (let x = step; x < w; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = step; y < h; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();

        const earthR = w * 0.09 * zoom;
        drawEarth(cx, cy, earthR, simTimeSec);
        drawMoon(cx, cy, earthR * 2.2 * zoom, simTimeSec, earthR);

        const maxR = w * 0.45;

        asteroids.forEach((obj, i) => {
            const { dMin, speed, epochClose } = obj;

            // Time offset relative to closest approach (seconds), using REAL TIME
            const dtSec = (simTimeMs - epochClose) / 1000;

            // Straight-line fly-by: distance^2 = d_min^2 + (v * dt)^2
            const distKm = Math.sqrt(dMin * dMin + (speed * dtSec) * (speed * dtSec));

            // Distance mapping: linear near Earth, clamped far away
            const dNear = dMin;
            const dFar = dMin * 10; // beyond this, we visually clamp
            let tNorm;
            if (distKm <= dNear) {
                tNorm = 0; // at closest
            } else if (distKm >= dFar) {
                tNorm = 1;
            } else {
                tNorm = (distKm - dNear) / (dFar - dNear); // 0..1
            }

            const maxRZ = maxR * zoom;
            const rScreen = earthR * 1.2 + tNorm * (maxRZ - earthR * 1.2);

            const angle = obj.angle + viewAngle;
            const x = cx + rScreen * Math.cos(angle);
            const y = cy + rScreen * Math.sin(angle);

            obj.trail.push({ x, y });
            if (obj.trail.length > 30) obj.trail.shift();

            drawTrail(obj.trail, cx, cy);

            const isClosest = i === 0;
            const baseR = 4 + obj.data.diameter_km * 2;
            const radius = (isClosest ? baseR * 1.8 : baseR) * zoom;


            const fill = isClosest
                ? "#ffb34d"
                : obj.data.hazardous
                    ? "#ff5c66"
                    : "#ffffff";
            const outline = isClosest
                ? "#ffe5b5"
                : obj.data.hazardous
                    ? "#ff9aa6"
                    : "#4fa3ff";

            drawAsteroid(x, y, radius, fill, outline, obj.data.name);
        });

        requestAnimationFrame(animate);
    }

    animate();
});
