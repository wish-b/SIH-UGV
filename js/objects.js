/**
 * Scenario-aware world model. Entity coordinates are road coordinates: x is
 * lateral position across the road and y is distance ahead of the rover.
 */
class TrackedEntity {
  constructor({ id, type, x, y, speed = 0, heading = Math.PI, isStatic = false, custom = false, lane = null }) {
    this.id = id || `ENT-${Math.floor(1000 + Math.random() * 9000)}`;
    this.type = type;
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.heading = heading;
    this.isStatic = isStatic;
    this.custom = custom;
    this.lane = lane;
    this.confidence = (95.2 + Math.random() * 4.4).toFixed(1);
    this.state = this.deriveInitialState();
    this.risk = 'SAFE';
    this.ttc = 99.9;
    this.closingSpeed = 0;
    this.relativeX = x;
  }

  deriveInitialState() {
    if (this.isStatic) return this.type === 'BARRIER' ? 'Road closure' : 'Static obstacle';
    if (this.type === 'PEDESTRIAN') return 'Pedestrian approaching crossing';
    if (this.type === 'VEHICLE') return 'Traffic participant';
    return 'Dynamic object';
  }

  update(dt, simulationRate, egoSpeedMs) {
    if (!this.isStatic) {
      const distance = this.speed * dt * simulationRate;
      this.x += Math.sin(this.heading) * distance;
      this.y += Math.cos(this.heading) * distance;
    }
    this.y -= egoSpeedMs * dt * simulationRate;
    const forwardVelocity = this.isStatic ? 0 : -this.speed * Math.cos(this.heading);
    this.closingSpeed = Math.max(0, egoSpeedMs + forwardVelocity);
  }
}

class EnvironmentObjectManager {
  constructor() {
    this.entities = [];
    this.scenario = 'CAMPUS';
    this.profile = null;
  }

  static profiles() {
    return {
      CITY: {
        roadName: 'Urban boulevard', roadWidth: 8.8, laneCenters: [-2.2, 0, 2.2], scenery: 'CITY',
        entities: [
          ['VEHICLE', 0, 30, 3.0, Math.PI, false], ['PEDESTRIAN', -3.0, 22, 1.1, Math.PI, false],
          ['VEHICLE', 2.2, 45, 3.6, Math.PI, false], ['BARRIER', 0, 66, 0, 0, true],
          ['TREE', -5.7, 16, 0, 0, true], ['TREE', 5.7, 38, 0, 0, true]
        ]
      },
      CAMPUS: {
        roadName: 'Campus access road', roadWidth: 7.2, laneCenters: [-1.8, 1.8], scenery: 'CAMPUS',
        entities: [
          ['VEHICLE', 1.8, 34, 3.0, Math.PI, false], ['PEDESTRIAN', -3.1, 24, 1.0, Math.PI, false],
          ['PEDESTRIAN', 3.0, 54, 1.0, Math.PI, false], ['BARRIER', -1.8, 72, 0, 0, true],
          ['TREE', -4.8, 13, 0, 0, true], ['TREE', 4.8, 36, 0, 0, true], ['TREE', -4.8, 60, 0, 0, true]
        ]
      },
      INDUSTRIAL: {
        roadName: 'Industrial service route', roadWidth: 8.2, laneCenters: [-2.05, 2.05], scenery: 'INDUSTRIAL',
        entities: [
          ['VEHICLE', 2.05, 39, 2.7, Math.PI, false], ['BARRIER', -2.05, 28, 0, 0, true],
          ['DEBRIS', 2.05, 60, 0, 0, true], ['PEDESTRIAN', -4.2, 45, 1.1, Math.PI, false]
        ]
      },
      HIGHWAY: {
        roadName: 'Expressway corridor', roadWidth: 12.8, laneCenters: [-3.2, -1.05, 1.05, 3.2], scenery: 'HIGHWAY',
        entities: [
          ['VEHICLE', 1.05, 32, 4.3, Math.PI, false], ['VEHICLE', 3.2, 54, 4.8, Math.PI, false],
          ['VEHICLE', -1.05, 76, 3.8, Math.PI, false], ['BARRIER', 1.05, 92, 0, 0, true],
          ['DEBRIS', -3.2, 52, 0, 0, true]
        ]
      },
      RURAL: {
        roadName: 'Rural two-lane road', roadWidth: 7.4, laneCenters: [-1.85, 1.85], scenery: 'RURAL',
        entities: [
          ['VEHICLE', 1.85, 39, 3.1, Math.PI, false], ['PEDESTRIAN', -3.4, 31, 1.0, Math.PI, false],
          ['DEBRIS', -1.85, 68, 0, 0, true], ['TREE', -5.3, 15, 0, 0, true],
          ['TREE', 5.3, 37, 0, 0, true], ['TREE', -5.3, 58, 0, 0, true]
        ]
      },
      MOUNTAIN: {
        roadName: 'Mountain pass', roadWidth: 6.8, laneCenters: [-1.7, 1.7], scenery: 'MOUNTAIN',
        entities: [
          ['VEHICLE', 1.7, 42, 2.8, Math.PI, false], ['BOULDER', -1.7, 64, 0, 0, true],
          ['PEDESTRIAN', -3.4, 34, 0.9, Math.PI, false], ['TREE', -5.0, 18, 0, 0, true],
          ['TREE', 5.0, 40, 0, 0, true], ['TREE', -5.0, 63, 0, 0, true]
        ]
      }
    };
  }

