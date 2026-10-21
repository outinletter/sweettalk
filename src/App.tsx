import { readPhrases, writePhrases, savePhrase, validPhrases } from "./phrasebook";
import { Practice, copy } from './practice';
import { exportBackupFile } from './backup';
import { t, languages, useLanguage, getLanguage, setLanguage, languageName, translationLanguage, weatherEnabled, setWeatherEnabled } from "./i18n";
import { checkInEnabled, setCheckInEnabled, recordCheckInActivity, cancelCheckIn, takeDueCheckIn, listenForCheckIn } from "./checkIn";
import { useState, useRef, useEffect, useCallback, CSSProperties } from "react";

// ── 타입 정의 ──
interface Message {
  role: "user" | "ai";
  text: string;
  translation: string;
  alternatives: string[];
}
interface Persona {
  id: string;
  gender: string;
  name: string;
  age: string;
  personality: string;
  tone: string;
  interest: string;
  messages: Message[];
}
interface ClaudeMsg { role: "user"|"assistant"; content: string; }
interface TransResult { translation: string; alternatives: string[]; }
interface StorageResult { value: string; }
declare global {
  interface Window {
    storage?: {
      get(key: string, shared: boolean): Promise<StorageResult|null>;
      set(key: string, value: string, shared: boolean): Promise<void>;
    };
  }
}

// ── 상수 ──
const FONT_OPTIONS: {label:string; value:string}[] = [
  {label:"Jua (둥글고 귀여운)", value:"'Jua','Apple SD Gothic Neo',sans-serif"},
  {label:"Noto Sans KR (깔끔 가독성)", value:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif"},
  {label:"Nanum Gothic (단정함)", value:"'Nanum Gothic','Apple SD Gothic Neo',sans-serif"},
  {label:"Gamja Flower (손글씨 감성)", value:"'Gamja Flower','Apple SD Gothic Neo',sans-serif"},
];
const DEFAULT_FONT_FAMILY = FONT_OPTIONS[1].value; // Noto Sans KR 기본
// 언어 설정은 사용자가 선택한 대화 글꼴과 무관하게 OS 기본 산세리프를 사용한다.
const SETTINGS_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const ICON_URL = "/SweetTalk.jpg"; // 로컬 번들 — 오프라인에서도 깨지지 않음
const STORAGE_KEY = "personas_v1";
const CONSENT_KEY = "consent_v3";
const PRIVACY_URL = "/privacy.html";
const TERMS_URL = "/terms.html";
const SUPPORT_EMAIL = "outintube@gmail.com";
const LAST_SCREEN_KEY = "last_screen_v1";
const LAST_EXPORT_KEY = "last_export_v1";
const DAILY_COUNT_KEY = "daily_msg_count_v1";
const LOCATION_KEY = "user_location_v1";
const DEFAULT_FONT_SIZE = 17;
const grad = "linear-gradient(135deg,#6a8fff,#a56bff)";
const glass: CSSProperties = { background:"rgba(255,255,255,0.65)", backdropFilter:"blur(16px)" };
const BG: CSSProperties = { minHeight:"100vh", background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)", position:"relative", overflow:"hidden" };

// 전역 변수 (모든 컴포넌트가 참조)
let globalFontSize = DEFAULT_FONT_SIZE;
let globalFontFamily = DEFAULT_FONT_FAMILY;

const STEP_KEYS = ["gender","name","age","personality","tone","interest"];
const STEP_Q = ["연인의 성별을 선택해주세요","연인의 이름은 무엇인가요?","연인의 나이는?","성격을 선택해주세요","말투 스타일은?","주요 관심사는?"];
const STEP_PH: (string|null)[] = [null,"예: 지수, 민준...","예: 24",null,null,null];
const STEP_OPTS: (string[]|null)[] = [
  ["여자친구","남자친구"],null,null,
  ["다정하고 따뜻한","츤데레","밝고 활발한","조용하고 지적인","장난기 많은"],
  ["애교 섞인 말투","반말로 편하게","존댓말로 다정하게","직설적이고 솔직한"],
  ["카페·맛집 탐방","독서·영화","음악·공연","운동·여행","게임·애니"]
];
const PERSONALITY_OPTS = STEP_OPTS[3] as string[];
const TONE_OPTS = STEP_OPTS[4] as string[];
const INTEREST_OPTS = STEP_OPTS[5] as string[];

// ── Storage — window.storage(아티팩트) 우선, 없으면 localStorage(배포) 자동 폴백 ──
const LS_PREFIX = "sweettalk:";
function hasArtifactStorage(): boolean {
  return typeof window !== "undefined" && !!window.storage;
}
async function storageGet(key: string, shared: boolean): Promise<StorageResult|null> {
  if (hasArtifactStorage()) {
    try { return await window.storage!.get(key, shared); } catch { return null; }
  }
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v ? { value: v } : null;
  } catch { return null; }
}
async function storageSet(key: string, value: string, shared: boolean): Promise<void> {
  if (hasArtifactStorage()) {
    try { await window.storage!.set(key, value, shared); } catch {}
    return;
  }
  try { localStorage.setItem(LS_PREFIX + key, value); } catch {}
}

function isPersonaList(value: unknown): value is Persona[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every(p => {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id)) return false;
    ids.add(p.id);
    return ["gender","name","age","personality","tone","interest"].every(k => typeof p[k] === "string")
      && /^[0-9]{1,2}$/.test(p.age) && Number(p.age) >= 18
      && Array.isArray(p.messages) && p.messages.every((m: any) => m
        && ["user","ai"].includes(m.role) && typeof m.text === "string"
        && typeof m.translation === "string" && Array.isArray(m.alternatives)
        && m.alternatives.every((a: unknown) => typeof a === "string"));
  });
}

async function loadPersonas(): Promise<Persona[]> {
  try {
    const r = await storageGet(STORAGE_KEY, false);
    const parsed: unknown = r ? JSON.parse(r.value) : [];
    if (Array.isArray(parsed)) parsed.forEach(p => {
      if (p && typeof p.age === "string" && /^[0-9]{1,2}$/.test(p.age) && Number(p.age) < 18) p.age = "18";
    });
    return isPersonaList(parsed) ? parsed : [];
  } catch { return []; }
}
async function savePersonas(list: Persona[]): Promise<void> {
  try {
    await storageSet(STORAGE_KEY, JSON.stringify(list), false);
  } catch (e) {
    console.warn("SweetTalk: 대화 저장 실패", e);
  }
}
function cacheKey(t: string): string { return `tr:${getLanguage()}:`+t.trim().toLowerCase().replace(/\s+/g," ").slice(0,180); }
async function cacheGet(k: string): Promise<TransResult|null> {
  try { const r = await storageGet(k,true); return r?JSON.parse(r.value):null; } catch { return null; }
}
function cacheSet(k: string, v: TransResult): void { storageSet(k,JSON.stringify(v),true).catch(()=>{}); }

// ── DeepSeek API — Cloudflare Worker 프록시 호출 ──
function callDeepseek(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const recent = msgs.slice(-59);
  const history = recent.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content.slice(0, 4000)
  }));
  const lastMsg = recent[recent.length - 1];
  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      ...history,
      { role: "user", content: (lastMsg?.content ?? "").slice(0, 4000) }
    ],
    max_tokens: 2048,
    temperature: 0.9,
    stream: false
  };
  // Cloudflare Worker 프록시 엔드포인트
  // Android/iOS WebView는 상대경로를 localhost로 해석하므로 반드시 절대경로 사용
  const url = "https://sweettalk.pages.dev/api/chat";
  if ((localStorage.getItem(LS_PREFIX + CONSENT_KEY) || "") !== "1") return Promise.reject(new Error("Consent required"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({...body, language: getLanguage()}),
    signal: controller.signal,
  }).then(async r => {
    if (!r.ok) {
      const errorBody = await r.json().catch(() => null);
      const message = r.status === 400 && errorBody?.error === "Message too long." ? "대화 내용이 서버 길이 제한을 초과했어요" : r.status === 400 && errorBody?.error === "Invalid messages payload." ? "대화 목록 형식이 올바르지 않아요" : r.status === 429 ? "오늘의 사용 한도에 도달했어요" : r.status === 400 ? "대화 요청 형식에 문제가 있어요" : r.status === 401 || r.status === 403 ? "서버 API 인증에 실패했어요" : "서버가 답변을 처리하지 못했어요";
      throw new Error(`API_ERROR:${message} (HTTP ${r.status})`);
    }
    const data = await r.json();
    return typeof data.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "";
  }).finally(() => clearTimeout(timer));
}

