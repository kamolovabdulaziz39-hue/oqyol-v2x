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

    // Текстовые фразы (для UI и локальных нейро-аудиофайлов)
    this.phrases = {
      ru: {
        safe: "Дорога свободна. Приятной поездки.",
        yellow_slow: "Внимание! Сбавьте скорость. Впереди опасное сближение.",
        red_collision: "Опасность столкновения! Экстренное торможение!",
        red_intersection: "Внимание, перекрёсток! Риск столкновения, тормозите!",
        blind_spot: "Внимание, помеха в слепой зоне!",
        gps_active: "GPS подключен. Ваше местоположение открыто на карте.",
        lang_selected: "Выбран русский язык. Безопасной дороги.",
        order_success: "Ваш заказ успешно принят.",
        trip_start: "Здравствуйте! OQ YO'L AI желает вам счастливого пути. Помните, дома вас ждут родные и близкие.",
        welcome: "Добро пожаловать в систему безопасности OQ YO'L AI.",
        green: "Дорога свободна. Движение разрешено.",
        shift_pause: "Режим паузы включен. Сигналы безопасности временно приостановлены.",
        shift_end: "Рабочая смена завершена. Спасибо за безопасное вождение, приятного отдыха!",
        order_pending: "Ваш платеж принят. После подтверждения администратором доступ к карте будет открыт.",
        order_approved: "Поздравляем! Администратор подтвердил оплату. Доступ на 1 месяц активирован. Счастливого пути!",
        demo_on: "Включен демонстрационный тестовый режим.",
        demo_off: "Демо-режим выключен. Реальный режим.",
        radar_caution: "Осторожно, радар! Впереди контроль скорости. Соблюдайте скоростной режим.",
        radar_speeding: "Осторожно, радар! Превышение скорости. Снизьте скорость!",
        radar_passed: "Радар пройден. Безопасной дороги!",
        accident_prevented: "Поздравляем! Опасность аварии успешно предотвращена. OQ YO'L защитил вас!"
      },
      uz: {
        safe: "Yo'l ochiq. Oq yo'l tilaymiz.",
        yellow_slow: "Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv.",
        red_collision: "To'qnashuv xavfi! Zudlik bilan tormoz bering!",
        red_intersection: "Diqqat, chorraha! To'qnashuv xavfi, zudlik bilan tormoz bering!",
        blind_spot: "Diqqat, ko'rinmas zonada transport vositasi bor!",
        gps_active: "GPS ulandi. Joylashuvingiz xaritada ochildi.",
        lang_selected: "O'zbek tili tanlandi. Xavfsiz safar tilaymiz.",
        order_success: "Buyurtmangiz muvaffaqiyatli qabul qilindi.",
        trip_start: "Assalomu alaykum! OQ YO'L AI sizga oq yo'l tilaydi. Unutmang, sizni uyda oilangiz kutmoqda.",
        welcome: "Xush kelibsiz! OQ YO'L AI yo'l xavfsizligi tizimiga xush kelibsiz.",
        green: "Yo'l ochiq. Harakatlanishingiz mumkin.",
        shift_pause: "Tanaffus rejimi yoqildi. Xavfsizlik signallari vaqtincha to'xtatildi.",
        shift_end: "Bugungi ish faoliyatingiz yakunlandi. Rahmat, yaxshi dam oling!",
        order_pending: "To'lovingiz qabul qilindi. Administrator tekshirib tasdiqlagach xarita ochiladi.",
        order_approved: "Tabriklaymiz! Administrator to'lovingizni tasdiqladi. 1 oylik ruxsat berildi. Oq yo'l!",
        demo_on: "Sinov demo rejimi yoqildi.",
        demo_off: "Demo rejim o'chirildi. Haqiqiy jonli rejim.",
        radar_caution: "Ehtiyot bo'ling, radar! Oldinda tezlik nazorati. Belgilangan me'yorda harakatlaning.",
        radar_speeding: "Ehtiyot bo'ling, radar! Tezlikni oshirdingiz. Zudlik bilan tezlikni pasaytiring!",
        radar_passed: "Radar hududidan o'tildi. Oq yo'l!",
        accident_prevented: "Tabriklaymiz! Avariya xavfi muvaffaqiyatli bartaraf etildi. Oq yo'l sizni asradi!"
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
      "uz_blind_spot.mp3", "uz_gps_active.mp3", "uz_lang_selected.mp3", "uz_order_success.mp3",
      "uz_welcome.mp3", "uz_trip_start.mp3", "uz_green.mp3", "uz_shift_pause.mp3", "uz_shift_end.mp3",
      "uz_order_pending.mp3", "uz_order_approved.mp3", "uz_demo_on.mp3", "uz_demo_off.mp3",
      "uz_radar_caution.mp3", "uz_radar_speeding.mp3", "uz_radar_passed.mp3",

      "ru_safe.mp3", "ru_yellow_slow.mp3", "ru_red_collision.mp3", "ru_red_intersection.mp3",
      "ru_blind_spot.mp3", "ru_gps_active.mp3", "ru_lang_selected.mp3", "ru_order_success.mp3",
      "ru_welcome.mp3", "ru_trip_start.mp3", "ru_green.mp3", "ru_shift_pause.mp3", "ru_shift_end.mp3",
      "ru_order_pending.mp3", "ru_order_approved.mp3", "ru_demo_on.mp3", "ru_demo_off.mp3",
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
   * Воспроизведение произвольного текста (сначала ищет ключ, затем онлайн нейро-TTS)
   */
  speakText(text, langOverride = null) {
    if (!this.voiceEnabled || !text) return;
    const lang = langOverride || this.currentLanguage;
    const cleanText = text.trim();

    // 1. Проверяем точное или частичное совпадение с ключами нейро-фраз
    for (const [key, val] of Object.entries(this.phrases[lang] || {})) {
      if (val === cleanText || cleanText.includes(val) || val.includes(cleanText)) {
        this.playVoiceAlert(key);
        return;
      }
    }

    // 2. Специфические ключевые слова
    if (cleanText.includes("O'zbek tili") || cleanText.includes("узбекский")) {
      this.playVoiceAlert("lang_selected", true);
      return;
    }
    if (cleanText.includes("Выбран русский") || cleanText.includes("русский")) {
      this.playVoiceAlert("lang_selected", true);
      return;
    }
    if (cleanText.includes("muvaffaqiyatli") || cleanText.includes("успешно")) {
      this.playVoiceAlert("order_success", true);
      return;
    }
    if (cleanText.includes("tasdiqlandi") || cleanText.includes("подтверждена") || cleanText.includes("активирован")) {
      this.playVoiceAlert("order_approved", true);
      return;
    }
    if (cleanText.includes("kutilmoqda") || cleanText.includes("ожидает") || cleanText.includes("tekshirib")) {
      this.playVoiceAlert("order_pending", true);
      return;
    }
    if (cleanText.includes("Tanaffus") || cleanText.includes("паузы")) {
      this.playVoiceAlert("shift_pause", true);
      return;
    }
    if (cleanText.includes("yakunlandi") || cleanText.includes("завершена")) {
      this.playVoiceAlert("shift_end", true);
      return;
    }
    if (cleanText.includes("GPS")) {
      this.playVoiceAlert("gps_active", true);
      return;
    }

    // 3. Динамический онлайн синтез Edge-TTS (без металлического роботизированного голоса)
    const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}`;
    this.playChimeTone();
    try {
      const dynamicAudio = new Audio(ttsUrl);
      dynamicAudio.play().then(() => {
        this.currentAudio = dynamicAudio;
        this.lastVoiceAlertTime = Date.now();
      }).catch(err => {
        console.warn("[V2X Audio] Neural TTS fetch failed, using fallback:", err);
        this._fallbackSpeak(cleanText, lang);
      });
    } catch (e) {
      this._fallbackSpeak(cleanText, lang);
    }
  }

  _fallbackSpeak(text, lang = null) {
    if (!this.speechSynth) return;
    const targetLang = lang || this.currentLanguage;
    const now = Date.now();
    if (now - this.lastVoiceAlertTime < 2500) return;

    this.speechSynth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
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

    this._ensureContext();
    const now = Date.now();
    const radarId = radar ? radar.id : "radar";
    const speedLimit = (radar && radar.speed_limit) ? radar.speed_limit : 60;
    const realSpeeding = isSpeeding && (speed > speedLimit);

    // Takroriy aytish oralig'i: bir xil radar bo'yicha 6 soniya
    if (this.lastRadarSpokenId === radarId && this.lastRadarSpokenSpeeding === realSpeeding) {
      if (now - this.lastVoiceAlertTime < 6000) return;
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
    if (now - this.lastVoiceAlertTime < 3500) return;
    this.playVoiceAlert("radar_passed", true);
  }

  playAccidentPrevented() {
    this.playVoiceAlert("accident_prevented", true);
  }
}

window.v2xAudio = new V2XAudioEngine();