  generateOutdoorScenario(scenario = 'CAMPUS') {
    const profiles = EnvironmentObjectManager.profiles();
    this.scenario = profiles[scenario] ? scenario : 'CAMPUS';
    this.profile = profiles[this.scenario];
    this.entities = this.profile.entities.map(([type, x, y, speed, heading, isStatic]) => new TrackedEntity({
      type, x, y, speed, heading, isStatic, lane: this.closestLane(x)
    }));
    return this.entities;
  }

  closestLane(x) {
    return (this.profile?.laneCenters || [0]).reduce((best, lane) => Math.abs(lane - x) < Math.abs(best - x) ? lane : best);
  }

  addEntity(entity) { entity.lane = this.closestLane(entity.x); this.entities.push(entity); }
  removeEntity(id) { this.entities = this.entities.filter(entity => entity.id !== id); }

  update(dt, simulationRate, egoSpeedMs) {
    this.entities.forEach(entity => entity.update(dt, simulationRate, egoSpeedMs));
    this.entities.forEach(entity => { if (entity.y < -5 && !entity.custom) this.recycle(entity); });
  }

  recycle(entity) {
    const spacing = entity.type === 'VEHICLE' ? 60 : entity.type === 'PEDESTRIAN' ? 48 : 72;
    entity.y = spacing + (entity.id.charCodeAt(entity.id.length - 1) % 12);
    if (entity.type === 'VEHICLE') {
      const lanes = this.profile.laneCenters;
      entity.x = lanes[(lanes.indexOf(entity.lane) + 1) % lanes.length];
      entity.lane = entity.x;
      entity.speed = this.scenario === 'HIGHWAY' ? 4.5 : 3.0;
      entity.heading = Math.PI;
    } else if (entity.type === 'PEDESTRIAN') {
      entity.x = (entity.x < 0 ? -1 : 1) * (this.profile.roadWidth / 2 + 0.45);
      entity.speed = 0.9;
      entity.heading = Math.PI;
    } else if (['TREE', 'BOULDER'].includes(entity.type)) {
      entity.x = (entity.x < 0 ? -1 : 1) * (this.profile.roadWidth / 2 + 1.2);
    } else {
      entity.x = entity.lane ?? this.profile.laneCenters[0];
    }
  }
}