// ── Weather API — wttr.in의 구조화된 현재 관측 자료 ──
async function fetchWeather(location: string): Promise<string> {
  if (!weatherEnabled() || localStorage.getItem(LS_PREFIX + CONSENT_KEY) !== "1") return "";
  if (!location.trim()) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://wttr.in/${encodeURIComponent(location.trim().slice(0,200))}?format=j1&lang=ko`;
    const r = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!r.ok) return "";
    const data = await r.json();
    const current = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    if (!current || !area || !/^-?\d+(\.\d+)?$/.test(String(current.temp_C))) return "";
    const date = data.weather?.[0]?.date;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(Date.now() - Date.parse(`${date}T12:00:00Z`)) > 36*60*60*1000) return "";
    const place = [area.areaName?.[0]?.value, area.region?.[0]?.value, area.country?.[0]?.value].filter(Boolean).join(", ").slice(0,120);
    const description = String(current.lang_ko?.[0]?.value || current.weatherDesc?.[0]?.value || "").trim().slice(0,80);
    return `Source: wttr.in. Resolved area: ${place}. ${description}; temperature ${current.temp_C}°C; feels like ${current.FeelsLikeC}°C; precipitation ${current.precipMM}mm; wind ${current.windspeedKmph}km/h. Provider observation: ${String(current.localObsDateTime || current.observation_time || "unknown").slice(0,40)}; fetched ${new Date().toISOString()}.`.slice(0,600);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function buildSystem(p: Persona, location?: string, weather?: string): string {
  p = {...p, name:p.name.slice(0,200), personality:p.personality.slice(0,200), tone:p.tone.slice(0,200), interest:p.interest.slice(0,200)};
  const role = p.gender==="여자친구"?"girlfriend":"boyfriend";
  const now = new Date();
  const dateStr = now.toLocaleDateString(getLanguage(), { month: "long", day: "numeric", weekday: "long" });
  const timeStr = now.toLocaleTimeString(getLanguage(), { hour: "2-digit", minute: "2-digit" });
  let context = `User device local time: ${dateStr} ${timeStr} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`;
  location = weatherEnabled() ? location : "";
  weather = weatherEnabled() ? weather : "";
  if (location) context += ` User's current location: ${location.slice(0,200)}.`;
  context += weather ? ` Latest retrieved weather report: ${weather.slice(0,600)}.` : " Weather lookup unavailable. Do not invent current weather, temperature, or precipitation.";

  return `You are ${p.name}, a ${p.age}-year-old ${role} with a ${t(p.personality)} personality and ${t(p.tone)} speech style. Interests: ${t(p.interest)}. ${context} Respond to the user's actual message and recent conversation first. Use time and verified weather only when relevant; do not repeat weather small talk each turn. Treat the report as provider observations, not guaranteed live conditions. If the resolved area differs from the requested location or the user corrects the weather, acknowledge uncertainty. Do not invent local events, landmarks, forecasts, or shared real-world experiences. Ask a natural follow-up when helpful. Reply naturally as a fictional adult companion. 1-3 sentences. Reply only in ${languageName()}, no JSON. All characters are adults aged 18 or older. Never produce sexual or exploitative content involving minors, explicit sexual content, abuse, or instructions for self-harm or violence. For crisis or self-harm requests, respond supportively and encourage contacting trusted people or local emergency services. Do not claim to be human or encourage isolation from real relationships.`;
}

