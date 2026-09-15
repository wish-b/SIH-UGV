/** Smooth lane planner and odometry for the demo vehicle. */
class NavigationEngine {
  constructor() {
    this.currentPose = { x: 0, y: 0, yaw: 0 };
    this.exploredDistance = 0;
    this.lateralDrift = 0;
    this.currentSteer = 0;
    this.targetSteer = 0;
    this.localPath = [];
    this.activeSector = 'CENTER';
    this.currentVisualGoal = 'Route clear. Maintaining the centre of the active lane.';
    this.weatherTraversabilityMod = 1;
    this.isYielding = false;
    this.laneCenters = [-1.8, 1.8];
    this.laneIndex = 0;
    this.targetLaneIndex = 0;
    this.laneOffset = this.laneCenters[0];
    this.laneChangeReason = '';
  }

  setScenario(profile) {
    this.laneCenters = profile?.laneCenters || [-1.8, 1.8];
    this.laneIndex = Math.min(this.laneIndex, this.laneCenters.length - 1);
    this.targetLaneIndex = this.laneIndex;
    this.laneOffset = this.laneCenters[this.laneIndex];
  }

  requestLaneChange(direction, reason = 'Operator command') {
    const delta = direction === 'LEFT' ? -1 : 1;
    const next = Math.max(0, Math.min(this.laneCenters.length - 1, this.laneIndex + delta));
    if (next === this.laneIndex) return false;
    this.targetLaneIndex = next;
    this.laneChangeReason = reason;
    return true;
  }

  get targetLane() { return this.laneCenters[this.targetLaneIndex]; }

  isLaneClear(lane, entities, ignoreEntity = null) {
    return !entities.some(object => object !== ignoreEntity && object.y > 0.3 && object.y < 18 && Math.abs(object.x - lane) < 1.35);
  }

  evaluateVisualSectors(entities, egoSpeedMs, dt = 0.016) {
    const maxRange = 40 * this.weatherTraversabilityMod;
    const sectors = {
      left: { clearance: maxRange, count: 0, dynamicOncoming: false },
      center: { clearance: maxRange, count: 0, dynamicOncoming: false },
      right: { clearance: maxRange, count: 0, dynamicOncoming: false }
    };
    let laneHazard = null;
    entities.forEach(object => {
      object.relativeX = object.x - this.laneOffset;
      if (object.y <= 0.3 || object.y > maxRange) return;
      const sector = object.relativeX < -1.15 ? sectors.left : object.relativeX > 1.15 ? sectors.right : sectors.center;
      sector.clearance = Math.min(sector.clearance, object.y);
      sector.count++;
      if (!object.isStatic && object.closingSpeed > egoSpeedMs + 0.25) sector.dynamicOncoming = true;
      if (Math.abs(object.relativeX) < 1.25 && (!laneHazard || object.y < laneHazard.y)) laneHazard = object;
    });

    this.isYielding = false;
    let desiredLane = this.targetLaneIndex;
    let bestSector = 'center';
    let goal = 'Route clear. Maintaining the centre of the active lane.';
    if (laneHazard && laneHazard.y < 22) {
      const candidates = this.laneCenters.map((lane, index) => ({ lane, index, clear: this.isLaneClear(lane, entities, laneHazard) }))
        .filter(candidate => candidate.clear).sort((a, b) => Math.abs(a.index - this.laneIndex) - Math.abs(b.index - this.laneIndex));
      const alternative = candidates.find(candidate => candidate.index !== this.laneIndex);
      if (alternative) {
        desiredLane = alternative.index;
        this.targetLaneIndex = alternative.index;
        this.isYielding = !laneHazard.isStatic;
        bestSector = alternative.lane < this.laneOffset ? 'left' : 'right';
        goal = `${laneHazard.type.replace('_', ' ')} ahead at ${laneHazard.y.toFixed(1)}m; ${this.isYielding ? 'yielding' : 'changing lanes'} smoothly to the clear ${bestSector} lane.`;
      } else {
        goal = `${laneHazard.type.replace('_', ' ')} ahead; holding lane and reducing speed for clearance.`;
      }
    } else if (this.targetLaneIndex !== this.laneIndex) {
      bestSector = this.targetLane < this.laneOffset ? 'left' : 'right';
      goal = `${this.laneChangeReason || 'Planned'}: moving smoothly to the ${bestSector} lane.`;
    }

    const targetOffset = this.laneCenters[desiredLane];
    const desiredSteer = Math.max(-0.34, Math.min(0.34, (targetOffset - this.laneOffset) * 0.19));
    this.currentSteer += (desiredSteer - this.currentSteer) * Math.min(1, dt * 3.4);
    this.targetSteer = desiredSteer;
    this.laneOffset += (targetOffset - this.laneOffset) * Math.min(1, dt * 1.7);
    if (Math.abs(targetOffset - this.laneOffset) < 0.04) {
      this.laneOffset = targetOffset;
      this.laneIndex = desiredLane;
    }
    this.activeSector = bestSector.toUpperCase();
    this.currentVisualGoal = goal;
    this.synthesizeDynamicPath(targetOffset);
    return { bestSector, sectors, steer: this.currentSteer, isYielding: this.isYielding, yieldEntity: laneHazard, currentGoal: goal };
  }

  synthesizeDynamicPath(targetOffset) {
    this.localPath = [];
    const startOffset = this.laneOffset;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const smoothT = t * t * (3 - 2 * t);
      this.localPath.push({ x: startOffset + (targetOffset - startOffset) * smoothT, y: (i + 1) * 1.6 });
    }
  }

  stepOdometry(speedMs, dt) {
    const distance = speedMs * dt;
    this.exploredDistance += distance;
    this.currentPose.yaw += this.currentSteer * distance * 0.042;
    this.currentPose.x = this.laneOffset;
    this.currentPose.y += Math.cos(this.currentPose.yaw) * distance;
    this.lateralDrift = this.laneOffset;
  }

  setWeatherCondition(weather) { this.weatherTraversabilityMod = weather === 'RAIN' ? 0.75 : weather === 'FOG' ? 0.58 : 1; }
  reset() {
    this.currentPose = { x: this.laneCenters[0], y: 0, yaw: 0 };
    this.exploredDistance = 0; this.lateralDrift = 0; this.currentSteer = 0; this.targetSteer = 0;
    this.laneIndex = 0; this.targetLaneIndex = 0; this.laneOffset = this.laneCenters[0]; this.isYielding = false; this.localPath = [];
  }
}
