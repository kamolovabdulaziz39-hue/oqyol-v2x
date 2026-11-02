import asyncio
import os
import edge_tts

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "app", "static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

VOICE_UZ = "uz-UZ-MadinaNeural"
VOICE_RU = "ru-RU-SvetlanaNeural"

PHRASES = {
    # Uzbek (O'zbekcha)
    "uz_safe.mp3": (VOICE_UZ, "Yo'l ochiq. Oq yo'l tilaymiz."),
    "uz_yellow_slow.mp3": (VOICE_UZ, "Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv."),
    "uz_red_collision.mp3": (VOICE_UZ, "To'qnashuv xavfi! Zudlik bilan tormoz bering!"),
    "uz_red_intersection.mp3": (VOICE_UZ, "Diqqat, chorraha! To'qnashuv xavfi, zudlik bilan tormoz bering!"),
    "uz_blind_spot.mp3": (VOICE_UZ, "Diqqat, ko'rinmas zonada transport vositasi bor!"),
    "uz_gps_active.mp3": (VOICE_UZ, "GPS ulandi. Harakat xavfsizligi nazorat qilinmoqda."),
    "uz_lang_selected.mp3": (VOICE_UZ, "O'zbek tili tanlandi. Xavfsiz safar tilaymiz."),
    "uz_order_success.mp3": (VOICE_UZ, "Buyurtmangiz muvaffaqiyatli qabul qilindi."),
    "uz_radar_caution.mp3": (VOICE_UZ, "Ehtiyot bo'ling, radar! Oldinda tezlik nazorati. Belgilangan me'yorda harakatlaning."),
    "uz_radar_speeding.mp3": (VOICE_UZ, "Ehtiyot bo'ling, radar! Tezlikni oshirdingiz. Zudlik bilan tezlikni tushiring!"),
    "uz_radar_passed.mp3": (VOICE_UZ, "Radar hududidan o'tildi. Oq yo'l tilaymiz."),

    # Russian (Русский)
    "ru_safe.mp3": (VOICE_RU, "Дорога свободна. Приятной поездки."),
    "ru_yellow_slow.mp3": (VOICE_RU, "Внимание! Сбавьте скорость. Впереди опасное сближение."),
    "ru_red_collision.mp3": (VOICE_RU, "Опасность столкновения! Экстренное торможение!"),
    "ru_red_intersection.mp3": (VOICE_RU, "Внимание, перекрёсток! Риск столкновения, тормозите!"),
    "ru_blind_spot.mp3": (VOICE_RU, "Внимание, помеха в слепой зоне!"),
    "ru_gps_active.mp3": (VOICE_RU, "GPS подключен. Ведется мониторинг безопасности."),
    "ru_lang_selected.mp3": (VOICE_RU, "Выбран русский язык. Безопасной дороги."),
    "ru_order_success.mp3": (VOICE_RU, "Ваш заказ успешно принят."),
    "ru_radar_caution.mp3": (VOICE_RU, "Осторожно, радар! Впереди контроль скорости. Соблюдайте скоростной режим."),
    "ru_radar_speeding.mp3": (VOICE_RU, "Осторожно, радар! Превышение скорости. Снизьте скорость!"),
    "ru_radar_passed.mp3": (VOICE_RU, "Радар пройден. Безопасной дороги.")
}

async def generate():
    print(f"Generating {len(PHRASES)} voice files into {AUDIO_DIR}...")
    for filename, (voice, text) in PHRASES.items():
        filepath = os.path.join(AUDIO_DIR, filename)
        print(f"Generating {filename} ({voice}): '{text}'...")
        communicate = edge_tts.Communicate(text, voice, rate="+5%", pitch="+0Hz")
        await communicate.save(filepath)
        size = os.path.getsize(filepath)
        print(f"  -> Saved {filename} ({size} bytes)")
    print("All voice files successfully generated!")

if __name__ == "__main__":
    asyncio.run(generate())