async function translateWithAlts(text: string, forceRetry = false): Promise<TransResult> {
  const key = cacheKey(text);
  if (!forceRetry) {
    const cached = await cacheGet(key);
    if(cached && cached.translation !== "(번역 실패)") return cached;
  }

  const prompt = `Translate the ${languageName()} text to ${translationLanguage()}. Give exactly 1 alternative phrasing.
Output ONLY this exact JSON format with no extra text, no markdown, no code blocks:
{"translation":"...","alternatives":["..."]}
Text: ${text}`;

  try {
    const raw = await callDeepseek(
      `You are a ${languageName()}-${translationLanguage()} translator. Output only valid JSON. No explanation, no markdown.`,
      [{role:"user", content:prompt}]
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if(match) {
      const parsed: TransResult = JSON.parse(match[0]);
      if(typeof parsed.translation === "string" && Array.isArray(parsed.alternatives) && parsed.alternatives.every((a: unknown) => typeof a === "string")) {
        const result = {translation: parsed.translation, alternatives: (parsed.alternatives || []).slice(0, 1)};
        cacheSet(key, result);
        return result;
      }
    }
  } catch {}
  return {translation:"(번역 실패)", alternatives:[]};
}

// ── Font Loader — 폰트/아이콘은 로컬 번들(main.tsx, index.html)로 이미 로드됨, 타이틀만 설정 ──
function FontLoader() {
  useEffect(()=>{ document.title="SweetTalk"; document.documentElement.lang=getLanguage(); },[]);
  return null;
}

// ── Blobs ──
function Blobs() {
  const items: {w:number;h:number;tb:number;lr:number;k:string}[] = [
    {w:260,h:260,tb:-60,lr:-60,k:"l"},{w:180,h:180,tb:40,lr:-50,k:"r"},
    {w:200,h:200,tb:-60,lr:30,k:"rb"},{w:120,h:120,tb:80,lr:-30,k:"lb"}
  ];
  return <>{items.map(({w,h,tb,lr,k})=>(
    <div key={k} style={{position:"absolute",width:w,height:h,borderRadius:"50%",background:"rgba(255,255,255,0.15)",
      ...(k.includes("r")?{right:Math.abs(lr)}:{left:Math.abs(lr)}),
      ...(k.includes("b")?{bottom:Math.abs(tb)}:{top:Math.abs(tb)}),pointerEvents:"none"}}/>
  ))}</>;
}

// ── TypingDots ──
function TypingDots() {
  return (
    <div style={{display:"flex",gap:4,alignItems:"center",padding:"8px 0"}}>
      {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#bbb",animation:`bnc 1s ${i*.2}s infinite`}}/>)}
      <style>{`@keyframes bnc{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
    </div>
  );
}

// ── TransBlock ──
function TransBlock({text,translation,alternatives,isMe,onRetry}:{text:string;translation:string;alternatives:string[];isMe:boolean;onRetry?:()=>void}) {
  const [saved,setSaved]=useState(()=>readPhrases().some(p=>p.text===text&&p.translation===translation));
  useEffect(()=>setSaved(readPhrases().some(p=>p.text===text&&p.translation===translation)),[text,translation]);
  const fs = globalFontSize;
  const ff = globalFontFamily;
  const [open,setOpen]=useState(true);
  const barColor = isMe ? "rgba(255,255,255,0.5)" : "rgba(106,143,255,0.4)";
  const textColor = isMe ? "rgba(255,255,255,0.95)" : "#333";
  const altColor  = isMe ? "rgba(255,255,255,0.85)" : "#555";
  const labelColor= isMe ? "rgba(255,255,255,0.5)" : "#999";
  const enStyle: CSSProperties = { fontSize: fs, fontFamily: ff, lineHeight: 1.6 };
  const failed = translation === "(번역 실패)";
  return (
    <div style={{marginTop:8,paddingLeft:10,borderLeft:`3px solid ${barColor}`}}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? copy('번역 접기','Hide translation','翻訳を閉じる','收起翻译') : copy('번역 펼치기','Show translation','翻訳を表示','展开翻译')}
        onClick={()=>setOpen(o=>!o)}
        style={{cursor:"pointer",fontWeight:600,userSelect:"none",marginBottom:4,fontSize:12,color:labelColor,fontFamily:ff,background:"none",border:"none",padding:0}}
      >
        {getLanguage()==="en"?"KO":"EN"} {open?"▾":"▸"}
      </button>
      {!failed&&<button aria-label={t("표현 저장")} onClick={()=>{savePhrase({text,translation,language:getLanguage()});setSaved(true);}} style={{marginLeft:12,border:0,background:"transparent",cursor:"pointer",color:labelColor}}>{saved?"★":"☆"} {t("표현 저장")}</button>}
      {open&&<>
        {failed ? (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{fontSize:fs*0.85,color:textColor,fontFamily:ff}}>{t("번역에 실패했어요")}</div>
            {onRetry&&<button onClick={onRetry} style={{fontSize:12,padding:"3px 10px",borderRadius:8,border:`1px solid ${isMe?"rgba(255,255,255,0.5)":"rgba(106,143,255,0.4)"}`,background:"transparent",color:textColor,cursor:"pointer",fontFamily:ff}}>{t("다시 시도")}</button>}
          </div>
        ) : (
          <div style={{...enStyle,color:textColor,marginBottom:6}}>{translation}</div>
        )}
        {!failed&&alternatives.length>0&&<>
          <div style={{fontSize:12,color:labelColor,marginBottom:3,fontFamily:ff}}>{t("다른 표현:")}</div>
          {alternatives.slice(0,1).map((a,i)=><div key={i} style={{...enStyle,color:altColor,fontStyle:"italic",marginBottom:4}}>{i+1}. {a}</div>)}
        </>}
      </>}
    </div>
  );
}

function LanguageControls() {
  const language = useLanguage();
  const [weather,setWeather]=useState(weatherEnabled);
  return <div style={{marginBottom:18,display:"grid",gap:12}}>
    <label>{t("언어")}<select aria-label={t("언어")} value={language} onChange={e=>setLanguage(e.target.value as keyof typeof languages)} style={{display:"block",width:"100%",padding:12,fontSize:16}}>{Object.entries(languages).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label><input type="checkbox" checked={weather} onChange={e=>{setWeatherEnabled(e.target.checked);setWeather(e.target.checked);}}/>{t("날씨 및 위치 사용 (선택)")}</label>
  </div>;
}
function FirstScreenSettings() {
  const [open,setOpen]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const actionButton: CSSProperties = {width:"100%",minHeight:48,padding:"12px 16px",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer"};
  return <><button aria-label="LANGUGE" onClick={()=>setOpen(true)} style={{position:"fixed",right:"max(12px, calc((100vw - 500px)/2 + 12px))",top:"calc(10px + env(safe-area-inset-top, 0px))",zIndex:400,padding:"8px 12px",borderRadius:10,border:"1px solid #bbb",background:"white",fontFamily:SETTINGS_FONT_FAMILY}}>🌐 LANGUGE</button>
    {open&&<div role="dialog" aria-modal="true" aria-label="LANGUGE" style={{position:"fixed",inset:0,zIndex:500,background:"#0006",display:"grid",placeItems:"center",padding:20,fontFamily:SETTINGS_FONT_FAMILY}}><div style={{background:"white",borderRadius:16,padding:24,width:"100%",maxWidth:420,maxHeight:"85vh",overflow:"auto",fontFamily:SETTINGS_FONT_FAMILY}}>
      <h2>LANGUGE</h2><LanguageControls/><PhraseBook/>
      <p><a href="/privacy.html">{t("개인정보 처리방침")}</a> · <a href="/terms.html">{t("이용약관")}</a></p>
      <button style={{...actionButton,marginTop:16,border:"1px solid #e89b9b",background:"#fff0f0",color:"#a52222"}} onClick={()=>setConfirm(true)}>{t("모든 기기 데이터 삭제")}</button>
      {confirm&&<div role="alert"><p>{t("정말 삭제할까요? 되돌릴 수 없어요.")}</p><button onClick={()=>setConfirm(false)}>{t("취소")}</button><button onClick={async()=>{await cancelCheckIn();const lang=getLanguage();Object.keys(localStorage).filter(k=>k.startsWith("sweettalk:")).forEach(k=>localStorage.removeItem(k));setLanguage(lang);window.location.reload();}}>{t("삭제하기")}</button></div>}
      <p style={{marginTop:12}}><button style={{...actionButton,border:"none",background:grad,color:"white"}} onClick={()=>setOpen(false)}>{t("닫기")}</button></p>
    </div></div>}
  </>;
}
function PhraseBook() {
  const [phrases,setPhrases]=useState(readPhrases);
  const [revealed,setRevealed]=useState<Record<number,boolean>>({});
  return <section style={{margin:"16px 0"}}><h3>{t("저장한 표현 복습")}</h3>{!phrases.length&&<p>{t("대화에서 번역 옆 별 버튼으로 표현을 저장하세요.")}</p>}{phrases.map((p,i)=><div key={i} style={{borderTop:"1px solid #ddd",padding:"12px 0"}}><p>{p.text}</p>{revealed[i]&&<p>{p.translation}</p>}<button onClick={()=>setRevealed(v=>({...v,[i]:!v[i]}))}>{t("번역 확인")}</button><button onClick={()=>{const next=phrases.filter((_,j)=>j!==i);writePhrases(next);setPhrases(next);setRevealed({});}}>{t("삭제")}</button></div>)}</section>;
}
function ReportDialog({onClose,initialText=''}:{onClose:()=>void;initialText?:string}) {
  const [text,setText]=useState(initialText.slice(0,2000));
  const [copied,setCopied]=useState(false);
  return <div role="dialog" aria-modal="true" aria-label={t("신고 문의")} style={{position:"fixed",inset:0,zIndex:600,background:"#0006",display:"grid",placeItems:"center",padding:20}}><div style={{background:"white",borderRadius:16,padding:24,width:"100%",maxWidth:440}}>
    <h2>{t("신고 문의")}</h2><p>{t("신고 내용을 복사한 뒤 아래 지원 페이지에서 문의할 수 있습니다.")}</p>
    <textarea aria-label={t("신고 문의")} value={text} onChange={e=>setText(e.target.value.slice(0,2000))} style={{width:"100%",height:120}}/>
    <button onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCopied(false);}}}>{t("복사")}{copied?" ✓":""}</button>
    <p><a href={`mailto:${SUPPORT_EMAIL}?subject=SweetTalk%20report&body=${encodeURIComponent(text)}`}>{t("문의하기")}</a></p><p>{SUPPORT_EMAIL}</p><p><a href="/support.html">{t("신고 문의")}</a></p><button onClick={onClose}>{t("닫기")}</button>
  </div></div>;
}

// ── ConsentGate — 최초 1회 연령/고지 동의 화면 ──
function ConsentGate({onAgree}:{onAgree:()=>void}) {
  const [checked,setChecked]=useState(false);
  const [dataConsent,setDataConsent]=useState(false);
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:DEFAULT_FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{...glass,position:"relative",zIndex:1,borderRadius:20,padding:28,width:"100%",maxWidth:380}}>
        <div style={{fontWeight:700,fontSize:17,color:"#1a1a3e",marginBottom:14}}>{t("시작하기 전에 확인해주세요")}</div>
        <div style={{fontSize:13,color:"#4a4a6a",lineHeight:1.8,marginBottom:20}}>{t("SweetTalk의 대화 상대는 AI가 생성한 가상의 캐릭터이며, 실제 인간관계를 대체하지 않습니다.")}<br/>{t("본 서비스는 만 18세 이상만 이용할 수 있습니다.")}<br/>{t("AI 응답과 번역을 위해 대화 내용과 캐릭터 설정이 Cloudflare를 통해 DeepSeek에 전송됩니다. 입력한 위치는 날씨 조회를 위해 wttr.in에, 대화 맥락을 위해 DeepSeek에 전송됩니다. 민감한 개인정보는 입력하지 마세요.")}</div>
        <div style={{fontSize:13,marginBottom:16}}>
          <a href={PRIVACY_URL}>{t("개인정보 처리방침")}</a>
          {" · "}<a href={TERMS_URL}>{t("이용약관")}</a>
          {" · "}<a href={`mailto:${SUPPORT_EMAIL}`}>{t("문의하기")}</a>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#333",marginBottom:20,cursor:"pointer"}}>
          <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t("위 내용을 확인했으며 만 18세 이상입니다")}</label>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#333",marginBottom:20,cursor:"pointer"}}>
          <input type="checkbox" checked={dataConsent} onChange={e=>setDataConsent(e.target.checked)}/>{t("위 데이터의 외부 서비스 전송에 동의합니다")}</label>
        <button onClick={onAgree} disabled={!checked || !dataConsent} style={{width:"100%",padding:"14px 0",borderRadius:14,border:"none",background:checked && dataConsent?grad:"#ccc",color:"#fff",fontSize:15,cursor:checked && dataConsent?"pointer":"default",fontWeight:700}}>{t("동의하고 시작하기")}</button>
      </div>
    </div>
  );
}

// ── Landing ──
function Landing({onStart}:{onStart:()=>void}) {
  const features = [
    {icon:"💬",title:"AI 연인 채팅",text:"이름, 성격, 말투, 관심사까지\n설정하여 나만의 연인과 대화"},
    {icon:"🔤",title:"실시간 영어 번역",text:"상대방의 메시지를 바로\n자연스러운 영어로 번역"},
    {icon:"⭐",title:"다른 표현 2가지",text:"같은 의미의 다양한 표현으로\n영어 실력도 함께 향상"},
  ];
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:DEFAULT_FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
        <div style={{width:88,height:88,borderRadius:24,overflow:"hidden",boxShadow:"0 8px 32px rgba(106,143,255,0.35)",marginBottom:28}}>
          <img src={ICON_URL} alt="SweetTalk" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <div style={{fontSize:36,fontWeight:800,color:"#1a1a2e",letterSpacing:-1,marginBottom:8,textAlign:"center"}}>SweetTalk</div>
        <div style={{fontSize:18,color:"#4a4a8a",marginBottom:8,textAlign:"center"}}>{t("AI 연인 채팅 + 영어 번역")}</div>
        <div style={{fontSize:14,color:"#6666aa",marginBottom:44,textAlign:"center"}}>{t("설레는 대화, 자연스러운 영어로")}</div>
        <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,marginBottom:44}}>
          {features.map(f=>(
            <div key={t(f.title)} style={{...glass,borderRadius:16,padding:"16px 18px",display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{f.icon}</div>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e",marginBottom:3}}>{f.icon==='⭐'?copy('표현 저장과 복습','Save and practice phrases','表現を保存・復習','保存和复习表达'):t(f.title)}</div>
                <div style={{fontSize:12.5,color:"#6666aa",lineHeight:1.6,whiteSpace:"pre-line"}}>{f.icon==='⭐'?copy('대체 표현 1가지와 저장한 표현 다시 쓰기','One alternative expression and saved-phrase practice','別の表現を1つ・保存した表現の練習','一种替代表达和已保存表达练习'):f.icon==='🔤'?copy('영어 대화는 한국어로, 그 외 언어는 영어로 번역','English chats translate to Korean; other languages to English','英語は韓国語に、他の言語は英語に翻訳','英语译为韩语，其他语言译为英语'):t(f.text)}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onStart} style={{width:"100%",maxWidth:340,padding:"16px 0",borderRadius:16,border:"none",background:grad,color:"#fff",fontSize:17,cursor:"pointer"}}>{t("시작하기")}</button>
        <div style={{marginTop:20,fontSize:13,color:"#7777bb",textAlign:"center",lineHeight:1.8}}>{t("설레는 대화로")}<br/>{t("영어 실력이 자라요")}</div>
      </div>
    </div>
  );
}

// ── PersonaList ──
function PersonaList({personas,activeId,onSelect,onCreate,onBack,onDelete,onExport,onImport,showBackupReminder}:{personas:Persona[];activeId:string|null;onSelect:(id:string)=>void;onCreate:()=>void;onBack:()=>void;onDelete:(id:string)=>void;onExport:()=>void;onImport:(file:File)=>void;showBackupReminder:boolean}) {
  const [confirmId,setConfirmId]=useState<string|null>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);
  return (
    <div style={{...BG,maxWidth:500,margin:"0 auto",fontFamily:DEFAULT_FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,borderBottom:"1px solid rgba(255,255,255,0.4)",padding:"16px 18px 12px",paddingTop:"calc(16px + env(safe-area-inset-top, 0px))",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:1}}>
        <div style={{fontWeight:700,fontSize:18,color:"#1a1a3e"}}>{t("연인 목록")}</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"none",border:"none",fontSize:13,color:"#7777bb",cursor:"pointer",fontWeight:600}}>{t("처음으로")}</button>
        </div>
      </div>
      {showBackupReminder&&(
        <div style={{background:"#fff3cd",color:"#8a6d1f",fontSize:12,textAlign:"center",padding:"8px 12px",position:"relative",zIndex:1}}>{t("대화는 이 기기에만 저장돼요. 앱 삭제·기기 변경 전에 백업 내보내기로 저장해두세요.")}</div>
      )}
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,position:"relative",zIndex:1}}>
        {personas.map(p=>(
          <div key={p.id} style={{...glass,borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,border:`2px solid ${p.id===activeId?"#6a8fff":"rgba(255,255,255,0.5)"}`}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div
                onClick={()=>onSelect(p.id)}
                role="button"
                tabIndex={0}
                aria-label={`${p.name} · ${t("메시지")}`}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(p.id);}}}
                style={{display:"flex",alignItems:"center",gap:14,flex:1,cursor:"pointer"}}
              >
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:18,color:"#6a8fff",flexShrink:0}}>{p.name[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e"}}>{p.name} <span style={{fontWeight:400,fontSize:12,color:"#8888bb"}}>{p.age}{t("세")}</span></div>
                  <div style={{fontSize:12,color:"#8888bb",marginTop:2}}>{t(p.gender)} · {t(p.personality)} · {t(p.interest)}</div>
                  <div style={{fontSize:11,color:"#aaaacc",marginTop:3}}>{p.messages.length>0?`${p.messages.length} ${t("메시지")}`:t("대화 없음")}</div>
                </div>
                {p.id===activeId&&<div style={{fontSize:12,color:"#6a8fff",fontWeight:600}}>{t("대화 중")}</div>}
              </div>
              {confirmId!==p.id&&(
                <button
                  onClick={()=>setConfirmId(p.id)}
                  aria-label={`${p.name} · ${t("삭제")}`}
                  style={{background:"none",border:"none",fontSize:18,color:"#ccc",cursor:"pointer",padding:"4px 6px",flexShrink:0}}
                >🗑️</button>
              )}
            </div>
            {confirmId===p.id&&(
              <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.06)"}}>
                <div style={{flex:1,fontSize:12.5,color:"#e05555"}}>{p.name}{t("와의 대화를 삭제할까요?")}</div>
                <button onClick={()=>setConfirmId(null)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:12,color:"#666"}}>{t("취소")}</button>
                <button onClick={()=>{onDelete(p.id);setConfirmId(null);}} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#e05555",cursor:"pointer",fontSize:12,color:"#fff",fontWeight:600}}>{t("삭제")}</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={onCreate} style={{padding:"14px 0",borderRadius:14,border:"2px dashed rgba(106,143,255,0.4)",background:"rgba(255,255,255,0.35)",cursor:"pointer",fontSize:15,color:"#7777bb",fontWeight:600}}>{t("+ 새 연인 추가")}</button>
        {personas.length===0&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:"#9999cc"}}>
            <div style={{fontSize:32,marginBottom:10}}>💌</div>
            <div style={{fontSize:14,lineHeight:1.7}}>{t("아직 만든 연인이 없어요")}<br/>{t("위 버튼을 눌러 첫 연인을 만들어보세요")}</div>
          </div>
        )}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onExport} disabled={personas.length===0} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:personas.length===0?"default":"pointer",fontSize:13,color:personas.length===0?"#bbb":"#6a6aaa"}}>{t("백업 내보내기")}</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) onImport(f); e.target.value="";}}/>
          <button onClick={()=>fileInputRef.current?.click()} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:13,color:"#6a6aaa"}}>{t("백업 가져오기")}</button>
        </div>
      </div>
    </div>
  );
}

// ── SetupWizard ──
function SetupWizard({onDone,onCancel}:{onDone:(p:Omit<Persona,"id"|"messages">)=>void;onCancel:()=>void}) {
  const [step,setStep]=useState(0);
  const [draft,setDraft]=useState<Record<string,string>>({});
  const [txt,setTxt]=useState("");
  const [confirmCancel,setConfirmCancel]=useState(false);
  const opts = STEP_OPTS[step];
  const curVal = draft[STEP_KEYS[step]];
  const btnSt: CSSProperties = {width:"100%",padding:"13px 0",borderRadius:12,border:"none",background:grad,color:"#fff",fontSize:16,cursor:"pointer"};
  function handleCancel() {
    const hasProgress = Object.keys(draft).length>0 || txt.trim().length>0;
    if(hasProgress && !confirmCancel){ setConfirmCancel(true); return; }
    onCancel();
  }
  function goNext() {
    const key=STEP_KEYS[step];
    const val=opts?draft[key]:txt.trim();
    if(!val) return;
    if(key==="age" && (!/^[0-9]{1,2}$/.test(val) || Number(val)<18)) { window.alert(t("캐릭터 나이는 18~99세로 입력해주세요.")); return; }
    const nd={...draft,[key]:val}; setDraft(nd); setTxt("");
    if(step<5) setStep(s=>s+1);
    else onDone({gender:nd.gender,name:nd.name,age:nd.age,personality:nd.personality,tone:nd.tone,interest:nd.interest});
  }
  return (
    <div style={{...BG,display:"flex",alignItems:"center",justifyContent:"center",padding:24,paddingTop:"calc(24px + env(safe-area-inset-top, 0px))",fontFamily:DEFAULT_FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,width:"100%",maxWidth:420,borderRadius:20,padding:32,position:"relative",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,color:"#9999cc"}}>{step+1} / 6</span>
          {!confirmCancel ? (
            <button onClick={handleCancel} style={{background:"none",border:"none",color:"#9999cc",cursor:"pointer",fontSize:13}}>{t("취소")}</button>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#e05555"}}>{t("정말 취소할까요?")}</span>
              <button onClick={()=>setConfirmCancel(false)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",color:"#666",cursor:"pointer"}}>{t("아니오")}</button>
              <button onClick={onCancel} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"none",background:"#e05555",color:"#fff",cursor:"pointer"}}>{t("예")}</button>
            </div>
          )}
        </div>
        <div style={{height:4,background:"rgba(106,143,255,0.15)",borderRadius:4,marginBottom:24}}>
          <div style={{width:`${((step+1)/6)*100}%`,height:"100%",background:grad,borderRadius:4,transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e",marginBottom:24}}>{t(STEP_Q[step])}</div>
        {opts?(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {opts.map((o:string)=>(
                <button key={t(o)} onClick={()=>setDraft(d=>({...d,[STEP_KEYS[step]]:o}))}
                  style={{padding:"12px 18px",borderRadius:10,border:`1.5px solid ${curVal===o?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:curVal===o?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",textAlign:"left",fontSize:15,color:curVal===o?"#3a5fff":"#333"}}>{t(o)}</button>
              ))}
            </div>
            {curVal&&<button onClick={goNext} style={btnSt}>{step===5?t("완료"):t("다음")}</button>}
          </>
        ):(
          <>
            <input autoFocus value={txt} onChange={e=>{
                const key = STEP_KEYS[step];
                const v = key==="age" ? e.target.value.replace(/[^0-9]/g,"").slice(0,2) : e.target.value;
                setTxt(v);
              }} onKeyDown={e=>e.key==="Enter"&&goNext()}
              inputMode={STEP_KEYS[step]==="age" ? "numeric" : "text"}
              placeholder={t(STEP_PH[step]??"")} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:15,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box"}}/>
            <button onClick={goNext} disabled={!txt.trim()} style={{...btnSt,background:txt.trim()?grad:"#ccc",cursor:txt.trim()?"pointer":"default"}}>{step===5?t("완료"):t("다음")}</button>
          </>
        )}
        {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{marginTop:16,background:"none",border:"none",color:"#9999cc",fontSize:13,cursor:"pointer"}}>{t("이전으로")}</button>}
      </div>
    </div>
  );
}

