import { useSyncExternalStore } from 'react';
import translations from './translations.json';
export const languages = { ko: '한국어', en: 'English', ja: '日本語', 'zh-CN': '简体中文' } as const;
export type Language = keyof typeof languages;
function readLanguage(): Language {
  try { const v = localStorage.getItem('sweettalk:language'); return v && v in languages ? v as Language : 'ko'; } catch { return 'ko'; }
}
let language = readLanguage();
const subscribers = new Set<() => void>();
export function getLanguage() { return language; }
export function languageName() { return {ko:'Korean',en:'English',ja:'Japanese','zh-CN':'Simplified Chinese'}[language]; }
export function translationLanguage() { return language === 'en' ? 'Korean' : 'English'; }
export function setLanguage(value: Language) {
  localStorage.setItem('sweettalk:language', value);
  language = value;
  document.documentElement.lang = value;
  subscribers.forEach(fn => fn());
}
export function useLanguage() {
  return useSyncExternalStore(fn => { subscribers.add(fn); return () => { subscribers.delete(fn); }; }, getLanguage);
}
export function t(text: string): string {
  const values = (translations as Record<string, string[]>)[text];
  if (language === 'ko') return ({
    '다른 표현 2가지':'다른 표현 1가지', '실시간 영어 번역':'메시지 번역',
    'AI 연인 채팅 + 영어 번역':'AI 연인 대화와 언어 연습',
    '설레는 대화, 자연스러운 영어로':'대화하며 다양한 표현을 연습해요',
    'AI 응답과 번역을 위해 대화 내용과 캐릭터 설정이 Cloudflare를 통해 DeepSeek에 전송됩니다. 입력한 위치는 날씨 조회를 위해 wttr.in에, 대화 맥락을 위해 DeepSeek에 전송됩니다. 민감한 개인정보는 입력하지 마세요.':'AI 응답·번역·안전 검사를 위해 대화 내용, 캐릭터 설정과 AI 응답이 Cloudflare를 통해 DeepSeek에 전송됩니다. 날씨 기능을 켠 경우에만 입력한 위치가 wttr.in과 DeepSeek에 전송됩니다. 민감한 개인정보는 입력하지 마세요.'
  } as Record<string,string>)[text] || text;
  if (!values) return text;
  return values[['en','ja','zh-CN'].indexOf(language)] || text;
}
export function weatherEnabled() { try { return localStorage.getItem('sweettalk:weather-consent') === '1'; } catch { return false; } }
export function setWeatherEnabled(value: boolean) { localStorage.setItem('sweettalk:weather-consent',value?'1':'0'); }
