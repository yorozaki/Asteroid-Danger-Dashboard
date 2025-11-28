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

    /* ------------------------------------------------------------------
     * 1. NORMALIZE RAW NASA DATA → CLEAN STRUCTURE
     * ------------------------------------------------------------------ */

    const RAW_DATA = ASTEROID_DATA || [];

    function toNum(x) {
        const n = parseFloat(x);
        return Number.isFinite(n) ? n : 0;
    }

    function mapAsteroid(a) {
        const ca = (a.close_approach_data && a.close_approach_data[0]) || {};
        const missKm = toNum(ca.miss_distance && ca.miss_distance.kilometers);
        const speedKms = toNum(
            ca.relative_velocity && ca.relative_velocity.kilometers_per_second
        );

        const dateFull =
            ca.close_approach_date_full || ca.close_approach_date || "";

        let epochMs = 0;
        if (ca.epoch_date_close_approach) {
            epochMs = Number(ca.epoch_date_close_approach);
        } else if (dateFull) {
            // rough parse fallback
            const d = new Date(dateFull.replace(" ", "T") + "Z");
            epochMs = d.getTime();
        }
        if (!Number.isFinite(epochMs) || epochMs <= 0) {
            epochMs = Date.now();
        }

        const dKm = a.estimated_diameter
            ? a.estimated_diameter.kilometers || {}
            : {};
        const dMin = toNum(dKm.estimated_diameter_min);
        const dMax = toNum(dKm.estimated_diameter_max);
        const dAvg = (dMin + dMax) / 2 || dMin || dMax || 0;

        return {
            raw: a,
            name: a.name || "Unknown",
            diameter_km: dAvg, // average km
            speed_kms: speedKms,
            miss_distance_km: missKm,
            hazardous: !!a.is_potentially_hazardous_asteroid,
            closest_approach: dateFull,
            close_epoch_ms: epochMs
        };
    }

    const NEO_DATA = RAW_DATA.map(mapAsteroid);

    function fmtNum(n, digits = 2) {
        if (!Number.isFinite(n)) return "–";
        return n.toLocaleString(undefined, {
            maximumFractionDigits: digits
        });
    }

    /* ------------------------------------------------------------------
     * 2. LIST UI
     * ------------------------------------------------------------------ */

    NEO_DATA.forEach((a, i) => {
        const div = document.createElement("div");
        div.className = "neo-item";
        div.dataset.index = i;

        div.innerHTML = `
      <div class="neo-name">${a.name}</div>
      <div class="neo-line"><span>Diameter</span><span>${fmtNum(
            a.diameter_km
        )} km</span></div>
      <div class="neo-line"><span>Speed</span><span>${fmtNum(
            a.speed_kms
        )} km/s</span></div>
      <div class="neo-line"><span>Miss</span><span>${fmtNum(
            a.miss_distance_km,
            0
        )} km</span></div>
      <div class="neo-line"><span>Hazard</span><span>${a.hazardous ? "Yes" : "No"
            }</span></div>
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

    /* ------------------------------------------------------------------
     * 3. METRICS (top 6 cards)
     * ------------------------------------------------------------------ */

    function updateMetrics(i) {
        const a = NEO_DATA[i] || NEO_DATA[0];
        if (!a) return;

        mName.textContent = a.name;
        mDiameter.textContent = `${fmtNum(a.diameter_km)} km`;
        mSpeed.textContent = `${fmtNum(a.speed_kms)} km/s`;
        mMiss.textContent = `${fmtNum(a.miss_distance_km, 0)} km`;
        mApproach.textContent = a.closest_approach || "–";
        mHazard.textContent = a.hazardous ? "Hazardous" : "Not Hazardous";
        mHazard.style.color = a.hazardous ? "#ff5c66" : "#4fa3ff";
    }

    updateMetrics(0);
    updateListSelection();

    /* ------------------------------------------------------------------
     * 4. REAL-WORLD COUNTDOWN
     * ------------------------------------------------------------------ */

    function formatCountdown(msDiff) {
        const sign = msDiff >= 0 ? "-" : "+";
        const abs = Math.abs(msDiff);
        const days = Math.floor(abs / (1000 * 60 * 60 * 24));
        const hours = Math.floor(abs / (1000 * 60 * 60)) % 24;
        const mins = Math.floor(abs / (1000 * 60)) % 60;
        return `T${sign} ${days}d ${hours}h ${mins}m to closest approach`;
    }

    function updateCountdown() {
        const a = NEO_DATA[selectedIndex];
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

    /* ------------------------------------------------------------------
     * 5. ASTEROID MODEL (real-time fly-bys)
     * ------------------------------------------------------------------ */

    let maxSpeed = Math.max(...NEO_DATA.map((a) => a.speed_kms || 0));
    if (!isFinite(maxSpeed) || maxSpeed <= 0) maxSpeed = 1;

    const asteroids = NEO_DATA.map((a, i) => {
        const seed = i * 1733 + a.miss_distance_km;
        const angle = seededRandom(seed) * Math.PI * 2;

        let epochMs = a.close_epoch_ms || Date.now();
        if (epochMs < 1e9) epochMs *= 1000;

        return {
            data: a,
            angle,
            dMin: a.miss_distance_km || 1, // km
            speed: a.speed_kms || 1, // km/s
            epochClose: epochMs, // ms
            trail: []
        };
    });

    /* ------------------------------------------------------------------
     * 6. CANVAS SETUP + CAMERA
     * ------------------------------------------------------------------ */

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.width * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // rotation
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
        viewAngle += dx * 0.004;
    });

    // zoom
    let zoom = 1.0;
    const ZOOM_MIN = 0.35;
    const ZOOM_MAX = 5.0;
    const ZOOM_SPEED = 0.0016;

    canvas.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            zoom -= e.deltaY * ZOOM_SPEED;
            if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
            if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
        },
        { passive: false }
    );

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

    /* TIME & WARP */
    let simTimeMs = Date.now();
    let lastRealTs = performance.now();

    function getWarp() {
        const normalized = (slider.value - 50) / 25; // -2..2
        return Math.pow(2, normalized); // 0.25..4
    }

    slider.addEventListener("input", () => {
        timeLabel.textContent = `x${getWarp().toFixed(2)}`;
    });
    timeLabel.textContent = "x1.00";

    /* ------------------------------------------------------------------
     * 7. DRAW HELPERS
     * ------------------------------------------------------------------ */

    function drawEarth(cx, cy, r, simTimeSec) {
        const earthPeriod = 86164;
        const rotAngle = (simTimeSec / earthPeriod) * Math.PI * 2;

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

        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.7);
        glow.addColorStop(0, "rgba(80,160,255,0.26)");
        glow.addColorStop(1, "rgba(80,160,255,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawMoon(cx, cy, orbitR, simTimeSec, earthR) {
        const moonPeriod = 27.3217 * 24 * 3600;
        const angle = (simTimeSec / moonPeriod) * Math.PI * 2 + viewAngle;

        const mx = cx + orbitR * Math.cos(angle);
        const my = cy + orbitR * Math.sin(angle);
        const moonR = earthR * 0.27;

        ctx.save();
        ctx.strokeStyle = "#1f2a3f";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

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

        const pts = trail.filter((p) => Math.hypot(p.x - cx, p.y - cy) > dLast);
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

    /* ------------------------------------------------------------------
     * 8. MAIN ANIMATION LOOP (REAL TIME BASE)
     * ------------------------------------------------------------------ */

    function animate() {
        const realNow = performance.now();
        const dtReal = (realNow - lastRealTs) / 1000;
        lastRealTs = realNow;

        const warp = getWarp();
        simTimeMs += dtReal * 1000 * warp;
        const simTimeSec = simTimeMs / 1000;

        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.width;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

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

            const dtSec = (simTimeMs - epochClose) / 1000;
            const distKm = Math.sqrt(dMin * dMin + (speed * dtSec) * (speed * dtSec));

            const dNear = dMin;
            const dFar = dMin * 10;
            let tNorm;
            if (distKm <= dNear) tNorm = 0;
            else if (distKm >= dFar) tNorm = 1;
            else tNorm = (distKm - dNear) / (dFar - dNear);

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
