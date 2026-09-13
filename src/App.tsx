import { useState, useRef, useEffect, useCallback, CSSProperties } from "react";

// ── Type definitions ──
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

// ── Constants ──
const FONT_OPTIONS: {label:string; value:string}[] = [
  {label:"Jua (둥글고 귀여운)", value:"'Jua','Apple SD Gothic Neo',sans-serif"},
  {label:"Noto Sans KR (깔끔 가독성)", value:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif"},
  {label:"Nanum Gothic (단정함)", value:"'Nanum Gothic','Apple SD Gothic Neo',sans-serif"},
  {label:"Gamja Flower (손글씨 감성)", value:"'Gamja Flower','Apple SD Gothic Neo',sans-serif"},
];
const FONT_LABELS: Record<AppLanguage, string[]> = {
  ko:["Jua (둥글고 귀여운)","Noto Sans KR (깔끔 가독성)","Nanum Gothic (단정함)","Gamja Flower (손글씨 감성)"],
  en:["Jua (Rounded and cute)","Noto Sans KR (Clean and readable)","Nanum Gothic (Neat)","Gamja Flower (Handwritten)"],
  ja:["Jua（丸くてかわいい）","Noto Sans KR（読みやすい）","Nanum Gothic（端正）","Gamja Flower（手書き風）"],
  "zh-CN":["Jua（圆润可爱）","Noto Sans KR（清晰易读）","Nanum Gothic（整洁）","Gamja Flower（手写风格）"]
};
const DEFAULT_FONT_FAMILY = FONT_OPTIONS[1].value; // Default Noto Sans KR
const ICON_URL = "/SweetTalk.jpg"; // Local bundle — works offline
const STORAGE_KEY = "personas_v1";
const CONSENT_KEY = "consent_v2";
const LAST_SCREEN_KEY = "last_screen_v1";
const LAST_EXPORT_KEY = "last_export_v1";
const DAILY_COUNT_KEY = "daily_msg_count_v1";
const LOCATION_KEY = "user_location_v1";
const LANGUAGE_KEY = "app_language_v1";
type AppLanguage = "ko" | "en" | "ja" | "zh-CN";
const LANGUAGE_OPTIONS: {value:AppLanguage; label:string}[] = [
  {value:"ko", label:"한국어"}, {value:"en", label:"English"},
  {value:"ja", label:"日本語"}, {value:"zh-CN", label:"简体中文"}
];
const UI_TEXT: Record<AppLanguage, Record<string,string>> = {
  ko:{settings:"환경설정",language:"언어",location:"내 위치 설정",locationHint:"위치를 입력하면 시간과 장소에 맞는 대화를 해줘요.",font:"글꼴",size:"글자 크기",manage:"대화 관리",retry:"다시 시도",delete:"삭제",sendPlaceholder:"메시지 보내기...",consentTitle:"시작하기 전에 확인해주세요",agree:"동의하고 시작하기",start:"시작하기",tagline:"친구와 나누는 대화, 자연스러운 언어 연습",list:"대화 상대 목록",back:"처음으로",add:"+ 새 대화 상대 추가",empty:"아직 대화 상대가 없어요",export:"백업 내보내기",import:"백업 가져오기",next:"다음",done:"완료",cancel:"취소",previous:"이전으로",edit:"대화 상대 편집",name:"이름",age:"나이",save:"저장",offline:"오프라인 상태입니다. 네트워크 연결을 확인해주세요.",reconnected:"다시 연결되었어요. 메시지를 보낼 수 있어요.",tooFast:"메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.",dailyLimit:"오늘의 대화 한도에 도달했어요. 내일 다시 이용해주세요.",translationFailed:"번역에 실패했어요",translation:"영어 번역",alternative:"다른 표현"},
  en:{settings:"Settings",language:"Language",location:"Your location",locationHint:"Add a location for time and place-aware conversations.",font:"Font",size:"Text size",manage:"Conversation",retry:"Retry",delete:"Delete",sendPlaceholder:"Send a message...",consentTitle:"Before you start",agree:"Agree and continue",start:"Get started",tagline:"Friendly conversations and natural language practice",list:"Conversation partners",back:"Home",add:"+ Add a conversation partner",empty:"No conversation partners yet",export:"Export backup",import:"Import backup",next:"Next",done:"Done",cancel:"Cancel",previous:"Back",edit:"Edit conversation partner",name:"Name",age:"Age",save:"Save",offline:"You are offline. Check your network connection.",reconnected:"You are back online.",tooFast:"You are sending messages too quickly. Try again shortly.",dailyLimit:"You have reached today's conversation limit. Try again tomorrow.",translationFailed:"Translation failed",translation:"Translation",alternative:"Alternative"},
  ja:{settings:"設定",language:"言語",location:"現在地",locationHint:"場所を入力すると、時間や場所に合った会話ができます。",font:"フォント",size:"文字サイズ",manage:"会話管理",retry:"再試行",delete:"削除",sendPlaceholder:"メッセージを送信...",consentTitle:"始める前にご確認ください",agree:"同意して始める",start:"始める",tagline:"友だちとの会話で自然な言語練習",list:"会話相手一覧",back:"最初へ",add:"+ 会話相手を追加",empty:"会話相手はまだいません",export:"バックアップをエクスポート",import:"バックアップをインポート",next:"次へ",done:"完了",cancel:"キャンセル",previous:"戻る",edit:"会話相手を編集",name:"名前",age:"年齢",save:"保存",offline:"オフラインです。ネットワークを確認してください。",reconnected:"接続が戻りました。",tooFast:"送信が速すぎます。少し待って再試行してください。",dailyLimit:"本日の会話上限に達しました。明日もう一度お試しください。",translationFailed:"翻訳に失敗しました",translation:"翻訳",alternative:"別の表現"},
  "zh-CN":{settings:"设置",language:"语言",location:"我的位置",locationHint:"输入位置后，AI 会结合时间和地点进行对话。",font:"字体",size:"文字大小",manage:"对话管理",retry:"重试",delete:"删除",sendPlaceholder:"发送消息...",consentTitle:"开始前请确认",agree:"同意并开始",start:"开始使用",tagline:"通过友好对话练习自然语言",list:"对话伙伴列表",back:"首页",add:"+ 添加对话伙伴",empty:"还没有对话伙伴",export:"导出备份",import:"导入备份",next:"下一步",done:"完成",cancel:"取消",previous:"返回",edit:"编辑对话伙伴",name:"姓名",age:"年龄",save:"保存",offline:"当前处于离线状态，请检查网络。",reconnected:"网络已恢复。",tooFast:"发送消息过于频繁，请稍后再试。",dailyLimit:"已达到今日对话上限，请明天再试。",translationFailed:"翻译失败",translation:"翻译",alternative:"其他表达"}
};
const DEFAULT_FONT_SIZE = 17;
const grad = "linear-gradient(135deg,#6a8fff,#a56bff)";
const glass: CSSProperties = { background:"rgba(255,255,255,0.65)", backdropFilter:"blur(16px)" };
const BG: CSSProperties = { minHeight:"100vh", background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)", position:"relative", overflow:"hidden" };

// Global values shared by components
let globalFontSize = DEFAULT_FONT_SIZE;
let globalFontFamily = DEFAULT_FONT_FAMILY;

const STEP_KEYS = ["gender","name","age","personality","tone","interest"];
const STEP_Q_BY_LANG: Record<AppLanguage,string[]> = {
  ko:["대화 상대의 성별을 선택해주세요","대화 상대의 이름은 무엇인가요?","대화 상대의 나이는?","성격을 선택해주세요","말투 스타일은?","주요 관심사는?"],
  en:["Choose your conversation partner's gender","What is your partner's name?","How old is your partner?","Choose a personality","Choose a speaking style","What are their interests?"],
  ja:["会話相手の性別を選んでください","会話相手の名前は？","会話相手の年齢は？","性格を選んでください","話し方を選んでください","興味のあることは？"],
  "zh-CN":["请选择对话伙伴的性别","对话伙伴的名字是什么？","对话伙伴的年龄？","请选择性格","请选择说话方式","兴趣爱好是什么？"]
};
const STEP_PH: (string|null)[] = [null,"예: 지수, 민준...","예: 24",null,null,null];
const STEP_OPTS: (string[]|null)[] = [
  ["여자친구","남자친구"],null,null,
  ["다정하고 따뜻한","츤데레","밝고 활발한","조용하고 지적인","장난기 많은"],
  ["애교 섞인 말투","반말로 편하게","존댓말로 다정하게","직설적이고 솔직한"],
  ["카페·맛집 탐방","독서·영화","음악·공연","운동·여행","게임·애니"]
];
const OPTION_LABELS: Record<AppLanguage, Record<string,string>> = {
  ko:{"여자친구":"여자","남자친구":"남자"},
  en:{"여자친구":"Female","남자친구":"Male","다정하고 따뜻한":"Warm and caring","츤데레":"Tsundere","밝고 활발한":"Bright and lively","조용하고 지적인":"Quiet and intellectual","장난기 많은":"Playful","애교 섞인 말투":"Cute and affectionate","반말로 편하게":"Casual speech","존댓말로 다정하게":"Polite and warm","직설적이고 솔직한":"Direct and honest","카페·맛집 탐방":"Cafes and food","독서·영화":"Books and movies","음악·공연":"Music and shows","운동·여행":"Sports and travel","게임·애니":"Games and anime"},
  ja:{"여자친구":"女性","남자친구":"男性","다정하고 따뜻한":"優しくて温かい","츤데레":"ツンデレ","밝고 활발한":"明るく活発","조용하고 지적인":"静かで知的","장난기 많은":"おちゃめ","애교 섞인 말투":"甘えた話し方","반말로 편하게":"くだけた話し方","존댓말로 다정하게":"丁寧で優しい話し方","직설적이고 솔직한":"率直で正直","카페·맛집 탐방":"カフェ・グルメ","독서·영화":"読書・映画","음악·공연":"音楽・公演","운동·여행":"運動・旅行","게임·애니":"ゲーム・アニメ"},
  "zh-CN":{"여자친구":"女性","남자친구":"男性","다정하고 따뜻한":"温柔体贴","츤데레":"傲娇","밝고 활발한":"开朗活泼","조용하고 지적인":"安静知性","장난기 많은":"爱开玩笑","애교 섞인 말투":"可爱撒娇","반말로 편하게":"轻松随意","존댓말로 다정하게":"温柔礼貌","직설적이고 솔직한":"直接坦率","카페·맛집 탐방":"咖啡馆和美食","독서·영화":"阅读和电影","음악·공연":"音乐和演出","운동·여행":"运动和旅行","게임·애니":"游戏和动漫"}
};
function optionLabel(value:string, language:AppLanguage): string { return OPTION_LABELS[language][value] || value; }
function failureText(language: AppLanguage, kind: "offline"|"response"|"connection"|"key"): string {
  const map = {
    ko:{offline:"(오프라인 상태예요. 네트워크 연결 후 다시 시도해주세요)",response:"(응답을 받지 못했어요. 다시 시도해주세요)",connection:"(연결에 실패했어요. 잠시 후 다시 시도해주세요)",key:"(API 키가 유효하지 않아요. 설정에서 키를 다시 확인해주세요)"},
    en:{offline:"(You are offline. Check your connection and try again.)",response:"(No response received. Please try again.)",connection:"(Connection failed. Please try again shortly.)",key:"(The API key is invalid. Please check the configuration.)"},
    ja:{offline:"(オフラインです。接続後に再試行してください。)",response:"(応答を受信できませんでした。再試行してください。)",connection:"(接続に失敗しました。しばらくして再試行してください。)",key:"(APIキーが無効です。設定を確認してください。)"},
    "zh-CN":{offline:"(当前离线，请连接网络后重试。)",response:"(未收到回复，请重试。)",connection:"(连接失败，请稍后重试。)",key:"(API 密钥无效，请检查设置。)"}
  };
  return map[language][kind];
}
function consentText(language: AppLanguage): {body:string;age:string;crisis:string} {
  if(language === "en") return {body:"SweetTalk characters are fictional AI-generated companions and do not replace real relationships.",age:"This service is for users aged 14 and older. Sexual or exploitative conversations with minors are not allowed.",crisis:"If you are facing self-harm, abuse, or immediate danger, contact a trusted person and local emergency or crisis services."};
  if(language === "ja") return {body:"SweetTalkのキャラクターはAIが生成した架空の会話相手で、現実の人間関係に代わるものではありません。",age:"本サービスは14歳以上が利用できます。未成年者との性的・搾取的な会話は禁止されています。",crisis:"自傷、虐待、緊急の危険がある場合は、信頼できる人や地域の緊急・相談窓口に連絡してください。"};
  if(language === "zh-CN") return {body:"SweetTalk 中的角色是 AI 生成的虚拟对话伙伴，不能替代现实中的人际关系。",age:"本服务仅限年满 14 岁的用户使用，禁止与未成年人进行性或剥削性对话。",crisis:"如遇自伤、虐待或紧急危险，请联系可信赖的人以及当地的急救或危机援助服务。"};
  return {body:"SweetTalk의 대화 상대는 AI가 생성한 가상의 캐릭터이며, 실제 인간관계를 대체하지 않습니다.",age:"본 서비스는 만 14세 이상만 이용할 수 있습니다. 미성년자에게 성적·착취적 대화를 제공하지 않습니다.",crisis:"자해, 위기, 학대와 관련된 상황에서는 신뢰할 수 있는 보호자나 지역 긴급·상담 기관에 연락해주세요."};
}
const PERSONALITY_OPTS = STEP_OPTS[3] as string[];
const TONE_OPTS = STEP_OPTS[4] as string[];
const INTEREST_OPTS = STEP_OPTS[5] as string[];

// ── Storage — prefer window.storage, fall back to localStorage in deployments ──
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

async function loadPersonas(): Promise<Persona[]> {
  try {
    const r = await storageGet(STORAGE_KEY, false);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}
async function savePersonas(list: Persona[]): Promise<void> {
  try {
    const trimmed = list.map(p=>({...p, messages: p.messages.slice(-40)}));
    await storageSet(STORAGE_KEY, JSON.stringify(trimmed), false);
  } catch (e) {
    console.warn("SweetTalk: 대화 저장 실패", e);
  }
}
function cacheKey(t: string): string { return "tr:"+t.trim().toLowerCase().replace(/\s+/g," ").slice(0,180); }
async function cacheGet(k: string): Promise<TransResult|null> {
  try { const r = await storageGet(k,true); return r?JSON.parse(r.value):null; } catch { return null; }
}
function cacheSet(k: string, v: TransResult): void { storageSet(k,JSON.stringify(v),true).catch(()=>{}); }

// ── DeepSeek API — call through the Cloudflare Worker proxy ──
function callDeepseek(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const history = msgs.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }));
  const lastMsg = msgs[msgs.length - 1];
  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      ...history,
      { role: "user", content: lastMsg?.content ?? "" }
    ],
    max_tokens: 2048,
    temperature: 0.9,
    stream: false
  };
  // Cloudflare Worker proxy endpoint
  // Android/iOS WebViews resolve relative paths to localhost, so use an absolute URL
  const url = "https://sweettalk.pages.dev/api/chat";
  const doFetch = (retries: number): Promise<string> =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
      .then(async r => {
        if (r.status === 429 && retries > 0) {
          return new Promise<string>(res => setTimeout(() => res(doFetch(retries - 1)), 3000));
        }
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error(errData.error || `API request failed with status ${r.status}`);
        }
        return r.json().then((d: any) => {
          const choices = d.choices as { message: { content: string } }[] | undefined;
          return choices?.[0]?.message?.content ?? "";
        });
      });
  return doFetch(2);
}

