import asyncio
import os
import shutil
import edge_tts

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "app", "static", "audio")
ROOT_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(ROOT_AUDIO_DIR, exist_ok=True)

VOICE_UZ = "uz-UZ-MadinaNeural"
VOICE_RU = "ru-RU-SvetlanaNeural"

PHRASES = {
    # Uzbek (O'zbekcha) - Madina Neural (Haqiqiy inson ovozi)
    "uz_safe.mp3": (VOICE_UZ, "Yo'l ochiq. Oq yo'l tilaymiz."),
    "uz_yellow_slow.mp3": (VOICE_UZ, "Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv."),
    "uz_red_collision.mp3": (VOICE_UZ, "To'qnashuv xavfi! Zudlik bilan tormoz bering!"),
    "uz_red_intersection.mp3": (VOICE_UZ, "Diqqat, chorraha! To'qnashuv xavfi, zudlik bilan tormoz bering!"),
    "uz_blind_spot.mp3": (VOICE_UZ, "Diqqat, ko'rinmas zonada transport vositasi bor!"),
    "uz_gps_active.mp3": (VOICE_UZ, "GPS ulandi. Joylashuvingiz xaritada ochildi."),
    "uz_lang_selected.mp3": (VOICE_UZ, "O'zbek tili tanlandi. Xavfsiz safar tilaymiz."),
    "uz_order_success.mp3": (VOICE_UZ, "Buyurtmangiz muvaffaqiyatli qabul qilindi."),
    "uz_radar_caution.mp3": (VOICE_UZ, "Ehtiyot bo'ling, radar! Oldinda tezlik nazorati. Belgilangan me'yorda harakatlaning."),
    "uz_radar_speeding.mp3": (VOICE_UZ, "Ehtiyot bo'ling, radar! Tezlikni oshirdingiz. Zudlik bilan tezlikni pasaytiring!"),
    "uz_radar_passed.mp3": (VOICE_UZ, "Radar hududidan o'tildi. Oq yo'l!"),
    "uz_trip_start.mp3": (VOICE_UZ, "Assalomu alaykum! OQ YO'L AI sizga oq yo'l tilaydi. Unutmang, sizni uyda oilangiz kutmoqda."),
    "uz_welcome.mp3": (VOICE_UZ, "Xush kelibsiz! OQ YO'L AI yo'l xavfsizligi tizimiga xush kelibsiz."),
    "uz_green.mp3": (VOICE_UZ, "Yo'l ochiq. Harakatlanishingiz mumkin."),
    "uz_shift_pause.mp3": (VOICE_UZ, "Tanaffus rejimi yoqildi. Xavfsizlik signallari vaqtincha to'xtatildi."),
    "uz_shift_end.mp3": (VOICE_UZ, "Bugungi ish faoliyatingiz yakunlandi. Rahmat, yaxshi dam oling!"),
    "uz_order_pending.mp3": (VOICE_UZ, "To'lovingiz qabul qilindi. Administrator tekshirib tasdiqlagach xarita ochiladi."),
    "uz_order_approved.mp3": (VOICE_UZ, "Tabriklaymiz! Administrator to'lovingizni tasdiqladi. 1 oylik ruxsat berildi. Oq yo'l!"),
    "uz_demo_on.mp3": (VOICE_UZ, "Sinov demo rejimi yoqildi."),
    "uz_demo_off.mp3": (VOICE_UZ, "Demo rejim o'chirildi. Haqiqiy jonli rejim."),
    "uz_accident_prevented.mp3": (VOICE_UZ, "Tabriklaymiz! Avariya xavfi muvaffaqiyatli bartaraf etildi. Oq yo'l sizni asradi!"),

    # Russian (Русский) - Svetlana Neural (Естественный человеческий голос)
    "ru_safe.mp3": (VOICE_RU, "Дорога свободна. Приятной поездки."),
    "ru_yellow_slow.mp3": (VOICE_RU, "Внимание! Сбавьте скорость. Впереди опасное сближение."),
    "ru_red_collision.mp3": (VOICE_RU, "Опасность столкновения! Экстренное торможение!"),
    "ru_red_intersection.mp3": (VOICE_RU, "Внимание, перекрёсток! Риск столкновения, тормозите!"),
    "ru_blind_spot.mp3": (VOICE_RU, "Внимание, помеха в слепой зоне!"),
    "ru_gps_active.mp3": (VOICE_RU, "GPS подключен. Ваше местоположение открыто на карте."),
    "ru_lang_selected.mp3": (VOICE_RU, "Выбран русский язык. Безопасной дороги."),
    "ru_order_success.mp3": (VOICE_RU, "Ваш заказ успешно принят."),
    "ru_radar_caution.mp3": (VOICE_RU, "Осторожно, радар! Впереди контроль скорости. Соблюдайте скоростной режим."),
    "ru_radar_speeding.mp3": (VOICE_RU, "Осторожно, радар! Превышение скорости. Снизьте скорость!"),
    "ru_radar_passed.mp3": (VOICE_RU, "Радар пройден. Безопасной дороги!"),
    "ru_trip_start.mp3": (VOICE_RU, "Здравствуйте! OQ YO'L AI желает вам счастливого пути. Помните, дома вас ждут родные и близкие."),
    "ru_welcome.mp3": (VOICE_RU, "Добро пожаловать в систему безопасности OQ YO'L AI."),
    "ru_green.mp3": (VOICE_RU, "Дорога свободна. Движение разрешено."),
    "ru_shift_pause.mp3": (VOICE_RU, "Режим паузы включен. Сигналы безопасности временно приостановлены."),
    "ru_shift_end.mp3": (VOICE_RU, "Рабочая смена завершена. Спасибо за безопасное вождение, приятного отдыха!"),
    "ru_order_pending.mp3": (VOICE_RU, "Ваш платеж принят. После подтверждения администратором доступ к карте будет открыт."),
    "ru_order_approved.mp3": (VOICE_RU, "Поздравляем! Администратор подтвердил оплату. Доступ на 1 месяц активирован. Счастливого пути!"),
    "ru_demo_on.mp3": (VOICE_RU, "Включен демонстрационный тестовый режим."),
    "ru_demo_off.mp3": (VOICE_RU, "Демо-режим выключен. Реальный режим."),
    "ru_accident_prevented.mp3": (VOICE_RU, "Поздравляем! Опасность аварии успешно предотвращена. OQ YO'L защитил вас!")
}

async def generate():
    print(f"Generating {len(PHRASES)} high-fidelity human neural voice files...")
    for filename, (voice, text) in PHRASES.items():
        filepath = os.path.join(AUDIO_DIR, filename)
        root_filepath = os.path.join(ROOT_AUDIO_DIR, filename)
        try:
            communicate = edge_tts.Communicate(text, voice, rate="+2%", pitch="+0Hz")
            await communicate.save(filepath)
            shutil.copyfile(filepath, root_filepath)
            size = os.path.getsize(filepath)
            print(f"  -> Generated {filename} ({voice}, {size} bytes)")
        except Exception as e:
            print(f"  FAILED {filename}: {e}")
    print("All voice files successfully generated!")

if __name__ == "__main__":
    asyncio.run(generate())
