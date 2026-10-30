"""Generate authentic neural human voices for Russian and Uzbek alerts using edge-tts."""
import asyncio
import os
import edge_tts

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "app", "static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

PHRASES = {
    # Русский язык (Голос: Дмитрий / Светлана)
    "ru_green.mp3": ("Дорога свободна. Движение разрешено.", "ru-RU-DmitryNeural"),
    "ru_yellow_slow.mp3": ("Внимание! Сбавьте скорость. Опасное сближение.", "ru-RU-DmitryNeural"),
    "ru_red_collision.mp3": ("Опасность столкновения! Экстренное торможение!", "ru-RU-DmitryNeural"),
    "ru_red_intersection.mp3": ("Внимание, перекресток! Риск столкновения, тормозите!", "ru-RU-DmitryNeural"),
    "ru_blind_spot.mp3": ("Внимание, помеха в слепой зоне!", "ru-RU-DmitryNeural"),
    "ru_gps_active.mp3": ("GPS подключен. Ведется мониторинг движения.", "ru-RU-DmitryNeural"),

    # O'zbek tili (Ovozi: Madina / Sardor)
    "uz_green.mp3": ("Yo'l ochiq. Xavfsiz harakatlanishingiz mumkin.", "uz-UZ-MadinaNeural"),
    "uz_yellow_slow.mp3": ("Diqqat! Tezlikni kamaytiring. Xavfli yaqinlashuv.", "uz-UZ-MadinaNeural"),
    "uz_red_collision.mp3": ("Xavfli to'qnashuv xavfi! Zudlik bilan tormoz bering!", "uz-UZ-MadinaNeural"),
    "uz_red_intersection.mp3": ("Diqqat, chorraha! To'qnashuv xavfi, tormoz bering!", "uz-UZ-MadinaNeural"),
    "uz_blind_spot.mp3": ("Diqqat, ko'rinmas zonada transport vositasi bor!", "uz-UZ-MadinaNeural"),
    "uz_gps_active.mp3": ("GPS ulandi. Harakat xavfsizligi nazorat qilinmoqda.", "uz-UZ-MadinaNeural")
}

async def generate():
    print(f"Generating human voice audio files in {AUDIO_DIR}...")
    for filename, (text, voice) in PHRASES.items():
        filepath = os.path.join(AUDIO_DIR, filename)
        print(f"Generating {filename} ({voice}): '{text}'")
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(filepath)
        size = os.path.getsize(filepath)
        print(f" -> Saved {filename} ({size} bytes)")
    print("All audio files successfully generated!")

if __name__ == "__main__":
    asyncio.run(generate())
