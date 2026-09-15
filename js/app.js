/** Main dashboard controller and presentation-safe simulation loop. */
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  const nav = new NavigationEngine();
  const objManager = new EnvironmentObjectManager();
  const ai = new AIDecisionEngine();
  const hud = new FsdHudRenderer('fsd-canvas');
  const mapCtrl = new MapController('map-wrapper');
  const telemetry = new TelemetryManager();
  const comms = new HardwareCommunicationBus();

  let isRunning = false;
  let emergencyActive = false;
  let simSpeed = 1;
  let activeWeather = 'CLEAR';
  let isDefenseMode = false;
  let pendingHazardSpawn = null;
  let activeSelectedEntity = null;
  let currentSpeedMs = 0;
  let demoTimers = [];
  let lastDecision = { throttle: 0, brake: 0, steer: 0, state: 'STANDBY' };
  let lastVisual = { sectors: { left: { clearance: 40 }, center: { clearance: 40 }, right: { clearance: 40 } }, currentGoal: 'Ready for autonomous route.' };

  function logStream(message, cssClass = '') {
    const logBox = document.getElementById('mission-log-stream');
    if (!logBox) return;
    const row = document.createElement('div');
    row.className = `log-entry ${cssClass}`;
    row.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
    logBox.appendChild(row);
    while (logBox.children.length > 24) logBox.removeChild(logBox.firstChild);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function bindClick(id, handler) {
    const element = document.getElementById(id);
    if (element) element.onclick = handler;
  }

  function applyScenario(scenario, announce = true) {
    objManager.generateOutdoorScenario(scenario);
    nav.setScenario(objManager.profile);
    nav.reset();
    mapCtrl.clear();
    currentSpeedMs = 0;
    telemetry.speedKmh = 0;
    telemetry.throttle = 0;
    telemetry.brake = 0;
    if (announce) logStream(`Scenario loaded: ${objManager.profile.roadName}. Natural road users and roadside features placed.`, 'log-sys');
  }

  function setSimState(active, source = 'operator') {
    if (active) {
      emergencyActive = false;
      telemetry.brake = 0;
    }
    isRunning = active;
    const dot = document.getElementById('sys-status-dot');
    const text = document.getElementById('sys-status-text');
    if (dot) dot.className = `status-dot ${active ? 'green' : 'red'} pulse`;
    if (text) text.innerText = active ? 'AUTONOMOUS DRIVE ACTIVE' : emergencyActive ? 'EMERGENCY STOP — SAFE' : 'SYSTEM STANDBY';
    logStream(`${source}: ${active ? 'autonomous drive started' : 'simulation paused'}.`);
  }

  function emergencyStop(source = 'Operator') {
    demoTimers.forEach(timer => clearTimeout(timer));
    demoTimers = [];
    emergencyActive = true;
    isRunning = false;
    currentSpeedMs = 0;
    telemetry.speedKmh = 0;
    telemetry.throttle = 0;
    telemetry.brake = 10;
    ai.currentState = 'FAILSAFE_EMERGENCY_HALT';
    ai.currentRisk = 'CRITICAL';
    ai.lastAnnouncement = 'Emergency stop active. The rover is stationary and awaiting a new Start command.';
    lastDecision = { throttle: 0, brake: 10, steer: 0, state: ai.currentState };
    const dot = document.getElementById('sys-status-dot');
    const text = document.getElementById('sys-status-text');
    if (dot) dot.className = 'status-dot red';
    if (text) text.innerText = 'EMERGENCY STOP — SAFE';
    logStream(`${source}: emergency stop engaged. Rover brought to a safe stop.`, 'log-danger');
  }

  function toggleDefenseMode(force = null) {
    isDefenseMode = force !== null ? force : !isDefenseMode;
    document.body.classList.toggle('mode-defense', isDefenseMode);
    document.body.classList.toggle('mode-commercial', !isDefenseMode);
    const label = document.getElementById('current-mode-label');
    if (label) label.innerText = isDefenseMode ? 'TACTICAL FIELD RECON' : 'CIVILIAN RECON / SURVEY';
    logStream(`Visual profile switched to ${isDefenseMode ? 'tactical field recon' : 'civilian survey'}.`, 'log-sys');
  }

  function applyVoiceCommand(command, transcript = '') {
    logStream(`Voice command: “${transcript || command}” → ${command}.`, 'log-sys');
    if (command === 'START') setSimState(true, 'Voice command');
    if (command === 'STOP') setSimState(false, 'Voice command');
    if (command === 'EMERGENCY') emergencyStop('Voice command');
    if (command === 'LANE_LEFT' || command === 'LANE_RIGHT') {
      const direction = command.replace('LANE_', '');
      const changed = nav.requestLaneChange(direction, 'Voice command');
      ai.lastAnnouncement = changed ? `Voice confirmed. Preparing a smooth lane change to the ${direction.toLowerCase()}.` : `Voice confirmed. There is no lane available to the ${direction.toLowerCase()}.`;
      if (!isRunning) setSimState(true, 'Voice command');
    }
    if (command === 'REPLAN') {
      nav.requestLaneChange(nav.laneIndex === 0 ? 'RIGHT' : 'LEFT', 'Voice replan');
    }
  }

  function updateVoiceButton(status, detail = '') {
    const button = document.getElementById('btn-voice-toggle');
    if (!button) return;
    const labels = {
      LISTENING: 'Voice: Listening', HEARD: `Heard: ${detail}`, RETRYING: 'Voice: Reconnecting',
      PERMISSION_DENIED: 'Voice: Allow microphone', UNSUPPORTED: 'Voice: Unsupported', UNKNOWN: `Not understood: ${detail}`, OFF: 'Voice: Off'
    };
    button.classList.toggle('voice-active', ['LISTENING', 'HEARD', 'RETRYING'].includes(status));
    button.innerHTML = `<i data-lucide="mic"></i> ${labels[status] || 'Voice: Active'}`;
    button.title = 'Commands: start, stop, emergency stop, change lane left, change lane right';
    if (window.lucide) lucide.createIcons();
  }

  const voice = new VoiceCommandEngine(applyVoiceCommand, updateVoiceButton);

  mapCtrl.onSlamClickCallback = (meterX, meterY) => {
    if (!pendingHazardSpawn) return;
    const dynamic = pendingHazardSpawn === 'VEHICLE' || pendingHazardSpawn === 'PEDESTRIAN';
    objManager.addEntity(new TrackedEntity({
      type: pendingHazardSpawn, x: meterX + nav.laneOffset, y: meterY,
      speed: pendingHazardSpawn === 'VEHICLE' ? 2.8 : pendingHazardSpawn === 'PEDESTRIAN' ? 1 : 0,
      heading: Math.PI, isStatic: !dynamic, custom: true
    }));
    logStream(`Manual hazard placed: ${pendingHazardSpawn} at ${meterY.toFixed(0)}m ahead.`, 'log-warn');
    pendingHazardSpawn = null;
    document.querySelectorAll('.btn-tool').forEach(button => button.classList.remove('active'));
  };

  function updateVehicleSpeed(decision, dt) {
    const baseTarget = objManager.scenario === 'HIGHWAY' ? 7 : objManager.scenario === 'MOUNTAIN' ? 3.6 : 5.2;
    let target = baseTarget;
    if (activeWeather === 'RAIN') target *= 0.72;
    if (activeWeather === 'FOG') target *= 0.62;
    if (decision.state === 'YIELDING_GIVING_WAY' || decision.state === 'CIRCUMVENTING_STATIC_HAZARD') target = Math.min(target, 3.2);
    if (decision.state === 'WAITING_FOR_CLEARANCE' || decision.state === 'FAILSAFE_EMERGENCY_HALT') target = 0;
    const rate = target < currentSpeedMs ? 4.7 : 1.45;
    currentSpeedMs += Math.max(-rate * dt, Math.min(rate * dt, target - currentSpeedMs));
    if (currentSpeedMs < 0.02) currentSpeedMs = 0;
  }

  let lastTime = performance.now();
  function tick(now) {
    const dt = Math.min(0.08, (now - lastTime) / 1000);
    lastTime = now;
    if (isRunning) {
      objManager.update(dt, simSpeed, currentSpeedMs);
      lastVisual = nav.evaluateVisualSectors(objManager.entities, currentSpeedMs, dt);
      lastDecision = ai.evaluatePerception(objManager.entities, currentSpeedMs, lastVisual, activeWeather);
      updateVehicleSpeed(lastDecision, dt);
      nav.stepOdometry(currentSpeedMs * simSpeed, dt);
      telemetry.update(currentSpeedMs * 3.6, lastDecision.throttle, lastDecision.brake, dt);
      comms.sendDriveCommand(lastDecision.throttle, lastDecision.brake, lastDecision.steer);
    }
    syncDashboardUI();
    mapCtrl.updateGrid(nav.currentPose, objManager.entities, nav.localPath, isDefenseMode, nav.isYielding, objManager.profile, nav.laneOffset);
    hud.render(objManager.entities, ai.currentState, nav.currentSteer, telemetry.speedKmh, isDefenseMode, nav.isYielding, objManager.profile, activeWeather, nav.laneOffset);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function syncDashboardUI() {
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.innerText = value; };
    setText('top-speed', `${telemetry.speedKmh.toFixed(1)} km/h`);
    setText('top-heading', `${Math.round(((nav.currentPose.yaw * 57.3) + 360) % 360)}° REL`);
    setText('top-coords', `Lane ${nav.laneIndex + 1} | ${nav.currentPose.y.toFixed(1)}m travelled`);
    setText('top-battery', `${Math.floor(telemetry.battery)}%`);
    setText('fsd-state-tag', (lastDecision.state || 'STANDBY').replaceAll('_', ' '));
    const risk = emergencyActive ? 'CRITICAL' : ai.currentRisk;
    const riskTag = document.getElementById('fsd-risk-tag');
    if (riskTag) { riskTag.className = `fsd-badge fsd-risk-tag risk-${risk.toLowerCase()}`; riskTag.innerText = `RISK: ${risk}`; }
    setText('fsd-ttc-display', `TTC: ${ai.minTtc > 90 ? '--.-' : ai.minTtc.toFixed(1)}s`);
    setText('ai-thought-text', ai.lastAnnouncement || lastVisual.currentGoal);
    setText('val-throttle', `${Math.round(lastDecision.throttle || 0)}%`);
    setText('val-brake', `${(lastDecision.brake || 0).toFixed(1)} kN`);

    const banner = document.getElementById('collision-alert-banner');
    if (banner) banner.classList.toggle('hidden', risk !== 'CRITICAL' || emergencyActive);
    const count = document.getElementById('live-obj-count');
    if (count) count.innerText = `${objManager.entities.length} Tracked`;
    renderEntityList();
  }

  function renderEntityList() {
    const container = document.getElementById('perception-entities');
    if (!container) return;
    container.innerHTML = '';
    [...objManager.entities].filter(entity => entity.y > -3 && entity.y < 60).sort((a, b) => a.y - b.y).forEach(entity => {
      const card = document.createElement('div');
      card.className = `detection-card ${entity.risk === 'CRITICAL' ? 'risk-high-card' : ''}`;
      card.innerHTML = `<div class="obj-card-left"><div class="obj-card-title">${entity.type} <span>${entity.id}</span></div><div class="obj-card-metrics">${entity.y.toFixed(1)}m ahead · lane offset ${entity.relativeX.toFixed(1)}m</div></div><div class="obj-card-right"><span class="pill-status">${entity.state}</span><span class="text-${entity.risk === 'CRITICAL' ? 'red' : entity.risk === 'MEDIUM' ? 'amber' : 'green'}" style="font-weight:700;font-size:.7rem">${entity.risk}</span></div>`;
      card.onclick = () => openObjectModal(entity);
      container.appendChild(card);
    });
  }

  function openObjectModal(entity) {
    activeSelectedEntity = entity;
    const title = document.getElementById('modal-obj-title');
    const body = document.getElementById('modal-obj-body');
    if (title) title.innerText = `${entity.type} (${entity.id})`;
    if (body) body.innerHTML = `<div><strong>Distance:</strong> ${entity.y.toFixed(2)} m</div><div><strong>Lane offset:</strong> ${entity.relativeX.toFixed(2)} m</div><div><strong>Closing speed:</strong> ${(entity.closingSpeed * 3.6).toFixed(1)} km/h</div><div><strong>Confidence:</strong> ${entity.confidence}%</div><div><strong>Time to collision:</strong> ${entity.ttc > 90 ? 'N/A' : `${entity.ttc} s`}</div><div><strong>Risk:</strong> ${entity.risk}</div>`;
    document.getElementById('obj-modal')?.classList.remove('hidden');
  }

  function stopDemo() { demoTimers.forEach(timer => clearTimeout(timer)); demoTimers = []; }
  function scheduleDemo(afterMs, task) { demoTimers.push(window.setTimeout(task, afterMs)); }
  function startJudgeDemo() {
    stopDemo();
    const env = document.getElementById('env-select');
    const weather = document.getElementById('weather-select');
    if (env) env.value = 'CITY';
    if (weather) weather.value = 'CLEAR';
    activeWeather = 'CLEAR'; nav.setWeatherCondition(activeWeather); applyScenario('CITY', false); setSimState(true, 'Judge demo');
    ai.lastAnnouncement = 'Guided demo: smooth autonomous cruising on an urban multi-lane road.';
    logStream('GUIDED DEMO 1/4: autonomous cruise and live perception.', 'log-sys');
    scheduleDemo(6000, () => { applyVoiceCommand('LANE_RIGHT', 'change lane right'); logStream('GUIDED DEMO 2/4: voice-directed smooth lane change.', 'log-sys'); });
    scheduleDemo(12000, () => { activeWeather = 'RAIN'; nav.setWeatherCondition('RAIN'); if (weather) weather.value = 'RAIN'; ai.lastAnnouncement = 'Guided demo: rain response enabled. Speed and sensing envelope adjusted.'; logStream('GUIDED DEMO 3/4: weather-aware traction response.', 'log-warn'); });
    scheduleDemo(18000, () => { objManager.addEntity(new TrackedEntity({ type: 'BARRIER', x: nav.laneOffset, y: 17, isStatic: true, custom: true })); ai.lastAnnouncement = 'Guided demo: barrier detected. Selecting a clear lane with gradual steering.'; logStream('GUIDED DEMO 4/4: obstacle detection, safety assessment and lane avoidance.', 'log-warn'); });
    scheduleDemo(27000, () => { activeWeather = 'CLEAR'; nav.setWeatherCondition('CLEAR'); if (weather) weather.value = 'CLEAR'; ai.lastAnnouncement = 'Guided demo complete. The rover is continuing safely on its route.'; logStream('GUIDED DEMO COMPLETE: all core features shown.', 'log-sys'); });
  }

  bindClick('btn-close-modal', () => document.getElementById('obj-modal')?.classList.add('hidden'));
  bindClick('btn-modal-close', () => document.getElementById('obj-modal')?.classList.add('hidden'));
  bindClick('btn-modal-delete', () => { if (activeSelectedEntity) { objManager.removeEntity(activeSelectedEntity.id); logStream(`Removed ${activeSelectedEntity.type} from the scenario.`, 'log-warn'); } document.getElementById('obj-modal')?.classList.add('hidden'); });
  bindClick('btn-sim-start', () => { stopDemo(); setSimState(true); });
  bindClick('btn-sim-pause', () => { stopDemo(); setSimState(false); });
  bindClick('btn-sim-reset', () => { stopDemo(); setSimState(false); applyScenario(objManager.scenario); logStream('Route and odometry reset to the start point.', 'log-sys'); });
  bindClick('btn-start-demo', startJudgeDemo);
  bindClick('btn-estop', () => emergencyStop('Operator'));
  bindClick('btn-toggle-defense', () => toggleDefenseMode());
  bindClick('btn-presentation-mode', () => { document.getElementById('main-workspace')?.classList.toggle('presentation-mode'); setTimeout(() => { hud.resize(); mapCtrl.resize(); }, 350); });
  bindClick('btn-voice-toggle', () => { const active = voice.toggle(); if (active) updateVoiceButton('LISTENING'); });

  const envSelect = document.getElementById('env-select');
  if (envSelect) envSelect.onchange = event => { stopDemo(); applyScenario(event.target.value); };
  const weatherSelect = document.getElementById('weather-select');
  if (weatherSelect) weatherSelect.onchange = event => { activeWeather = event.target.value; nav.setWeatherCondition(activeWeather); logStream(`Weather changed to ${activeWeather}. Drive envelope updated.`, 'log-sys'); };
  document.querySelectorAll('.btn-speed').forEach(button => button.onclick = () => { document.querySelectorAll('.btn-speed').forEach(item => item.classList.remove('active')); button.classList.add('active'); simSpeed = Number(button.dataset.speed); });
  document.querySelectorAll('.btn-tool').forEach(button => button.onclick = () => { document.querySelectorAll('.btn-tool').forEach(item => item.classList.remove('active')); button.classList.add('active'); pendingHazardSpawn = ({ CAR: 'VEHICLE', PERSON: 'PEDESTRIAN', BARRIER: 'BARRIER', DEBRIS: 'DEBRIS' })[button.dataset.spawn]; });

  applyScenario('CAMPUS', false);
  updateVoiceButton('OFF');
});
