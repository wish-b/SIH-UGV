/**
 * Telemetry Stream & Performance Profiling
 */
class TelemetryManager {
  constructor() {
    this.speedKmh = 0;
    this.battery = 98.4;
    this.headingDeg = 24;
    this.throttle = 35;
    this.brake = 0.0;
    this.chart = null;
    this.initChart();
  }

  initChart() {
    const chartCanvas = document.getElementById('telemetryChart');
    // The driving demo remains usable if an event venue has no connection to
    // the optional CDN that supplies Chart.js.
    if (!chartCanvas || !window.Chart) return;
    const ctx = chartCanvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(20).fill(''),
        datasets: [{
          data: Array(20).fill(0),
          borderColor: '#00d2ff',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.35,
          fill: true,
          backgroundColor: 'rgba(0, 210, 255, 0.08)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            suggestedMin: 0,
            suggestedMax: 30,
            ticks: { color: '#486581', font: { family: 'JetBrains Mono', size: 9 } },
            grid: { color: 'rgba(64,120,210,0.1)' }
          }
        },
        animation: false
      }
    });
  }

  update(speed, throttle, brake, dt) {
    this.speedKmh = speed;
    this.throttle = throttle;
    this.brake = brake;
    this.battery = Math.max(5, this.battery - (dt * 0.005));

    // Update real-time Chart dataset
    if (!this.chart) return;
    const data = this.chart.data.datasets[0].data;
    data.shift();
    data.push(this.speedKmh);
    this.chart.update('none');
  }
}
