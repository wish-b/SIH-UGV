/**
 * Cognitive Decision Matrix & Mutual Safety Engine
 * Orchestrates Finite State Machine (FSM) and natural situation reasoning.
 */
class AIDecisionEngine {
  constructor() {
    this.safetyZones = {
      critical: 5.5,  // meters
      caution: 14.0,  // meters
      clear: 25.0     // meters
    };

    // States: EXPLORING_OPEN_TRAIL, YIELDING_GIVING_WAY,
    // CIRCUMVENTING_STATIC_HAZARD, WAITING_FOR_CLEARANCE, FAILSAFE_EMERGENCY_HALT
    this.currentState = 'EXPLORING_OPEN_TRAIL';
    this.currentRisk = 'SAFE';
    this.minTtc = 99.9;
    this.highestRiskObject = null;
    this.lastAnnouncement = "Visual path clear. Cruising on natural terrain corridor.";
  }

  evaluatePerception(entities, ugvSpeedMs, visualAnalysis, weather) {
    let maxRisk = 'SAFE';
    let lowestTtc = 99.9;
    let criticalObj = null;

    entities.forEach(obj => {
      // Navigation supplies a lane-relative lateral position. Objects in a
      // neighbouring lane must not trigger braking for the active lane.
      const lateralOffset = Number.isFinite(obj.relativeX) ? obj.relativeX : obj.x;
      const distance = Math.hypot(lateralOffset, obj.y);
      const effectiveClosingRate = Math.max(0.5, obj.closingSpeed || ugvSpeedMs);

      // Calculate instantaneous Time-To-Collision (TTC) along forward path
      let ttc = 99.9;
      if (obj.y > 0.2 && Math.abs(lateralOffset) < 1.25) {
        ttc = parseFloat((obj.y / effectiveClosingRate).toFixed(1));
      }
      obj.ttc = ttc;

      // Risk level categorization
      if (distance < this.safetyZones.critical || ttc < 1.6) {
        obj.risk = 'CRITICAL';
      } else if (distance < this.safetyZones.caution || ttc < 3.8) {
        obj.risk = 'MEDIUM';
      } else {
        obj.risk = 'SAFE';
      }

      if (obj.risk === 'CRITICAL') {
        maxRisk = 'CRITICAL';
        criticalObj = obj;
      } else if (obj.risk === 'MEDIUM' && maxRisk === 'SAFE') {
        maxRisk = 'MEDIUM';
      }

      if (ttc < lowestTtc) lowestTtc = ttc;
    });

    this.currentRisk = maxRisk;
    this.minTtc = lowestTtc;
    this.highestRiskObject = criticalObj;

    return this.resolveAutonomousAction(maxRisk, criticalObj, visualAnalysis, weather);
  }

  resolveAutonomousAction(risk, criticalObj, visualAnalysis, weather) {
    let thought = visualAnalysis.currentGoal || "Path clear. Cruising.";
    let action = {
      throttle: 35,
      brake: 0.0,
      state: 'EXPLORING_OPEN_TRAIL',
      steer: visualAnalysis.steer
    };

    // 1. Weather Traction Regulation
    if (weather === 'RAIN') {
      action.throttle = 24;
      if (risk === 'SAFE' && !visualAnalysis.isYielding) {
        thought = "Wet surface traction control active. Speed regulated to 14 km/h.";
      }
    }

    // 2. FSM Execution
    if (risk === 'CRITICAL') {
      // Immediate emergency stop if an entity breaches safety envelope (< 5.5m)
      thought = `Immediate collision hazard: ${criticalObj.type.replace('_', ' ')} directly ahead (${criticalObj.y.toFixed(1)}m)! Decoupling throttle & braking hard.`;
      action = { throttle: 0, brake: 9.8, state: 'WAITING_FOR_CLEARANCE', steer: visualAnalysis.steer };
    } else if (visualAnalysis.isYielding) {
      // Social Courtesy Yielding: Slow down to ~12 km/h and hug the shoulder
      action.state = 'YIELDING_GIVING_WAY';
      action.throttle = 20;
      action.brake = 1.2;
      thought = `Social courtesy protocol active: Oncoming ${visualAnalysis.yieldEntity ? visualAnalysis.yieldEntity.type.replace('_', ' ') : 'traffic'} detected. Hugging shoulder to yield passage.`;
    } else if (visualAnalysis.bestSector !== 'center') {
      // Circumventing static rocks or ditches
      action.state = 'CIRCUMVENTING_STATIC_HAZARD';
      action.throttle = 24;
      action.brake = 0.8;
      thought = `Static obstruction in lane. Navigating around obstacle via clear ${visualAnalysis.bestSector.toUpperCase()} corridor.`;
    }

    this.currentState = action.state;
    this.lastAnnouncement = thought;
    return action;
  }
}
