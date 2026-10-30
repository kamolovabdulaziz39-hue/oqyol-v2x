/**
 * V2X High-Fidelity Acoustic & Human Voice AI Engine.
 * Supports Russian (Русский) and Uzbek (O'zbekcha) with natural human speech synthesis,
 * automotive luxury chimes (Mercedes/Tesla-style dual chimes), and language switching.
 */

class V2XAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.soundEnabled = true;
    this.voiceEnabled = true;
    this.currentLanguage = "uz"; // "uz" (O'zbekcha) yoki "ru" (Русский)
    
    this.lastVoiceAlertTime = 0;
    this.lastBeepTime = 0;
    this.lastLevel = "GREEN";
    this.speechSynth = window.speechSynthesis || null;

    // Справочник фраз на двух языках
    this.phrases = {
      ru: {
        safe: "Дорога свободна. Приятной поездки.",
        yellow_slow: "Внимание! Сбавьте скорость. Впереди опасное сближение.",
        red_collision: "Опасность столкновения! Экстренное торможение!",
        red_intersection: "Внимание, перекресток! Риск пересечения траекторий! Тормозите!",
        blind_spot: "Внимание, помеха в слепой зоне!",
        gps_active: "GPS подключен. Ведется мониторинг безопасности."
      },
      uz: {
        safe: "Yo'l ochiq. Oq yo'l tilaymiz.",
        yellow_slow: "Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv.",
        red_collision: "To'qnashuv xavfi! Zudlik bilan tormoz bering!",
        red_intersection: "Diqqat, chorraha! To'qnashuv xavfi, tormoz bering!",
        blind_spot: "Diqqat, ko'rinmas zonada transport vositasi bor!",
        gps_active: "GPS ulandi. Harakat xavfsizligi nazorat qilinmoqda."
      }
    };
  }

  setLanguage(lang) {
    if (lang === "ru" || lang === "uz") {
      this.currentLanguage = lang;
      console.log("[V2X Audio] Language switched to:", lang);
    }
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

  /**
   * Благородный двухтональный автомобильный гонг (как в Mercedes-Benz / Tesla)
   */
  playChimeTone() {
    if (!this.soundEnabled) return;
    this._ensureContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    // Тон 1: Мягкий колокольчик 587 Гц (D5)
    const osc1 = this.audioCtx.createOscillator();
    const gain1 = this.audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(this.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Тон 2: Верхний гармонический перелив 880 Гц (A5)
    const osc2 = this.audioCtx.createOscillator();
    const gain2 = this.audioCtx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc2.connect(gain2);
    gain2.connect(this.audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.5);
  }

  /**
   * Тревожный пульсирующий сигнал опасности столкновения
   */
  playUrgentHazardStrobe() {
    if (!this.soundEnabled) return;
    this._ensureContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.setValueAtTime(1350, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Воспроизведение живой человеческой речи на выбранном языке (Узбекский / Русский)
   */
  speakText(text, langOverride = null) {
    if (!this.voiceEnabled || !this.speechSynth) return;

    const targetLang = langOverride || this.currentLanguage;
    const now = Date.now();

    // Защита от спама (не чаще чем раз в 3.5 сек)
    if (now - this.lastVoiceAlertTime < 3500) return;

    this.speechSynth.cancel(); // Очищаем предыдущую очередь

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05; // Естественный темп речи
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = this.speechSynth.getVoices();

    if (targetLang === "uz") {
      // Ищем узбекский голос
      utterance.lang = "uz-UZ";
      const uzVoice = voices.find(v => v.lang.startsWith("uz") || v.name.toLowerCase().includes("uzbek"));
      if (uzVoice) {
        utterance.voice = uzVoice;
      } else {
        // Если отдельного узбекского пакета нет в ОС, используем турецкий или международный (тюркская фонетика идентична узбекской латинице)
        const trVoice = voices.find(v => v.lang.startsWith("tr"));
        if (trVoice) {
          utterance.voice = trVoice;
        } else {
          const ruVoice = voices.find(v => v.lang.startsWith("ru"));
          if (ruVoice) utterance.voice = ruVoice;
        }
      }
    } else {
      // Русский язык
      utterance.lang = "ru-RU";
      const ruVoice = voices.find(v => v.lang.startsWith("ru"));
      if (ruVoice) {
        utterance.voice = ruVoice;
      }
    }

    // Сначала проигрываем благородный автомобильный гонг, затем запускаем речь
    this.playChimeTone();

    setTimeout(() => {
      this.speechSynth.speak(utterance);
    }, 180);

    this.lastVoiceAlertTime = now;
  }

  updateSafetyLevel(level, rawMessage, details = {}) {
    const now = Date.now();
    const lang = this.currentLanguage;
    const p = this.phrases[lang];

    if (level === "RED") {
      // Пульсирующий зуммер
      if (now - this.lastBeepTime > 350) {
        this.playUrgentHazardStrobe();
        this.lastBeepTime = now;
      }

      if (this.lastLevel !== "RED") {
        let msg = p.red_collision;
        if (details.is_intersection_risk) {
          msg = p.red_intersection;
        } else if (details.is_blind_spot) {
          msg = p.blind_spot;
        }
        this.speakText(msg);
      }
    } else if (level === "YELLOW") {
      // Предупреждающий гонг раз в 2.5 сек
      if (now - this.lastBeepTime > 2500) {
        this.playChimeTone();
        this.lastBeepTime = now;
      }

      if (this.lastLevel === "GREEN") {
        let msg = p.yellow_slow;
        if (details.is_blind_spot) {
          msg = p.blind_spot;
        }
        this.speakText(msg);
      }
    }

    this.lastLevel = level;
  }
}

window.v2xAudio = new V2XAudioEngine();
