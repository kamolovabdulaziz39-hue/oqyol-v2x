/**
 * Main V2X Application Controller (Uzbekistan / Tashkent & Real GPS Integration).
 * Handles WebSocket telemetry pipeline, live geolocation, bilingual UI (Russian / Uzbek),
 * automotive human voice AI, and realistic vehicle models.
 */

// Реальные полилинии проезжих частей дорог Ташкента (OpenStreetMap)
const TASHKENT_ROADS = {
  amir_temur_nb: [
    [41.31700, 69.28111],
    [41.31825, 69.28139],
    [41.31950, 69.28165],
    [41.32050, 69.28187],
    [41.32140, 69.28207],
    [41.32172, 69.28214], // Перекресток с ул. Абдуллы Кадыри
    [41.32211, 69.28223],
    [41.32357, 69.28252],
    [41.32550, 69.28293]
  ],
  amir_temur_sb: [
    [41.32558, 69.28273],
    [41.32357, 69.28232],
    [41.32214, 69.28200],
    [41.32172, 69.28192],
    [41.32105, 69.28177],
    [41.31863, 69.28126],
    [41.31685, 69.28088]
  ],
  abdulla_qodiriy_wb: [
    [41.32109, 69.28655],
    [41.32136, 69.28580],
    [41.32145, 69.28420],
    [41.32155, 69.28300],
    [41.32172, 69.28214], // Перекресток с пр. Амира Темура
    [41.32181, 69.28104],
    [41.32193, 69.27956],
    [41.32227, 69.27927],
    [41.32249, 69.27738]
  ],
  abdulla_qodiriy_eb: [
    [41.32184, 69.27720],
    [41.32181, 69.27953],
    [41.32162, 69.28104],
    [41.32152, 69.28214],
    [41.32140, 69.28292],
    [41.32094, 69.28649]
  ]
};

class V2XApp {
  constructor() {
    this.vehicleId = "UZB-" + Math.floor(100 + Math.random() * 900);
    this.ws = null;
    this.sendInterval = null;
    this.telemetryHz = 10;
    this.lang = "uz"; // По умолчанию: узбекский язык (O'zbekcha)

    // По умолчанию: Демо-режим ВЫКЛЮЧЕН (Реальный боевой режим для водителей)
    this.demoMode = false;
    this.shiftState = "ended"; // "active" (Ishda), "paused" (Pauzada), "ended" (Ish tugatildi)
    this.fleetSyncInterval = null;
    this.orderCheckInterval = null;

    // Начальные координаты: Ташкент, Узбекистан (пр. Амира Темура / ул. Абдуллы Кадыри)
    // По умолчанию автомобиль остановлен, двигатель выключен (скорость 0.0)
    this.ego = {
      lat: 41.31950,
      lon: 69.28165,
      speed: 0.0,      // км/ч (начальное состояние — стоянка)
      heading: 9.3,    // По направлению полосы проспекта Амира Темура
      stealth: false,
      isMoving: false, // Стоит на месте
      laneOffset: 0.0,
      pathDistance: 280.0
    };

    this.gpsMode = false;
    this.gpsWatchId = null;
    this.lastGpsTimestamp = null;
    this.lastGpsCoords = null;
    this.hudMirror = false;
    this.isPaused = false;
    this.rtt = 0;

    // Радары и реклама платформы
    this.radars = [];
    this.ads = [];
    this.activeRadarId = null;

    // Словари интерфейса на узбекском и русском языках
    this.i18n = {
      uz: {
        label_admin_panel: "Admin Panel",
        safe_title: "YO'L OCHIQ • XAVFSIZ HUDUD",
        safe_desc: "Yo'l ochiq. Belgilangan tezlikda xavfsiz harakatlanishingiz mumkin.",
        yellow_title: "DIQQAT: XAVFLI YAQINLASHUV",
        yellow_desc: "Tezlikni kamaytiring. Boshqa transport vositasiga yaqinlashmoqda.",
        red_title: "XAVF! ZUDLIK BILAN TO'XTANG!",
        red_desc: "To'qnashuv xavfi mavjud! Favqulodda tormoz berish tavsiya etiladi!",
        speed_unit: "km/soat",
        safe_limit: "Xavfsiz chegara:",
        location_label: "Shahar:",
        threat_title: "Xavf manbai:",
        threat_none: "Mavjud emas",
        threat_dist: "Yaqinlashish masofasi:",
        threat_ttc: "Zarbaga qadar vaqt (TTC):",
        ping_label: "Kechikish (Ping)",
        vehicles_label: "Atrofdagi avto",
        gateway_label: "V2X Aloqa",
        btn_gps_off: "📡 GPS: O'CHIQ",
        btn_gps_on: "📍 GPS: YOQILGAN (Jonli)",
        btn_restart: "⟲ Qayta boshlash",
        btn_brake: "🛑 TO'XTATISH / O'CHIRISH",
        btn_demo_off: "🎮 Demo: O'CHIQ",
        btn_demo_on: "🎮 Demo: YOQILGAN",
        btn_stealth_off: "👁 Yashirin: O'CHIQ",
        btn_stealth_on: "🕶 Yashirin: YOQILGAN",
        btn_sound_on: "🔊 Ovoz: YOQILGAN",
        btn_sound_off: "🔇 Ovoz: O'CHIQ",
        btn_voice_on: "🗣 AI Nutq: YOQILGAN",
        btn_voice_off: "🤐 AI Nutq: O'CHIQ",
        btn_hud: "🪞 HUD Proyeksiya",
        keyboard_tips: "⌨ Avto boshqaruvi: [↑/W] Gaz | [↓/S] Tormoz | [←/→/A/D] Rul | [Bo'shliq] To'xtash",
        btn_tariffs: "🎁 3 kun bepul • Ijara (200 ming)",
        btn_cabinet: "Shaxsiy kabinet",
        modal_tariffs_title: "V2X Xavfsizlik Platformasi Narxlari",
        modal_cabinet_title: "Haydovchi Shaxsiy Kabineti",
        name_rent: "SDAT V ARENDU (3 kun bepul / 200 ming)",
        desc_rent: "Oldingi narx: 1 000 000 so'm -> 80% CHEGIRMA: oyiga 200 000 so'm (Kuniga 6 600 so'm). Dastlabki 3 kun 0 so'm (mutlaqo bepul)!",
        btn_rent_text: "🎁 3 kun bepul boshlash (Keyin 200 000 so'm/oy)",
        tab_reviews: "⭐ Fikrlar va Videolar",
        tab_profile: "⚙ Mening ma'lumotlarim",
        lbl_new_review: "✍ Fikr-mulohaza va videoregistrator videosini qoldirish",
        lbl_rating: "Baholash:",
        lbl_review_text: "Fikringiz (V2X tizimi to'qnashuvdan qanday qutqardi?):",
        lbl_review_video: "Videoregistrator videosini biriktirish:",
        btn_send_review: "Fikr va videoni yuborish",
        btn_onboarding: "🛡️ OQ YO'L AI Haqida",
        title_modal_onboarding: "🛡️ OQ YO'L AI — Xavfsiz Harakatlanish Tizimi",
        step1_name: "1. Biz haqimizda",
        step2_name: "2. Ro'yxatdan o'tish",
        step3_name: "3. Tarif va To'lov",
        lbl_step1_headline: "🛡️ OQ YO'L AI — Sun'iy Intellekt va V2X Xavfsizlik Platformasi",
        lbl_step1_desc: "O'zbekistondagi har bir haydovchini yo'l-transport hodisalaridan asrovchi, ko'rinmas xavflarni 3-5 soniya oldin aniqlovchi va inson ovozida ogohlantiruvchi milliy platforma.",
        lbl_about_feat1_title: "Ultra tezkor aloqa (<10 ms)",
        lbl_about_feat1_desc: "Avtomobillar o'zaro sekundiga 10 marta ma'lumot almashadi. Internet yoki GPS yo'qolganda ham mahalliy radioto'lqinlar orqali uzluksiz ishlaydi.",
        lbl_about_feat2_title: "Bino va tuman orqasini ko'rish",
        lbl_about_feat2_desc: "Ko'rinmas chorrahalarda, baland binolar orqasidan yoki tuman ichidan tezlikda kelayotgan xavfni inson ko'zidan ancha oldin sezadi.",
        lbl_about_feat3_title: "Tabiiy o'zbek tilidagi AI ovoz",
        lbl_about_feat3_desc: "Chiroyli Madina Neural inson ovozi safar boshida iliq tilak bildiradi va xavf paytida zudlik bilan tormoz berishni buyuradi.",
        lbl_about_feat4_title: "Qulay va shaffof narxlar",
        lbl_about_feat4_desc: "Oyiga 200 000 so'm ijara (dastlabki 3 kun mutlaqo bepul!). Shaxsiy kabinet va cheksiz V2X xavfsizlik.",
        btn_text_to_reg: "Ro'yxatdan o'tish ➔",
        lbl_step2_headline: "👤 Haydovchini OQ YO'L AI tizimida ro'yxatdan o'tkazish",
        lbl_step2_desc: "Xavfsizlik tizimidan foydalanish uchun ma'lumotlaringizni to'ldiring:",
        lbl_reg_fullname: "Ism va Familiyangiz *",
        lbl_reg_phone: "Telefon raqamingiz *",
        lbl_reg_email: "Elektron pochtangiz (Email) *",
        lbl_reg_car: "Avtomobil rusumi",
        lbl_reg_plate: "Davlat raqami",
        btn_text_reg_back: "← Orqaga (Biz haqimizda)",
        btn_text_to_pay: "Tarifni tanlash va To'lovga o'tish ➔",
        lbl_pay_title: "💳 OQ YO'L AI Litsenziyasini tanlash va To'lov",
        lbl_pay_desc: "O'zingizga qulay tarifni tanlang, to'lovni amalga oshiring va platformani to'liq ishga tushiring:",
        btn_text_pay_now_rent: "💳 To'lash va Litsenziyani faollashtirish (200 000 so'm/oy)",
        btn_text_pay_back: "← Orqaga (Ro'yxatdan o'tish)",
        lbl_pay_biz_title: "Rasmiy Biznes To'lov (Paynet / Click / Payme / Uzum)",
        lbl_pay_qr_hint: "📷 QR kodni ilovada skanerlang",
        lbl_pay_card_title: "Biznes karta raqami:",
        lbl_pay_recipient_title: "Qabul qiluvchi (Karta egasi):",
        lbl_pay_apps_title: "Istalgan ilova orqali to'lash mumkin:",
        lbl_pay_sender_card: "Siz to'lov qilgan karta raqami yoki telefoningiz: *",
        lbl_pay_amount_label: "To'langan summa:",
        btn_copy_card_text: "📋 Nusxa olish",
        lbl_sat_drivers: "Faol haydovchilar",
        lbl_sat_rating: "Mijozlar bahosi",
        lbl_sat_satisfaction: "Mamnunlik darajasi",
        lbl_sat_accidents: "To'qnashuv holatlari",
        btn_text_finish: "Platformadan foydalanish (Safarni boshlash) 🚀",
        lbl_reg_password: "Parol (Kabinetga kirish uchun) *",
        link_forgot_password: "Parolni unutdingizmi? (Tiklash)",
        title_modal_forgot: "Parolni Tiklash",
        lbl_forgot_desc: "Ro'yxatdan o'tgan telefon raqamingiz yoki elektron pochtangizni kiriting. Biz sizga bir martalik tasdiqlash kodini yuboramiz.",
        lbl_forgot_identifier: "Telefon raqam yoki Elektron pochta *",
        btn_text_send_code: "Tasdiqlash kodini olish (SMS / Email) ➔",
        lbl_enter_sms: "SMS Tasdiqlash kodi (4 ta raqam) *",
        lbl_enter_new_pass: "Yangi parol *",
        lbl_confirm_new_pass: "Yangi parolni tasdiqlang *",
        btn_text_save_new_pass: "✓ Yangi parolni saqlash va Tiklash",
        label_start_trip: "Safarni boshlash"
      },
      ru: {
        label_admin_panel: "Админ-панель",
        safe_title: "ПУТЬ СВОБОДЕН • БЕЗОПАСНАЯ ЗОНА",
        safe_desc: "Дорога свободна. Движение на крейсерской скорости разрешено.",
        yellow_title: "ВНИМАНИЕ: ОПАСНОЕ СБЛИЖЕНИЕ",
        yellow_desc: "Сбавьте скорость. Приближение к перекрестку или другому ТС.",
        red_title: "КРИТИЧЕСКАЯ ОПАСНОСТЬ СТОЛКНОВЕНИЯ!",
        red_desc: "Угроза удара на перекрестке! Экстренное торможение!",
        speed_unit: "км/ч",
        safe_limit: "Безопасный лимит:",
        location_label: "Локация:",
        threat_title: "Угроза столкновения:",
        threat_none: "Нет",
        threat_dist: "Дистанция сближения:",
        threat_ttc: "Время до удара (TTC):",
        ping_label: "Задержка (Пинг)",
        vehicles_label: "ТС в радиусе",
        gateway_label: "Шлюз V2X",
        btn_gps_off: "📡 GPS: ВЫКЛ",
        btn_gps_on: "📍 GPS: ВКЛ (Живой)",
        btn_restart: "⟲ Рестарт",
        btn_brake: "🛑 СТОП / ВЫКЛЮЧИТЬ",
        btn_demo_off: "🎮 Демо: ВЫКЛ",
        btn_demo_on: "🎮 Демо: ВКЛ",
        btn_stealth_off: "👁 Невидимка: ВЫКЛ",
        btn_stealth_on: "🕶 Невидимка: ВКЛ",
        btn_sound_on: "🔊 Звук: ВКЛ",
        btn_sound_off: "🔇 Звук: ВЫКЛ",
        btn_voice_on: "🗣 Голос ИИ: ВКЛ",
        btn_voice_off: "🤐 Голос ИИ: ВЫКЛ",
        btn_hud: "🪞 Проекция HUD",
        keyboard_tips: "⌨ Управление авто: [↑/W] Газ | [↓/S] Тормоз | [←/→/A/D] Руль | [Пробел] Экстренный стоп",
        btn_tariffs: "🎁 3 дня бесплатно • Аренда (200 тыс)",
        btn_cabinet: "Личный кабинет",
        modal_tariffs_title: "Тарифы Платформы Безопасности OQ YO'L AI",
        modal_cabinet_title: "Личный Кабинет Водителя",
        name_rent: "СДАТЬ В АРЕНДУ (3 дня бесплатно / 200 тыс)",
        desc_rent: "Прежняя цена: 1 000 000 сум -> СКИДКА 80%: всего 200 000 сум/мес (6 600 сум в день). Первые 3 дня бесплатно!",
        btn_rent_text: "🎁 Начать 3 дня бесплатно (Затем 200 000 сум/мес)",
        tab_reviews: "⭐ Отзывы и Видеорегистратор",
        tab_profile: "⚙ Мои данные",
        lbl_new_review: "✍ Оставить отзыв и прикрепить видеорегистратор",
        lbl_rating: "Оценка:",
        lbl_review_text: "Ваш отзыв (Как V2X помог избежать аварии?):",
        lbl_review_video: "Прикрепить видео с видеорегистратора:",
        btn_send_review: "Опубликовать отзыв с видео",
        btn_onboarding: "🛡️ О платформе OQ YO'L AI",
        title_modal_onboarding: "🛡️ OQ YO'L AI — Интеллектуальная Система Безопасности",
        step1_name: "1. О платформе",
        step2_name: "2. Регистрация",
        step3_name: "3. Тариф и Оплата",
        lbl_step1_headline: "🛡️ OQ YO'L AI — Искусственный Интеллект и V2X Безопасность",
        lbl_step1_desc: "Национальная платформа Узбекистана для предотвращения ДТП, обнаружения невидимых угроз за 3–5 секунд и голосового предупреждения человека.",
        lbl_about_feat1_title: "Сверхбыстрая связь (<10 мс)",
        lbl_about_feat1_desc: "Автомобили обмениваются данными 10 раз в секунду. Работает автономно даже при потере интернета или сигнала GPS.",
        lbl_about_feat2_title: "Видит сквозь здания и туман",
        lbl_about_feat2_desc: "Предотвращает боковые удары на перекрестках при вылете нарушителей на красный свет задолго до появления в зоне видимости.",
        lbl_about_feat3_title: "Естественный голос ИИ",
        lbl_about_feat3_desc: "Премиальный диктор тепло приветствует в начале пути и заблаговременно командует о торможении при угрозе ДТП.",
        lbl_about_feat4_title: "Выгодные тарифы",
        lbl_about_feat4_desc: "Аренда всего 200 000 сум в месяц (первые 3 дня бесплатно!). Личный кабинет и безлимитная безопасность V2X.",
        btn_text_to_reg: "Регистрация ➔",
        lbl_step2_headline: "👤 Регистрация водителя в системе OQ YO'L AI",
        lbl_step2_desc: "Заполните данные для подключения к кооперативной системе безопасности:",
        lbl_reg_fullname: "Имя и Фамилия *",
        lbl_reg_phone: "Номер телефона *",
        lbl_reg_email: "Электронная почта (Email) *",
        lbl_reg_car: "Модель автомобиля",
        lbl_reg_plate: "Гос. номер",
        btn_text_reg_back: "← Назад (О платформе)",
        btn_text_to_pay: "Выбрать тариф и перейти к оплате ➔",
        lbl_pay_title: "💳 Выбор тарифа и Оплата лицензии OQ YO'L AI",
        lbl_pay_desc: "Выберите подходящий тариф, совершите оплату и активируйте платформу:",
        btn_text_pay_now_rent: "💳 Оплатить и активировать лицензию (200 000 сум/мес)",
        btn_text_pay_back: "← Назад (Регистрация)",
        lbl_pay_biz_title: "Официальный Бизнес-платеж (Paynet / Click / Payme / Uzum)",
        lbl_pay_qr_hint: "📷 Отсканируйте QR-код в приложении",
        lbl_pay_card_title: "Номер бизнес-карты:",
        lbl_pay_recipient_title: "Получатель (Владелец карты):",
        lbl_pay_apps_title: "Оплата через любое банковское приложение:",
        lbl_pay_sender_card: "Номер вашей карты или телефона с которого оплатили: *",
        lbl_pay_amount_label: "Сумма к оплате:",
        btn_copy_card_text: "📋 Скопировать",
        lbl_sat_drivers: "Активных водителей",
        lbl_sat_rating: "Оценка сервиса",
        lbl_sat_satisfaction: "Уровень довольства",
        lbl_sat_accidents: "Предотвращено ДТП",
        btn_text_finish: "Пользоваться платформой (Начать поездку) 🚀",
        lbl_reg_password: "Пароль (Для входа в кабинет) *",
        link_forgot_password: "Забыли пароль? (Восстановить)",
        title_modal_forgot: "Восстановление Пароля",
        lbl_forgot_desc: "Введите зарегистрированный номер телефона или email. Мы отправим вам одноразовый код подтверждения.",
        lbl_forgot_identifier: "Номер телефона или Email *",
        btn_text_send_code: "Получить код подтверждения (SMS / Email) ➔",
        lbl_enter_sms: "Код подтверждения из SMS (4 цифры) *",
        lbl_enter_new_pass: "Новый пароль *",
        lbl_confirm_new_pass: "Подтвердите новый пароль *",
        btn_text_save_new_pass: "✓ Сохранить новый пароль",
        label_start_trip: "Начать поездку"
      }
    };
  }

