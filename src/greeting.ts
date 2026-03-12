import type { Lang } from './i18n';

const GREETINGS: Record<string, { morning: string[]; afternoon: string[]; evening: string[]; night: string[] }> = {
  ja: {
    morning: ['おはようございます', 'いい朝ですね', '今日もがんばりましょう', 'さあ、始めましょう'],
    afternoon: ['こんにちは', '午後もがんばりましょう', '調子はいかがですか？', 'いい調子ですね'],
    evening: ['おつかれさまです', 'もうひと踏ん張り', '今日もお疲れ様', 'いい一日でしたか？'],
    night: ['夜遅くまでお疲れ様', 'そろそろ休みませんか？', '今日はここまでにしましょう', '遅い時間ですね'],
  },
  en: {
    morning: ['Good morning', 'Rise and shine', 'Fresh start today', 'Ready to go?'],
    afternoon: ['Good afternoon', 'How\'s it going?', 'Keep it up', 'Making progress'],
    evening: ['Good evening', 'Wrapping up?', 'Nice work today', 'Almost there'],
    night: ['Working late?', 'Burning the midnight oil', 'Don\'t forget to rest', 'Night owl mode'],
  },
  es: {
    morning: ['Buenos días', '¡A empezar el día!', '¿Listo para hoy?'],
    afternoon: ['Buenas tardes', '¿Cómo va todo?', 'Sigue así'],
    evening: ['Buenas noches', 'Buen trabajo hoy', '¿Terminando?'],
    night: ['Trasnochas hoy', 'Descansa pronto', 'Modo nocturno'],
  },
  fr: {
    morning: ['Bonjour', 'Belle matinée', 'Prêt à commencer?'],
    afternoon: ['Bon après-midi', 'Ça avance bien?', 'Continuez'],
    evening: ['Bonsoir', 'Belle soirée', 'Beau travail aujourd\'hui'],
    night: ['Encore debout?', 'Pensez à dormir', 'Mode nuit'],
  },
  de: {
    morning: ['Guten Morgen', 'Frisch ans Werk', 'Bereit?'],
    afternoon: ['Guten Tag', 'Läuft gut?', 'Weiter so'],
    evening: ['Guten Abend', 'Gute Arbeit heute', 'Feierabend?'],
    night: ['Noch wach?', 'Nachtschicht', 'Ab ins Bett bald'],
  },
  zh: {
    morning: ['早上好', '新的一天', '准备开始吧'],
    afternoon: ['下午好', '进展如何？', '继续加油'],
    evening: ['晚上好', '今天辛苦了', '快收工了吧'],
    night: ['夜深了', '注意休息', '夜猫子模式'],
  },
  ko: {
    morning: ['좋은 아침이에요', '오늘도 화이팅', '시작해볼까요?'],
    afternoon: ['안녕하세요', '잘 되고 있나요?', '계속 파이팅'],
    evening: ['수고하셨어요', '오늘도 고생했어요', '마무리할까요?'],
    night: ['늦은 시간이네요', '좀 쉬세요', '야근 모드'],
  },
  pt: {
    morning: ['Bom dia', 'Vamos começar', 'Pronto para hoje?'],
    afternoon: ['Boa tarde', 'Como vai?', 'Continue assim'],
    evening: ['Boa noite', 'Bom trabalho hoje', 'Terminando?'],
    night: ['Ainda acordado?', 'Hora de descansar', 'Modo noturno'],
  },
};

export function getGreeting(lang: Lang): string {
  const hour = new Date().getHours();
  const period = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : hour < 23 ? 'evening' : 'night';
  let greetingLang = lang === 'ja' ? 'ja' : 'en';
  try {
    const navLang = navigator.language.split('-')[0].toLowerCase();
    if (GREETINGS[navLang]) greetingLang = navLang;
  } catch { /* ignore */ }
  const set = GREETINGS[greetingLang] || GREETINGS.en;
  const options = set[period];
  const dayIndex = new Date().getDate() + hour;
  return options[dayIndex % options.length];
}