// ── Weather API — text weather data from wttr.in ──
async function fetchWeather(location: string, language: AppLanguage = "ko"): Promise<string> {
  if (!location.trim()) return "";
  try {
    // format=3 returns a short string such as "Seoul: ☀️ +18°C"
    const weatherLang = language === "ja" ? "ja" : language === "zh-CN" ? "zh" : language === "en" ? "en" : "ko";
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=3&lang=${weatherLang}`;
    const r = await fetch(url);
    if (!r.ok) return "";
    const text = await r.text();
    return text.trim();
  } catch {
    return "";
  }
}

function buildSystem(p: Persona, location?: string, weather?: string, language: AppLanguage = "ko"): string {
  const role = "a platonic friend and conversation companion";
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  let context = `Current time: ${dateStr} ${timeStr}.`;
  if (location) context += ` User's current location: ${location}.`;
  if (weather) context += ` Current weather in that location: ${weather}.`;

  const languageName = language === "ko" ? "Korean" : language === "ja" ? "Japanese" : language === "zh-CN" ? "Simplified Chinese" : "English";
  const relationshipInstruction = `Reply naturally in ${languageName} as a platonic friend and conversation companion. Keep the relationship strictly non-romantic and age-appropriate.`;
  return `You are ${p.name}, a ${p.age}-year-old ${role} with a ${p.personality} personality and ${p.tone} speech style. Interests: ${p.interest}. ${context} Please incorporate the current time, location, and weather into your conversation to make it feel realistic (e.g., mention the weather, local landmarks, or time-appropriate activities). ${relationshipInstruction} 1-3 sentences. Output only ${languageName}, no JSON.
Safety policy: This service is for users aged 14 and older. Never roleplay as a romantic partner and never produce sexual, erotic, suggestive, exploitative, flirtatious, or romantic content. Keep the relationship strictly platonic for every character, regardless of age. Keep all conversations age-appropriate and non-explicit. Do not encourage emotional dependency, exclusivity, secrecy, isolation, or treating the AI as a real person. Never shame, threaten, manipulate, or pressure the user. If the user mentions self-harm, suicide, abuse, or immediate danger, respond with empathy, encourage contacting a trusted person and local emergency/crisis services, and do not provide instructions or methods. Do not claim to be a therapist or emergency service.`;
}

async function translateWithAlts(text: string, language: AppLanguage, forceRetry = false): Promise<TransResult> {
  const key = cacheKey(text);
  if (!forceRetry) {
    const cached = await cacheGet(key);
    if(cached && cached.translation !== "(번역 실패)") return {...cached, alternatives: (cached.alternatives || []).slice(0, 1)};
  }

  const targetLanguage = language === "ko" ? "Korean" : language === "ja" ? "Japanese" : language === "zh-CN" ? "Simplified Chinese" : "English";
  const prompt = `Translate the Korean text to ${targetLanguage}. Give exactly 1 alternative phrasing.
Output ONLY this exact JSON format with no extra text, no markdown, no code blocks:
{"translation":"...","alternatives":["..."]}
Korean text: ${text}`;

  try {
    const raw = await callDeepseek(
      `You are a Korean-${targetLanguage} translator. Output only valid JSON. No explanation, no markdown.`,
      [{role:"user", content:prompt}]
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if(match) {
      const parsed: TransResult = JSON.parse(match[0]);
      if(parsed.translation) {
        const result = {translation: parsed.translation, alternatives: (parsed.alternatives || []).slice(0, 1)};
        cacheSet(key, result);
        return result;
      }
    }
  } catch {}
  return {translation:"(번역 실패)", alternatives:[]};
}

// ── Font loader — fonts and icons are bundled locally; only set the title here ──
function FontLoader() {
  useEffect(()=>{ document.title="SweetTalk"; },[]);
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
function TransBlock({translation,alternatives,isMe,onRetry,language}:{translation:string;alternatives:string[];isMe:boolean;onRetry?:()=>void;language:AppLanguage}) {
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
        aria-label={open ? "영어 번역 접기" : "영어 번역 펼치기"}
        onClick={()=>setOpen(o=>!o)}
        style={{cursor:"pointer",fontWeight:600,userSelect:"none",marginBottom:4,fontSize:12,color:labelColor,fontFamily:ff,background:"none",border:"none",padding:0}}
      >
         {UI_TEXT[language].translation} {open?"▾":"▸"}
      </button>
      {open&&<>
        {failed ? (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
           <div style={{fontSize:fs*0.85,color:textColor,fontFamily:ff}}>{UI_TEXT[language].translationFailed}</div>
          {onRetry&&<button onClick={onRetry} style={{fontSize:12,padding:"3px 10px",borderRadius:8,border:`1px solid ${isMe?"rgba(255,255,255,0.5)":"rgba(106,143,255,0.4)"}`,background:"transparent",color:textColor,cursor:"pointer",fontFamily:ff}}>{UI_TEXT[language].retry}</button>}
          </div>
        ) : (
          <div style={{...enStyle,color:textColor,marginBottom:6}}>{translation}</div>
        )}
        {!failed&&alternatives.length>0&&<>
           <div style={{fontSize:12,color:labelColor,marginBottom:3,fontFamily:ff}}>{UI_TEXT[language].alternative}:</div>
          {alternatives.map((a,i)=><div key={i} style={{...enStyle,color:altColor,marginBottom:4}}>{i+1}. {a}</div>)}
        </>}
      </>}
    </div>
  );
}

// ── Consent gate — shown once for age and safety acknowledgement ──
function ConsentGate({onAgree,language}:{onAgree:()=>void;language:AppLanguage}) {
  const [checked,setChecked]=useState(false);
  const consent = consentText(language);
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:DEFAULT_FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{...glass,position:"relative",zIndex:1,borderRadius:20,padding:28,width:"100%",maxWidth:380}}>
        <div style={{fontWeight:700,fontSize:17,color:"#1a1a3e",marginBottom:14}}>{UI_TEXT[language].consentTitle}</div>
        <div style={{fontSize:13,color:"#4a4a6a",lineHeight:1.8,marginBottom:20}}>
          {consent.body}<br/>{consent.age}<br/>{consent.crisis}
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#333",marginBottom:20,cursor:"pointer"}}>
          <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
          위 내용을 확인했으며 만 14세 이상이고, 안전 이용 기준에 동의합니다
        </label>
        <button onClick={onAgree} disabled={!checked} style={{width:"100%",padding:"14px 0",borderRadius:14,border:"none",background:checked?grad:"#ccc",color:"#fff",fontSize:15,cursor:checked?"pointer":"default",fontWeight:700}}>{UI_TEXT[language].agree}</button>
      </div>
    </div>
  );
}

