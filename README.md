# Autonomous UGV AI Perception & Navigation Command Station

An enterprise-grade, browser-based command and visualization dashboard for Unmanned Ground Vehicles (UGVs). The architecture blends a **Tesla FSD-inspired 3D HUD perspective**, real-time **interactive GIS mapping**, and an autonomous **obstacle avoidance and path replanning engine**.

---

## 1. Features

- **Dual Perspective Visualizer**: Simultaneous real-time 3D Tesla-style perspective on dynamic HTML5 Canvas and top-down GIS moving map.
- **Autonomous Avoidance Engine**: Computes relative Time-To-Collision (TTC) for vehicles, crossing pedestrians, and debris. Triggers speed reduction and dynamic lateral detour replanning.
- **Interactive Hazard Placement**: Click-to-spawn interactive hazards (cars, pedestrians, roadblocks) onto the track.
- **Operational Dual Modes**:
  - _Commercial Mode_: Blue/cyan theme for logistics and delivery.
  - _Tactical Defense Mode_: High-contrast HUD style for surveillance and field reconnaissance.
- **Microphone Voice Control**: Real-time Web Speech API commands: `Run`, `Halt`, `Replan`, `Defense Mode`.
- **Telemetric Data Export**: Instant one-click JSON / CSV logging.

---

## 2. Quick Start & Execution

1. Clone or extract this repository to your computer:
   ```bash
   cd ugv-dashboard
   ```
