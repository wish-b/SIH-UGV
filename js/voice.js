/** Browser microphone control with automatic recovery after each spoken command. */
class VoiceCommandEngine {
  constructor(onCommand, onStatus = () => {}) {
    this.onCommand = onCommand;
    this.onStatus = onStatus;
    this.recognition = null;
    this.isActive = false;
    this.lastLaneDirection = 'RIGHT';
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';
    this.recognition.maxAlternatives = 1;
    this.recognition.onstart = () => this.onStatus('LISTENING');
    this.recognition.onresult = event => {
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) return;
      const transcript = result[0].transcript.trim().toLowerCase();
      this.onStatus('HEARD', transcript);
      this.parseCommand(transcript);
    };
    this.recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.isActive = false;
        this.onStatus('PERMISSION_DENIED');
      } else if (event.error !== 'aborted') {
        this.onStatus('RETRYING');
      }
    };
    this.recognition.onend = () => {
      if (!this.isActive) return;
      window.setTimeout(() => {
        try { this.recognition.start(); } catch (_) { /* an active session is already restarting */ }
      }, 250);
    };
  }

  toggle() {
    if (!this.recognition) { this.onStatus('UNSUPPORTED'); return false; }
    if (this.isActive) {
      this.isActive = false;
      this.recognition.stop();
      this.onStatus('OFF');
      return false;
    }
    this.isActive = true;
    try { this.recognition.start(); } catch (_) { /* browser is already listening */ }
    return true;
  }

  parseCommand(text) {
    // The most specific phrases must be evaluated first: "emergency stop"
    // should never be reduced to a normal pause command.
    let command = null;
    if (/\b(emergency|e[- ]?stop|panic)\b/.test(text)) command = 'EMERGENCY';
    else if (/\b(change|switch|move|take).*\blane\b.*\bleft\b|\blane left\b/.test(text)) command = 'LANE_LEFT';
    else if (/\b(change|switch|move|take).*\blane\b.*\bright\b|\blane right\b/.test(text)) command = 'LANE_RIGHT';
    else if (/\b(change|switch|move|take).*\blane\b/.test(text)) {
      this.lastLaneDirection = this.lastLaneDirection === 'LEFT' ? 'RIGHT' : 'LEFT';
      command = `LANE_${this.lastLaneDirection}`;
    } else if (/\b(start|run|go|resume|continue)\b/.test(text)) command = 'START';
    else if (/\b(stop|halt|pause|hold)\b/.test(text)) command = 'STOP';
    else if (/\b(replan|recalculate)\b/.test(text)) command = 'REPLAN';
    if (command) this.onCommand(command, text);
    else this.onStatus('UNKNOWN', text);
  }
}