  init() {
    window.v2xMap.init();
    window.v2xAudio.setLanguage(this.lang);
    this._setupUIListeners();
    this._setupTariffsAndCabinet();
    this._setupOnboardingModal();
    this._setupSubscriptionGate();
    this._loadReviews();
    this._setupKeyboardControls();
    this.updateLanguageUI();
    this._loadRadars();
    this._loadAds();
    this.connectWebSocket();
    this._startTelemetryLoop();
    this._startFleetSync();
    this._checkDriverSubscriptionStatus();

    // Запрос реального GPS устройства
    this._tryInitialGeolocation();

    // Если перешли со страницы welcome.html с параметром start_trip=1
    if (window.location.search.includes("start_trip=1")) {
      setTimeout(() => {
        const modalOnboarding = document.getElementById("modal-onboarding");
        if (modalOnboarding) {
          modalOnboarding.style.display = "none";
          modalOnboarding.classList.remove("active");
        }
        this.startTrip();
      }, 1000);
    }
  }

  setLanguage(lang) {
    if (lang === "uz" || lang === "ru") {
      this.lang = lang;
      window.v2xAudio.setLanguage(lang);
      this.updateLanguageUI();
      // Озвучиваем переключение приятным голосом
      if (lang === "uz") {
        window.v2xAudio.speakText("O'zbek tili tanlandi. Xavfsiz safar tilaymiz.");
      } else {
        window.v2xAudio.speakText("Выбран русский язык. Безопасной дороги.");
      }
    }
  }

