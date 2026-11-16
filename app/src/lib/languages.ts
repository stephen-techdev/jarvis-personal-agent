export interface LanguageOption {
  value: string
  label: string
  native: string
}

/** Languages offered for speech recognition, replies and text-to-speech. */
export const LANGUAGES: LanguageOption[] = [
  { value: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { value: 'en-IN', label: 'English (India)', native: 'English' },
  { value: 'en-US', label: 'English (US)', native: 'English' },
  { value: 'en-GB', label: 'English (UK)', native: 'English' },
  { value: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { value: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { value: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { value: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { value: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { value: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { value: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
  { value: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { value: 'ur-IN', label: 'Urdu', native: 'اردو' },
  { value: 'ar-SA', label: 'Arabic', native: 'العربية' },
  { value: 'fr-FR', label: 'French', native: 'Français' },
  { value: 'de-DE', label: 'German', native: 'Deutsch' },
  { value: 'es-ES', label: 'Spanish', native: 'Español' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)', native: 'Português' },
  { value: 'it-IT', label: 'Italian', native: 'Italiano' },
  { value: 'ru-RU', label: 'Russian', native: 'Русский' },
  { value: 'tr-TR', label: 'Turkish', native: 'Türkçe' },
  { value: 'ja-JP', label: 'Japanese', native: '日本語' },
  { value: 'ko-KR', label: 'Korean', native: '한국어' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', native: '简体中文' },
  { value: 'vi-VN', label: 'Vietnamese', native: 'Tiếng Việt' },
  { value: 'th-TH', label: 'Thai', native: 'ไทย' },
  { value: 'id-ID', label: 'Indonesian', native: 'Bahasa Indonesia' },
  { value: 'nl-NL', label: 'Dutch', native: 'Nederlands' },
  { value: 'pl-PL', label: 'Polish', native: 'Polski' },
  { value: 'sv-SE', label: 'Swedish', native: 'Svenska' },
]

/** New installs start in Tamil; the header switch changes it instantly. */
export const DEFAULT_LANGUAGE = 'ta-IN'

export function languageOption(value: string): LanguageOption | undefined {
  return LANGUAGES.find((language) => language.value === value)
}

export function languageName(value: string): string {
  const found = languageOption(value)
  if (!found) return value
  return found.native === found.label ? found.label : `${found.label} (${found.native})`
}

export function languageInstruction(value: string): string {
  const found = languageOption(value)
  if (!found) return ''
  return `Reply language: always answer in ${languageName(value)} unless the user explicitly asks you to switch to another language. Code, numbers and quoted source titles may stay in their original form.`
}

/** Compact label for the header switch. */
export function languageShort(value: string): string {
  const found = languageOption(value)
  if (!found) return value
  if (found.native === 'English') return `EN-${found.value.split('-')[1] ?? 'IN'}`
  return found.native
}

const SAMPLES: Record<string, string> = {
  'ta-IN': 'வணக்கம்! நான் ஜார்விஸ். இன்று நான் உங்களுக்கு எப்படி உதவலாம்?',
  'hi-IN': 'नमस्ते! मैं जार्विस हूँ। आज मैं आपकी कैसे मदद कर सकता हूँ?',
  'te-IN': 'నమస్కారం! నేను జార్విస్. ఈరోజు మీకు ఎలా సహాయం చేయగలను?',
  'ml-IN': 'നമസ്കാരം! ഞാൻ ജാർവിസ്. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?',
  'kn-IN': 'ನಮಸ್ಕಾರ! ನಾನು ಜಾರ್ವಿಸ್. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  'bn-IN': 'নমস্কার! আমি জার্ভিস। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?',
  'mr-IN': 'नमस्कार! मी जार्विस आहे. आज मी तुम्हाला कशी मदत करू शकतो?',
  'gu-IN': 'નમસ્તે! હું જાર્વિસ છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?',
  'pa-IN': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਜਾਰਵਿਸ ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?',
  'ur-IN': 'اسلام علیکم! میں جاروس ہوں۔ آج میں آپ کی کیسے مدد کر سکتا ہوں؟',
  'ar-SA': 'مرحباً! أنا جارفيس. كيف يمكنني مساعدتك اليوم؟',
  'fr-FR': 'Bonjour ! Je suis Jarvis. Comment puis-je vous aider aujourd’hui ?',
  'de-DE': 'Hallo! Ich bin Jarvis. Wie kann ich Ihnen heute helfen?',
  'es-ES': '¡Hola! Soy Jarvis. ¿Cómo puedo ayudarte hoy?',
  'pt-BR': 'Olá! Eu sou o Jarvis. Como posso ajudar você hoje?',
  'it-IT': 'Ciao! Sono Jarvis. Come posso aiutarti oggi?',
  'ru-RU': 'Здравствуйте! Я Джарвис. Чем я могу помочь вам сегодня?',
  'tr-TR': 'Merhaba! Ben Jarvis. Bugün size nasıl yardımcı olabilirim?',
  'ja-JP': 'こんにちは！ジャービスです。今日はどのようにお手伝いしましょうか？',
  'ko-KR': '안녕하세요! 저는 자비스입니다. 오늘 어떻게 도와드릴까요?',
  'zh-CN': '你好！我是贾维斯。今天我能帮你做什么？',
  'vi-VN': 'Xin chào! Tôi là Jarvis. Hôm nay tôi có thể giúp gì cho bạn?',
  'th-TH': 'สวัสดีครับ! ผมชื่อจาร์วิส วันนี้ผมช่วยอะไรคุณได้บ้าง?',
  'id-ID': 'Halo! Saya Jarvis. Ada yang bisa saya bantu hari ini?',
  'nl-NL': 'Hallo! Ik ben Jarvis. Hoe kan ik je vandaag helpen?',
  'pl-PL': 'Cześć! Jestem Jarvis. Jak mogę ci dziś pomóc?',
  'sv-SE': 'Hej! Jag är Jarvis. Hur kan jag hjälpa dig idag?',
}

export function voiceSample(value: string): string {
  return SAMPLES[value] ?? 'Hello! I am Jarvis. How can I help you today?'
}