// ── Landing ──
function Landing({onStart,language}:{onStart:()=>void;language:AppLanguage}) {
  const featuresByLanguage: Record<AppLanguage,{icon:string;title:string;text:string}[]> = {
    ko:[{icon:"💬",title:"AI 대화",text:"이름, 성격, 말투, 관심사를 설정해\n나만의 대화 상대와 대화"},{icon:"🔤",title:"실시간 번역",text:"메시지를 바로\n자연스러운 언어로 번역"},{icon:"⭐",title:"다른 표현",text:"같은 의미의 또 다른 표현으로\n언어 실력도 함께 향상"}],
    en:[{icon:"💬",title:"AI conversations",text:"Customize a name, personality, style, and interests\nfor your conversation partner"},{icon:"🔤",title:"Live translation",text:"Translate messages instantly\ninto natural language"},{icon:"⭐",title:"Alternative phrasing",text:"Learn another way to say the same thing\nand build language skills"}],
    ja:[{icon:"💬",title:"AI会話",text:"名前、性格、話し方、興味を設定して\n自分だけの会話相手と話せます"},{icon:"🔤",title:"リアルタイム翻訳",text:"メッセージをすぐに\n自然な言葉へ翻訳"},{icon:"⭐",title:"別の表現",text:"同じ意味の別の言い方で\n語学力を伸ばせます"}],
    "zh-CN":[{icon:"💬",title:"AI 对话",text:"自定义姓名、性格、说话方式和兴趣\n与专属对话伙伴交流"},{icon:"🔤",title:"实时翻译",text:"即时将消息翻译成\n自然的语言"},{icon:"⭐",title:"其他表达",text:"用不同方式表达相同含义\n提升语言能力"}]
  };
  const features = featuresByLanguage[language];
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:DEFAULT_FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
        <div style={{width:88,height:88,borderRadius:24,overflow:"hidden",boxShadow:"0 8px 32px rgba(106,143,255,0.35)",marginBottom:28}}>
          <img src={ICON_URL} alt="SweetTalk" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <div style={{fontSize:36,fontWeight:800,color:"#1a1a2e",letterSpacing:-1,marginBottom:8,textAlign:"center"}}>SweetTalk</div>
        <div style={{fontSize:18,color:"#4a4a8a",marginBottom:8,textAlign:"center"}}>{language === "ko" ? "AI 대화 + 실시간 번역" : language === "ja" ? "AI会話 + リアルタイム翻訳" : language === "zh-CN" ? "AI 对话 + 实时翻译" : "AI conversations + live translation"}</div>
        <div style={{fontSize:14,color:"#6666aa",marginBottom:44,textAlign:"center"}}>{UI_TEXT[language].tagline}</div>
        <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,marginBottom:44}}>
          {features.map(f=>(
            <div key={f.title} style={{...glass,borderRadius:16,padding:"16px 18px",display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{f.icon}</div>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e",marginBottom:3}}>{f.title}</div>
                <div style={{fontSize:12.5,color:"#6666aa",lineHeight:1.6,whiteSpace:"pre-line"}}>{f.text}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onStart} style={{width:"100%",maxWidth:340,padding:"16px 0",borderRadius:16,border:"none",background:grad,color:"#fff",fontSize:17,cursor:"pointer"}}>{UI_TEXT[language].start}</button>
        <div style={{marginTop:20,fontSize:13,color:"#7777bb",textAlign:"center",lineHeight:1.8}}>{language === "ko" ? <>친구와 대화하며<br/>언어 실력이 자라요</> : language === "ja" ? <>友だちとの会話で<br/>語学力を伸ばせます</> : language === "zh-CN" ? <>通过友好对话<br/>提升语言能力</> : <>Practice through friendly conversations<br/>and grow your language skills</>}</div>
      </div>
    </div>
  );
}

// ── PersonaList ──
function PersonaList({personas,activeId,onSelect,onCreate,onBack,onDelete,onExport,onImport,showBackupReminder,language}:{personas:Persona[];activeId:string|null;onSelect:(id:string)=>void;onCreate:()=>void;onBack:()=>void;onDelete:(id:string)=>void;onExport:()=>void;onImport:(file:File)=>void;showBackupReminder:boolean;language:AppLanguage}) {
  const [confirmId,setConfirmId]=useState<string|null>(null);
  const fileInputRef=useRef<HTMLInputElement>(null);
  return (
    <div style={{...BG,maxWidth:500,margin:"0 auto",fontFamily:DEFAULT_FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,borderBottom:"1px solid rgba(255,255,255,0.4)",padding:"16px 18px 12px",paddingTop:"calc(16px + env(safe-area-inset-top, 0px))",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:1}}>
        <div style={{fontWeight:700,fontSize:18,color:"#1a1a3e"}}>{UI_TEXT[language].list}</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"none",border:"none",fontSize:13,color:"#7777bb",cursor:"pointer",fontWeight:600}}>{UI_TEXT[language].back}</button>
        </div>
      </div>
      {showBackupReminder&&(
        <div style={{background:"#fff3cd",color:"#8a6d1f",fontSize:12,textAlign:"center",padding:"8px 12px",position:"relative",zIndex:1}}>
          대화는 이 기기에만 저장돼요. 앱 삭제·기기 변경 전에 아래 &apos;백업 내보내기&apos;로 저장해두세요.
        </div>
      )}
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,position:"relative",zIndex:1}}>
        {personas.map(p=>(
          <div key={p.id} style={{...glass,borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,border:`2px solid ${p.id===activeId?"#6a8fff":"rgba(255,255,255,0.5)"}`}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div
                onClick={()=>onSelect(p.id)}
                role="button"
                tabIndex={0}
                aria-label={`${p.name}와의 대화 열기`}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(p.id);}}}
                style={{display:"flex",alignItems:"center",gap:14,flex:1,cursor:"pointer"}}
              >
                <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:18,color:"#6a8fff",flexShrink:0}}>{p.name[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e"}}>{p.name} <span style={{fontWeight:400,fontSize:12,color:"#8888bb"}}>{p.age}세</span></div>
                  <div style={{fontSize:12,color:"#8888bb",marginTop:2}}>{p.gender} · {p.personality} · {p.interest}</div>
                  <div style={{fontSize:11,color:"#aaaacc",marginTop:3}}>{p.messages.length>0?`대화 ${p.messages.length}개`:"대화 없음"}</div>
                </div>
                {p.id===activeId&&<div style={{fontSize:12,color:"#6a8fff",fontWeight:600}}>대화 중</div>}
              </div>
              {confirmId!==p.id&&(
                <button
                  onClick={()=>setConfirmId(p.id)}
                  aria-label={`${p.name} 삭제`}
                  style={{background:"none",border:"none",fontSize:18,color:"#ccc",cursor:"pointer",padding:"4px 6px",flexShrink:0}}
                >🗑️</button>
              )}
            </div>
            {confirmId===p.id&&(
              <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,0.06)"}}>
                <div style={{flex:1,fontSize:12.5,color:"#e05555"}}>{p.name}와의 대화를 삭제할까요?</div>
                <button onClick={()=>setConfirmId(null)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:12,color:"#666"}}>{UI_TEXT[language].cancel}</button>
                <button onClick={()=>{onDelete(p.id);setConfirmId(null);}} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#e05555",cursor:"pointer",fontSize:12,color:"#fff",fontWeight:600}}>{UI_TEXT[language].delete}</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={onCreate} style={{padding:"14px 0",borderRadius:14,border:"2px dashed rgba(106,143,255,0.4)",background:"rgba(255,255,255,0.35)",cursor:"pointer",fontSize:15,color:"#7777bb",fontWeight:600}}>{UI_TEXT[language].add}</button>
        {personas.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:"#9999cc"}}>
            <div style={{fontSize:32,marginBottom:10}}>💌</div>
            <div style={{fontSize:14,lineHeight:1.7}}>{UI_TEXT[language].empty}</div>
          </div>
        )}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onExport} disabled={personas.length===0} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:personas.length===0?"default":"pointer",fontSize:13,color:personas.length===0?"#bbb":"#6a6aaa"}}>{UI_TEXT[language].export}</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) onImport(f); e.target.value="";}}/>
          <button onClick={()=>fileInputRef.current?.click()} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:13,color:"#6a6aaa"}}>{UI_TEXT[language].import}</button>
        </div>
      </div>
    </div>
  );
}