  updateLanguageUI() {
    const t = this.i18n[this.lang];
    document.getElementById("speed-unit-label").textContent = t.speed_unit;
    document.getElementById("safe-limit-label").textContent = t.safe_limit;
    document.getElementById("label-location").textContent = t.location_label;
    document.getElementById("label-threat-title").textContent = t.threat_title;
    document.getElementById("label-threat-dist").textContent = t.threat_dist;
    document.getElementById("label-threat-ttc").textContent = t.threat_ttc;
    document.getElementById("label-metric-ping").textContent = t.ping_label;
    document.getElementById("label-metric-vehicles").textContent = t.vehicles_label;
    document.getElementById("label-metric-gateway").textContent = t.gateway_label;
    document.getElementById("keyboard-tips").textContent = t.keyboard_tips;

    document.getElementById("btn-reset").textContent = t.btn_restart;
    const btnBrake = document.getElementById("btn-emergency-brake");
    if (btnBrake) btnBrake.textContent = t.btn_brake;
    const btnDemo = document.getElementById("btn-demo-mode");
    if (btnDemo) btnDemo.textContent = this.demoMode ? t.btn_demo_on : t.btn_demo_off;
    document.getElementById("btn-hud-mirror").textContent = t.btn_hud;

    const btnStealth = document.getElementById("btn-stealth");
    btnStealth.textContent = this.ego.stealth ? t.btn_stealth_on : t.btn_stealth_off;

    const btnSound = document.getElementById("btn-sound");
    btnSound.textContent = window.v2xAudio.soundEnabled ? t.btn_sound_on : t.btn_sound_off;

    const btnVoice = document.getElementById("btn-voice");
    btnVoice.textContent = window.v2xAudio.voiceEnabled ? t.btn_voice_on : t.btn_voice_off;

    const btnGps = document.getElementById("btn-real-gps");
    btnGps.textContent = this.gpsMode ? t.btn_gps_on : t.btn_gps_off;

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el && txt) el.textContent = txt;
    };
    setTxt("label-tariffs", t.btn_tariffs);
    setTxt("label-cabinet", t.btn_cabinet);
    setTxt("label-admin-panel", t.label_admin_panel);
    setTxt("title-modal-tariffs", t.modal_tariffs_title);
    setTxt("title-modal-cabinet", t.modal_cabinet_title);
    setTxt("name-rent", t.name_rent);
    setTxt("desc-rent", t.desc_rent);
    setTxt("btn-rent-text", t.btn_rent_text);
    setTxt("tab-btn-reviews", t.tab_reviews);
    setTxt("tab-btn-profile", t.tab_profile);
    setTxt("lbl-new-review-title", t.lbl_new_review);
    setTxt("lbl-review-rating", t.lbl_rating);
    setTxt("lbl-review-text", t.lbl_review_text);
    setTxt("lbl-review-video", t.lbl_review_video);
    setTxt("btn-send-review-text", t.btn_send_review);

    // Onboarding & Registration modal bindings
    const saved = this._getSavedDriver();
    setTxt("label-onboarding", saved ? `👤 ${saved.name} • OQ YO'L AI` : t.btn_onboarding);
    setTxt("title-modal-onboarding", t.title_modal_onboarding);
    setTxt("lbl-step1-name", t.step1_name);
    setTxt("lbl-step2-name", t.step2_name);
    setTxt("lbl-step3-name", t.step3_name);
    setTxt("lbl-step1-headline", t.lbl_step1_headline);
    setTxt("lbl-step1-desc", t.lbl_step1_desc);
    setTxt("btn-text-to-reg", t.btn_text_to_reg);
    setTxt("lbl-step2-headline", t.lbl_step2_headline);
    setTxt("lbl-step2-desc", t.lbl_step2_desc);
    setTxt("lbl-reg-fullname", t.lbl_reg_fullname);
    setTxt("lbl-reg-phone", t.lbl_reg_phone);
    setTxt("lbl-reg-email", t.lbl_reg_email);
    setTxt("lbl-reg-car", t.lbl_reg_car);
    setTxt("lbl-reg-plate", t.lbl_reg_plate);
    setTxt("btn-text-reg-back", t.btn_text_reg_back);
    setTxt("btn-text-to-pay", t.btn_text_to_pay);
    setTxt("lbl-pay-title", t.lbl_pay_title);
    setTxt("lbl-pay-desc", t.lbl_pay_desc);
    setTxt("lbl-pay-biz-title", t.lbl_pay_biz_title);
    setTxt("lbl-pay-qr-hint", t.lbl_pay_qr_hint);
    setTxt("lbl-pay-card-title", t.lbl_pay_card_title);
    setTxt("lbl-pay-recipient-title", t.lbl_pay_recipient_title);
    setTxt("lbl-pay-apps-title", t.lbl_pay_apps_title);
    setTxt("lbl-pay-sender-card", t.lbl_pay_sender_card);
    setTxt("lbl-pay-amount-label", t.lbl_pay_amount_label);
    setTxt("btn-copy-card-text", t.btn_copy_card_text);
    setTxt("btn-text-pay-back", t.btn_text_pay_back);
    setTxt("btn-text-finish", t.btn_text_finish);
    setTxt("lbl-about-feat1-title", t.lbl_about_feat1_title);
    setTxt("lbl-about-feat1-desc", t.lbl_about_feat1_desc);
    setTxt("lbl-about-feat2-title", t.lbl_about_feat2_title);
    setTxt("lbl-about-feat2-desc", t.lbl_about_feat2_desc);
    setTxt("lbl-about-feat3-title", t.lbl_about_feat3_title);
    setTxt("lbl-about-feat3-desc", t.lbl_about_feat3_desc);
    setTxt("lbl-about-feat4-title", t.lbl_about_feat4_title);
    setTxt("lbl-about-feat4-desc", t.lbl_about_feat4_desc);
    setTxt("lbl-sat-drivers", t.lbl_sat_drivers);
    setTxt("lbl-sat-rating", t.lbl_sat_rating);
    setTxt("lbl-sat-satisfaction", t.lbl_sat_satisfaction);
    setTxt("lbl-sat-accidents", t.lbl_sat_accidents);
    setTxt("lbl-reg-password", t.lbl_reg_password);
    setTxt("link-forgot-password", t.link_forgot_password);
    setTxt("title-modal-forgot", t.title_modal_forgot);
    setTxt("lbl-forgot-desc", t.lbl_forgot_desc);
    setTxt("lbl-forgot-identifier", t.lbl_forgot_identifier);
    setTxt("btn-text-send-code", t.btn_text_send_code);
    setTxt("lbl-enter-sms", t.lbl_enter_sms);
    setTxt("lbl-enter-new-pass", t.lbl_enter_new_pass);
    setTxt("lbl-confirm-new-pass", t.lbl_confirm_new_pass);
    setTxt("btn-text-save-new-pass", t.btn_text_save_new_pass);
    setTxt("label-start-trip", t.label_start_trip);
  }

  _tryInitialGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.applyGpsPosition(pos, true);
        this.activateRealGps();
      },
      (err) => {
        console.log("[V2X] GPS waiting for user click/permission:", err.message);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }

  applyGpsPosition(pos, recenter = false) {
    const now = Date.now();
    const newLat = pos.coords.latitude;
    const newLon = pos.coords.longitude;

    if (this.lastGpsCoords && this.lastGpsTimestamp) {
      const dtSec = (now - this.lastGpsTimestamp) / 1000.0;
      if (dtSec > 0.5) {
        const dLat = (newLat - this.lastGpsCoords.lat) * 111139.0;
        const dLon = (newLon - this.lastGpsCoords.lon) * 111139.0 * Math.cos(newLat * Math.PI / 180);
        const distM = Math.hypot(dLat, dLon);
        if (distM > 1.0) {
          this.ego.speed = Math.round((distM / dtSec) * 3.6);
          this.ego.heading = Math.round((Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360);
        }
      }
    }

    if (pos.coords.speed !== null && !isNaN(pos.coords.speed) && pos.coords.speed >= 0) {
      this.ego.speed = Math.round(pos.coords.speed * 3.6);
    }
    if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
      this.ego.heading = Math.round(pos.coords.heading);
    }

    this.ego.lat = newLat;
    this.ego.lon = newLon;
    this.ego.isMoving = (this.ego.speed > 2.0);
    this.lastGpsCoords = { lat: newLat, lon: newLon };
    this.lastGpsTimestamp = now;
    this.gpsMode = true;

    if (window.v2xMap) {
      if (recenter) {
        window.v2xMap.panTo(newLat, newLon, 17);
      }
      window.v2xMap.updateEgo(newLat, newLon, this.ego.heading, this.ego.speed, this.lastSafetyLevel || "SAFE");
    }

    this._syncAnchorWithServer(newLat, newLon);

    const btnGps = document.getElementById("btn-real-gps");
    const t = this.i18n[this.lang];
    if (btnGps) {
      btnGps.classList.add("gps-live-active");
      btnGps.textContent = t.btn_gps_on;
    }
  }

  activateRealGps() {
    if (!navigator.geolocation) return;
    if (this.gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this.gpsWatchId);
    }
    this.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.applyGpsPosition(pos, false);
      },
      (err) => {
        console.warn("GPS watch error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
  }

  toggleRealGps() {
    const btnGps = document.getElementById("btn-real-gps");
    const t = this.i18n[this.lang];
    if (!this.gpsMode) {
      if (!navigator.geolocation) {
        alert(this.lang === "uz" ? "GPS qurilmangizda mavjud emas." : "Геолокация не поддерживается вашим устройством.");
        return;
      }
      if (btnGps) {
        btnGps.textContent = this.lang === "uz" ? "📡 GPS qidirilmoqda..." : "📡 Поиск GPS...";
      }

      this.demoMode = false;
      this._updateDemoUI();

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.applyGpsPosition(pos, true);
          this.activateRealGps();
          if (window.v2xAudio) {
            window.v2xAudio.speakText(this.lang === "uz" ? "GPS ulandi. Joylashuvingiz xaritada ochildi." : "GPS подключен. Ваше местоположение открыто на карте.");
          }
        },
        (err) => {
          alert("GPS xatosi: " + err.message);
          this.gpsMode = false;
          if (btnGps) {
            btnGps.classList.remove("gps-live-active");
            btnGps.textContent = t.btn_gps_off;
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      if (this.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(this.gpsWatchId);
        this.gpsWatchId = null;
      }
      this.gpsMode = false;
      if (btnGps) {
        btnGps.classList.remove("gps-live-active");
        btnGps.textContent = t.btn_gps_off;
      }
    }
  }

  _getApiBase() {
    let host = window.location.host;
    if (!host || window.location.protocol === "file:") {
      return "http://localhost:8085";
    }
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${host}`;
  }

  async _syncAnchorWithServer(lat, lon) {
    try {
      await fetch(`${this._getApiBase()}/api/simulator/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: lat, lon: lon })
      });
    } catch (e) {
      console.warn("Failed to sync anchor:", e);
    }
  }

  connectWebSocket() {
    let host = window.location.host;
    if (!host || window.location.protocol === "file:") {
      host = "localhost:8085";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${host}/ws/telemetry/${this.vehicleId}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn("WebSocket initialization error:", e);
      return;
    }

    this.ws.onopen = () => {
      document.getElementById("connection-status").textContent = "ONLINE (10 Hz, Python Hub)";
      document.getElementById("connection-status").style.color = "var(--color-green)";
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "safety_update") {
          this.handleSafetyUpdate(data);
        }
      } catch (e) {
        console.error("[V2X] Parse error:", e);
      }
    };

    this.ws.onerror = () => {
      document.getElementById("connection-status").textContent = "STANDALONE (Offline)";
      document.getElementById("connection-status").style.color = "var(--color-yellow)";
    };

    this.ws.onclose = () => {
      document.getElementById("connection-status").textContent = "STANDALONE (Offline)";
      document.getElementById("connection-status").style.color = "var(--color-yellow)";
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  _computePoseAlongPath(waypoints, distanceMeters, laneOffsetMeters = 0.0) {
    const METERS_PER_DEG_LAT = 111139.0;
    let totalLength = 0;
    const segments = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const latRad = ((p1[0] + p2[0]) / 2.0) * (Math.PI / 180.0);
      const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(latRad);
      const dn = (p2[0] - p1[0]) * METERS_PER_DEG_LAT;
      const de = (p2[1] - p1[1]) * metersPerDegLon;
      const length = Math.max(0.1, Math.hypot(dn, de));
      const bearing = (Math.atan2(de, dn) * (180.0 / Math.PI) + 360.0) % 360.0;
      segments.push({
        p1, p2, length, bearing,
        cumStart: totalLength,
        cumEnd: totalLength + length
      });
      totalLength += length;
    }

    if (totalLength === 0 || segments.length === 0) {
      return { lat: waypoints[0][0], lon: waypoints[0][1], heading: 0.0 };
    }

    const d = ((distanceMeters % totalLength) + totalLength) % totalLength;
    let seg = segments[segments.length - 1];
    for (const s of segments) {
      if (s.cumStart <= d && d <= s.cumEnd) {
        seg = s;
        break;
      }
    }

    const ratio = Math.max(0.0, Math.min(1.0, (d - seg.cumStart) / seg.length));
    const latBase = seg.p1[0] + (seg.p2[0] - seg.p1[0]) * ratio;
    const lonBase = seg.p1[1] + (seg.p2[1] - seg.p1[1]) * ratio;
    const heading = seg.bearing;

    if (laneOffsetMeters !== 0.0) {
      const perpRad = (heading + 90.0) * (Math.PI / 180.0);
      const latRad = latBase * (Math.PI / 180.0);
      const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(latRad);
      const offNorth = laneOffsetMeters * Math.cos(perpRad);
      const offEast = laneOffsetMeters * Math.sin(perpRad);
      return {
        lat: latBase + offNorth / METERS_PER_DEG_LAT,
        lon: lonBase + offEast / metersPerDegLon,
        heading
      };
    }

    return { lat: latBase, lon: lonBase, heading };
  }

  _stepEgoLaneFollower(dt) {
    if (this.gpsMode || !this.demoMode) return;
    if (this.ego.speed <= 0) return;
    const distDelta = (this.ego.speed / 3.6) * dt;
    this.ego.pathDistance = (this.ego.pathDistance || 280.0) + distDelta;
    const pose = this._computePoseAlongPath(TASHKENT_ROADS.amir_temur_nb, this.ego.pathDistance, this.ego.laneOffset || 0.0);
    this.ego.lat = pose.lat;
    this.ego.lon = pose.lon;
    this.ego.heading = pose.heading;
  }

  _runLocalSimulationStep(dt) {
    // Если демо-режим выключен, никаких фантомных машин и ложных симуляций!
    if (!this.demoMode) {
      const safetyUpdate = {
        type: "safety_update",
        ego_telemetry: {
          lat: this.ego.lat,
          lon: this.ego.lon,
          speed: this.ego.speed,
          heading: this.ego.heading
        },
        safety: {
          level: "SAFE",
          recommended_speed: 60,
          threat_vehicle_id: null,
          closest_distance: null,
          min_ttc: null,
          conflict_type: null,
          is_intersection_risk: false,
          is_blind_spot: false
        },
        neighbors: []
      };
      this.handleSafetyUpdate(safetyUpdate);
      return;
    }

    if (!this.localVehicles) {
      this.localVehicles = [
        { id: "TRUCK-901", type: "truck", path: TASHKENT_ROADS.abdulla_qodiriy_wb, dist: 230.0, offset: 0.0, speed: 52.0 },
        { id: "TAXI-304", type: "car", path: TASHKENT_ROADS.amir_temur_nb, dist: 215.0, offset: 3.5, speed: 45.0 }
      ];
    }
    const METERS_PER_DEG_LAT = 111139.0;
    const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((this.ego.lat * Math.PI) / 180.0);

    const neighbors = [];
    let minTtc = null;
    let closestDist = null;
    let threatVid = null;
    let level = "SAFE";

    for (const v of this.localVehicles) {
      const vDist = (v.speed / 3.6) * dt;
      v.dist += vDist;
      const pose = this._computePoseAlongPath(v.path, v.dist, v.offset);

      const dn = (pose.lat - this.ego.lat) * METERS_PER_DEG_LAT;
      const de = (pose.lon - this.ego.lon) * metersPerDegLon;
      const dist = Math.hypot(dn, de);

      if (closestDist === null || dist < closestDist) {
        closestDist = Math.round(dist);
      }

      const trajectory = [];
      for (let s = 1; s <= 4; s++) {
        const futurePose = this._computePoseAlongPath(v.path, v.dist + (v.speed / 3.6) * s * 1.5, v.offset);
        trajectory.push({ lat: futurePose.lat, lon: futurePose.lon });
      }

      neighbors.push({
        vehicle_id: v.id,
        vehicle_type: v.type,
        lat: pose.lat,
        lon: pose.lon,
        speed: v.speed,
        heading: pose.heading,
        distance_meters: Math.round(dist),
        trajectory: trajectory
      });

      if (dist < 30) {
        level = "RED";
        threatVid = v.id;
        minTtc = Math.max(0.5, (dist / 14)).toFixed(1);
      } else if (dist < 65 && level !== "RED") {
        level = "YELLOW";
        threatVid = v.id;
        minTtc = (dist / 14).toFixed(1);
      }
    }

    const safetyUpdate = {
      type: "safety_update",
      ego_telemetry: {
        lat: this.ego.lat,
        lon: this.ego.lon,
        speed: this.ego.speed,
        heading: this.ego.heading
      },
      safety: {
        level: level,
        recommended_speed: level === "RED" ? 0 : (level === "YELLOW" ? 35 : 60),
        threat_vehicle_id: threatVid,
        closest_distance: closestDist,
        min_ttc: minTtc,
        conflict_type: level !== "SAFE" ? "intersection" : null,
        is_intersection_risk: (threatVid === "TRUCK-901" && level !== "SAFE"),
        is_blind_spot: (threatVid === "TAXI-304" && dist < 20)
      },
      neighbors: neighbors
    };

    this.handleSafetyUpdate(safetyUpdate);
  }

  _startTelemetryLoop() {
    const intervalMs = 1000 / this.telemetryHz;
    const dt = 1.0 / this.telemetryHz;

    this.sendInterval = setInterval(() => {
      if (this.isPaused) return;

      if (!this.gpsMode && this.ego.isMoving && this.ego.speed > 0 && this.demoMode) {
        this._stepEgoLaneFollower(dt);
      }

      // Проверка приближения к радарам контроля скорости
      this._checkUpcomingRadars();
      this._updateAdSafetyInterlock(this.lastSafetyLevel || "SAFE");

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const payload = {
          vehicle_id: this.vehicleId,
          vehicle_type: "car",
          lat: Number(this.ego.lat.toFixed(7)),
          lon: Number(this.ego.lon.toFixed(7)),
          speed: Number(this.ego.speed.toFixed(1)),
          heading: Number(this.ego.heading.toFixed(1)),
          elevation: 450.0,
          stealth: this.ego.stealth,
          client_time: Date.now()
        };
        this.ws.send(JSON.stringify(payload));
      } else {
        this._runLocalSimulationStep(dt);
      }
    }, intervalMs);
  }

  handleSafetyUpdate(data) {
    const safety = data.safety;
    const t = this.i18n[this.lang];
    const now = Date.now();
    if (data.client_time > 0) {
      this.rtt = Math.max(0, now - data.client_time);
    }

    const statusBar = document.getElementById("safety-status-bar");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");
    const statusIcon = document.getElementById("status-icon");

    statusBar.className = `status-${safety.level.toLowerCase()}`;
    
    if (safety.level === "RED") {
      statusIcon.textContent = "⚠";
      statusTitle.textContent = t.red_title;
      statusTitle.style.color = "var(--color-red)";
      statusDesc.textContent = t.red_desc;
    } else if (safety.level === "YELLOW") {
      statusIcon.textContent = "!";
      statusTitle.textContent = t.yellow_title;
      statusTitle.style.color = "var(--color-yellow)";
      statusDesc.textContent = t.yellow_desc;
    } else {
      statusIcon.textContent = "✓";
      statusTitle.textContent = t.safe_title;
      statusTitle.style.color = "var(--color-green)";
      statusDesc.textContent = t.safe_desc;
    }

    document.getElementById("speed-display").textContent = Math.round(this.ego.speed);
    document.getElementById("rec-speed-badge").textContent = `${Math.round(safety.recommended_speed)} ${t.speed_unit}`;

    document.getElementById("metric-ping").textContent = `${this.rtt} ms`;
    document.getElementById("metric-vehicles").textContent = data.neighbors.length;

    const threatCard = document.getElementById("threat-card");
    threatCard.className = `hud-panel threat-card hazard-${safety.level.toLowerCase()}`;
    const hasActiveThreat = (safety.threat_vehicle_id && safety.level !== "SAFE");
    document.getElementById("threat-vid").textContent = hasActiveThreat ? safety.threat_vehicle_id : t.threat_none;
    document.getElementById("threat-dist").textContent = (hasActiveThreat && safety.closest_distance !== null) ? `${safety.closest_distance} m` : "--";
    document.getElementById("threat-ttc").textContent = (hasActiveThreat && safety.min_ttc !== null) ? `${safety.min_ttc} s` : "--";

    // Голосовой движок с человеческой речью и передачей текущей скорости
    window.v2xAudio.updateSafetyLevel(safety.level, safety.alert_message, {
      is_intersection_risk: safety.is_intersection_risk,
      is_blind_spot: safety.is_blind_spot
    }, this.ego.speed);

    // Отрисовка на карте
    window.v2xMap.updateEgo(this.ego.lat, this.ego.lon, this.ego.heading, this.ego.speed, safety.level);
    window.v2xMap.updateNeighbors(data.neighbors, this.ego.lat, this.ego.lon, safety.threat_vehicle_id);

    // Дорожная безопасность рекламы
    this.lastSafetyLevel = safety.level;
    this._updateAdSafetyInterlock(safety.level);
  }

  _setupKeyboardControls() {
    window.addEventListener("keydown", (e) => {
      // Secret Admin Hotkey: Ctrl + Shift + A
      if (e.ctrlKey && e.shiftKey && (e.code === "KeyA" || e.key === "A" || e.key === "a")) {
        e.preventDefault();
        window.open("/admin", "_blank");
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          this.ego.speed = Math.min(160, this.ego.speed + 5);
          this.ego.isMoving = true;
          break;
        case "ArrowDown":
        case "KeyS":
          this.ego.speed = Math.max(0, this.ego.speed - 5);
          if (this.ego.speed === 0) this.ego.isMoving = false;
          break;
        case "ArrowLeft":
        case "KeyA":
          this.ego.laneOffset = Math.max(-3.5, (this.ego.laneOffset || 0.0) - 3.5);
          break;
        case "ArrowRight":
        case "KeyD":
          this.ego.laneOffset = Math.min(3.5, (this.ego.laneOffset || 0.0) + 3.5);
          break;
        case "Space":
          this.ego.speed = 0;
          this.ego.isMoving = false;
          break;
      }
    });
  }

  _setupUIListeners() {
    // Переключатель языка (Русский / Узбекский)
    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.addEventListener("change", (e) => {
        this.setLanguage(e.target.value);
      });
    }

    // Выбор модели автомобиля (Cobalt / Tracker / Tesla)
    const carModelSelect = document.getElementById("car-model-select");
    if (carModelSelect) {
      carModelSelect.addEventListener("change", (e) => {
        window.v2xMap.setCarModel(e.target.value);
      });
    }

    // Выбор региона / города по всему Узбекистану
    const citySelect = document.getElementById("city-select");
    if (citySelect) {
      const uzbekistanRegions = {
        tashkent: { lat: 41.31950, lon: 69.28165, heading: 9.3, dist: 280.0, zoom: 17 },
        samarkand: { lat: 39.65450, lon: 66.97580, heading: 45.0, dist: 0.0, zoom: 16 },
        bukhara: { lat: 39.77480, lon: 64.42850, heading: 0.0, dist: 0.0, zoom: 16 },
        andijan: { lat: 40.78210, lon: 72.34420, heading: 90.0, dist: 0.0, zoom: 16 },
        fergana: { lat: 40.38420, lon: 71.78430, heading: 0.0, dist: 0.0, zoom: 16 },
        namangan: { lat: 40.99830, lon: 71.67260, heading: 30.0, dist: 0.0, zoom: 16 },
        urgench: { lat: 41.55040, lon: 60.63140, heading: 120.0, dist: 0.0, zoom: 16 },
        nukus: { lat: 42.46020, lon: 59.61660, heading: 0.0, dist: 0.0, zoom: 16 },
        qarshi: { lat: 38.86060, lon: 65.78910, heading: 60.0, dist: 0.0, zoom: 16 },
        termez: { lat: 37.22420, lon: 67.27830, heading: 0.0, dist: 0.0, zoom: 16 },
        navoi: { lat: 40.10390, lon: 65.36880, heading: 90.0, dist: 0.0, zoom: 16 },
        jizzakh: { lat: 40.11580, lon: 67.84220, heading: 180.0, dist: 0.0, zoom: 16 },
        gulistan: { lat: 40.48970, lon: 68.78440, heading: 45.0, dist: 0.0, zoom: 16 },
        qamchiq: { lat: 41.14440, lon: 70.47780, heading: 75.0, dist: 0.0, zoom: 15 },
        m39: { lat: 40.78000, lon: 68.60000, heading: 60.0, dist: 0.0, zoom: 14 }
      };

      citySelect.addEventListener("change", (e) => {
        const targetRegion = uzbekistanRegions[e.target.value] || uzbekistanRegions.tashkent;
        this.ego.lat = targetRegion.lat;
        this.ego.lon = targetRegion.lon;
        this.ego.heading = targetRegion.heading;
        this.ego.pathDistance = targetRegion.dist;
        this.ego.laneOffset = 0.0;
        this._syncAnchorWithServer(this.ego.lat, this.ego.lon);
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, targetRegion.zoom);
      });
    }

    // HUD Mirror
    const btnMirror = document.getElementById("btn-hud-mirror");
    btnMirror.addEventListener("click", () => {
      this.hudMirror = !this.hudMirror;
      document.body.classList.toggle("hud-mirror", this.hudMirror);
      btnMirror.classList.toggle("active", this.hudMirror);
    });

    // Режим Невидимка
    const btnStealth = document.getElementById("btn-stealth");
    btnStealth.addEventListener("click", () => {
      this.ego.stealth = !this.ego.stealth;
      btnStealth.classList.toggle("stealth-active", this.ego.stealth);
      this.updateLanguageUI();
    });

    // Звук
    const btnSound = document.getElementById("btn-sound");
    btnSound.addEventListener("click", () => {
      window.v2xAudio.soundEnabled = !window.v2xAudio.soundEnabled;
      btnSound.classList.toggle("active", window.v2xAudio.soundEnabled);
      this.updateLanguageUI();
    });

    // Голос ИИ
    const btnVoice = document.getElementById("btn-voice");
    btnVoice.addEventListener("click", () => {
      window.v2xAudio.voiceEnabled = !window.v2xAudio.voiceEnabled;
      btnVoice.classList.toggle("active", window.v2xAudio.voiceEnabled);
      this.updateLanguageUI();
    });

    // Смена и рабочий график водителя (3 ключевые кнопки)
    const btnShiftStart = document.getElementById("btn-shift-start");
    if (btnShiftStart) {
      btnShiftStart.addEventListener("click", () => {
        this.startShift();
      });
    }

    const btnShiftPause = document.getElementById("btn-shift-pause");
    if (btnShiftPause) {
      btnShiftPause.addEventListener("click", () => {
        this.pauseShift();
      });
    }

    const btnShiftEnd = document.getElementById("btn-shift-end");
    if (btnShiftEnd) {
      btnShiftEnd.addEventListener("click", () => {
        this.endShift();
      });
    }

    // Экстренный тормоз / Выключение автомобиля и двигателя
    const btnBrake = document.getElementById("btn-emergency-brake");
    if (btnBrake) {
      btnBrake.addEventListener("click", () => {
        this.stopVehicle();
      });
    }

    // Переключатель демо-режима (выключен по умолчанию)
    const btnDemo = document.getElementById("btn-demo-mode");
    if (btnDemo) {
      btnDemo.addEventListener("click", () => {
        this.toggleDemoMode();
      });
    }

    // Рестарт (очистка и возврат в исходное безопасное состояние)
    const btnReset = document.getElementById("btn-reset");
    if (btnReset) {
      btnReset.addEventListener("click", async () => {
        this.stopVehicle();
        this.ego.pathDistance = 280.0;
        const pose = this._computePoseAlongPath(TASHKENT_ROADS.amir_temur_nb, this.ego.pathDistance, 0.0);
        this.ego.lat = pose.lat;
        this.ego.lon = pose.lon;
        this.ego.heading = pose.heading;
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);
        try {
          await fetch(`${this._getApiBase()}/api/simulator/stop`, { method: "POST" });
          await fetch(`${this._getApiBase()}/api/simulator/reset`, { method: "POST" });
        } catch (err) {
          console.warn("Could not reset simulator:", err);
        }
      });
    }

    // Сценарий (только если водитель захотел включить симуляцию)
    const scenarioSelect = document.getElementById("scenario-select");
    if (scenarioSelect) {
      scenarioSelect.addEventListener("change", async (e) => {
        this.demoMode = true;
        this._updateDemoUI();
        this.ego.pathDistance = 280.0;
        this.ego.speed = 48.0;
        this.ego.isMoving = true;
        this.ego.laneOffset = 0.0;
        const pose = this._computePoseAlongPath(TASHKENT_ROADS.amir_temur_nb, this.ego.pathDistance, this.ego.laneOffset);
        this.ego.lat = pose.lat;
        this.ego.lon = pose.lon;
        this.ego.heading = pose.heading;
        window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);
        try {
          await fetch(`${this._getApiBase()}/api/simulator/scenario`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: e.target.value })
          });
          await fetch(`${this._getApiBase()}/api/simulator/start`, { method: "POST" });
        } catch (err) {
          console.error("Failed to set scenario:", err);
        }
      });
    }

    // Кнопка включения/выключения реального GPS
    const btnGps = document.getElementById("btn-real-gps");
    if (btnGps) {
      btnGps.addEventListener("click", () => {
        this.toggleRealGps();
      });
    }
  }

  _setupSubscriptionGate() {
    const gateModal = document.getElementById("modal-subscription-gate");
    const gatePhoneInput = document.getElementById("gate-phone-input");
    const btnVerify = document.getElementById("btn-gate-verify");
    const errMsg = document.getElementById("gate-error-msg");
    const driverBox = document.getElementById("driver-logged-box");
    const labelDriver = document.getElementById("label-logged-driver");
    const btnLogout = document.getElementById("btn-logout-driver");

    const accessGranted = localStorage.getItem("v2x_access_granted");
    const savedPhone = localStorage.getItem("v2x_driver_phone");

    const onAccessGranted = (driverName, phone) => {
      if (gateModal) {
        gateModal.style.display = "none";
        gateModal.classList.remove("active");
      }
      if (driverBox) driverBox.style.display = "flex";
      if (labelDriver) {
        labelDriver.textContent = `✓ ${driverName || "Haydovchi"} (Obuna faol)`;
      }
      // Jonli GPS ni darhol yoqamiz va xaritani uning joylashuviga ochamiz
      this.toggleRealGps();
    };

    if (accessGranted === "true" && savedPhone) {
      onAccessGranted(localStorage.getItem("v2x_driver_name"), savedPhone);
    } else {
      if (gateModal) {
        gateModal.style.display = "flex";
        gateModal.classList.add("active");
      }
    }

    if (btnVerify) {
      btnVerify.addEventListener("click", async () => {
        const val = gatePhoneInput?.value?.trim();
        if (!val) {
          if (errMsg) {
            errMsg.textContent = this.lang === "uz" ? "Telefon raqamingiz yoki davlat raqamingizni kiriting!" : "Введите ваш номер телефона или гос. номер!";
            errMsg.style.display = "block";
          }
          return;
        }

        btnVerify.disabled = true;
        btnVerify.textContent = this.lang === "uz" ? "Tekshirilmoqda..." : "Проверка...";
        if (errMsg) errMsg.style.display = "none";

        try {
          const resp = await fetch(`${this._getApiBase()}/api/orders/check/${encodeURIComponent(val)}`);
          const data = await resp.json();
          if (data.approved) {
            localStorage.setItem("v2x_access_granted", "true");
            localStorage.setItem("v2x_driver_phone", val);
            localStorage.setItem("v2x_driver_name", data.driver_name || "Haydovchi");

            if (window.v2xAudio) {
              window.v2xAudio.speakText(this.lang === "uz" ? `Xush kelibsiz, ${data.driver_name || ""}. Obunangiz tasdiqlandi.` : `Добро пожаловать, ${data.driver_name || ""}. Подписка подтверждена.`);
            }
            onAccessGranted(data.driver_name, val);
          } else if (data.has_order && !data.approved) {
            if (errMsg) {
              errMsg.textContent = this.lang === "uz"
                ? "Sizning to'lovingiz qabul qilingan, administrator tasdiqlashi kutilmoqda (15 daqiqa ichida faollashadi)."
                : "Ваш платеж получен, ожидает подтверждения администратором.";
              errMsg.style.display = "block";
            }
          } else {
            if (errMsg) {
              errMsg.innerHTML = this.lang === "uz"
                ? `Bu raqam bo'yicha to'lov topilmadi.<br><a href="landing.html" style="color: #38bdf8; text-decoration: underline; font-weight: bold;">To'lov sahifasiga o'tish (200 000 so'm) ➔</a>`
                : `Оплаченная подписка по этому номеру не найдена.<br><a href="landing.html" style="color: #38bdf8; text-decoration: underline; font-weight: bold;">Перейти к оплате (200 000 сум) ➔</a>`;
              errMsg.style.display = "block";
            }
          }
        } catch (err) {
          if (errMsg) {
            errMsg.textContent = "Server bilan aloqa xatosi: " + err.message;
            errMsg.style.display = "block";
          }
        } finally {
          btnVerify.disabled = false;
          btnVerify.textContent = this.lang === "uz" ? "Kirish va GPS Navigatsiyani Boshlash ➔" : "Войти и начать GPS-навигацию ➔";
        }
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        localStorage.removeItem("v2x_access_granted");
        localStorage.removeItem("v2x_driver_phone");
        localStorage.removeItem("v2x_driver_name");
        window.location.reload();
      });
    }
  }

  _setupTariffsAndCabinet() {
    const modalTariffs = document.getElementById("modal-tariffs");
    const modalCabinet = document.getElementById("modal-cabinet");
    const btnTariffs = document.getElementById("btn-tariffs");
    const btnCabinet = document.getElementById("btn-cabinet");

    const openModal = (modal) => {
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
    };
    const closeModal = (modal) => {
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    };

    if (btnTariffs) btnTariffs.addEventListener("click", () => openModal(modalTariffs));
    if (btnCabinet) {
      btnCabinet.addEventListener("click", () => {
        openModal(modalCabinet);
        this._loadReviews();
        this._loadDriverProfile();
      });
    }

    document.querySelectorAll(".v2x-modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-close");
        closeModal(document.getElementById(targetId));
      });
    });

    [modalTariffs, modalCabinet].forEach((modal) => {
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) closeModal(modal);
        });
      }
    });

    // Tariffs Selection & Checkout
    const orderSection = document.getElementById("order-checkout-section");
    const checkoutTitle = document.getElementById("checkout-title");
    const btnRent = document.getElementById("btn-select-rent");
    const btnBuy = document.getElementById("btn-select-buy");
    const btnCancelOrder = document.getElementById("btn-cancel-order");
    const btnSubmitOrder = document.getElementById("btn-submit-order");
    const orderStatusMsg = document.getElementById("order-status-msg");

    let currentOrderPlan = "rent";

    if (btnRent) {
      btnRent.addEventListener("click", () => {
        currentOrderPlan = "rent";
        if (orderSection) {
          orderSection.style.display = "block";
          orderSection.scrollIntoView({ behavior: "smooth" });
        }
        if (checkoutTitle) {
          checkoutTitle.textContent = this.lang === "uz" 
            ? "Ijara buyurtmasi: 200 000 so'm / oy (3 kun bepul!)"
            : "Заявка на аренду: 200 000 сум / месяц (3 дня бесплатно!)";
        }
      });
    }

    if (btnCancelOrder) {
      btnCancelOrder.addEventListener("click", () => {
        if (orderSection) orderSection.style.display = "none";
      });
    }

    if (btnSubmitOrder) {
      btnSubmitOrder.addEventListener("click", async () => {
        const name = document.getElementById("order-name")?.value || "Azizbek Karimov";
        const phone = document.getElementById("order-phone")?.value || "+998 90 123-45-67";
        const plate = document.getElementById("order-plate")?.value || "01 A 777 AA";
        const pay = document.getElementById("order-payment")?.value || "payme";
        const amount = "200 000 so'm / oy";

        const payload = {
          order_type: "rent",
          driver_name: name,
          phone: phone,
          vehicle_plate: plate,
          vehicle_model: "Chevrolet Cobalt 2024",
          payment_method: pay,
          amount: amount
        };

        try {
          await fetch(`${this._getApiBase()}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch (e) {
          console.warn("Order saved locally:", e);
        }

        const savedOrders = JSON.parse(localStorage.getItem("v2x_orders") || "[]");
        savedOrders.push(payload);
        localStorage.setItem("v2x_orders", JSON.stringify(savedOrders));

        if (orderStatusMsg) {
          orderStatusMsg.textContent = this.lang === "uz"
            ? `✓ Rahmat! ${name}, buyurtmangiz qabul qilindi. Operator tez orada bog'lanadi.`
            : `✓ Спасибо! ${name}, ваш заказ принят. Менеджер свяжется с вами в течение 5 минут.`;
        }

        if (window.v2xAudio) {
          window.v2xAudio.speakText(this.lang === "uz" ? "Buyurtmangiz muvaffaqiyatli qabul qilindi." : "Ваш заказ успешно принят.");
        }

        setTimeout(() => {
          if (orderSection) orderSection.style.display = "none";
          if (orderStatusMsg) orderStatusMsg.textContent = "";
        }, 3500);
      });
    }

    // Cabinet Tabs
    document.querySelectorAll(".cab-tab-btn").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        document.querySelectorAll(".cab-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".cab-tab-pane").forEach(p => p.classList.remove("active"));
        tabBtn.classList.add("active");
        const targetPane = document.getElementById(tabBtn.getAttribute("data-tab"));
        if (targetPane) targetPane.classList.add("active");
      });
    });

    // Video File Selection & Instant Player Preview
    const videoInput = document.getElementById("review-video-file");
    const videoPreview = document.getElementById("review-preview-video");
    const videoName = document.getElementById("selected-video-name");
    let attachedVideoUrl = null;

    if (videoInput) {
      videoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          attachedVideoUrl = URL.createObjectURL(file);
          if (videoPreview) {
            videoPreview.src = attachedVideoUrl;
            videoPreview.style.display = "block";
            videoPreview.play().catch(() => {});
          }
          if (videoName) {
            videoName.textContent = `✓ ${file.name} (${Math.round(file.size / 1024)} KB)`;
          }
        }
      });
    }

    // Submit Review with Video
    const btnSubmitReview = document.getElementById("btn-submit-review");
    const reviewStatus = document.getElementById("review-submit-status");

    if (btnSubmitReview) {
      btnSubmitReview.addEventListener("click", async () => {
        const rating = parseInt(document.getElementById("review-rating")?.value || "5", 10);
        const text = document.getElementById("review-text-input")?.value?.trim();
        const driverName = document.getElementById("cab-driver-name")?.textContent || "Azizbek Karimov";
        const plate = document.getElementById("prof-plate-input")?.value || "01 A 777 AA";
        const car = document.getElementById("prof-car-input")?.value || "Chevrolet Cobalt 2024";

        if (!text) {
          alert(this.lang === "uz" ? "Iltimos, fikringizni yozing!" : "Пожалуйста, напишите текст отзыва!");
          return;
        }

        const newReview = {
          id: `rev-${Date.now()}`,
          driver_name: driverName,
          vehicle_model: car,
          vehicle_plate: plate,
          city: "Toshkent",
          rating: rating,
          text: text,
          video_url: attachedVideoUrl || "https://assets.mixkit.co/videos/preview/mixkit-car-driving-through-a-tunnel-at-night-42845-large.mp4",
          created_at: new Date().toLocaleDateString(),
          verified_v2x: true
        };

        try {
          await fetch(`${this._getApiBase()}/api/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newReview)
          });
        } catch (e) {
          console.warn("Review saved to local storage:", e);
        }

        const localReviews = JSON.parse(localStorage.getItem("v2x_reviews") || "[]");
        localReviews.unshift(newReview);
        localStorage.setItem("v2x_reviews", JSON.stringify(localReviews));

        this._renderReviews(localReviews);

        const textEl = document.getElementById("review-text-input");
        if (textEl) textEl.value = "";
        if (videoPreview) {
          videoPreview.src = "";
          videoPreview.style.display = "none";
        }
        if (videoName) videoName.textContent = "";
        attachedVideoUrl = null;

        if (reviewStatus) {
          reviewStatus.textContent = this.lang === "uz" ? "✓ Fikringiz va videongiz e'lon qilindi!" : "✓ Отзыв и видео успешно опубликованы!";
          setTimeout(() => { reviewStatus.textContent = ""; }, 3500);
        }
      });
    }

    // Save Driver Profile
    const btnSaveProfile = document.getElementById("btn-save-profile");
    const profSaveStatus = document.getElementById("profile-save-status");
    if (btnSaveProfile) {
      btnSaveProfile.addEventListener("click", async () => {
        const name = document.getElementById("prof-name-input")?.value || "Azizbek Karimov";
        const plate = document.getElementById("prof-plate-input")?.value || "01 A 777 AA";
        const car = document.getElementById("prof-car-input")?.value || "Chevrolet Cobalt 2024";
        const city = document.getElementById("prof-city-input")?.value || "Toshkent";

        const profileData = {
          name: name,
          vehicle_plate: plate,
          vehicle_model: car,
          city: city,
          v2x_id: "UZB-842",
          tariff: "rent",
          mileage_km: 14820,
          prevented_accidents: 18,
          safety_score: 98.7
        };

        try {
          await fetch(`${this._getApiBase()}/api/driver/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profileData)
          });
        } catch (e) {
          console.warn("Profile saved locally:", e);
        }
        localStorage.setItem("v2x_profile", JSON.stringify(profileData));

        const nameEl = document.getElementById("cab-driver-name");
        if (nameEl) nameEl.textContent = name;
        const metaEl = document.getElementById("cab-car-meta");
        if (metaEl) metaEl.innerHTML = `🚗 ${car} • <strong>${plate}</strong> • ID: <span>UZB-842</span>`;

        if (profSaveStatus) {
          profSaveStatus.textContent = this.lang === "uz" ? "✓ Saqlandi!" : "✓ Сохранено!";
          setTimeout(() => { profSaveStatus.textContent = ""; }, 3000);
        }
      });
    }
  }

  async _loadReviews() {
    const defaultReviews = [
      {
        id: "rev-1",
        driver_name: "Sherzod Rahimov",
        vehicle_model: "Chevrolet Malibu 2 Turbo",
        vehicle_plate: "01 777 SAA",
        city: "Toshkent",
        rating: 5,
        text: "Amir Temur shoh ko'chasidagi chorrahada V2X 3 soniya oldin qizil trevoga berdi va zudlik bilan tormoz berishni aytdi. Qizil chiroqda uchib kelayotgan yuk mashinasi bilan to'qnashuvdan qutqarib qoldi! 1 000 000 so'm ijara narxi hayotimni va mashinamni asrab qoldi.",
        video_url: "https://assets.mixkit.co/videos/preview/mixkit-car-driving-through-a-tunnel-at-night-42845-large.mp4",
        created_at: "31.10.2026",
        verified_v2x: true
      },
      {
        id: "rev-2",
        driver_name: "Jasurbek Toshtemirov",
        vehicle_model: "Chevrolet Cobalt",
        vehicle_plate: "30 A 123 BA",
        city: "Samarqand",
        rating: 5,
        text: "3 kunlik bepul sinovdan so'ng 200 000 so'mga ijara tarifiga ulandim. Doim Samarqand-Toshkent trassasida qatnayman. Qalin tuman va yomg'irda ko'rinmas zonadagi xavfli quvib o'tishni 150 metrdan aniqladi. O'zbekcha AI ovozli yordamchisi juda aniq ishlaydi.",
        video_url: "https://assets.mixkit.co/videos/preview/mixkit-driving-on-a-highway-at-sunset-41617-large.mp4",
        created_at: "30.10.2026",
        verified_v2x: true
      },
      {
        id: "rev-3",
        driver_name: "Dilshod Karimov",
        vehicle_model: "Chevrolet Tracker 2 Redline",
        vehicle_plate: "01 B 456 BB",
        city: "Toshkent",
        rating: 5,
        text: "5 ta avtomobilimizga 1 000 000 so'mdan ijaraga oldik. Haydovchilar shaxsiy kabinetida har bir mashinaning xavfsizlik reytingi va qochilgan avariyalar soni ko'rinadi. Avariyalar soni 0 ga tushdi!",
        video_url: "https://assets.mixkit.co/videos/preview/mixkit-traffic-in-a-city-street-at-night-42844-large.mp4",
        created_at: "29.10.2026",
        verified_v2x: true
      }
    ];

    let reviews = [];
    try {
      const resp = await fetch(`${this._getApiBase()}/api/reviews`);
      if (resp.ok) {
        reviews = await resp.json();
      }
    } catch (e) {
      console.warn("Loading reviews from localStorage");
    }

    if (!reviews || reviews.length === 0) {
      const stored = localStorage.getItem("v2x_reviews");
      reviews = stored ? JSON.parse(stored) : defaultReviews;
      localStorage.setItem("v2x_reviews", JSON.stringify(reviews));
    }

    this._renderReviews(reviews);
  }

  _renderReviews(reviews) {
    const container = document.getElementById("reviews-feed-container");
    if (!container) return;

    container.innerHTML = "";
    reviews.forEach((r) => {
      const card = document.createElement("div");
      card.className = "review-item-card";

      const stars = "★".repeat(r.rating || 5) + "☆".repeat(5 - (r.rating || 5));
      const videoHtml = r.video_url
        ? `<video class="review-video-embed" controls preload="metadata" playsinline src="${r.video_url}"></video>`
        : "";

      card.innerHTML = `
        <div class="review-card-top">
          <div>
            <span class="review-author">${r.driver_name}</span>
            <span class="review-car-badge">🚗 ${r.vehicle_model} (${r.vehicle_plate || ""})</span>
          </div>
          <div class="review-stars">${stars}</div>
        </div>
        <div class="review-text-content">${r.text}</div>
        ${videoHtml}
        <div class="review-meta-date">
          <span>📍 ${r.city || "O'zbekiston"} • ${r.verified_v2x ? "✓ V2X Tasdiqlangan haydovchi" : ""}</span>
          <span>📅 ${r.created_at || ""}</span>
        </div>
      `;
      container.appendChild(card);
    });

    const tabReviewsBtn = document.getElementById("tab-btn-reviews");
    if (tabReviewsBtn) {
      tabReviewsBtn.textContent = this.lang === "uz" 
        ? `⭐ Fikrlar va Videolar (${reviews.length})` 
        : `⭐ Отзывы и Видеорегистратор (${reviews.length})`;
    }
  }

  async _loadRadars() {
    const defaultRadars = [
      {
        id: "RAD-01",
        name: "Радар КОРДОН-М • Перекресток Амир Темур / А. Кадыри",
        lat: 41.32120,
        lon: 69.28200,
        speed_limit: 60,
        type: "speed_camera",
        type_name: "Контроль скорости и стоп-линии",
        is_active: true,
        city: "Ташкент",
        direction: "Оба направления"
      },
      {
        id: "RAD-02",
        name: "Автоураган ВСМ • Проспект Амира Темура (Север)",
        lat: 41.32410,
        lon: 69.28260,
        speed_limit: 70,
        type: "speed_camera",
        type_name: "Контроль скорости",
        is_active: true,
        city: "Ташкент",
        direction: "Северное направление"
      },
      {
        id: "RAD-03",
        name: "Радар Стрелка-М • Улица Абдуллы Кадыри (Восток)",
        lat: 41.32160,
        lon: 69.28420,
        speed_limit: 60,
        type: "crossroad_radar",
        type_name: "Контроль перекрестка",
        is_active: true,
        city: "Ташкент",
        direction: "В сторону Алайского рынка"
      },
      {
        id: "RAD-04",
        name: "Кордон-М • Проспект Амира Темура (Юг)",
        lat: 41.31790,
        lon: 69.28125,
        speed_limit: 60,
        type: "speed_camera",
        type_name: "Контроль скорости",
        is_active: true,
        city: "Ташкент",
        direction: "Южное направление"
      },
      {
        id: "RAD-05",
        name: "Радарный комплекс • Сквер Амира Темура",
        lat: 41.31110,
        lon: 69.27960,
        speed_limit: 60,
        type: "speed_camera",
        type_name: "Круговой контроль скорости",
        is_active: true,
        city: "Ташкент",
        direction: "Круговое движение"
      }
    ];

    try {
      const resp = await fetch(`${this._getApiBase()}/api/radars`);
      if (resp.ok) {
        this.radars = await resp.json();
      }
    } catch (e) {
      console.warn("Could not load radars from server, using local fallback");
    }

    if (!this.radars || this.radars.length === 0) {
      this.radars = defaultRadars;
    }

    if (window.v2xMap) {
      window.v2xMap.updateRadars(this.radars);
    }
  }

  async _loadAds() {
    const defaultAds = [
      {
        id: "ad-1",
        title: "⛽ UNG Petro: Скидка 10% на АИ-95 для участников V2X",
        text: "Предъявите QR-код водителя OQ YO'L в приложении на любой АЗС сети UNG Petro и получите мгновенную скидку 10%.",
        badge: "ТОП АКЦИЯ",
        image_emoji: "⛽",
        link_url: "https://ung.uz",
        button_text: "Заправиться со скидкой",
        is_active: true
      },
      {
        id: "ad-2",
        title: "🛡️ Gross Insurance: КАСКО и ОСАГО со скидкой 20%",
        text: "Для водителей с высоким рейтингом безопасности (>95%) специальный льготный тариф автострахования.",
        badge: "СТРАХОВАНИЕ",
        image_emoji: "🛡️",
        link_url: "https://gross.uz",
        button_text: "Рассчитать полис",
        is_active: true
      }
    ];

    try {
      const resp = await fetch(`${this._getApiBase()}/api/ads/active`);
      if (resp.ok) {
        this.ads = await resp.json();
      }
    } catch (e) {
      console.warn("Could not load ads from server");
    }

    if (!this.ads || this.ads.length === 0) {
      this.ads = defaultAds;
    }

    this._setupAdBanner();
  }

  _setupAdBanner() {
    const banner = document.getElementById("hud-ad-banner");
    if (!banner || !this.ads || this.ads.length === 0) return;

    let currentAdIndex = 0;
    let secondsRemaining = 25;
    let totalDuration = 25;

    const showAd = (index) => {
      if (!this.ads || this.ads.length === 0) return;
      const ad = this.ads[index % this.ads.length];
      if (!ad) return;

      // Длительность показа: строго от 10 секунд до 2 минут (120 секунд)
      totalDuration = Math.max(10, Math.min(120, Number(ad.duration_sec) || 25));
      secondsRemaining = totalDuration;

      const emojiEl = document.getElementById("ad-banner-emoji");
      const badgeEl = document.getElementById("ad-banner-badge");
      const titleEl = document.getElementById("ad-banner-title");
      const linkEl = document.getElementById("ad-banner-link");
      const timerPill = document.getElementById("ad-timer-pill");
      const progressFill = document.getElementById("ad-progress-fill");

      if (emojiEl) emojiEl.textContent = ad.image_emoji || "📢";
      if (badgeEl) badgeEl.textContent = ad.badge || (this.lang === "uz" ? "HAMKOR AKSIYASI" : "АКЦИЯ ПАРТНЕРА");
      if (titleEl) titleEl.textContent = ad.title;
      if (timerPill) timerPill.textContent = `⏱️ ${secondsRemaining}s`;
      if (progressFill) progressFill.style.width = "100%";

      if (linkEl) {
        linkEl.textContent = (ad.button_text || (this.lang === "uz" ? "Batafsil" : "Подробнее")) + " ➔";
        linkEl.href = ad.link_url || "#";
        linkEl.onclick = () => {
          fetch(`${this._getApiBase()}/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
        };
      }

      banner.style.display = "flex";
      this._updateAdSafetyInterlock(this.lastSafetyLevel || "SAFE");
    };

    showAd(0);

    // Секундный обратный отсчет показа рекламы (от 10 секунд до 2 минут)
    if (this._adTimerInterval) clearInterval(this._adTimerInterval);
    this._adTimerInterval = setInterval(() => {
      if (banner.style.display === "none") return;

      // При экстренных опасных ситуациях (RED) отсчет замораживается
      if (this.lastSafetyLevel === "RED") return;

      secondsRemaining--;
      const timerPill = document.getElementById("ad-timer-pill");
      const progressFill = document.getElementById("ad-progress-fill");

      if (timerPill) timerPill.textContent = `⏱️ ${Math.max(0, secondsRemaining)}s`;
      if (progressFill && totalDuration > 0) {
        const pct = Math.max(0, Math.min(100, (secondsRemaining / totalDuration) * 100));
        progressFill.style.width = `${pct.toFixed(1)}%`;
      }

      if (secondsRemaining <= 0) {
        currentAdIndex++;
        showAd(currentAdIndex);
      }
    }, 1000);

    const btnClose = document.getElementById("btn-close-ad");
    if (btnClose) {
      btnClose.onclick = () => {
        banner.style.display = "none";
      };
    }
  }

  _updateAdSafetyInterlock(safetyLevel) {
    const banner = document.getElementById("hud-ad-banner");
    if (!banner || banner.style.display === "none") return;

    // ПРАВИЛО БЕЗОПАСНОСТИ: Реклама не должна перебивать водителя на дороге!
    // Если скорость > 30 км/ч ИЛИ активен радар ИЛИ уровень угрозы RED/YELLOW
    const isDrivingFast = (this.ego && this.ego.speed > 30.0);
    const hasRadarAlert = !!this.activeRadarId;
    const hasDangerWarning = (safetyLevel === "RED" || safetyLevel === "YELLOW");

    if (isDrivingFast || hasRadarAlert || hasDangerWarning) {
      if (!banner.classList.contains("ad-safe-minimized")) {
        banner.classList.add("ad-safe-minimized");
      }
    } else {
      if (banner.classList.contains("ad-safe-minimized")) {
        banner.classList.remove("ad-safe-minimized");
      }
    }
  }

  _checkUpcomingRadars() {
    const alertBox = document.getElementById("hud-radar-alert");

    // ЖЕЛЕЗНОЕ ПРАВИЛО: если автомобиль заглушен или стоит на месте (скорость <= 5 км/ч),
    // радар полностью скрывается, луч убирается, и никаких оповещений о превышении!
    if (!this.ego.isMoving || this.ego.speed <= 5.0) {
      if (this.activeRadarId) {
        window.v2xMap.clearRadarHighlights();
        this.activeRadarId = null;
      }
      if (alertBox) {
        alertBox.classList.remove("active", "speeding-hazard");
        alertBox.style.display = "none";
      }
      return;
    }

    if (!this.radars || this.radars.length === 0) return;

    const METERS_PER_DEG_LAT = 111139.0;
    const latRad = this.ego.lat * (Math.PI / 180.0);
    const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(latRad);

    let closestRadar = null;
    let closestDist = Infinity;
    let isApproachingClosest = false;

    for (const r of this.radars) {
      if (!r.is_active) continue;

      const dn = (r.lat - this.ego.lat) * METERS_PER_DEG_LAT;
      const de = (r.lon - this.ego.lon) * metersPerDegLon;
      const dist = Math.hypot(dn, de);

      // Проверка азимута движения к радару
      const bearingToRadar = (Math.atan2(de, dn) * (180.0 / Math.PI) + 360.0) % 360.0;
      let angleDiff = Math.abs(this.ego.heading - bearingToRadar);
      if (angleDiff > 180.0) angleDiff = 360.0 - angleDiff;

      const isApproaching = (angleDiff < 90.0 || dist < 60.0);

      if (dist < closestDist && (isApproaching || dist < 120.0)) {
        closestDist = dist;
        closestRadar = r;
        isApproachingClosest = isApproaching;
      }
    }

    const hudLimit = document.getElementById("radar-hud-limit");
    const hudTitle = document.getElementById("radar-hud-title");
    const hudDist = document.getElementById("radar-hud-dist");
    const hudName = document.getElementById("radar-hud-name");
    const hudAdvice = document.getElementById("radar-hud-advice");

    // Если радар в зоне 420 метров и водитель приближается к нему
    if (closestRadar && closestDist <= 420.0 && isApproachingClosest) {
      const isSpeeding = (this.ego.speed > closestRadar.speed_limit);
      const distM = Math.round(closestDist);

      if (alertBox) {
        alertBox.style.display = "flex";
        alertBox.classList.add("active");
        if (isSpeeding) {
          alertBox.classList.add("speeding-hazard");
        } else {
          alertBox.classList.remove("speeding-hazard");
        }
      }

      if (hudLimit) hudLimit.textContent = closestRadar.speed_limit;
      if (hudDist) hudDist.textContent = `${distM} ${this.lang === "uz" ? "m" : "м"}`;
      if (hudName) hudName.textContent = closestRadar.name;

      if (this.lang === "uz") {
        if (hudTitle) hudTitle.textContent = isSpeeding ? "🚨 EHTIYOT BO'LING, RADAR! (TEZLIK OSHDI!)" : "📷 DIQQAT: OLDINDA RADAR";
        if (hudAdvice) {
          hudAdvice.textContent = isSpeeding 
            ? `⚡ Tezlik oshirildi! Sizning tezligingiz ${Math.round(this.ego.speed)} km/s! Zudlik bilan tezlikni kamaytiring!`
            : `Cheklov ${closestRadar.speed_limit} km/s. Harakat tezligi me'yorda saqlanmoqda.`;
        }
      } else {
        if (hudTitle) hudTitle.textContent = isSpeeding ? "🚨 ОСТОРОЖНО, РАДАР! (ПРЕВЫШЕНИЕ СКОРОСТИ!)" : "📷 ВНИМАНИЕ: ВПЕРЕДИ РАДАР";
        if (hudAdvice) {
          hudAdvice.textContent = isSpeeding
            ? `⚡ Превышение скорости! Ваша скорость ${Math.round(this.ego.speed)} км/ч! Срочно сбавьте скорость!`
            : `Ограничение ${closestRadar.speed_limit} км/ч. Скорость в пределах нормы, соблюдайте дистанцию.`;
        }
      }

      // Голосовое умное предупреждение
      window.v2xAudio.playRadarAlert(isSpeeding, closestRadar, this.ego.speed, distM);
      window.v2xMap.highlightRadar(closestRadar.id, isSpeeding, [this.ego.lat, this.ego.lon], [closestRadar.lat, closestRadar.lon]);
      this.activeRadarId = closestRadar.id;

    } else {
      // Если ранее были в зоне радара, а теперь проехали
      if (this.activeRadarId) {
        window.v2xAudio.playRadarPassed();
        window.v2xMap.clearRadarHighlights();
        this.activeRadarId = null;
      }
      if (alertBox) {
        alertBox.classList.remove("active", "speeding-hazard");
        alertBox.style.display = "none";
      }
    }
  }

  async _loadDriverProfile() {
    let profile = null;
    const regDriver = this._getSavedDriver();
    if (regDriver) {
      profile = regDriver;
    }
    if (!profile) {
      try {
        const resp = await fetch(`${this._getApiBase()}/api/driver/profile`);
        if (resp.ok) profile = await resp.json();
      } catch (e) {}
    }

    if (!profile) {
      const stored = localStorage.getItem("v2x_profile");
      if (stored) profile = JSON.parse(stored);
    }

    if (profile) {
      const nameEl = document.getElementById("cab-driver-name");
      if (nameEl) nameEl.textContent = profile.name;
      const metaEl = document.getElementById("cab-car-meta");
      if (metaEl) metaEl.innerHTML = `🚗 ${profile.vehicle_model} • <strong>${profile.vehicle_plate}</strong> • ID: <span>${profile.v2x_id || "UZB-842"}</span>`;
      const nameInput = document.getElementById("prof-name-input");
      if (nameInput) nameInput.value = profile.name;
      const plateInput = document.getElementById("prof-plate-input");
      if (plateInput) plateInput.value = profile.vehicle_plate;
      const carInput = document.getElementById("prof-car-input");
      if (carInput) carInput.value = profile.vehicle_model;
      const tariffEl = document.getElementById("cab-tariff-badge");
      if (tariffEl) {
        tariffEl.textContent = this.lang === "uz" 
          ? "🎁 3 kun bepul sinov faol • Ijara (200 000 so'm/oy)" 
          : "🎁 3 дня бесплатно активно • Аренда (200 000 сум/мес)";
      }
    }
  }

  _getSavedDriver() {
    try {
      const data = localStorage.getItem("v2x_registered_driver");
      if (data) return JSON.parse(data);
    } catch (e) {}
    return null;
  }

  _updateDriverHeader(name) {
    const lbl = document.getElementById("label-onboarding");
    if (lbl && name) {
      lbl.textContent = `👤 ${name}`;
    }
  }

  _renderOnboardingReviews() {
    const container = document.getElementById("onboarding-reviews-feed");
    if (!container) return;

    const list = (this.reviews && this.reviews.length > 0) ? this.reviews : [
      {
        driver_name: "Sherzod Rahimov",
        vehicle_model: "Chevrolet Malibu 2 Turbo",
        rating: 5,
        text: "Amir Temur shoh ko'chasidagi chorrahada V2X 3 soniya oldin qizil trevoga berdi va zudlik bilan tormoz berishni aytdi. Qizil chiroqda uchib kelayotgan yuk mashinasi bilan to'qnashuvdan qutqarib qoldi! 1 000 000 so'm ijara narxi hayotimni va mashinamni asrab qoldi."
      },
      {
        driver_name: "Jasurbek Toshtemirov",
        vehicle_model: "Chevrolet Cobalt (Toshkent-Samarqand)",
        rating: 5,
        text: "3 kun bepul sinab ko'rib, oyiga 200 000 so'm ijaraga ulandim. Qalin tuman va yomg'irda oldinda to'xtab turgan fura bilan to'qnashuvdan qutqarib qoldi. AI ovozi o'zbek tilida juda chiroyli va tushunarli gapiradi, qulog'ingizga yoqadi!"
      },
      {
        driver_name: "«Yunusobod Express» taksoparki",
        vehicle_model: "45 ta Chevrolet Gentra",
        rating: 5,
        text: "Parkimizdagi barcha mashinalarga 1 000 000 so'mlik oylik ijara paketini o'rnatdik. 6 oy ichida birorta ham avariya bo'lmadi! Sug'urta xarajatlarimiz 80% ga kamaydi, haydovchilarimiz juda xursand va mamnun."
      }
    ];

    container.innerHTML = list.map(item => `
      <div class="testim-card">
        <div class="testim-header">
          <div>
            <span class="testim-author">👨‍✈️ ${item.driver_name}</span>
            <span class="testim-car">🚗 ${item.vehicle_model || "Avto"}</span>
          </div>
          <span class="testim-stars">${"★".repeat(item.rating || 5)}</span>
        </div>
        <div class="testim-quote">"${item.text}"</div>
      </div>
    `).join("");
  }

  _setupOnboardingModal() {
    const modalOnboarding = document.getElementById("modal-onboarding");
    const btnOnboarding = document.getElementById("btn-onboarding");
    if (!modalOnboarding) return;

    const openModal = () => {
      modalOnboarding.style.display = "flex";
      modalOnboarding.classList.add("active");
      this._renderOnboardingReviews();
    };

    const closeModal = () => {
      modalOnboarding.style.display = "none";
      modalOnboarding.classList.remove("active");
    };

    if (btnOnboarding) {
      btnOnboarding.addEventListener("click", () => {
        openModal();
      });
    }

    modalOnboarding.addEventListener("click", (e) => {
      if (e.target === modalOnboarding) closeModal();
    });

    // Step switching logic
    let currentStep = 1;
    let selectedTariff = "rent"; // "rent" or "buy"

    const showStep = (step) => {
      currentStep = step;
      [1, 2, 3].forEach((s) => {
        const pane = document.getElementById(`onboarding-pane-${s}`);
        const nav = document.getElementById(`step-nav-${s}`);
        if (pane) pane.style.display = (s === step) ? "block" : "none";
        if (nav) {
          nav.classList.toggle("active", s === step);
          nav.classList.toggle("completed", s < step);
        }
      });
      if (step === 1) {
        this._renderOnboardingReviews();
      }
    };

    // Nav click
    [1, 2, 3].forEach((s) => {
      const nav = document.getElementById(`step-nav-${s}`);
      if (nav) {
        nav.addEventListener("click", () => showStep(s));
      }
    });

    // Step 1: About Us -> Button "Ro'yxatdan o'tish ➔"
    const btnAboutToReg = document.getElementById("btn-about-to-reg");
    if (btnAboutToReg) {
      btnAboutToReg.addEventListener("click", () => {
        showStep(2);
      });
    }

    // Step 2: Registration
    const btnRegBack = document.getElementById("btn-reg-back");
    const btnRegToPay = document.getElementById("btn-reg-to-pay");
    const regName = document.getElementById("reg-fullname");
    const regPhone = document.getElementById("reg-phone");
    const regEmail = document.getElementById("reg-email");
    const regCar = document.getElementById("reg-car");
    const regPlate = document.getElementById("reg-plate");
    const regPassword = document.getElementById("reg-password");
    const regError = document.getElementById("reg-error-msg");

    if (btnRegBack) {
      btnRegBack.addEventListener("click", () => showStep(1));
    }

    // Pre-fill if already in localStorage
    const savedDriver = this._getSavedDriver();
    if (savedDriver) {
      if (regName && savedDriver.name) regName.value = savedDriver.name;
      if (regPhone && savedDriver.phone) regPhone.value = savedDriver.phone;
      if (regEmail && savedDriver.email) regEmail.value = savedDriver.email;
      if (regCar && savedDriver.vehicle_model) regCar.value = savedDriver.vehicle_model;
      if (regPlate && savedDriver.vehicle_plate) regPlate.value = savedDriver.vehicle_plate;
      if (regPassword && savedDriver.password) regPassword.value = savedDriver.password;
      this._updateDriverHeader(savedDriver.name);
    }

    if (btnRegToPay) {
      btnRegToPay.addEventListener("click", async () => {
        const nameVal = (regName && regName.value.trim()) || "";
        const phoneVal = (regPhone && regPhone.value.trim()) || "";
        const emailVal = (regEmail && regEmail.value.trim()) || "";
        const passVal = (regPassword && regPassword.value.trim()) || "123456";
        const carVal = (regCar && regCar.value.trim()) || "Chevrolet Cobalt 2024";
        const plateVal = (regPlate && regPlate.value.trim()) || "01 A 777 AA";

        if (!nameVal || !phoneVal || !emailVal) {
          if (regError) {
            regError.textContent = (this.lang === "uz") 
              ? "Iltimos, Ism, Telefon va Pochta maydonlarini to'ldiring!" 
              : "Пожалуйста, заполните Имя, Телефон и Email!";
          }
          return;
        }

        if (regError) regError.textContent = "";

        const driverProfile = {
          name: nameVal,
          phone: phoneVal,
          email: emailVal,
          password: passVal,
          vehicle_model: carVal,
          vehicle_plate: plateVal,
          tariff: "rent",
          tariff_name_uz: "Ijara (200 000 so'm/oy, 3 kun bepul)",
          tariff_name_ru: "Аренда (200 000 сум/мес, 3 дня бесплатно)",
          mileage_km: 14820,
          prevented_accidents: 18,
          safety_score: 99.2
        };

        // Save to localStorage
        localStorage.setItem("v2x_registered_driver", JSON.stringify(driverProfile));
        localStorage.setItem("v2x_profile", JSON.stringify(driverProfile));
        this._updateDriverHeader(nameVal);

        // Save to backend
        try {
          await fetch(`${this._getApiBase()}/api/driver/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(driverProfile)
          });
        } catch (e) {
          console.warn("Backend profile sync error:", e);
        }

        // Prefill payment form with driver details
        const savedDriverInfo = this._getSavedDriver() || {};
        const payNameInput = document.getElementById("input-pay-driver-name");
        const payPlateInput = document.getElementById("input-pay-plate");
        const payPhoneInput = document.getElementById("input-pay-phone");
        if (payNameInput) payNameInput.value = savedDriverInfo.name || document.getElementById("reg-name")?.value || "";
        if (payPlateInput) payPlateInput.value = savedDriverInfo.vehicle_plate || document.getElementById("reg-plate")?.value || "";
        if (payPhoneInput) payPhoneInput.value = savedDriverInfo.phone || document.getElementById("reg-phone")?.value || "";

        // Move to Step 3: Payment
        showStep(3);
      });
    }

    // Step 3: Payment & Tariff Selection (Karta va Naqd pul, 15 daqiqalik tekshiruv)
    const btnExecutePay = document.getElementById("btn-execute-pay");
    const paySuccessBanner = document.getElementById("pay-success-banner");
    const payPendingBanner = document.getElementById("pay-pending-banner");
    const payMethodSelect = document.getElementById("input-pay-method");
    const boxCardDetails = document.getElementById("box-card-details");
    const btnPayBack = document.getElementById("btn-pay-back");
    const btnFinish = document.getElementById("btn-finish-onboarding");

    if (payMethodSelect && boxCardDetails) {
      payMethodSelect.addEventListener("change", (e) => {
        boxCardDetails.style.display = (e.target.value === "card") ? "block" : "none";
      });
    }

    if (btnExecutePay) {
      btnExecutePay.addEventListener("click", async () => {
        const payName = document.getElementById("input-pay-driver-name")?.value.trim() || "";
        const payPlate = document.getElementById("input-pay-plate")?.value.trim().toUpperCase() || "";
        const payPhone = document.getElementById("input-pay-phone")?.value.trim() || "";
        const payMethod = document.getElementById("input-pay-method")?.value || "card";
        const payCard = document.getElementById("input-pay-card")?.value.trim() || "";

        if (!payName || !payPlate || !payPhone) {
          alert(this.lang === "uz" 
            ? "Iltimos, ism-familiya, avtomobil raqami va telefoningizni to'liq kiriting!" 
            : "Пожалуйста, введите ФИО, госномер авто и телефон!");
          return;
        }

        if (payPendingBanner) payPendingBanner.style.display = "block";
        if (paySuccessBanner) paySuccessBanner.style.display = "none";

        btnExecutePay.disabled = true;
        btnExecutePay.textContent = this.lang === "uz" ? "⏳ Yuborilmoqda..." : "⏳ Отправка...";

        try {
          const res = await fetch(`${this._getApiBase()}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_type: "rent",
              driver_name: payName,
              vehicle_plate: payPlate,
              phone: payPhone,
              payment_method: payMethod,
              card_number: payCard || (payMethod === 'cash' ? "Naqd to'lov" : ""),
              amount: "200 000 so'm"
            })
          });
          const data = await res.json();

          if (window.v2xAudio) {
            window.v2xAudio.speakText(this.lang === "uz" 
              ? "To'lovingiz qabul qilindi. Administrator 15 daqiqa ichida tekshirib ruxsat beradi." 
              : "Ваш платеж принят. Администратор проверит и активирует доступ в течение 15 минут.");
          }

          // Сохраняем локально заявку
          const curDriver = this._getSavedDriver() || {};
          curDriver.name = payName;
          curDriver.vehicle_plate = payPlate;
          curDriver.phone = payPhone;
          curDriver.tariff = "rent";
          curDriver.payment_status = "pending";
          localStorage.setItem("v2x_registered_driver", JSON.stringify(curDriver));

          // Запускаем опрос проверки одобрения администратором
          this._startOrderApprovalPolling(payPlate || payPhone);

        } catch (e) {
          alert("Xatolik yuz berdi: " + e.message);
        } finally {
          btnExecutePay.disabled = false;
          btnExecutePay.textContent = this.lang === "uz" 
            ? "🚀 To'lovni yuborish va 1 oylik ruxsat olish (200 000 so'm)" 
            : "🚀 Отправить оплату и получить доступ на 1 месяц (200 000 сум)";
        }
      });
    }

    if (btnPayBack) {
      btnPayBack.addEventListener("click", () => showStep(2));
    }

    if (btnFinish) {
      btnFinish.addEventListener("click", () => {
        closeModal();
        this.startTrip();
      });
    }

    // Setup Forgot Password Modal
    const modalForgot = document.getElementById("modal-forgot-password");
    const linkForgot = document.getElementById("link-forgot-password");
    const btnRequestSms = document.getElementById("btn-request-sms-code");
    const btnSubmitReset = document.getElementById("btn-submit-reset-pass");
    const resetSection = document.getElementById("reset-code-section");
    const inputIdentifier = document.getElementById("forgot-identifier-input");
    const inputSms = document.getElementById("input-sms-code");
    const inputNewPass = document.getElementById("input-new-pass");
    const inputConfirmPass = document.getElementById("input-confirm-pass");
    const resetError = document.getElementById("reset-error-msg");
    const resetSuccess = document.getElementById("reset-success-msg");
    const generatedSmsSpan = document.getElementById("generated-sms-code");

    let currentResetCode = "7742";

    if (linkForgot) {
      linkForgot.addEventListener("click", () => {
        closeModal();
        if (modalForgot) {
          modalForgot.style.display = "flex";
          modalForgot.classList.add("active");
          if (resetSection) resetSection.style.display = "none";
          if (resetError) resetError.textContent = "";
          if (resetSuccess) resetSuccess.textContent = "";
          const regPhoneVal = (regPhone && regPhone.value.trim()) || (regEmail && regEmail.value.trim()) || "";
          if (inputIdentifier && regPhoneVal) inputIdentifier.value = regPhoneVal;
        }
      });
    }

    if (modalForgot) {
      modalForgot.addEventListener("click", (e) => {
        if (e.target === modalForgot) {
          modalForgot.style.display = "none";
          modalForgot.classList.remove("active");
        }
      });
    }

    if (btnRequestSms) {
      btnRequestSms.addEventListener("click", () => {
        const idVal = (inputIdentifier && inputIdentifier.value.trim()) || "";
        if (!idVal) {
          if (resetError) resetError.textContent = (this.lang === "uz") ? "Iltimos, telefon yoki emailingizni kiriting!" : "Пожалуйста, введите телефон или email!";
          return;
        }
        if (resetError) resetError.textContent = "";
        currentResetCode = String(Math.floor(1000 + Math.random() * 9000));
        if (generatedSmsSpan) generatedSmsSpan.textContent = currentResetCode;
        if (resetSection) resetSection.style.display = "block";
        if (inputSms) inputSms.value = currentResetCode;
      });
    }

    if (btnSubmitReset) {
      btnSubmitReset.addEventListener("click", async () => {
        const idVal = (inputIdentifier && inputIdentifier.value.trim()) || "";
        const codeVal = (inputSms && inputSms.value.trim()) || "";
        const passVal = (inputNewPass && inputNewPass.value) || "";
        const confirmVal = (inputConfirmPass && inputConfirmPass.value) || "";

        if (codeVal !== currentResetCode) {
          if (resetError) resetError.textContent = (this.lang === "uz") ? "Tasdiqlash kodi noto'g'ri kiritildi!" : "Неверный код подтверждения!";
          return;
        }

        if (!passVal || passVal.length < 4) {
          if (resetError) resetError.textContent = (this.lang === "uz") ? "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak!" : "Пароль должен содержать минимум 4 символа!";
          return;
        }

        if (passVal !== confirmVal) {
          if (resetError) resetError.textContent = (this.lang === "uz") ? "Parollar mos kelmadi!" : "Пароли не совпадают!";
          return;
        }

        if (resetError) resetError.textContent = "";
        if (resetSuccess) resetSuccess.textContent = (this.lang === "uz") ? "✓ Parolingiz muvaffaqiyatli tiklandi va yangilandi!" : "✓ Пароль успешно восстановлен!";

        // Save new password
        const curDriver = this._getSavedDriver() || {};
        curDriver.password = passVal;
        localStorage.setItem("v2x_registered_driver", JSON.stringify(curDriver));

        try {
          await fetch(`${this._getApiBase()}/api/driver/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: idVal, new_password: passVal })
          });
        } catch (e) {
          console.warn("Reset password backend call failed:", e);
        }

        setTimeout(() => {
          if (modalForgot) {
            modalForgot.style.display = "none";
            modalForgot.classList.remove("active");
          }
          openModal();
          showStep(1);
          if (regPassword) regPassword.value = passVal;
        }, 1500);
      });
    }

    // Safarni boshlash tugmasi
    const btnStartTrip = document.getElementById("btn-start-trip");
    if (btnStartTrip) {
      btnStartTrip.addEventListener("click", () => {
        this.startTrip();
      });
    }

    // Radar sinovi tugmasi (Test radar detection)
    const btnRadarTest = document.getElementById("btn-radar-test");
    if (btnRadarTest) {
      btnRadarTest.addEventListener("click", () => {
        this.testRadarDetection();
      });
    }

    // If first visit (not registered yet) and not directly starting a trip, open modal automatically!
    if (!savedDriver && !window.location.search.includes("start_trip=1")) {
      setTimeout(() => openModal(), 600);
    }
  }

  startTrip() {
    this.startShift();
  }

  startShift() {
    this.shiftState = "active";
    this.ego.isMoving = true;
    if (this.ego.speed <= 5.0) {
      this.ego.speed = 42.0;
    }
    this._updateShiftUI();

    if (window.v2xAudio) {
      window.v2xAudio.playVoiceAlert("trip_start", true);
    }
  }

  pauseShift() {
    this.shiftState = "paused";
    this.ego.speed = 0.0;
    this.ego.isMoving = false;
    this.stopVehicle();
    this.shiftState = "paused";
    this._updateShiftUI();

    if (window.v2xAudio) {
      window.v2xAudio.speakText(this.lang === "uz" 
        ? "Tanaffus rejimi yoqildi. Xavfsizlik signallari vaqtincha to'xtatildi." 
        : "Режим паузы включен. Сигналы безопасности временно приостановлены.");
    }
  }

  endShift() {
    this.shiftState = "ended";
    this.stopVehicle();
    this.shiftState = "ended";
    this._updateShiftUI();

    if (window.v2xAudio) {
      window.v2xAudio.speakText(this.lang === "uz"
        ? "Bugungi ish faoliyatingiz muvaffaqiyatli yakunlandi. Rahmat, yaxshi dam oling!"
        : "Рабочая смена завершена. Спасибо за безопасное вождение, приятного отдыха!");
    }

    const modalMsg = this.lang === "uz"
      ? "🏁 Bugungi ish faoliyatingiz muvaffaqiyatli yakunlandi!\nBarcha ogohlantirishlar xavfsiz to'xtatildi. Ertaga yana 'Ishni boshlash' tugmasi orqali xizmatingizni davom ettirishingiz mumkin."
      : "🏁 Ваша рабочая смена успешно завершена!\nВсе оповещения безопасно выключены. Завтра вы сможете продолжить работу, нажав 'Начать работу'.";
    alert(modalMsg);
  }

  _updateShiftUI() {
    const btnStart = document.getElementById("btn-shift-start");
    const btnPause = document.getElementById("btn-shift-pause");
    const btnEnd = document.getElementById("btn-shift-end");
    const lblStart = document.getElementById("label-shift-start");

    if (btnStart) {
      btnStart.classList.toggle("active", this.shiftState === "active");
      if (lblStart) {
        if (this.shiftState === "active") {
          lblStart.textContent = this.lang === "uz" ? "Ish faoliyatida" : "На смене";
        } else if (this.shiftState === "paused") {
          lblStart.textContent = this.lang === "uz" ? "Davom ettirish" : "Продолжить";
        } else {
          lblStart.textContent = this.lang === "uz" ? "Ishni boshlash" : "Начать работу";
        }
      }
    }
    if (btnPause) {
      btnPause.classList.toggle("active", this.shiftState === "paused");
    }
    if (btnEnd) {
      btnEnd.classList.toggle("active", this.shiftState === "ended");
    }

    const statusBar = document.getElementById("safety-status-bar");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");

    if (this.shiftState === "paused") {
      if (statusBar) statusBar.className = "status-yellow";
      if (statusTitle) {
        statusTitle.textContent = this.lang === "uz" ? "TANAFFUSDA (PAUZA)" : "НА ПАУЗЕ (ПЕРЕРЫВ)";
        statusTitle.style.color = "var(--color-yellow)";
      }
      if (statusDesc) {
        statusDesc.textContent = this.lang === "uz" ? "Haydovchi tanaffusda. Tizim kutish holatida." : "Водитель на перерыве. Система в режиме ожидания.";
      }
    } else if (this.shiftState === "ended") {
      if (statusBar) statusBar.className = "status-safe";
      if (statusTitle) {
        statusTitle.textContent = this.lang === "uz" ? "ISH TUGATILDI (DAM OLISH)" : "СМЕНА ОКОНЧЕНА";
        statusTitle.style.color = "#94a3b8";
      }
      if (statusDesc) {
        statusDesc.textContent = this.lang === "uz" ? "Ish faoliyati yakunlangan. Ertaga yana boshlashingiz mumkin." : "Смена окончена. Завтра вы можете продолжить работу.";
      }
    }
  }

  _startFleetSync() {
    if (this.fleetSyncInterval) clearInterval(this.fleetSyncInterval);
    const sync = async () => {
      try {
        const resp = await fetch(`${this._getApiBase()}/api/fleet/all`);
        if (resp.ok) {
          const fleet = await resp.json();
          if (window.v2xMap) {
            window.v2xMap.updateAllFleet(fleet, this.vehicleId);
          }
        }
      } catch (err) {}
    };
    sync();
    this.fleetSyncInterval = setInterval(sync, 3500);
  }

  _startOrderApprovalPolling(query) {
    if (this.orderCheckInterval) clearInterval(this.orderCheckInterval);
    const check = async () => {
      try {
        const resp = await fetch(`${this._getApiBase()}/api/orders/check/${encodeURIComponent(query)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.approved) {
            clearInterval(this.orderCheckInterval);
            this.orderCheckInterval = null;
            const payPendingBanner = document.getElementById("pay-pending-banner");
            const paySuccessBanner = document.getElementById("pay-success-banner");
            if (payPendingBanner) payPendingBanner.style.display = "none";
            if (paySuccessBanner) paySuccessBanner.style.display = "block";

            if (window.v2xAudio) {
              window.v2xAudio.speakText(this.lang === "uz"
                ? "Tabriklaymiz! Administrator to'lovingizni tasdiqladi. 1 oylik ruxsat berildi. Oq yo'l!"
                : "Поздравляем! Администратор подтвердил оплату. Доступ на 1 месяц активирован. Счастливого пути!");
            }

            const curDriver = this._getSavedDriver() || {};
            curDriver.is_paid = true;
            curDriver.status = "active";
            curDriver.subscription_active = true;
            localStorage.setItem("v2x_registered_driver", JSON.stringify(curDriver));
          }
        }
      } catch (e) {}
    };
    this.orderCheckInterval = setInterval(check, 4000);
  }

  async _checkDriverSubscriptionStatus() {
    const saved = this._getSavedDriver();
    if (!saved) return;
    const q = saved.vehicle_plate || saved.phone || saved.name;
    if (!q) return;

    try {
      const resp = await fetch(`${this._getApiBase()}/api/orders/check/${encodeURIComponent(q)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.approved) {
          const badge = document.getElementById("label-tariffs");
          if (badge) {
            badge.textContent = this.lang === "uz" ? "✓ 1 oylik obuna faol" : "✓ Подписка активна (1 мес)";
          }
        }
      }
    } catch (e) {}
  }

  stopVehicle() {
    this.ego.speed = 0.0;
    this.ego.isMoving = false;
    this.demoMode = false;
    this._updateDemoUI();

    // Полная тишина: немедленно глушим все аудиофайлы и голосовой синтезатор речи!
    if (window.v2xAudio) {
      window.v2xAudio.stopAll();
      window.v2xAudio.setVehicleSpeed(0.0);
    }

    // Немедленно прячем радар и очищаем луч на карте
    const alertBox = document.getElementById("hud-radar-alert");
    if (alertBox) {
      alertBox.classList.remove("active", "speeding-hazard");
      alertBox.style.display = "none";
    }
    this.activeRadarId = null;
    if (window.v2xMap) {
      window.v2xMap.clearRadarHighlights();
    }

    // Выключаем бэкенд-симулятор и очищаем фантомные машины
    fetch(`${this._getApiBase()}/api/simulator/stop`, { method: "POST" }).catch(() => {});
    this.localVehicles = [];

    // Обновляем статус HUD в безопасное состояние
    const t = this.i18n[this.lang];
    const statusBar = document.getElementById("safety-status-bar");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");
    const statusIcon = document.getElementById("status-icon");

    if (statusBar) statusBar.className = "status-safe";
    if (statusIcon) statusIcon.textContent = "✓";
    if (statusTitle) {
      statusTitle.textContent = this.lang === "uz" ? "AVTOMOBIL TO'XTATILDI" : "АВТОМОБИЛЬ ОСТАНОВЛЕН";
      statusTitle.style.color = "var(--color-green)";
    }
    if (statusDesc) {
      statusDesc.textContent = this.lang === "uz" ? "Dvigatel o'chiq. Tizim kutish rejimida." : "Двигатель выключен. Система в режиме ожидания.";
    }

    const speedDisp = document.getElementById("speed-display");
    if (speedDisp) speedDisp.textContent = "0";

    const threatCard = document.getElementById("threat-card");
    if (threatCard) threatCard.className = "hud-panel threat-card hazard-safe";
    const threatVid = document.getElementById("threat-vid");
    if (threatVid) threatVid.textContent = t.threat_none;
    const threatDist = document.getElementById("threat-dist");
    if (threatDist) threatDist.textContent = "--";
    const threatTtc = document.getElementById("threat-ttc");
    if (threatTtc) threatTtc.textContent = "--";
  }

  toggleDemoMode(forceState = null) {
    this.demoMode = (forceState !== null) ? forceState : !this.demoMode;
    const t = this.i18n[this.lang];

    if (this.demoMode) {
      this.ego.speed = 45.0;
      this.ego.isMoving = true;
      fetch(`${this._getApiBase()}/api/simulator/start`, { method: "POST" }).catch(() => {});
      if (window.v2xAudio) {
        window.v2xAudio.speakText(this.lang === "uz" ? "Sinov demo rejimi yoqildi." : "Включен демонстрационный тестовый режим.");
      }
    } else {
      this.stopVehicle();
      if (window.v2xAudio) {
        window.v2xAudio.speakText(this.lang === "uz" ? "Demo rejim o'chirildi. Haqiqiy jonli rejim." : "Демо-режим выключен. Реальный режим.");
      }
    }
    this._updateDemoUI();
  }

  _updateDemoUI() {
    const t = this.i18n[this.lang];
    const btnDemo = document.getElementById("btn-demo-mode");
    const scenarioSelect = document.getElementById("scenario-select");
    if (btnDemo) {
      btnDemo.textContent = this.demoMode ? (t.btn_demo_on || "🎮 Demo: YOQILGAN") : (t.btn_demo_off || "🎮 Demo: O'CHIQ");
      btnDemo.classList.toggle("active", this.demoMode);
    }
    if (scenarioSelect) {
      scenarioSelect.style.display = this.demoMode ? "inline-block" : "none";
    }
  }

  testRadarDetection() {
    // 1. Позиционируем автомобиль на пр. Амира Темура в 260 метрах перед стационарным радаром RAD-01
    this.ego.pathDistance = 330.0;
    this.ego.speed = 68.0; // Скорость 68 км/ч при лимите 60 км/ч (демонстрация превышения скорости)
    this.ego.isMoving = true;
    const pose = this._computePoseAlongPath(TASHKENT_ROADS.amir_temur_nb, this.ego.pathDistance, 0.0);
    this.ego.lat = pose.lat;
    this.ego.lon = pose.lon;
    this.ego.heading = pose.heading;

    window.v2xMap.panTo(this.ego.lat, this.ego.lon, 17);

    // 2. Немедленно проверяем радар и запускаем оповещение
    this._checkUpcomingRadars();

    // 3. Звуковое и речевое подтверждение
    if (window.v2xAudio) {
      window.v2xAudio._ensureContext();
      window.v2xAudio.setVehicleSpeed(68.0);
      const r = (this.radars && this.radars.find(x => x.id === "RAD-01")) || { id: "RAD-01", name: "Радар КОРДОН-М • пр. Амира Темура", speed_limit: 60 };
      window.v2xAudio.playRadarAlert(true, r, 68.0, 260);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.v2xApp = new V2XApp();
  window.v2xApp.init();
});

// Global Helpers for Business Card & QR Modal
window.copyBizCardNumber = function(btn) {
  const num = "8888014490626927";
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(num).catch(() => {});
  } else {
    try {
      const input = document.createElement("input");
      input.value = num;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    } catch (e) {}
  }
  if (btn) {
    const origHtml = btn.innerHTML;
    const isRu = (window.v2xApp && window.v2xApp.lang === "ru");
    btn.innerHTML = isRu ? "<span>✓ Скопировано!</span>" : "<span>✓ Nusxalandi!</span>";
    btn.style.background = "#ffffff";
    btn.style.color = "#0f172a";
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.style.background = "#00e676";
      btn.style.color = "#06111f";
    }, 2000);
  }
};

window.openPaymentQrModal = function() {
  const modal = document.getElementById("modal-qr-zoom");
  if (modal) modal.style.display = "flex";
};

window.closePaymentQrModal = function() {
  const modal = document.getElementById("modal-qr-zoom");
  if (modal) modal.style.display = "none";
};
