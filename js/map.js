/**
 * Interactive Local SLAM Canvas & Visual Occupancy Grid Visualizer
 * Renders forward optical sensory cone, discovered terrain, dynamic path ribbon,
 * and live interactive hazard injection (GPS-Free Architecture).
 */
class MapController {
  constructor(containerId) {
    // Robust container lookup: Checks for new slam container or legacy map wrapper
    const container = document.getElementById(containerId) 
                   || document.getElementById('slam-wrapper')
                   || document.getElementById('map-wrapper') 
                   || document.getElementById('leaflet-map');

    if (container) {
      container.innerHTML = `<canvas id="slam-canvas" style="width:100%;height:100%;display:block;"></canvas>`;
    }

    this.canvas = document.getElementById('slam-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
    }

    this.traversedFrontier = []; // Traversed path history
    this.onSlamClickCallback = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Interactive hazard injection directly into sensory grid
    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => {
        if (!this.onSlamClickCallback) return;
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height * 0.82;
        const meterScale = 5.2;

        const meterX = (clickX - centerX) / meterScale;
        const meterY = (centerY - clickY) / meterScale;

        if (meterY > 0 && meterY <= 45) {
          this.onSlamClickCallback(meterX, meterY);
        }
      });
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth || window.innerWidth * 0.5;
      this.canvas.height = parent.clientHeight || 300;
    }
  }

  /**
   * Main SLAM Rendering Routine
   */
  updateGrid(pose = { x: 0, y: 0, yaw: 0 }, entities = [], localPath = [], isDefenseMode = false, isYielding = false, profile = {}, laneOffset = 0) {
    if (!this.canvas || !this.ctx) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // 1. Clear background
    ctx.fillStyle = isDefenseMode ? '#040905' : '#04080e';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.82;
    const meterScale = 5.2; // 5.2 pixels per real-world meter

    // 2. Draw Orthogonal Metric Grid (10m intervals)
    ctx.strokeStyle = isDefenseMode ? 'rgba(80, 250, 120, 0.06)' : 'rgba(0, 210, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(centerX, centerY);

    // Scenario road geometry makes the local map read like a real road map,
    // including additional lanes on city streets and highways.
    this.drawRoadNetwork(ctx, meterScale, profile, laneOffset, isDefenseMode);

    // 3. Optical Forward Field of View (FOV Cone: 90° sweep, 40m depth)
    const fovRadius = 40 * meterScale;
    const fovGradient = ctx.createRadialGradient(0, 0, 8, 0, 0, fovRadius);
    if (isDefenseMode) {
      fovGradient.addColorStop(0, 'rgba(80, 250, 123, 0.22)');
      fovGradient.addColorStop(0.75, 'rgba(80, 250, 123, 0.04)');
      fovGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
      fovGradient.addColorStop(0, 'rgba(0, 210, 255, 0.22)');
      fovGradient.addColorStop(0.75, 'rgba(0, 210, 255, 0.04)');
      fovGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }

    ctx.fillStyle = fovGradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, fovRadius, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.closePath();
    ctx.fill();

    // 4. Distance Range Rings (10m, 20m, 30m, 40m)
    ctx.strokeStyle = isDefenseMode ? 'rgba(80, 250, 123, 0.2)' : 'rgba(0, 210, 255, 0.2)';
    ctx.setLineDash([3, 4]);
    for (let r = 10; r <= 40; r += 10) {
      ctx.beginPath();
      ctx.arc(0, 0, r * meterScale, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      ctx.fillStyle = isDefenseMode ? '#50fa7b' : '#00d2ff';
      ctx.font = '9px monospace';
      ctx.fillText(`${r}m`, 5, -r * meterScale);
    }
    ctx.setLineDash([]);

    // 5. Sector Boundary Vectors
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([2, 4]);
    [-0.58, -0.42].forEach(angleFraction => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(Math.PI * angleFraction) * fovRadius, Math.sin(Math.PI * angleFraction) * fovRadius);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 6. Render Dynamic Trajectory Corridor Ribbon
    if (localPath && localPath.length > 0) {
      ctx.strokeStyle = isYielding ? '#ffaa00' : '#00ff88';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      localPath.forEach(pt => {
        ctx.lineTo((pt.x - laneOffset) * meterScale, -pt.y * meterScale);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 7. Draw Detected Outdoor Entities
    entities.forEach(obj => {
      if (obj.y < 0.4 || obj.y > 45) return;

      const sx = (obj.x - laneOffset) * meterScale;
      const sy = -obj.y * meterScale;

      const color = obj.risk === 'CRITICAL' ? '#ff3344' : (obj.risk === 'MEDIUM' ? '#ffaa00' : '#00d2ff');

      // Motion Direction Vector for dynamic entities
      if (!obj.isStatic && obj.speed > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.sin(obj.heading) * 14, sy - Math.cos(obj.heading) * 14);
        ctx.stroke();
      }

      // Feature Indicator Dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, 2 * Math.PI);
      ctx.fill();

      // Proximity Envelope
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, 2 * Math.PI);
      ctx.stroke();

      // Entity Label Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.fillText(`${(obj.type || '').replace('ONCOMING_', '')}`, sx + 8, sy + 3);
    });

    // 8. Ego UGV Robot Base Triangle
    ctx.fillStyle = isDefenseMode ? '#50fa7b' : '#00d2ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(9, 10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // 9. OSD Telemetry & Frontier Exploration Status
    ctx.fillStyle = isDefenseMode ? '#50fa7b' : '#00d2ff';
    ctx.font = '10px monospace';
    ctx.fillText(`${profile.roadName || 'LOCAL ROAD'} · LOCAL OCCUPANCY MAP`, 12, 18);
    ctx.fillStyle = '#829ab1';
    ctx.fillText(`FRONTIER: ${(pose.exploredDistance || 0).toFixed(1)}m | LATERAL DRIFT: ${(pose.x || 0).toFixed(2)}m | YAW: ${((pose.yaw || 0) * 57.3).toFixed(1)}°`, 12, 32);
  }

  drawRoadNetwork(ctx, scale, profile, laneOffset, isDefenseMode) {
    const roadWidth = profile.roadWidth || 7.2;
    const lanes = profile.laneCenters || [-1.8, 1.8];
    const roadCenter = -laneOffset;
    ctx.fillStyle = '#1b2732';
    ctx.fillRect((roadCenter - roadWidth / 2) * scale, -58 * scale, roadWidth * scale, 60 * scale);
    ctx.strokeStyle = isDefenseMode ? 'rgba(80,250,123,.55)' : 'rgba(208,227,238,.55)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect((roadCenter - roadWidth / 2) * scale, -58 * scale, roadWidth * scale, 60 * scale);
    ctx.setLineDash([5, 5]);
    lanes.slice(1).forEach((_, index) => {
      const separator = (lanes[index] + lanes[index + 1]) / 2 - laneOffset;
      ctx.beginPath(); ctx.moveTo(separator * scale, 0); ctx.lineTo(separator * scale, -58 * scale); ctx.stroke();
    });
    ctx.setLineDash([]);
    if (['CITY', 'CAMPUS', 'INDUSTRIAL'].includes(profile.scenery)) {
      ctx.fillStyle = 'rgba(105,135,158,.38)';
      ctx.fillRect(-55 * scale, -31 * scale, 110 * scale, 4.4 * scale);
    }
    if (profile.scenery === 'MOUNTAIN') {
      ctx.fillStyle = 'rgba(125,104,82,.55)';
      for (let y = -12; y > -55; y -= 10) { ctx.beginPath(); ctx.arc((-roadWidth / 2 - 2 - laneOffset) * scale, y * scale, 5, 0, Math.PI * 2); ctx.arc((roadWidth / 2 + 2 - laneOffset) * scale, y * scale, 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  clear() {
    this.traversedFrontier = [];
  }
}
