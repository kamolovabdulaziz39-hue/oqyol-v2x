/**
 * V2X Acoustic & Voice Warning Engine.
 * Implements Web Audio API synthesizer for crisp warning tones and Web Speech API for Russian voice alerts.
 */

class V2XAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.voiceEnabled = true;
    this.lastVoiceAlertTime = 0;
    this.lastBeepTime = 0;
    this.lastLevel = "GREEN";
    this.speechSynth = window.speechSynthesis || null;
  }

  _ensureContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playYellowWarningBeep() {
    if (!this.soundEnabled) return;
    this._ensureContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    // Двухтональный мягкий предупреждающий сигнал (660 Гц -> 880 Гц)
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  playRedAlarmStrobe() {
    if (!this.soundEnabled) return;
    this._ensureContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    // Агрессивный импульсный сигнал тревоги (1100 Гц пульсация)
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.setValueAtTime(1350, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  speakAlert(text) {
    if (!this.voiceEnabled || !this.speechSynth) return;
    const now = Date.now();
    // Ограничение частоты голосовых предупреждений (не чаще одного раза в 4 секунды)
    if (now - this.lastVoiceAlertTime < 4000) return;

    this.speechSynth.cancel(); // отменяем незаконченные реплики
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.rate = 1.15; // слегка ускоренный четкий голос
    utterance.pitch = 1.05;

    // Подбираем русский голос
    const voices = this.speechSynth.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith("ru"));
    if (ruVoice) {
      utterance.voice = ruVoice;
    }

    this.speechSynth.speak(utterance);
    this.lastVoiceAlertTime = now;
  }

  updateSafetyLevel(level, alertMessage) {
    const now = Date.now();

    if (level === "RED") {
      // Частое импульсное пищание раз в 350 мс
      if (now - this.lastBeepTime > 350) {
        this.playRedAlarmStrobe();
        this.lastBeepTime = now;
      }
      if (this.lastLevel !== "RED") {
        this.speakAlert("Опасность столкновения! Тормозите!");
      }
    } else if (level === "YELLOW") {
      // Предупреждающий одинарный бип раз в 1.8 сек
      if (now - this.lastBeepTime > 1800) {
        this.playYellowWarningBeep();
        this.lastBeepTime = now;
      }
      if (this.lastLevel === "GREEN") {
        this.speakAlert("Внимание: снизьте скорость");
      }
    }

    this.lastLevel = level;
  }
}

window.v2xAudio = new V2XAudioEngine();
