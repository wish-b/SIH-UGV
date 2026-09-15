/**
 * Hardware Abstraction Layer (HAL) & Serial / WebSocket Protocol
 */
class HardwareCommunicationBus {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.fallbackSimulation = true;
  }

  connect(wsUrl = 'ws://192.168.4.1:81') {
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.fallbackSimulation = false;
        console.log('[COMMS] Hardware link established via WebSocket');
      };
      this.ws.onmessage = (event) => this.handleIncomingTelemetry(event.data);
      this.ws.onerror = () => this.triggerFallback();
      this.ws.onclose = () => this.triggerFallback();
    } catch (e) {
      this.triggerFallback();
    }
  }

  triggerFallback() {
    this.isConnected = false;
    this.fallbackSimulation = true;
    console.info('[COMMS] Real hardware not connected. Running local autonomous HAL simulator.');
  }

  sendDriveCommand(throttle, brake, steerAngle) {
    const payload = JSON.stringify({
      cmd: 'DRIVE',
      throttle: parseFloat(throttle.toFixed(2)),
      brake: parseFloat(brake.toFixed(2)),
      steer: parseFloat(steerAngle.toFixed(2)),
      timestamp: Date.now()
    });

    if (this.isConnected && this.ws) {
      this.ws.send(payload);
    }
  }

  handleIncomingTelemetry(rawMsg) {
    try {
      const data = JSON.parse(rawMsg);
      // Expected Schema: { lat: 28.474, lng: 77.504, speed: 12.4, heading: 45, battery: 89 }
      window.dispatchEvent(new CustomEvent('ugv-telemetry', { detail: data }));
    } catch (e) {
      console.error('[COMMS] Telemetry packet parse error', e);
    }
  }
}