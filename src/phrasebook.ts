export interface Phrase { text: string; translation: string; language: string; }
const KEY = 'sweettalk:phrasebook';
export function validPhrases(value: unknown): value is Phrase[] {
  return Array.isArray(value) && value.length <= 500 && value.every(p => p && typeof p.text === 'string' && p.text.length <= 4000 && typeof p.translation === 'string' && p.translation.length <= 4000 && ['ko','en','ja','zh-CN'].includes(p.language));
}
export function readPhrases(): Phrase[] { try { const value=JSON.parse(localStorage.getItem(KEY)||'[]');return validPhrases(value)?value:[]; } catch { return []; } }
export function writePhrases(value: Phrase[]) { if (!validPhrases(value)) throw new Error('Invalid phrasebook');localStorage.setItem(KEY,JSON.stringify(value)); }
export function savePhrase(phrase: Phrase) { const current=readPhrases();if (!current.some(p=>p.text===phrase.text&&p.translation===phrase.translation))writePhrases([phrase,...current].slice(0,500)); }