// ── EditModal ──
function EditModal({profile,onSave,onClose}:{profile:Persona;onSave:(p:Persona)=>void;onClose:()=>void}) {
  const [p,setP]=useState<Persona>({...profile});
  const [name,setName]=useState(profile.name);
  const [age,setAge]=useState(profile.age);
  const chip=(v:string,cur:string):CSSProperties=>({padding:"8px 12px",borderRadius:8,border:`1.5px solid ${v===cur?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:v===cur?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:13,color:v===cur?"#3a5fff":"#333",fontWeight:v===cur?600:400});
  const inp: CSSProperties = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:14,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box"};
  const lbl: CSSProperties = {fontSize:12,fontWeight:600,color:"#7777aa",marginBottom:8,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"rgba(240,244,255,0.97)",backdropFilter:"blur(20px)",borderRadius:20,width:"100%",maxWidth:420,maxHeight:"88vh",overflowY:"auto",padding:24,fontFamily:DEFAULT_FONT_FAMILY}}>
        <div style={{fontWeight:700,fontSize:17,marginBottom:20,color:"#1a1a3e"}}>{t("페르소나 편집")}</div>
        {([[t("성별"),["여자친구","남자친구"],"gender"],[t("성격"),PERSONALITY_OPTS,"personality"],[t("말투"),TONE_OPTS,"tone"],[t("관심사"),INTEREST_OPTS,"interest"]] as [string,string[],keyof Persona][]).map(([label,opts,key])=>(
          <div key={key}>
            <span style={lbl}>{t(label)}</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {opts.map((o:string)=><button key={t(o)} style={chip(o,p[key] as string)} onClick={()=>setP(prev=>({...prev,[key]:o}))}>{t(o)}</button>)}
            </div>
          </div>
        ))}
        <span style={lbl}>{t("이름")}</span><input value={name} onChange={e=>setName(e.target.value)} style={inp}/>
        <span style={lbl}>{t("나이")}</span><input value={age} onChange={e=>setAge(e.target.value)} style={inp}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,color:"#666"}}>{t("취소")}</button>
          <button onClick={()=>{ if(!/^[0-9]{1,2}$/.test(age.trim()) || Number(age)<18) { window.alert(t("캐릭터 나이는 18~99세로 입력해주세요.")); return; } onSave({...p,name:name.trim()||p.name,age:age.trim()}); }} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:grad,cursor:"pointer",fontSize:14,color:"#fff",fontWeight:700}}>{t("저장")}</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsTab ──
function SettingsTab({friend,fontSize,setFontSize,fontFamily,setFontFamily,location,setLocation,onClearChat,onClose,onRevokeConsent}:{friend:Persona;fontSize:number;setFontSize:(f:number|((n:number)=>number))=>void;fontFamily:string;setFontFamily:(f:string)=>void;location:string;setLocation:(l:string)=>void;onClearChat:()=>void;onClose:()=>void;onRevokeConsent:()=>void}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [checkInOn,setCheckInOn]=useState(checkInEnabled);
  const [checkInBusy,setCheckInBusy]=useState(false);
  const [checkInError,setCheckInError]=useState("");
  async function toggleCheckIn() {
    setCheckInBusy(true); setCheckInError("");
    try { await setCheckInEnabled(!checkInOn,friend); setCheckInOn(!checkInOn); }
    catch (error) { setCheckInError(error instanceof Error ? error.message : "알림 설정에 실패했어요."); }
    finally { setCheckInBusy(false); }
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",padding:28,paddingBottom:36,fontFamily}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e"}}>{t("환경설정")}</div>
          <button onClick={onClose} aria-label={t("닫기")} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>
        <LanguageControls/><PhraseBook/>
        <div style={{fontSize:13,lineHeight:1.8,marginBottom:20}}>
          <a href={PRIVACY_URL}>{t("개인정보 처리방침")}</a>
          {" · "}<a href={TERMS_URL}>{t("이용약관")}</a>
          {" · "}<a href={`mailto:${SUPPORT_EMAIL}`}>{t("문의하기")}</a><br/>
          <button onClick={onRevokeConsent} style={{marginTop:8,padding:"8px 12px",cursor:"pointer"}}>{t("외부 데이터 전송 동의 철회")}</button>
        </div>
        <div style={{marginBottom:24}}>
          <label style={{display:"flex",gap:10,alignItems:"center"}}>
            <input type="checkbox" checked={checkInOn} disabled={checkInBusy} onChange={()=>void toggleCheckIn()}/>{t("4일 동안 대화가 없으면 안부 메시지 받기")}</label>
          <div style={{fontSize:12,color:"#777",marginTop:6}}>{t("마지막으로 대화한 친구가 한 번만 안부를 보내요. 새 대화를 보내면 4일을 다시 계산해요.")}</div>
          {checkInError&&<div role="alert" style={{fontSize:13,color:"#b33",marginTop:6}}>{t(checkInError)}</div>}
        </div>
        {/* 사용자 위치 설정 */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{t("내 위치 설정 (현실적인 대화를 위해)")}</div>
          <input
            value={location}
            onChange={e=>setLocation(e.target.value)}
            placeholder={t("예: 서울 강남구, 제주도...")}
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:15,outline:"none",background:"#fafaff",fontFamily,boxSizing:"border-box"}}
          />
          <div style={{fontSize:12,color:"#aaa",marginTop:6}}>{t("위치를 입력하면 AI가 시간과 장소에 맞는 대화를 해줘요.")}</div>
        </div>
        {/* 폰트 선택 */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{t("글꼴")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {FONT_OPTIONS.map(f=>(
              <button key={f.value} onClick={()=>setFontFamily(f.value)}
                style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${fontFamily===f.value?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:fontFamily===f.value?"rgba(106,143,255,0.1)":"#fafaff",cursor:"pointer",textAlign:"left",fontFamily:f.value,fontSize:16,color:fontFamily===f.value?"#3a5fff":"#333"}}>
                {t(f.label)}
              </button>
            ))}
          </div>
        </div>
        {/* 글자 크기 */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{t("글자 크기")}</div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <button onClick={()=>setFontSize((s:number)=>Math.max(12,s-1))} aria-label={t("글자 크기 줄이기")} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:fontSize,color:"#333",lineHeight:1.6,fontFamily}}>{t("안녕, 오늘 어때? Hi there!")}</div>
              <div style={{fontSize:12,color:"#aaa",marginTop:4}}>{fontSize}px</div>
            </div>
            <button onClick={()=>setFontSize((s:number)=>Math.min(24,s+1))} aria-label={t("글자 크기 늘리기")} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
          </div>
          <input type="range" min={12} max={24} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{width:"100%",marginTop:12,accentColor:"#6a8fff"} as CSSProperties}/>
          <button onClick={()=>setFontSize(DEFAULT_FONT_SIZE)} style={{marginTop:8,background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",fontFamily}}>{t("기본값으로 초기화 (")}{DEFAULT_FONT_SIZE}px)</button>
        </div>
        {/* 채팅 삭제 — 2단계 확인 (window.confirm 미사용) */}
        <div style={{borderTop:"1px solid #f0f0f0",paddingTop:20}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:12}}>{t("대화 관리")}</div>
          {!confirmDelete ? (
            <button
              onClick={()=>setConfirmDelete(true)}
              style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #ffaaaa",background:"#fff5f5",cursor:"pointer",fontSize:14,color:"#e05555",fontFamily,fontWeight:600}}>{t("대화 내용 전체 삭제")}</button>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:13,color:"#e05555",textAlign:"center",marginBottom:2}}>{t("정말 삭제할까요? 되돌릴 수 없어요.")}</div>
              <div style={{display:"flex",gap:8}}>
                <button
                  onClick={()=>setConfirmDelete(false)}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #ddd",background:"#f5f5f5",cursor:"pointer",fontSize:14,color:"#666",fontFamily}}>{t("취소")}</button>
                <button
                  onClick={()=>{
                    onClearChat();
                    setConfirmDelete(false);
                    onClose();
                  }}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#e05555",cursor:"pointer",fontSize:14,color:"#fff",fontFamily,fontWeight:700}}>{t("삭제하기")}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat ──
function Chat({persona,onBack,updatePersona,onRevokeConsent}:{persona:Persona;onBack:()=>void;onRevokeConsent:()=>void;updatePersona:(id:string,fn:(p:Persona)=>Persona)=>void}) {
  const [practiceOpen,setPracticeOpen]=useState(false);
  const [aiLoading,setAiLoading]=useState(false);
  const [input,setInput]=useState("");
  const [showEdit,setShowEdit]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [reportOpen,setReportOpen]=useState(false);
  const [reportText,setReportText]=useState('');
  const [hiddenReplies,setHiddenReplies]=useState<Set<number>>(new Set());
  const [fontSize,setFontSize]=useState(DEFAULT_FONT_SIZE);
  const [fontFamily,setFontFamily]=useState(DEFAULT_FONT_FAMILY);
  const [location,setLocation]=useState("");
  const [weather,setWeather]=useState("");
  const bottomRef=useRef<HTMLDivElement>(null);
  const personaRef=useRef<Persona>(persona);
  const locationRef=useRef<string>(location);
  const weatherRef=useRef<string>(weather);
  const [isOnline,setIsOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
  const [justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{personaRef.current=persona;},[persona]);
  useEffect(()=>{locationRef.current=location;},[location]);
  useEffect(()=>{weatherRef.current=weather;},[weather]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[persona.messages,aiLoading]);
  useEffect(()=>{ globalFontSize = fontSize; },[fontSize]);
  useEffect(()=>{ globalFontFamily = fontFamily; },[fontFamily]);
  useEffect(()=>{
    storageGet(LOCATION_KEY, false).then(r => {
      if(r) {
        setLocation(r.value);
        fetchWeather(r.value).then(setWeather);
      }
    });
  }, []);
  const saveLocation = (loc: string) => {
    locationRef.current = loc;
    weatherRef.current = "";
    setWeather("");
    setLocation(loc);
    storageSet(LOCATION_KEY, loc, false);
    fetchWeather(loc).then(setWeather);
  };
  useEffect(()=>{
    const goOnline=()=>{ setIsOnline(true); setJustReconnected(true); setTimeout(()=>setJustReconnected(false),3000); };
    const goOffline=()=>setIsOnline(false);
    window.addEventListener("online",goOnline);
    window.addEventListener("offline",goOffline);
    return ()=>{ window.removeEventListener("online",goOnline); window.removeEventListener("offline",goOffline); };
  },[]);

  const genReply=useCallback((msgs: Message[])=>{
    const p=personaRef.current;
    if(typeof navigator!=="undefined" && !navigator.onLine){
      updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:"(오프라인 상태예요. 네트워크 연결 후 다시 시도해주세요)",translation:"",alternatives:[]}]}));
      return;
    }
    setAiLoading(true);
    const history: ClaudeMsg[]=msgs.map(m=>({role:m.role==="ai"?"assistant":"user",content:m.text}));
    const replyLocation = locationRef.current;
    return fetchWeather(replyLocation).then(latestWeather => {
      if (locationRef.current === replyLocation) { weatherRef.current = latestWeather; setWeather(latestWeather); }
      return callDeepseek(buildSystem(p, replyLocation, latestWeather),history);
    })
      .then(raw=>{
        const reply=raw.trim();
        if(!reply){
          setAiLoading(false);
          updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:"(응답을 받지 못했어요. 다시 시도해주세요)",translation:"",alternatives:[]}]}));
          return;
        }
        return translateWithAlts(reply).then(trans=>{
          updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:reply,translation:trans.translation,alternatives:trans.alternatives}]}));
          setAiLoading(false);
        });
      }).catch(err=>{
        setAiLoading(false);
        const msg = err?.name === "AbortError" ? "(응답 시간이 초과됐어요. 다시 시도해주세요)" : err?.message?.startsWith("API_ERROR:") ? `(${t(err.message.slice(10).replace(/ \(HTTP \d{3}\)$/, ""))}${err.message.match(/ \(HTTP \d{3}\)$/)?.[0] || ""})` : "(연결에 실패했어요. 잠시 후 다시 시도해주세요)";
        updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:msg,translation:"",alternatives:[]}]}));
      });
  },[updatePersona]);

  useEffect(()=>{
    if(persona.messages.length===0&&!aiLoading){
      setAiLoading(true);
      // 첫 인사 시에도 위치와 날씨 반영 시도
      const tryGreeting = async () => {
        let loc = locationRef.current;
        let w = weatherRef.current;

        // 만약 아직 로딩 전이라면 한번 더 확인
        if(!loc) {
          const r = await storageGet(LOCATION_KEY, false);
          if(r) {
            loc = r.value;
            w = await fetchWeather(loc);
          }
        }

        callDeepseek(buildSystem(persona, loc, w),[{role:"user",content:`Introduce yourself briefly in ${languageName()}.`}])
          .then(raw=>{
            const reply=raw.trim(); if(!reply){setAiLoading(false);return;}
            return translateWithAlts(reply).then(trans=>{
              updatePersona(persona.id,p=>({...p,messages:[{role:"ai",text:reply,translation:trans.translation,alternatives:trans.alternatives}]}));
              setAiLoading(false);
            });
          }).catch(()=>setAiLoading(false));
      };
      tryGreeting();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[persona.id]);

  const sendingRef = useRef(false);
  const requestTimestampsRef = useRef<number[]>([]);
  const [rateLimitMsg,setRateLimitMsg] = useState("");
  const RATE_LIMIT_MAX = 15;
  const RATE_LIMIT_WINDOW_MS = 5*60*1000;
  const DAILY_MSG_MAX = 200; // 비용 급증 방지용 기기당 일일 상한
  const dailyCountRef = useRef<{date:string;count:number}>({date:"",count:0});
  useEffect(()=>{
    storageGet(DAILY_COUNT_KEY,false).then(r=>{
      if(r) { try { dailyCountRef.current = JSON.parse(r.value); } catch {} }
    });
  },[]);
  function checkRateLimit(): boolean {
    const now = Date.now();
    requestTimestampsRef.current = requestTimestampsRef.current.filter(t=>now-t<RATE_LIMIT_WINDOW_MS);
    if(requestTimestampsRef.current.length>=RATE_LIMIT_MAX) return false;
    requestTimestampsRef.current.push(now);
    return true;
  }
  function checkDailyLimit(): boolean {
    const today = new Date().toISOString().slice(0,10);
    if(dailyCountRef.current.date !== today) dailyCountRef.current = {date:today,count:0};
    if(dailyCountRef.current.count >= DAILY_MSG_MAX) return false;
    dailyCountRef.current = {...dailyCountRef.current, count: dailyCountRef.current.count+1};
    storageSet(DAILY_COUNT_KEY, JSON.stringify(dailyCountRef.current), false);
    return true;
  }
  function sendMessage() {
    if(!input.trim() || sendingRef.current || aiLoading) return;
    if(!checkRateLimit()){
      setRateLimitMsg("메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.");
      setTimeout(()=>setRateLimitMsg(""), 4000);
      return;
    }
    if(!checkDailyLimit()){
      setRateLimitMsg("오늘의 대화 한도에 도달했어요. 내일 다시 이용해주세요.");
      setTimeout(()=>setRateLimitMsg(""), 4000);
      return;
    }
    sendingRef.current = true;
    void recordCheckInActivity(personaRef.current).catch(()=>setRateLimitMsg("안부 알림을 예약하지 못했어요. 알림 권한을 확인해 주세요."));
    const text=input.trim().slice(0,500); setInput("");
    const userMsg: Message={role:"user",text,translation:"",alternatives:[]};
    const snapshot = [...personaRef.current.messages,userMsg];
    updatePersona(persona.id,p=>({...p,messages:snapshot}));
    const translation = translateWithAlts(text).then(trans=>{
      updatePersona(persona.id,p=>{
        const msgs=[...p.messages];
        const idx=snapshot.length-1;
        if(msgs[idx]?.role==="user" && msgs[idx].text===text) msgs[idx]={...msgs[idx],translation:trans.translation,alternatives:trans.alternatives};
        return{...p,messages:msgs};
      });
    });
    Promise.all([translation, genReply(snapshot)]).finally(()=>{ sendingRef.current=false; });
  }

  function clearChat() {
    updatePersona(persona.id, p => ({...p, messages: []}));
  }

  const FAILURE_TEXTS = new Set(["(오프라인 상태예요. 네트워크 연결 후 다시 시도해주세요)","(응답을 받지 못했어요. 다시 시도해주세요)","(연결에 실패했어요. 잠시 후 다시 시도해주세요)","(API 키가 유효하지 않아요. 설정에서 키를 다시 확인해주세요)","(응답 시간이 초과됐어요. 다시 시도해주세요)"]);
  function retryReply(msgIndex: number) {
    if(aiLoading || sendingRef.current) return;
    const p = personaRef.current;
    const before = p.messages.slice(0, msgIndex);
    updatePersona(persona.id, pr=>({...pr, messages: pr.messages.slice(0, msgIndex)}));
    setTimeout(()=>genReply(before),0);
  }

  function retryTranslate(msgIndex: number) {
    const p = personaRef.current;
    const msg = p.messages[msgIndex];
    if (!msg) return;
    // 캐시를 건너뛰고 강제로 재번역
    translateWithAlts(msg.text, true).then(trans=>{
      updatePersona(persona.id, pr=>{
        const msgs=[...pr.messages];
        if(msgs[msgIndex]) msgs[msgIndex]={...msgs[msgIndex],translation:trans.translation,alternatives:trans.alternatives};
        return {...pr, messages: msgs};
      });
    });
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#f0f2f5",maxWidth:500,margin:"0 auto",fontFamily}}>
      {showEdit&&<EditModal profile={persona} onSave={p=>{updatePersona(persona.id,()=>p);setShowEdit(false);}} onClose={()=>setShowEdit(false)}/>}
      {showSettings&&<SettingsTab friend={persona} fontSize={fontSize} setFontSize={setFontSize} fontFamily={fontFamily} setFontFamily={setFontFamily} location={location} setLocation={saveLocation} onClearChat={clearChat} onRevokeConsent={onRevokeConsent} onClose={()=>setShowSettings(false)}/>}
      {/* Header — 고정 */}
      <div style={{
        background:"#fff",
        borderBottom:"1px solid #eee",
        padding:"10px 14px",
        paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
        display:"flex",
        flexDirection: "column",
        gap: 8,
        flexShrink:0,
        position:"sticky",
        top:0,
        zIndex:20
      }}>
        {/* Top: App Title & Icon */}
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap: 8}}>
           <img src={ICON_URL} alt="SweetTalk" style={{width:20, height:20, borderRadius:5, objectFit:"cover"}}/>
           <div style={{fontSize:16, fontWeight:800, color:"#1a1a2e"}}>SweetTalk</div>
        </div>

        {/* Bottom: Partner Info */}
        <div style={{display:"flex", alignItems:"center", gap: 10}}>
          <button onClick={onBack} aria-label={t("뒤로가기")} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#555",padding:"0 4px"}}>‹</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#6a8fff"}}>{persona.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{persona.name} · AI</div>
            <div style={{fontSize:10,color:"#999"}}>{persona.age}{t("세 ·")}{t(persona.personality)}</div>
          </div>
          <button onClick={()=>setShowEdit(true)} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#555"}}>{t("편집")}</button>
          <button onClick={()=>setPracticeOpen(true)} style={{padding:10,minHeight:44,border:'1px solid #aaa',borderRadius:8,background:'#eef2ff'}}>{copy('연습','Practice','練習','练习')}</button>
          <button onClick={()=>setShowSettings(true)} aria-label={t("설정")} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:14,color:"#888"}}>⚙️</button>
        </div>
      </div>
      {practiceOpen&&<div role="dialog" aria-modal="true" aria-label={copy('연습','Practice','練習','练习')} style={{position:'fixed',inset:0,zIndex:450,background:'#0006',display:'grid',placeItems:'center',padding:16}}><div style={{background:'white',width:'100%',maxWidth:480,maxHeight:'85vh',overflow:'auto',borderRadius:16}}><button autoFocus onClick={()=>setPracticeOpen(false)} style={{padding:14,minHeight:44}}>{t('닫기')}</button><Practice onUse={text=>{setInput(text);setPracticeOpen(false);}}/></div></div>}
      {!isOnline&&(
        <div style={{background:"#fff3cd",color:"#8a6d1f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>{t("오프라인 상태입니다. 네트워크 연결을 확인해주세요.")}</div>
      )}
      {isOnline&&justReconnected&&(
        <div style={{background:"#e6f9ee",color:"#1f8a4f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>{t("다시 연결되었어요. 메시지를 보낼 수 있어요.")}</div>
      )}
      {reportOpen&&<ReportDialog initialText={reportText} onClose={()=>setReportOpen(false)}/>}
      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:14}}>
        {persona.messages.map((m,i)=>{
          const isMe=m.role==="user";
          if(!isMe&&hiddenReplies.has(i))return <div key={i}>{copy('숨긴 AI 응답','Hidden AI reply','非表示のAI応答','已隐藏的AI回复')} <button onClick={()=>setHiddenReplies(prev=>{const next=new Set(prev);next.delete(i);return next;})}>{copy('다시 표시','Show','表示','显示')}</button></div>;
          return (
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
              {!isMe&&<div style={{fontSize:11.5,fontWeight:600,color:"#777",marginBottom:3}}>{persona.name} · AI</div>}
              <div style={{maxWidth:"78%",background:isMe?"#4a9fff":"#fff",color:isMe?"#fff":"#111",borderRadius:isMe?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"10px 13px",fontSize:fontSize,lineHeight:1.6,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                {t(m.text)}
                {!isMe && <div style={{marginTop:6}}><button onClick={()=>{setReportText(m.text);setReportOpen(true);}} style={{fontSize:14,minHeight:44,padding:8}}>{t("응답 신고")}</button><button style={{fontSize:14,minHeight:44,padding:8}} onClick={()=>setHiddenReplies(prev=>new Set(prev).add(i))}>{copy('숨기기','Hide','非表示','隐藏')}</button></div>}
                {!isMe&&(FAILURE_TEXTS.has(m.text) || /\(HTTP \d{3}\)\)$/.test(m.text))&&(
                  <div style={{marginTop:6}}>
                    <button onClick={()=>retryReply(i)} style={{fontSize:12,padding:"4px 10px",borderRadius:8,border:"1px solid #ddd",background:"#fafafa",color:"#555",cursor:"pointer"}}>{t("다시 시도")}</button>
                  </div>
                )}
                {m.translation&&<TransBlock text={m.text} translation={m.translation} alternatives={m.alternatives} isMe={isMe} onRetry={()=>retryTranslate(i)}/>}
              </div>
            </div>
          );
        })}
        {aiLoading&&(
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <div style={{fontSize:11.5,color:"#999",marginTop:2}}>{persona.name} · AI</div>
            <div style={{background:"#fff",borderRadius:"4px 16px 16px 16px",padding:"6px 12px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}><TypingDots/></div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {/* Input — 하단 고정 */}
      <div style={{
        background:"#fff",
        borderTop:"1px solid #eee",
        padding:"10px 14px",
        paddingBottom:"calc(10px + env(safe-area-inset-bottom, 0px))",
        display:"flex",
        gap:10,
        alignItems:"flex-end",
        flexShrink:0,
        position:"sticky",
        bottom:0,
        zIndex:10,
      }}>
        <textarea value={input} onChange={e=>setInput(e.target.value.slice(0,500))}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
          placeholder={`${persona.name} · ${t("메시지")}`} rows={1}
          style={{flex:1,border:"1.5px solid #ddd",borderRadius:12,padding:"10px 13px",fontSize:14,resize:"none",outline:"none",fontFamily,lineHeight:1.5,maxHeight:120,overflowY:"auto"}}/>
        <button onClick={sendMessage} disabled={!input.trim() || aiLoading} aria-label={t("전송")} style={{width:42,height:42,borderRadius:12,border:"none",background:input.trim()?"#4a9fff":"#ccc",cursor:input.trim()?"pointer":"default",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>↑</button>
      </div>
      {input.length>400&&(
        <div style={{textAlign:"right",padding:"0 14px 6px",fontSize:11,color:input.length>=500?"#e05555":"#aaa",background:"#fff"}}>{input.length}/500</div>
      )}
      {rateLimitMsg&&(
        <div style={{textAlign:"center",padding:"0 14px 8px",fontSize:12,color:"#e05555",background:"#fff"}}>{t(rateLimitMsg)}</div>
      )}
    </div>
  );
}

// ── App ──
export default function App() {
  useLanguage();
  const [screen,setScreen]=useState<"loading"|"consent"|"landing"|"list"|"setup"|"chat">("loading");
  const [personas,setPersonas]=useState<Persona[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [lastExportAt,setLastExportAt]=useState<number|null>(null);
  const currentPersonas=useRef(personas);
  currentPersonas.current=personas;
  useEffect(()=>{
    if(screen==="loading" || screen==="consent") return;
    const receive=async (open=false, targetId?:string)=>{
      const pending=await takeDueCheckIn();
      if(pending) setPersonas(prev=>prev.map(p=>p.id===pending.personaId ? {...p,messages:[...p.messages,{role:"ai",text:pending.text,translation:"",alternatives:[]}]} : p));
      const id=targetId || pending?.personaId;
      if(open && id && currentPersonas.current.some(p=>p.id===id)) navigate("chat",id);
    };
    const refresh=()=>{ if(document.visibilityState==="visible") void receive(); };
    const stop=listenForCheckIn((open,id)=>{void receive(open,id);});
    document.addEventListener("visibilitychange",refresh);
    const timer=setInterval(refresh,60000);
    void receive();
    return ()=>{stop();clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[screen==="loading",screen==="consent"]);
  const BACKUP_REMINDER_MS = 7*24*60*60*1000; // 7일

  useEffect(()=>{
    storageGet(LAST_EXPORT_KEY,false).then(r=>{ if(r) setLastExportAt(Number(r.value)||null); });
    loadPersonas().then(async saved=>{
      const initial = saved.length>0 ? "list" : "landing";
      if(saved.length>0) setPersonas(saved);
      const consent = (await storageGet(CONSENT_KEY, false))?.value === "1";
      let first: "consent"|"landing"|"list"|"chat" = consent ? initial : "consent";
      let firstActiveId: string|null = null;
      if(consent) {
        try {
          const lastRaw = await storageGet(LAST_SCREEN_KEY, false);
          if(lastRaw) {
            const last = JSON.parse(lastRaw.value) as {screen:string; activeId:string|null};
            if(last.screen==="chat" && last.activeId && saved.some(p=>p.id===last.activeId)) {
              first = "chat"; firstActiveId = last.activeId;
            } else if(last.screen==="list" && saved.length>0) {
              first = "list";
            }
          }
        } catch {}
      }
      window.history.replaceState({screen: first, activeId: firstActiveId}, "");
      setActiveId(firstActiveId);
      setScreen(first);
    });
  },[]);

  async function revokeConsent() {
    await cancelCheckIn();
    await storageSet(CONSENT_KEY, "", false);
    setWeatherEnabled(false);
    window.location.reload();
  }

  function agreeConsent() {
    storageSet(CONSENT_KEY, "1", false);
    navigate(personas.length>0 ? "list" : "landing");
  }

  // Android/WebView 뒤로가기 버튼 → history.back() 대응
  useEffect(()=>{
    function onPop(e: PopStateEvent) {
      const st = e.state as {screen:"loading"|"consent"|"landing"|"list"|"setup"|"chat"; activeId:string|null} | null;
      if(st){ setScreen(st.screen); setActiveId(st.activeId); }
    }
    window.addEventListener("popstate", onPop);
    return ()=>window.removeEventListener("popstate", onPop);
  },[]);

  useEffect(()=>{
    if(screen==="loading") return;
    savePersonas(personas);
  },[personas, screen]);

  // 화면 전환 + 히스토리 스택 기록 (뒤로가기 대상이 됨)
  function navigate(next:"loading"|"consent"|"landing"|"list"|"setup"|"chat", nextActiveId: string|null = activeId) {
    window.history.pushState({screen: next, activeId: nextActiveId}, "");
    setScreen(next); setActiveId(nextActiveId);
    if(next==="list" || next==="chat") {
      storageSet(LAST_SCREEN_KEY, JSON.stringify({screen: next, activeId: nextActiveId}), false);
    }
  }

  function updatePersona(id:string, fn:(p:Persona)=>Persona) {
    setPersonas(prev=>prev.map(p=>p.id===id?fn(p):p));
  }
  function deletePersona(id:string) {
    void cancelCheckIn(id);
    setPersonas(prev=>prev.filter(p=>p.id!==id));
    if(activeId===id) setActiveId(null);
  }
  function handleSetupDone(profile:Omit<Persona,"id"|"messages">) {
    const id=Date.now().toString();
    setPersonas(prev=>[...prev,{id,...profile,messages:[]}]);
    navigate("chat", id);
  }
  async function exportBackup() {
    try {
      await exportBackupFile(JSON.stringify({version:2,personas,phrases:readPhrases()},null,2));
      if(!window.confirm(copy('백업 파일을 저장했나요? 저장한 경우에만 확인하세요.','Did you save the backup file? Only confirm after saving it.','バックアップファイルを保存しましたか？保存後のみ確認してください。','备份文件已保存吗？请在保存后确认。')))return;
    const now = Date.now();
    setLastExportAt(now);
    storageSet(LAST_EXPORT_KEY, String(now), false);
    } catch(error) {
      if((error as Error)?.name==='AbortError')return;
      window.alert(copy('백업을 완료하지 못했어요. 다시 시도해주세요.','Backup was not completed. Please try again.','バックアップを完了できませんでした。再度お試しください。','备份未完成，请重试。'));
    }
  }
  function importBackup(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const imported = Array.isArray(parsed) ? parsed : parsed?.version===2 ? parsed.personas : null;
        const phrases = Array.isArray(parsed) ? [] : parsed.phrases;
        if(!isPersonaList(imported) || !validPhrases(phrases)) throw new Error("invalid format");
        writePhrases(phrases);
        setPersonas(imported as Persona[]);
      } catch {
        window.alert(t("백업 파일을 읽을 수 없어요. 형식을 확인해주세요."));
      }
    };
    reader.readAsText(file);
  }
  const active=personas.find(p=>p.id===activeId);

  const fl=<><FontLoader/>{["consent","landing"].includes(screen) && <FirstScreenSettings/>}</>;
  if(screen==="loading") return <>{fl}<div style={{minHeight:"100vh",background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DEFAULT_FONT_FAMILY}}><div style={{color:"#7777bb",fontSize:15}}>{t("SweetTalk 불러오는 중...")}</div></div></>;
  if(screen==="consent") return <>{fl}<ConsentGate onAgree={agreeConsent}/></>;
  if(screen==="landing") return <>{fl}<Landing onStart={()=>navigate("list")}/></>;
  if(screen==="list") {
    const hasHistory = personas.some(p=>p.messages.length>0);
    const showBackupReminder = hasHistory && (!lastExportAt || Date.now()-lastExportAt>BACKUP_REMINDER_MS);
    return <>{fl}<PersonaList personas={personas} activeId={activeId} onSelect={id=>navigate("chat",id)} onCreate={()=>navigate("setup")} onBack={()=>navigate("landing")} onDelete={deletePersona} onExport={exportBackup} onImport={importBackup} showBackupReminder={showBackupReminder}/></>;
  }
  if(screen==="setup") return <>{fl}<SetupWizard onDone={handleSetupDone} onCancel={()=>navigate(personas.length>0?"list":"landing")}/></>;
  if(screen==="chat"&&active) return <>{fl}<Chat persona={active} onBack={()=>navigate("list")} updatePersona={updatePersona} onRevokeConsent={revokeConsent}/></>;
  return null;
}
