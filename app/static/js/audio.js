/**
 * V2X High-Fidelity Acoustic & Neural Human Voice AI Engine.
 * Features ultra-realistic Microsoft Neural voice synthesis for Uzbek (Madina Neural)
 * and Russian (Svetlana Neural), automotive luxury chimes (Mercedes/Tesla-style),
 * instant audio playback without robot distortion, and bilingual support.
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

    this.audioCache = new Map();
    this.currentAudio = null;
    this.currentSpeed = 0.0;
    this.lastRadarSpokenId = null;
    this.lastRadarSpokenSpeeding = null;

    // Текстовые фразы (для UI и fallback)
    this.phrases = {
      ru: {
        safe: "Дорога свободна. Приятной поездки.",
        yellow_slow: "Внимание! Сбавьте скорость. Впереди опасное сближение.",
        red_collision: "Опасность столкновения! Экстренное торможение!",
        red_intersection: "Внимание, перекрёсток! Риск столкновения, тормозите!",
        blind_spot: "Внимание, помеха в слепой зоне!",
        gps_active: "GPS подключен. Ведется мониторинг безопасности.",
        lang_selected: "Выбран русский язык. Безопасной дороги.",
        order_success: "Ваш заказ успешно принят.",
        trip_start: "Ассалому алейкум! OQ YO'L AI желает вам доброго пути. Помните, дома вас ждут ваши родители и дети.",
        radar_caution: "Осторожно, радар! Впереди контроль скорости. Соблюдайте скоростной режим.",
        radar_speeding: "Осторожно, радар! Превышение скорости. Снизьте скорость!",
        radar_passed: "Радар пройден. Безопасной дороги."
      },
      uz: {
        safe: "Yo'l ochiq. Oq yo'l tilaymiz.",
        yellow_slow: "Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv.",
        red_collision: "To'qnashuv xavfi! Zudlik bilan tormoz bering!",
        red_intersection: "Diqqat, chorraha! To'qnashuv xavfi, zudlik bilan tormoz bering!",
        blind_spot: "Diqqat, ko'rinmas zonada transport vositasi bor!",
        gps_active: "GPS ulandi. Harakat xavfsizligi nazorat qilinmoqda.",
        lang_selected: "O'zbek tili tanlandi. Xavfsiz safar tilaymiz.",
        order_success: "Buyurtmangiz muvaffaqiyatli qabul qilindi.",
        trip_start: "Assalomu alaykum! OQ YO'L AI sizga oq yo'l tilaydi. Unutmang, sizni uyda ota-onangiz va farzandlaringiz kutmoqda.",
        radar_caution: "Ehtiyot bo'ling, radar! Oldinda tezlik nazorati. Belgilangan me'yorda harakatlaning.",
        radar_speeding: "Ehtiyot bo'ling, radar! Tezlikni oshirdingiz. Zudlik bilan tezlikni tushiring!",
        radar_passed: "Radar hududidan o'tildi. Oq yo'l tilaymiz."
      }
    };

    this._setupUserUnlock();
    this._preloadAudio();
  }

  _getAudioUrl(filename) {
    if (window.location.protocol === "file:") {
      return "app/static/audio/" + filename;
    }
    return "/static/audio/" + filename;
  }

  _preloadAudio() {
    const keys = [
      "uz_safe.mp3", "uz_yellow_slow.mp3", "uz_red_collision.mp3", "uz_red_intersection.mp3",
      "uz_blind_spot.mp3", "uz_gps_active.mp3", "uz_lang_selected.mp3", "uz_order_success.mp3", "uz_welcome.mp3", "uz_trip_start.mp3",
      "uz_radar_caution.mp3", "uz_radar_speeding.mp3", "uz_radar_passed.mp3",
      "ru_safe.mp3", "ru_yellow_slow.mp3", "ru_red_collision.mp3", "ru_red_intersection.mp3",
      "ru_blind_spot.mp3", "ru_gps_active.mp3", "ru_lang_selected.mp3", "ru_order_success.mp3", "ru_welcome.mp3", "ru_trip_start.mp3",
      "ru_radar_caution.mp3", "ru_radar_speeding.mp3", "ru_radar_passed.mp3"
    ];

    keys.forEach(file => {
      try {
        const audio = new Audio(this._getAudioUrl(file));
        audio.preload = "auto";
        this.audioCache.set(file, audio);
      } catch (e) {
        // Игнорируем ошибки кэширования
      }
    });
  }

  _setupUserUnlock() {
    const unlock = () => {
      this._ensureContext();
      // Разблокировка AudioContext в браузере Chrome
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("touchstart", unlock);
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

    try {
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
    } catch (e) {
      console.warn("Chime error:", e);
    }
  }

  /**
   * Тревожный пульсирующий сигнал опасности столкновения
   */
  playUrgentHazardStrobe() {
    if (!this.soundEnabled) return;
    this._ensureContext();
    if (!this.audioCtx) return;

    try {
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
    } catch (e) {
      console.warn("Hazard strobe error:", e);
    }
  }

  /**
   * Воспроизведение студийной нейросетевой записи (Madina Neural для узбекского)
   */
  playVoiceAlert(alertKey, force = false) {
    if (!this.voiceEnabled) return;

    const now = Date.now();
    // Защита от спама (не чаще чем раз в 3 сек, если не force)
    if (!force && now - this.lastVoiceAlertTime < 3000) return;

    const filename = `${this.currentLanguage}_${alertKey}.mp3`;
    let audio = this.audioCache.get(filename);
    if (!audio) {
      audio = new Audio(this._getAudioUrl(filename));
      this.audioCache.set(filename, audio);
    }

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
    }

    this.playChimeTone();

    setTimeout(() => {
      try {
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.currentAudio = audio;
              this.lastVoiceAlertTime = Date.now();
            })
            .catch(err => {
              console.warn("[V2X Audio] HTML5 audio play prevented, falling back to Web Speech:", err);
              const fallbackText = (this.phrases[this.currentLanguage] && this.phrases[this.currentLanguage][alertKey]) || "";
              if (fallbackText) {
                this._fallbackSpeak(fallbackText);
              }
            });
        }
      } catch (err) {
        console.warn("Audio play exception:", err);
      }
    }, 180);
  }

  /**
   * Воспроизведение произвольного текста (сначала ищет ключ, затем fallback TTS)
   */
  speakText(text, langOverride = null) {
    if (!this.voiceEnabled) return;
    const lang = langOverride || this.currentLanguage;

    // Проверяем, есть ли готовый нейро-файл под эту фразу
    for (const [key, val] of Object.entries(this.phrases[lang] || {})) {
      if (val === text || text.includes(val) || val.includes(text)) {
        this.playVoiceAlert(key);
        return;
      }
    }

    // Если это фраза переключения языка
    if (text.includes("O'zbek tili") || text.includes("узбекский")) {
      this.playVoiceAlert("lang_selected", true);
      return;
    }
    if (text.includes("Выбран русский") || text.includes("русский")) {
      this.playVoiceAlert("lang_selected", true);
      return;
    }
    if (text.includes("muvaffaqiyatli") || text.includes("успешно")) {
      this.playVoiceAlert("order_success", true);
      return;
    }

    // Fallback на синтез речи браузера
    this._fallbackSpeak(text, lang);
  }

  _fallbackSpeak(text, lang = null) {
    if (!this.speechSynth) return;
    const targetLang = lang || this.currentLanguage;
    const now = Date.now();
    if (now - this.lastVoiceAlertTime < 3000) return;

    this.speechSynth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = this.speechSynth.getVoices();
    if (targetLang === "uz") {
      utterance.lang = "uz-UZ";
      const uzVoice = voices.find(v => v.lang.startsWith("uz") || v.name.toLowerCase().includes("uzbek"));
      if (uzVoice) utterance.voice = uzVoice;
    } else {
      utterance.lang = "ru-RU";
      const ruVoice = voices.find(v => v.lang.startsWith("ru"));
      if (ruVoice) utterance.voice = ruVoice;
    }

    this.playChimeTone();
    setTimeout(() => {
      this.speechSynth.speak(utterance);
      this.lastVoiceAlertTime = Date.now();
    }, 180);
  }

  setVehicleSpeed(speed) {
    this.currentSpeed = Number(speed) || 0.0;
  }

  /**
   * Полная экстренная тишина (при остановке автомобиля, выключении двигателя или сбросе)
   */
  stopAll() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
    if (this.speechSynth) {
      try {
        this.speechSynth.cancel();
      } catch (e) {}
    }
    this.lastVoiceAlertTime = 0;
    this.lastRadarSpokenId = null;
    this.lastRadarSpokenSpeeding = null;
    this.lastLevel = "SAFE";
  }

  /**
   * Обновление статуса безопасности и триггер голосовых оповещений
   */
  updateSafetyLevel(level, rawMessage, details = {}, currentSpeed = null) {
    const now = Date.now();
    const speed = (currentSpeed !== null && currentSpeed !== undefined) ? Number(currentSpeed) : this.currentSpeed;
    this.currentSpeed = speed;

    // Если машина полностью стоит (скорость <= 3 км/ч), никогда не проигрываем сигналы сбавления скорости
    const isStationary = (speed <= 3.0);

    if (level === "RED") {
      // Пульсирующий строб опасности
      if (now - this.lastBeepTime > 380) {
        this.playUrgentHazardStrobe();
        this.lastBeepTime = now;
      }

      if (this.lastLevel !== "RED") {
        if (details.is_intersection_risk) {
          this.playVoiceAlert("red_intersection");
        } else if (details.is_blind_spot) {
          this.playVoiceAlert("blind_spot");
        } else {
          this.playVoiceAlert("red_collision");
        }
      }
    } else if (level === "YELLOW") {
      // Предупреждающий гонг раз в 2.5 сек
      if (now - this.lastBeepTime > 2500) {
        this.playChimeTone();
        this.lastBeepTime = now;
      }

      if (this.lastLevel === "GREEN" || this.lastLevel === "SAFE") {
        if (details.is_blind_spot) {
          this.playVoiceAlert("blind_spot");
        } else if (!isStationary) {
          // Говорим "Сбавьте скорость / Tezlikni kamaytiring" ТОЛЬКО если автомобиль реально едет!
          this.playVoiceAlert("yellow_slow");
        }
      }
    } else if (level === "SAFE" || level === "GREEN") {
      if (this.lastLevel === "RED" || this.lastLevel === "YELLOW") {
        this.playVoiceAlert("safe");
      }
    }

    this.lastLevel = level;
  }

  /**
   * Умное голосовое оповещение о приближении к радару и камерам фиксации скорости
   */
  playRadarAlert(isSpeeding, radar = null, currentSpeed = null, distance = 0) {
    if (!this.voiceEnabled) return;
    const speed = (currentSpeed !== null && currentSpeed !== undefined) ? Number(currentSpeed) : this.currentSpeed;

    // ЖЕЛЕЗНОЕ ПРАВИЛО: если автомобиль стоит или заглушен (скорость <= 5 км/ч),
    // НИКОГДА не объявлять радар и не обвинять водителя в превышении скорости!
    if (speed <= 5.0) {
      return;
    }

    this._ensureContext();
    const now = Date.now();
    const radarId = radar ? radar.id : "radar";
    const speedLimit = (radar && radar.speed_limit) ? radar.speed_limit : 60;
    const realSpeeding = isSpeeding && (speed > speedLimit);

    // Предотвращаем повторение одной и той же фразы чаще чем раз в 5 сек,
    // но ОБЯЗАТЕЛЬНО озвучиваем сразу при обнаружении радара или смене статуса превышения!
    if (this.lastRadarSpokenId === radarId && this.lastRadarSpokenSpeeding === realSpeeding) {
      if (now - this.lastVoiceAlertTime < 5000) return;
    }

    this.lastRadarSpokenId = radarId;
    this.lastRadarSpokenSpeeding = realSpeeding;

    if (realSpeeding) {
      this.playUrgentHazardStrobe();
      this.playVoiceAlert("radar_speeding", true);
    } else {
      this.playChimeTone();
      this.playVoiceAlert("radar_caution", true);
    }
  }

  /**
   * Оповещение при выходе из зоны действия радара
   */
  playRadarPassed() {
    this.lastRadarSpokenId = null;
    this.lastRadarSpokenSpeeding = null;
    if (!this.voiceEnabled) return;
    const now = Date.now();
    if (now - this.lastVoiceAlertTime < 3000) return;
    this.playVoiceAlert("radar_passed", true);
  }
}

window.v2xAudio = new V2XAudioEngine();
