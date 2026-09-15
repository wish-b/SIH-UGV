/** Perspective driving view used in the judges' demo. */
class FsdHudRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.roadTextureOffset = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth || window.innerWidth * 0.5;
    this.canvas.height = parent.clientHeight || 300;
  }

  render(entities = [], ugvState = 'CRUISING', steer = 0, speedKmh = 0, isDefense = false, isYielding = false, profile = {}, weather = 'CLEAR', laneOffset = 0) {
    if (!this.ctx) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    this.roadTextureOffset = (this.roadTextureOffset + speedKmh * 0.12) % 42;
    ctx.fillStyle = weather === 'NIGHT' ? '#050812' : isDefense ? '#071008' : '#8fc3e6';
    ctx.fillRect(0, 0, width, height);

    const horizon = height * 0.32;
    const roadWidth = profile.roadWidth || 7.2;
    const laneCenters = profile.laneCenters || [-1.8, 1.8];
    const vanishX = width / 2 - laneOffset * 8 + steer * 18;
    const roadBottomWidth = Math.min(width * 0.9, Math.max(width * 0.53, roadWidth * 58));
    const roadTopWidth = Math.max(34, roadBottomWidth * 0.13);

    this.drawBackdrop(ctx, width, height, horizon, profile.scenery, weather);
    this.drawRoad(ctx, width, height, horizon, vanishX, roadBottomWidth, roadTopWidth, laneCenters, roadWidth, isDefense, isYielding);
    this.drawTrajectory(ctx, width, height, horizon, vanishX, steer, isYielding, isDefense);

    [...entities].sort((a, b) => b.y - a.y).forEach(entity => {
      if (entity.y <= 0.4 || entity.y > 55) return;
      const depth = Math.min(1, entity.y / 55);
      const screenY = horizon + (height - horizon) * Math.pow(1 - depth, 1.58);
      const scale = Math.max(0.14, (screenY - horizon) / (height - horizon));
      const relativeX = entity.x - laneOffset;
      const screenX = vanishX + relativeX * (roadBottomWidth / roadWidth) * scale;
      this.drawEntity(ctx, entity, screenX, screenY, scale);
    });

    this.drawEgoUGV(ctx, width / 2, height - 24, isDefense);
    this.drawWeather(ctx, width, height, horizon, weather);
  }

  drawBackdrop(ctx, width, height, horizon, scenery, weather) {
    if (scenery === 'MOUNTAIN' || scenery === 'RURAL') {
      ctx.fillStyle = scenery === 'MOUNTAIN' ? '#52657c' : '#6b8e63';
      ctx.beginPath();
      ctx.moveTo(0, horizon + 28);
      [[0.1, -35], [0.22, 12], [0.38, -64], [0.56, 6], [0.72, -48], [0.9, 10], [1, -32]].forEach(([x, y]) => ctx.lineTo(width * x, horizon + y));
      ctx.lineTo(width, horizon + 42); ctx.lineTo(0, horizon + 42); ctx.fill();
      if (scenery === 'MOUNTAIN') {
        ctx.fillStyle = '#dbe8ed';
        ctx.beginPath(); ctx.moveTo(width * .38, horizon - 64); ctx.lineTo(width * .31, horizon - 18); ctx.lineTo(width * .45, horizon - 18); ctx.fill();
        ctx.beginPath(); ctx.moveTo(width * .72, horizon - 48); ctx.lineTo(width * .66, horizon - 15); ctx.lineTo(width * .78, horizon - 15); ctx.fill();
      }
    } else if (scenery === 'CITY' || scenery === 'CAMPUS' || scenery === 'INDUSTRIAL') {
      ctx.fillStyle = scenery === 'INDUSTRIAL' ? '#65717e' : '#6f89a0';
      for (let x = -10; x < width + 30; x += scenery === 'CAMPUS' ? 52 : 38) {
        const buildingHeight = scenery === 'CAMPUS' ? 25 + ((x / 11) % 3) * 8 : 28 + ((x / 7) % 4) * 12;
        ctx.fillRect(x, horizon - buildingHeight, scenery === 'CAMPUS' ? 44 : 30, buildingHeight + 18);
      }
    }
    if (weather === 'NIGHT') {
      ctx.fillStyle = '#f4e6ae';
      for (let i = 0; i < 26; i++) ctx.fillRect((i * 97) % width, 16 + (i * 41) % Math.max(35, horizon - 15), 1.2, 1.2);
    }
  }

  drawRoad(ctx, width, height, horizon, vanishX, bottomWidth, topWidth, lanes, roadWidth, isDefense, isYielding) {
    ctx.fillStyle = '#252c36';
    ctx.beginPath();
    ctx.moveTo(vanishX - topWidth / 2, horizon); ctx.lineTo(vanishX + topWidth / 2, horizon);
    ctx.lineTo(width / 2 + bottomWidth / 2, height); ctx.lineTo(width / 2 - bottomWidth / 2, height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = isDefense ? '#65e886' : '#d7e3eb';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(vanishX - topWidth / 2, horizon); ctx.lineTo(width / 2 - bottomWidth / 2, height); ctx.moveTo(vanishX + topWidth / 2, horizon); ctx.lineTo(width / 2 + bottomWidth / 2, height); ctx.stroke();

    const separators = lanes.slice(1).map((_, index) => (lanes[index] + lanes[index + 1]) / 2);
    separators.forEach(laneX => {
      for (let distance = this.roadTextureOffset; distance < height - horizon; distance += 38) {
        const p1 = distance / (height - horizon);
        const p2 = Math.min(1, (distance + 18) / (height - horizon));
        const x1 = vanishX + laneX / roadWidth * (topWidth + (bottomWidth - topWidth) * p1);
        const x2 = vanishX + laneX / roadWidth * (topWidth + (bottomWidth - topWidth) * p2);
        ctx.strokeStyle = isYielding ? '#ffaa00' : '#f8f4da'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x1, horizon + distance); ctx.lineTo(x2, horizon + distance + 18); ctx.stroke();
      }
    });
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let y = horizon + 20; y < height; y += 34) ctx.fillRect(0, y, width, 1);
  }

  drawTrajectory(ctx, width, height, horizon, vanishX, steer, isYielding, isDefense) {
    const colour = isYielding ? 'rgba(255,170,0,.35)' : isDefense ? 'rgba(80,250,123,.30)' : 'rgba(0,255,136,.30)';
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.moveTo(vanishX - 7, horizon); ctx.lineTo(vanishX + 7, horizon);
    ctx.lineTo(width / 2 + 34 + steer * 70, height - 18); ctx.lineTo(width / 2 - 34 + steer * 70, height - 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = isYielding ? '#ffaa00' : '#00ff88'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(width / 2, height - 10, 106, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
  }

  drawEntity(ctx, entity, x, y, scale) {
    const colour = entity.risk === 'CRITICAL' ? '#ff4252' : entity.risk === 'MEDIUM' ? '#ffb020' : '#00d2ff';
    const size = Math.max(13, 62 * scale);
    ctx.save(); ctx.translate(x, y);
    if (entity.type === 'VEHICLE') {
      ctx.fillStyle = '#27384b'; ctx.fillRect(-size * .5, -size * .55, size, size * .46);
      ctx.fillStyle = '#8ec6de'; ctx.fillRect(-size * .28, -size * .82, size * .56, size * .31);
      ctx.fillStyle = '#111922'; ctx.fillRect(-size * .48, -size * .12, size * .16, size * .2); ctx.fillRect(size * .32, -size * .12, size * .16, size * .2);
    } else if (entity.type === 'PEDESTRIAN') {
      ctx.fillStyle = '#f4d1b7'; ctx.beginPath(); ctx.arc(0, -size * .7, size * .15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2c4e70'; ctx.lineWidth = Math.max(2, size * .1); ctx.beginPath(); ctx.moveTo(0, -size * .55); ctx.lineTo(0, -size * .18); ctx.moveTo(0, -size * .4); ctx.lineTo(-size * .22, -size * .25); ctx.moveTo(0, -size * .4); ctx.lineTo(size * .22, -size * .25); ctx.stroke();
    } else if (entity.type === 'TREE') {
      ctx.fillStyle = '#765234'; ctx.fillRect(-size * .09, -size * .7, size * .18, size * .7); ctx.fillStyle = '#3f8759'; ctx.beginPath(); ctx.arc(0, -size * .8, size * .42, 0, Math.PI * 2); ctx.fill();
    } else if (entity.type === 'BOULDER' || entity.type === 'DEBRIS') {
      ctx.fillStyle = '#8c8278'; ctx.beginPath(); ctx.ellipse(0, -size * .2, size * .42, size * .28, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#f28a22'; ctx.fillRect(-size * .35, -size * .4, size * .7, size * .4); ctx.fillStyle = '#ffffff'; ctx.fillRect(-size * .35, -size * .28, size * .7, size * .08);
    }
    ctx.strokeStyle = colour; ctx.lineWidth = 1.5; ctx.strokeRect(-size * .58, -size, size * 1.16, size * .92);
    ctx.fillStyle = colour; ctx.font = `${Math.max(8, 10 * scale)}px JetBrains Mono, monospace`; ctx.fillText(`${entity.type} ${entity.y.toFixed(0)}m`, -size * .55, -size - 5); ctx.restore();
  }

  drawWeather(ctx, width, height, horizon, weather) {
    if (weather === 'FOG') { const mist = ctx.createLinearGradient(0, horizon - 25, 0, height); mist.addColorStop(0, 'rgba(225,235,238,.58)'); mist.addColorStop(1, 'rgba(225,235,238,.08)'); ctx.fillStyle = mist; ctx.fillRect(0, horizon - 25, width, height); }
    if (weather === 'RAIN') { ctx.strokeStyle = 'rgba(205,230,255,.45)'; ctx.lineWidth = 1; for (let x = 0; x < width; x += 17) { const y = (x * 3) % height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke(); } }
    if (weather === 'NIGHT') { const glow = ctx.createRadialGradient(width / 2, height, 10, width / 2, height, width * .7); glow.addColorStop(0, 'rgba(255,246,189,.16)'); glow.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height); }
  }

  drawEgoUGV(ctx, x, y, isDefense) {
    const colour = isDefense ? '#50fa7b' : '#00d2ff';
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = colour; ctx.shadowColor = colour; ctx.shadowBlur = 13; ctx.fillRect(-22, -34, 44, 42); ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2f7fb'; ctx.beginPath(); ctx.arc(0, -14, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1f2b38'; [-28, 23].forEach(wheelX => { ctx.fillRect(wheelX, -31, 6, 13); ctx.fillRect(wheelX, -4, 6, 13); }); ctx.restore();
  }
}