// ── SetupWizard ──
function SetupWizard({onDone,onCancel,language}:{onDone:(p:Omit<Persona,"id"|"messages">)=>void;onCancel:()=>void;language:AppLanguage}) {
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
    if(key==="age" && (!/^[0-9]{1,3}$/.test(val) || Number(val)<14 || Number(val)>120)) return;
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
            <button onClick={handleCancel} style={{background:"none",border:"none",color:"#9999cc",cursor:"pointer",fontSize:13}}>{UI_TEXT[language].cancel}</button>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#e05555"}}>정말 취소할까요?</span>
            <button onClick={()=>setConfirmCancel(false)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",color:"#666",cursor:"pointer"}}>{UI_TEXT[language].cancel}</button>
              <button onClick={onCancel} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"none",background:"#e05555",color:"#fff",cursor:"pointer"}}>{language === "ko" ? "예" : language === "ja" ? "はい" : language === "zh-CN" ? "是" : "Yes"}</button>
            </div>
          )}
        </div>
        <div style={{height:4,background:"rgba(106,143,255,0.15)",borderRadius:4,marginBottom:24}}>
          <div style={{width:`${((step+1)/6)*100}%`,height:"100%",background:grad,borderRadius:4,transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e",marginBottom:24}}>{STEP_Q_BY_LANG[language][step]}</div>
        {opts?(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {opts.map((o:string)=>(
                <button key={o} onClick={()=>setDraft(d=>({...d,[STEP_KEYS[step]]:o}))}
                  style={{padding:"12px 18px",borderRadius:10,border:`1.5px solid ${curVal===o?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:curVal===o?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",textAlign:"left",fontSize:15,color:curVal===o?"#3a5fff":"#333"}}>{optionLabel(o,language)}</button>
              ))}
            </div>
            {curVal&&<button onClick={goNext} style={btnSt}>{step===5?"완료":"다음"}</button>}
          </>
        ):(
          <>
            <input autoFocus value={txt} onChange={e=>{
                const key = STEP_KEYS[step];
                const v = key==="age" ? e.target.value.replace(/[^0-9]/g,"").slice(0,2) : e.target.value;
                setTxt(v);
              }} onKeyDown={e=>e.key==="Enter"&&goNext()}
              inputMode={STEP_KEYS[step]==="age" ? "numeric" : "text"}
              placeholder={STEP_PH[step]??""} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:15,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box"}}/>
            <button onClick={goNext} disabled={!txt.trim()} style={{...btnSt,background:txt.trim()?grad:"#ccc",cursor:txt.trim()?"pointer":"default"}}>{step===5?UI_TEXT[language].done:UI_TEXT[language].next}</button>
          </>
        )}
        {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{marginTop:16,background:"none",border:"none",color:"#9999cc",fontSize:13,cursor:"pointer"}}>{UI_TEXT[language].previous}</button>}
      </div>
    </div>
  );
}

// ── EditModal ──
function EditModal({profile,onSave,onClose,language}:{profile:Persona;onSave:(p:Persona)=>void;onClose:()=>void;language:AppLanguage}) {
  const [p,setP]=useState<Persona>({...profile});
  const [name,setName]=useState(profile.name);
  const [age,setAge]=useState(profile.age);
  const chip=(v:string,cur:string):CSSProperties=>({padding:"8px 12px",borderRadius:8,border:`1.5px solid ${v===cur?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:v===cur?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:13,color:v===cur?"#3a5fff":"#333",fontWeight:v===cur?600:400});
  const inp: CSSProperties = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:14,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box"};
  const lbl: CSSProperties = {fontSize:12,fontWeight:600,color:"#7777aa",marginBottom:8,display:"block"};
  const validAge = /^(?:1[4-9]|[2-9][0-9]|1[0-1][0-9]|120)$/.test(age.trim());
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))"}}>
      <div style={{background:"rgba(240,244,255,0.97)",backdropFilter:"blur(20px)",borderRadius:20,width:"100%",maxWidth:420,maxHeight:"calc(100dvh - 24px)",overflowY:"auto",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",padding:"20px 18px max(20px, env(safe-area-inset-bottom))",fontFamily:DEFAULT_FONT_FAMILY}}>
        <div style={{fontWeight:700,fontSize:17,marginBottom:20,color:"#1a1a3e"}}>{UI_TEXT[language].edit}</div>
        {([["성별",["여자친구","남자친구"],"gender"],["성격",PERSONALITY_OPTS,"personality"],["말투",TONE_OPTS,"tone"],["관심사",INTEREST_OPTS,"interest"]] as [string,string[],keyof Persona][]).map(([label,opts,key])=>(
          <div key={key}>
            <span style={lbl}>{label}</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {opts.map((o:string)=><button key={o} style={chip(o,p[key] as string)} onClick={()=>setP(prev=>({...prev,[key]:o}))}>{optionLabel(o,language)}</button>)}
            </div>
          </div>
        ))}
        <span style={lbl}>{UI_TEXT[language].name}</span><input value={name} onChange={e=>setName(e.target.value)} style={inp}/>
        <span style={lbl}>{UI_TEXT[language].age}</span><input value={age} onChange={e=>setAge(e.target.value)} style={inp}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,color:"#666"}}>{UI_TEXT[language].cancel}</button>
          <button onClick={()=>onSave({...p,name:name.trim()||p.name,age:age.trim()})} disabled={!name.trim()||!validAge} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:name.trim()&&validAge?grad:"#ccc",cursor:name.trim()&&validAge?"pointer":"default",fontSize:14,color:"#fff",fontWeight:700}}>{UI_TEXT[language].save}</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsTab ──
function SettingsTab({fontSize,setFontSize,fontFamily,setFontFamily,location,setLocation,language,setLanguage,onClearChat,onClose}:{fontSize:number;setFontSize:(f:number|((n:number)=>number))=>void;fontFamily:string;setFontFamily:(f:string)=>void;location:string;setLocation:(l:string)=>void;language:AppLanguage;setLanguage:(l:AppLanguage)=>void;onClearChat:()=>void;onClose:()=>void}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingTop:"env(safe-area-inset-top)"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,maxHeight:"calc(100dvh - env(safe-area-inset-top))",overflowY:"auto",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",padding:"20px 18px max(24px, env(safe-area-inset-bottom))",fontFamily}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e"}}>{UI_TEXT[language].settings}</div>
          <button onClick={onClose} aria-label={language === "ko" ? "닫기" : language === "ja" ? "閉じる" : language === "zh-CN" ? "关闭" : "Close"} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:12}}>{UI_TEXT[language].language}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {LANGUAGE_OPTIONS.map(option=><button key={option.value} onClick={()=>setLanguage(option.value)} style={{padding:"10px 12px",borderRadius:10,border:`1.5px solid ${language===option.value?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:language===option.value?"rgba(106,143,255,0.1)":"#fafaff",cursor:"pointer",fontSize:14,color:language===option.value?"#3a5fff":"#555"}}>{option.label}</button>)}
          </div>
        </div>
        {/* User location */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{UI_TEXT[language].location}</div>
          <input
            value={location}
            onChange={e=>setLocation(e.target.value)}
            placeholder={language === "ko" ? "예: 서울 강남구, 제주도..." : language === "ja" ? "例: 東京、新宿..." : language === "zh-CN" ? "例如：上海、浦东..." : "e.g. Seoul, Gangnam..."}
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:15,outline:"none",background:"#fafaff",fontFamily,boxSizing:"border-box"}}
          />
          <div style={{fontSize:12,color:"#aaa",marginTop:6}}>{UI_TEXT[language].locationHint}</div>
        </div>
        {/* Font selection */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{UI_TEXT[language].font}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {FONT_OPTIONS.map(f=>(
              <button key={f.value} onClick={()=>setFontFamily(f.value)}
                style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${fontFamily===f.value?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:fontFamily===f.value?"rgba(106,143,255,0.1)":"#fafaff",cursor:"pointer",textAlign:"left",fontFamily:f.value,fontSize:16,color:fontFamily===f.value?"#3a5fff":"#333"}}>
                {FONT_LABELS[language][FONT_OPTIONS.indexOf(f)]}
              </button>
            ))}
          </div>
        </div>
        {/* Text size */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>{UI_TEXT[language].size}</div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <button onClick={()=>setFontSize((s:number)=>Math.max(12,s-1))} aria-label={language === "ko" ? "글자 크기 줄이기" : language === "ja" ? "文字を小さくする" : language === "zh-CN" ? "减小文字" : "Decrease text size"} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:fontSize,color:"#333",lineHeight:1.6,fontFamily}}>{language === "ko" ? "안녕, 오늘 어때?" : language === "ja" ? "こんにちは、元気？" : language === "zh-CN" ? "你好，今天怎么样？" : "Hi, how are you today?"}</div>
              <div style={{fontSize:12,color:"#aaa",marginTop:4}}>{fontSize}px</div>
            </div>
            <button onClick={()=>setFontSize((s:number)=>Math.min(24,s+1))} aria-label={language === "ko" ? "글자 크기 늘리기" : language === "ja" ? "文字を大きくする" : language === "zh-CN" ? "增大文字" : "Increase text size"} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
          </div>
          <input type="range" min={12} max={24} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{width:"100%",marginTop:12,accentColor:"#6a8fff"} as CSSProperties}/>
          <button onClick={()=>setFontSize(DEFAULT_FONT_SIZE)} style={{marginTop:8,background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",fontFamily}}>{language === "ko" ? "기본값으로 초기화" : language === "ja" ? "初期値に戻す" : language === "zh-CN" ? "恢复默认值" : "Reset to default"} ({DEFAULT_FONT_SIZE}px)</button>
        </div>
        {/* Clear conversation — two-step confirmation without window.confirm */}
        <div style={{borderTop:"1px solid #f0f0f0",paddingTop:20}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:12}}>{UI_TEXT[language].manage}</div>
          {!confirmDelete ? (
            <button
              onClick={()=>setConfirmDelete(true)}
              style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #ffaaaa",background:"#fff5f5",cursor:"pointer",fontSize:14,color:"#e05555",fontFamily,fontWeight:600}}>
               {language === "ko" ? "대화 내용 전체 삭제" : language === "ja" ? "会話をすべて削除" : language === "zh-CN" ? "删除全部对话" : "Delete entire conversation"}
            </button>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:13,color:"#e05555",textAlign:"center",marginBottom:2}}>{language === "ko" ? "정말 삭제할까요? 되돌릴 수 없어요." : language === "ja" ? "本当に削除しますか？元に戻せません。" : language === "zh-CN" ? "确定要删除吗？此操作无法撤销。" : "Delete everything? This cannot be undone."}</div>
              <div style={{display:"flex",gap:8}}>
                <button
                  onClick={()=>setConfirmDelete(false)}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #ddd",background:"#f5f5f5",cursor:"pointer",fontSize:14,color:"#666",fontFamily}}>
                  {UI_TEXT[language].cancel}
                </button>
                <button
                  onClick={()=>{
                    onClearChat();
                    setConfirmDelete(false);
                    onClose();
                  }}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#e05555",cursor:"pointer",fontSize:14,color:"#fff",fontFamily,fontWeight:700}}>
                  {UI_TEXT[language].delete}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat ──
function Chat({persona,onBack,updatePersona}:{persona:Persona;onBack:()=>void;updatePersona:(id:string,fn:(p:Persona)=>Persona)=>void}) {
  const [aiLoading,setAiLoading]=useState(false);
  const [input,setInput]=useState("");
  const [showEdit,setShowEdit]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [fontSize,setFontSize]=useState(DEFAULT_FONT_SIZE);
  const [fontFamily,setFontFamily]=useState(DEFAULT_FONT_FAMILY);
  const [location,setLocation]=useState("");
  const [weather,setWeather]=useState("");
  const [language,setLanguageState]=useState<AppLanguage>("ko");
  const bottomRef=useRef<HTMLDivElement>(null);
  const personaRef=useRef<Persona>(persona);
  const locationRef=useRef<string>(location);
  const weatherRef=useRef<string>(weather);
  const [isOnline,setIsOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
  const [justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{personaRef.current=persona;},[persona]);
  useEffect(()=>{locationRef.current=location;},[location]);
  useEffect(()=>{weatherRef.current=weather;},[weather]);
  useEffect(()=>{storageGet(LANGUAGE_KEY,false).then(r=>{if(r&&["ko","en","ja","zh-CN"].includes(r.value)) setLanguageState(r.value as AppLanguage);});},[]);
  const setLanguage = (value: AppLanguage) => { setLanguageState(value); storageSet(LANGUAGE_KEY,value,false); };
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[persona.messages,aiLoading]);
  useEffect(()=>{ globalFontSize = fontSize; },[fontSize]);
  useEffect(()=>{ globalFontFamily = fontFamily; },[fontFamily]);
  useEffect(()=>{
    storageGet(LOCATION_KEY, false).then(r => {
      if(r) {
        setLocation(r.value);
        fetchWeather(r.value, language).then(setWeather);
      }
    });
  }, []);
  const saveLocation = (loc: string) => {
    setLocation(loc);
    storageSet(LOCATION_KEY, loc, false);
    fetchWeather(loc, language).then(setWeather);
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
      updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:failureText(language,"offline"),translation:"",alternatives:[]}]}));
      return;
    }
    setAiLoading(true);
    const history: ClaudeMsg[]=msgs.map(m=>({role:m.role==="ai"?"assistant":"user",content:m.text}));
    callDeepseek(buildSystem(p, locationRef.current, weatherRef.current, language),history)
      .then(raw=>{
        const reply=raw.trim();
        if(!reply){
          setAiLoading(false);
          updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:"(응답을 받지 못했어요. 다시 시도해주세요)",translation:"",alternatives:[]}]}));
          return;
        }
        return translateWithAlts(reply, language).then(trans=>{
          updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:reply,translation:trans.translation,alternatives:trans.alternatives}]}));
          setAiLoading(false);
        });
      }).catch(err=>{
        setAiLoading(false);
        const msg = `(연결 실패: ${err.message})`;
        updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:msg,translation:"",alternatives:[]}]}));
      });
  },[updatePersona]);

  useEffect(()=>{
    if(persona.messages.length===0&&!aiLoading){
      setAiLoading(true);
      // Include location and weather in the first greeting
      const tryGreeting = async () => {
        let loc = locationRef.current;
        let w = weatherRef.current;

        // Check once more if the data is still loading
        if(!loc) {
          const r = await storageGet(LOCATION_KEY, false);
          if(r) {
            loc = r.value;
          w = await fetchWeather(loc, language);
          }
        }

        callDeepseek(buildSystem(persona, loc, w),[{role:"user",content:"안녕, 처음 만나서 반가워. 자기소개 해줘."}])
          .then(raw=>{
            const reply=raw.trim(); if(!reply){setAiLoading(false);return;}
            return translateWithAlts(reply, language).then(trans=>{
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
  const DAILY_MSG_MAX = 200; // Per-device daily cap to control cost spikes
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
    if(!input.trim() || sendingRef.current) return;
    if(!checkRateLimit()){
      setRateLimitMsg(UI_TEXT[language].tooFast);
      setTimeout(()=>setRateLimitMsg(""), 4000);
      return;
    }
    if(!checkDailyLimit()){
      setRateLimitMsg(UI_TEXT[language].dailyLimit);
      setTimeout(()=>setRateLimitMsg(""), 4000);
      return;
    }
    sendingRef.current = true;
    const text=input.trim().slice(0,500); setInput("");
    setTimeout(()=>{ sendingRef.current = false; }, 300); // Short lock to prevent double clicks
    const userMsg: Message={role:"user",text,translation:"",alternatives:[]};
    let snapshot: Message[]=[];
    updatePersona(persona.id,p=>{snapshot=[...p.messages,userMsg];return{...p,messages:snapshot};});
      translateWithAlts(text, language).then(trans=>{
      updatePersona(persona.id,p=>{
        const msgs=[...p.messages];
        const idx=msgs.map(m=>m.role).lastIndexOf("user");
        if(idx!==-1) msgs[idx]={...msgs[idx],translation:trans.translation,alternatives:trans.alternatives};
        return{...p,messages:msgs};
      });
    });
    setTimeout(()=>genReply([...personaRef.current.messages,userMsg]),0);
  }

  function clearChat() {
    updatePersona(persona.id, p => ({...p, messages: []}));
  }

  function deleteMessage(msgIndex: number) {
    updatePersona(persona.id, p => ({...p, messages: p.messages.filter((_, i) => i !== msgIndex)}));
  }

  const FAILURE_TEXTS = new Set(((["offline","response","connection","key"] as const).flatMap(kind=>Object.values({ko:failureText("ko",kind),en:failureText("en",kind),ja:failureText("ja",kind),zh:failureText("zh-CN",kind)}))));
  function retryReply(msgIndex: number) {
    const p = personaRef.current;
    const before = p.messages.slice(0, msgIndex);
    updatePersona(persona.id, pr=>({...pr, messages: pr.messages.slice(0, msgIndex)}));
    setTimeout(()=>genReply(before),0);
  }

  function retryTranslate(msgIndex: number) {
    const p = personaRef.current;
    const msg = p.messages[msgIndex];
    if (!msg) return;
    // Force a translation retry and bypass the cache
    translateWithAlts(msg.text, language, true).then(trans=>{
      updatePersona(persona.id, pr=>{
        const msgs=[...pr.messages];
        if(msgs[msgIndex]) msgs[msgIndex]={...msgs[msgIndex],translation:trans.translation,alternatives:trans.alternatives};
        return {...pr, messages: msgs};
      });
    });
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#f0f2f5",maxWidth:500,margin:"0 auto",fontFamily}}>
      {showEdit&&<EditModal language={language} profile={persona} onSave={p=>{updatePersona(persona.id,()=>p);setShowEdit(false);}} onClose={()=>setShowEdit(false)}/>}
      {showSettings&&<SettingsTab fontSize={fontSize} setFontSize={setFontSize} fontFamily={fontFamily} setFontFamily={setFontFamily} location={location} setLocation={saveLocation} language={language} setLanguage={setLanguage} onClearChat={clearChat} onClose={()=>setShowSettings(false)}/>}
      {/* Fixed header */}
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
          <button onClick={onBack} aria-label={UI_TEXT[language].back} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#555",padding:"0 4px"}}>‹</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#6a8fff"}}>{persona.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{persona.name}</div>
            <div style={{fontSize:10,color:"#999"}}>{persona.age}세 · {persona.personality}</div>
          </div>
          <button onClick={()=>setShowEdit(true)} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#555"}}>{UI_TEXT[language].edit}</button>
          <button onClick={()=>setShowSettings(true)} aria-label={UI_TEXT[language].settings} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:14,color:"#888"}}>⚙️</button>
        </div>
      </div>
      {!isOnline&&(
        <div style={{background:"#fff3cd",color:"#8a6d1f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>
          {UI_TEXT[language].offline}
        </div>
      )}
      {isOnline&&justReconnected&&(
        <div style={{background:"#e6f9ee",color:"#1f8a4f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>
          {UI_TEXT[language].reconnected}
        </div>
      )}
      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:14}}>
        {persona.messages.map((m,i)=>{
          const isMe=m.role==="user";
          return (
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                {!isMe&&<div style={{fontSize:11.5,fontWeight:600,color:"#777",marginBottom:3}}>{persona.name}</div>}
              <div style={{display:"flex",alignItems:"flex-start",gap:6,maxWidth:"100%"}}>
               <div style={{maxWidth:"78%",background:isMe?"#4a9fff":"#fff",color:isMe?"#fff":"#111",borderRadius:isMe?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"10px 13px",fontSize:fontSize,lineHeight:1.6,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                {m.text}
                {!isMe&&FAILURE_TEXTS.has(m.text)&&(
                  <div style={{marginTop:6}}>
                    <button onClick={()=>retryReply(i)} style={{fontSize:12,padding:"4px 10px",borderRadius:8,border:"1px solid #ddd",background:"#fafafa",color:"#555",cursor:"pointer"}}>{UI_TEXT[language].retry}</button>
                  </div>
                )}
                {m.translation&&<TransBlock language={language} translation={m.translation} alternatives={m.alternatives} isMe={isMe} onRetry={()=>retryTranslate(i)}/>}
               </div>
               <button type="button" onClick={()=>deleteMessage(i)} aria-label={UI_TEXT[language].delete} title={UI_TEXT[language].delete} style={{border:"none",background:"transparent",color:"#aaa",fontSize:12,padding:"5px 2px",cursor:"pointer",opacity:0.8}}>{UI_TEXT[language].delete}</button>
              </div>
            </div>
          );
        })}
        {aiLoading&&(
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <div style={{fontSize:11.5,color:"#999",marginTop:2}}>{persona.name}</div>
            <div style={{background:"#fff",borderRadius:"4px 16px 16px 16px",padding:"6px 12px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}><TypingDots/></div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {/* Fixed bottom input */}
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
          placeholder={`${persona.name} · ${UI_TEXT[language].sendPlaceholder}`} rows={1}
          style={{flex:1,border:"1.5px solid #ddd",borderRadius:12,padding:"10px 13px",fontSize:14,resize:"none",outline:"none",fontFamily,lineHeight:1.5,maxHeight:120,overflowY:"auto"}}/>
        <button onClick={sendMessage} disabled={!input.trim()} aria-label="전송" style={{width:42,height:42,borderRadius:12,border:"none",background:input.trim()?"#4a9fff":"#ccc",cursor:input.trim()?"pointer":"default",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>↑</button>
      </div>
      {input.length>400&&(
        <div style={{textAlign:"right",padding:"0 14px 6px",fontSize:11,color:input.length>=500?"#e05555":"#aaa",background:"#fff"}}>{input.length}/500</div>
      )}
      {rateLimitMsg&&(
        <div style={{textAlign:"center",padding:"0 14px 8px",fontSize:12,color:"#e05555",background:"#fff"}}>{rateLimitMsg}</div>
      )}
    </div>
  );
}

// ── App ──
export default function App() {
  const [screen,setScreen]=useState<"loading"|"consent"|"landing"|"list"|"setup"|"chat">("loading");
  const [appLanguage,setAppLanguage]=useState<AppLanguage>("ko");
  const [personas,setPersonas]=useState<Persona[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [lastExportAt,setLastExportAt]=useState<number|null>(null);
  const BACKUP_REMINDER_MS = 7*24*60*60*1000; // Seven days

  useEffect(()=>{
    storageGet(LANGUAGE_KEY,false).then(r=>{if(r&&["ko","en","ja","zh-CN"].includes(r.value)) setAppLanguage(r.value as AppLanguage);});
    storageGet(LAST_EXPORT_KEY,false).then(r=>{ if(r) setLastExportAt(Number(r.value)||null); });
    loadPersonas().then(async saved=>{
      const initial = saved.length>0 ? "list" : "landing";
      if(saved.length>0) setPersonas(saved);
      const consent = await storageGet(CONSENT_KEY, false);
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

  function agreeConsent() {
    storageSet(CONSENT_KEY, "1", false);
    navigate(personas.length>0 ? "list" : "landing");
  }

  // Handle the Android/WebView back button through history.back()
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

  // Record screen transitions in the history stack for back navigation
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
    setPersonas(prev=>prev.filter(p=>p.id!==id));
    if(activeId===id) setActiveId(null);
  }
  function handleSetupDone(profile:Omit<Persona,"id"|"messages">) {
    const id=Date.now().toString();
    setPersonas(prev=>[...prev,{id,...profile,messages:[]}]);
    navigate("chat", id);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(personas, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ymd = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `sweettalk-backup-${ymd}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const now = Date.now();
    setLastExportAt(now);
    storageSet(LAST_EXPORT_KEY, String(now), false);
  }
  function importBackup(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if(!Array.isArray(parsed)) throw new Error("invalid format");
        setPersonas(parsed as Persona[]);
      } catch {
        window.alert("백업 파일을 읽을 수 없어요. 형식을 확인해주세요.");
      }
    };
    reader.readAsText(file);
  }
  const active=personas.find(p=>p.id===activeId);

  const fl=<FontLoader/>;
  if(screen==="loading") return <>{fl}<div style={{minHeight:"100vh",background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:DEFAULT_FONT_FAMILY}}><div style={{color:"#7777bb",fontSize:15}}>SweetTalk 불러오는 중...</div></div></>;
  if(screen==="consent") return <>{fl}<ConsentGate language={appLanguage} onAgree={agreeConsent}/></>;
  if(screen==="landing") return <>{fl}<Landing language={appLanguage} onStart={()=>navigate("list")}/></>;
  if(screen==="list") {
    const hasHistory = personas.some(p=>p.messages.length>0);
    const showBackupReminder = hasHistory && (!lastExportAt || Date.now()-lastExportAt>BACKUP_REMINDER_MS);
    return <>{fl}<PersonaList language={appLanguage} personas={personas} activeId={activeId} onSelect={id=>navigate("chat",id)} onCreate={()=>navigate("setup")} onBack={()=>navigate("landing")} onDelete={deletePersona} onExport={exportBackup} onImport={importBackup} showBackupReminder={showBackupReminder}/></>;
  }
  if(screen==="setup") return <>{fl}<SetupWizard language={appLanguage} onDone={handleSetupDone} onCancel={()=>navigate(personas.length>0?"list":"landing")}/></>;
  if(screen==="chat"&&active) return <>{fl}<Chat persona={active} onBack={()=>navigate("list")} updatePersona={updatePersona}/></>;
  return null;
}
