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
    __GEMINI_KEY__?: string;
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
const ICON_URL = "/SweetTalk.jpg"; // 로컬 번들 — 오프라인에서도 깨지지 않음
const STORAGE_KEY = "personas_v1";
const CONSENT_KEY = "consent_v1";
const LAST_SCREEN_KEY = "last_screen_v1";
const LAST_EXPORT_KEY = "last_export_v1";
const DAILY_COUNT_KEY = "daily_msg_count_v1";
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

// ── API 헬퍼 ──
function getWinKey(k: keyof Window): string {
  return (window[k] as string) ?? "";
}

// ── Gemini API (배포 환경) ──
function callGemini(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const key = getWinKey("__GEMINI_KEY__");
  const history = msgs.slice(0,-1).map(m=>({
    role: m.role==="assistant" ? "model" : "user",
    parts: [{text: m.content}]
  }));
  const lastMsg = msgs[msgs.length-1];
  const body = {
    system_instruction: { parts: [{text: system}] },
    contents: [
      ...history,
      { role: "user", parts: [{text: lastMsg?.content ?? ""}] }
    ],
    generationConfig: { maxOutputTokens: 800, temperature: 0.9 }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`;
  const doFetch = (retries: number): Promise<string> =>
    fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) })
      .then(r => {
        if (r.status === 429 && retries > 0) {
          return new Promise<string>(res => setTimeout(() => res(doFetch(retries-1)), 3000));
        }
        return r.json().then((d: Record<string, unknown>) => {
          const candidates = d.candidates as {content:{parts:{text:string}[]}}[] | undefined;
          return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        });
      });
  return doFetch(2);
}

// ── Claude API (아티팩트 환경 fallback) ──
function callClaude(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const geminiKey = getWinKey("__GEMINI_KEY__");
  if (geminiKey) return callGemini(system, msgs);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers,
    body: JSON.stringify({model:"claude-sonnet-4-20250514", max_tokens:800, system, messages:msgs})
  }).then(r => r.json())
    .then((d: Record<string, unknown>) => {
      const content = d.content as {text?:string}[] | undefined;
      return (content || []).map(c => c.text || "").join("");
    });
}

function buildSystem(p: Persona): string {
  const role = p.gender==="여자친구"?"girlfriend":"boyfriend";
  return `You are ${p.name}, a ${p.age}-year-old ${role} with a ${p.personality} personality and ${p.tone} speech style. Interests: ${p.interest}. Reply naturally in Korean as a loving partner. 1-3 sentences. Korean only, no JSON.`;
}

async function translateWithAlts(text: string, forceRetry = false): Promise<TransResult> {
  const key = cacheKey(text);
  if (!forceRetry) {
    const cached = await cacheGet(key);
    if(cached && cached.translation !== "(번역 실패)") return cached;
  }

  const prompt = `Translate the Korean text to English. Give 2 alternative phrasings.
Output ONLY this exact JSON format with no extra text, no markdown, no code blocks:
{"translation":"...","alternatives":["...","..."]}
Korean text: ${text}`;

  try {
    const raw = await callClaude(
      "You are a Korean-English translator. Output only valid JSON. No explanation, no markdown.",
      [{role:"user", content:prompt}]
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if(match) {
      const parsed: TransResult = JSON.parse(match[0]);
      if(parsed.translation) {
        const result = {translation: parsed.translation, alternatives: parsed.alternatives || []};
        cacheSet(key, result);
        return result;
      }
    }
  } catch {}
  return {translation:"(번역 실패)", alternatives:[]};
}

// ── Font Loader — 폰트/아이콘은 로컬 번들(main.tsx, index.html)로 이미 로드됨, 타이틀만 설정 ──
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
function TransBlock({translation,alternatives,isMe,onRetry}:{translation:string;alternatives:string[];isMe:boolean;onRetry?:()=>void}) {
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
        EN {open?"▾":"▸"}
      </button>
      {open&&<>
        {failed ? (
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{fontSize:fs*0.85,color:textColor,fontFamily:ff}}>번역에 실패했어요</div>
            {onRetry&&<button onClick={onRetry} style={{fontSize:12,padding:"3px 10px",borderRadius:8,border:`1px solid ${isMe?"rgba(255,255,255,0.5)":"rgba(106,143,255,0.4)"}`,background:"transparent",color:textColor,cursor:"pointer",fontFamily:ff}}>다시 시도</button>}
          </div>
        ) : (
          <div style={{...enStyle,color:textColor,marginBottom:6}}>{translation}</div>
        )}
        {!failed&&alternatives.length>0&&<>
          <div style={{fontSize:12,color:labelColor,marginBottom:3,fontFamily:ff}}>다른 표현:</div>
          {alternatives.map((a,i)=><div key={i} style={{...enStyle,color:altColor,marginBottom:4}}>{i+1}. {a}</div>)}
        </>}
      </>}
    </div>
  );
}

// ── ConsentGate — 최초 1회 연령/고지 동의 화면 ──
function ConsentGate({onAgree}:{onAgree:()=>void}) {
  const [checked,setChecked]=useState(false);
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:DEFAULT_FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{...glass,position:"relative",zIndex:1,borderRadius:20,padding:28,width:"100%",maxWidth:380}}>
        <div style={{fontWeight:700,fontSize:17,color:"#1a1a3e",marginBottom:14}}>시작하기 전에 확인해주세요</div>
        <div style={{fontSize:13,color:"#4a4a6a",lineHeight:1.8,marginBottom:20}}>
          SweetTalk의 대화 상대는 AI가 생성한 가상의 캐릭터이며, 실제 인간관계를 대체하지 않습니다.<br/>
          본 서비스는 만 14세 이상만 이용할 수 있습니다.
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#333",marginBottom:20,cursor:"pointer"}}>
          <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
          위 내용을 확인했으며 만 14세 이상입니다
        </label>
        <button onClick={onAgree} disabled={!checked} style={{width:"100%",padding:"14px 0",borderRadius:14,border:"none",background:checked?grad:"#ccc",color:"#fff",fontSize:15,cursor:checked?"pointer":"default",fontWeight:700}}>동의하고 시작하기</button>
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
        <div style={{fontSize:18,color:"#4a4a8a",marginBottom:8,textAlign:"center"}}>AI 연인 채팅 + 영어 번역</div>
        <div style={{fontSize:14,color:"#6666aa",marginBottom:44,textAlign:"center"}}>설레는 대화, 자연스러운 영어로</div>
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
        <button onClick={onStart} style={{width:"100%",maxWidth:340,padding:"16px 0",borderRadius:16,border:"none",background:grad,color:"#fff",fontSize:17,cursor:"pointer"}}>시작하기</button>
        <div style={{marginTop:28,fontSize:13,color:"#7777bb",textAlign:"center",lineHeight:1.8}}>설레는 대화로<br/>영어 실력이 자라요</div>
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
      <div style={{...glass,borderBottom:"1px solid rgba(255,255,255,0.4)",padding:"16px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:1}}>
        <div style={{fontWeight:700,fontSize:18,color:"#1a1a3e"}}>연인 목록</div>
        <button onClick={onBack} style={{background:"none",border:"none",fontSize:13,color:"#7777bb",cursor:"pointer",fontWeight:600}}>처음으로</button>
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
                <button onClick={()=>setConfirmId(null)} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:12,color:"#666"}}>취소</button>
                <button onClick={()=>{onDelete(p.id);setConfirmId(null);}} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#e05555",cursor:"pointer",fontSize:12,color:"#fff",fontWeight:600}}>삭제</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={onCreate} style={{padding:"14px 0",borderRadius:14,border:"2px dashed rgba(106,143,255,0.4)",background:"rgba(255,255,255,0.35)",cursor:"pointer",fontSize:15,color:"#7777bb",fontWeight:600}}>+ 새 연인 추가</button>
        {personas.length===0&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:"#9999cc"}}>
            <div style={{fontSize:32,marginBottom:10}}>💌</div>
            <div style={{fontSize:14,lineHeight:1.7}}>아직 만든 연인이 없어요<br/>위 버튼을 눌러 첫 연인을 만들어보세요</div>
          </div>
        )}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={onExport} disabled={personas.length===0} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:personas.length===0?"default":"pointer",fontSize:13,color:personas.length===0?"#bbb":"#6a6aaa"}}>백업 내보내기</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) onImport(f); e.target.value="";}}/>
          <button onClick={()=>fileInputRef.current?.click()} style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:13,color:"#6a6aaa"}}>백업 가져오기</button>
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
    if(key==="age" && (!/^[0-9]{1,2}$/.test(val) || val==="0")) return;
    const nd={...draft,[key]:val}; setDraft(nd); setTxt("");
    if(step<5) setStep(s=>s+1);
    else onDone({gender:nd.gender,name:nd.name,age:nd.age,personality:nd.personality,tone:nd.tone,interest:nd.interest});
  }
  return (
    <div style={{...BG,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:DEFAULT_FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,width:"100%",maxWidth:420,borderRadius:20,padding:32,position:"relative",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,color:"#9999cc"}}>{step+1} / 6</span>
          {!confirmCancel ? (
            <button onClick={handleCancel} style={{background:"none",border:"none",color:"#9999cc",cursor:"pointer",fontSize:13}}>취소</button>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:"#e05555"}}>정말 취소할까요?</span>
              <button onClick={()=>setConfirmCancel(false)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid #ddd",background:"#fff",color:"#666",cursor:"pointer"}}>아니오</button>
              <button onClick={onCancel} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"none",background:"#e05555",color:"#fff",cursor:"pointer"}}>예</button>
            </div>
          )}
        </div>
        <div style={{height:4,background:"rgba(106,143,255,0.15)",borderRadius:4,marginBottom:24}}>
          <div style={{width:`${((step+1)/6)*100}%`,height:"100%",background:grad,borderRadius:4,transition:"width 0.3s"}}/>
        </div>
        <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e",marginBottom:24}}>{STEP_Q[step]}</div>
        {opts?(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
              {opts.map((o:string)=>(
                <button key={o} onClick={()=>setDraft(d=>({...d,[STEP_KEYS[step]]:o}))}
                  style={{padding:"12px 18px",borderRadius:10,border:`1.5px solid ${curVal===o?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:curVal===o?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",textAlign:"left",fontSize:15,color:curVal===o?"#3a5fff":"#333"}}>{o}</button>
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
            <button onClick={goNext} disabled={!txt.trim()} style={{...btnSt,background:txt.trim()?grad:"#ccc",cursor:txt.trim()?"pointer":"default"}}>{step===5?"완료":"다음"}</button>
          </>
        )}
        {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{marginTop:16,background:"none",border:"none",color:"#9999cc",fontSize:13,cursor:"pointer"}}>이전으로</button>}
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
        <div style={{fontWeight:700,fontSize:17,marginBottom:20,color:"#1a1a3e"}}>페르소나 편집</div>
        {([["성별",["여자친구","남자친구"],"gender"],["성격",PERSONALITY_OPTS,"personality"],["말투",TONE_OPTS,"tone"],["관심사",INTEREST_OPTS,"interest"]] as [string,string[],keyof Persona][]).map(([label,opts,key])=>(
          <div key={key}>
            <span style={lbl}>{label}</span>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {opts.map((o:string)=><button key={o} style={chip(o,p[key] as string)} onClick={()=>setP(prev=>({...prev,[key]:o}))}>{o}</button>)}
            </div>
          </div>
        ))}
        <span style={lbl}>이름</span><input value={name} onChange={e=>setName(e.target.value)} style={inp}/>
        <span style={lbl}>나이</span><input value={age} onChange={e=>setAge(e.target.value)} style={inp}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,color:"#666"}}>취소</button>
          <button onClick={()=>onSave({...p,name:name.trim()||p.name,age:age.trim()||p.age})} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:grad,cursor:"pointer",fontSize:14,color:"#fff",fontWeight:700}}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsTab ──
function SettingsTab({fontSize,setFontSize,fontFamily,setFontFamily,onClearChat,onClose}:{fontSize:number;setFontSize:(f:number|((n:number)=>number))=>void;fontFamily:string;setFontFamily:(f:string)=>void;onClearChat:()=>void;onClose:()=>void}) {
  const [confirmDelete,setConfirmDelete]=useState(false);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,padding:28,paddingBottom:36,fontFamily}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e"}}>환경설정</div>
          <button onClick={onClose} aria-label="닫기" style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>
        {/* 폰트 선택 */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>글꼴</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {FONT_OPTIONS.map(f=>(
              <button key={f.value} onClick={()=>setFontFamily(f.value)}
                style={{padding:"12px 14px",borderRadius:10,border:`1.5px solid ${fontFamily===f.value?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:fontFamily===f.value?"rgba(106,143,255,0.1)":"#fafaff",cursor:"pointer",textAlign:"left",fontFamily:f.value,fontSize:16,color:fontFamily===f.value?"#3a5fff":"#333"}}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {/* 글자 크기 */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>글자 크기</div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <button onClick={()=>setFontSize((s:number)=>Math.max(12,s-1))} aria-label="글자 크기 줄이기" style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:fontSize,color:"#333",lineHeight:1.6,fontFamily}}>안녕, 오늘 어때? Hi there!</div>
              <div style={{fontSize:12,color:"#aaa",marginTop:4}}>{fontSize}px</div>
            </div>
            <button onClick={()=>setFontSize((s:number)=>Math.min(24,s+1))} aria-label="글자 크기 늘리기" style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
          </div>
          <input type="range" min={12} max={24} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{width:"100%",marginTop:12,accentColor:"#6a8fff"} as CSSProperties}/>
          <button onClick={()=>setFontSize(DEFAULT_FONT_SIZE)} style={{marginTop:8,background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",fontFamily}}>기본값으로 초기화 ({DEFAULT_FONT_SIZE}px)</button>
        </div>
        {/* 채팅 삭제 — 2단계 확인 (window.confirm 미사용) */}
        <div style={{borderTop:"1px solid #f0f0f0",paddingTop:20}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:12}}>대화 관리</div>
          {!confirmDelete ? (
            <button
              onClick={()=>setConfirmDelete(true)}
              style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #ffaaaa",background:"#fff5f5",cursor:"pointer",fontSize:14,color:"#e05555",fontFamily,fontWeight:600}}>
              대화 내용 전체 삭제
            </button>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:13,color:"#e05555",textAlign:"center",marginBottom:2}}>정말 삭제할까요? 되돌릴 수 없어요.</div>
              <div style={{display:"flex",gap:8}}>
                <button
                  onClick={()=>setConfirmDelete(false)}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"1.5px solid #ddd",background:"#f5f5f5",cursor:"pointer",fontSize:14,color:"#666",fontFamily}}>
                  취소
                </button>
                <button
                  onClick={()=>{
                    onClearChat();
                    setConfirmDelete(false);
                    onClose();
                  }}
                  style={{flex:1,padding:"12px 0",borderRadius:12,border:"none",background:"#e05555",cursor:"pointer",fontSize:14,color:"#fff",fontFamily,fontWeight:700}}>
                  삭제하기
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
  const bottomRef=useRef<HTMLDivElement>(null);
  const personaRef=useRef<Persona>(persona);
  const [isOnline,setIsOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:true);
  const [justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{personaRef.current=persona;},[persona]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[persona.messages,aiLoading]);
  useEffect(()=>{ globalFontSize = fontSize; },[fontSize]);
  useEffect(()=>{ globalFontFamily = fontFamily; },[fontFamily]);
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
    callClaude(buildSystem(p),history)
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
      }).catch(()=>{
        setAiLoading(false);
        updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:"(연결에 실패했어요. 잠시 후 다시 시도해주세요)",translation:"",alternatives:[]}]}));
      });
  },[updatePersona]);

  useEffect(()=>{
    if(persona.messages.length===0&&!aiLoading){
      setAiLoading(true);
      callClaude(buildSystem(persona),[{role:"user",content:"안녕, 처음 만나서 반가워. 자기소개 해줘."}])
        .then(raw=>{
          const reply=raw.trim(); if(!reply){setAiLoading(false);return;}
          return translateWithAlts(reply).then(trans=>{
            updatePersona(persona.id,p=>({...p,messages:[{role:"ai",text:reply,translation:trans.translation,alternatives:trans.alternatives}]}));
            setAiLoading(false);
          });
        }).catch(()=>setAiLoading(false));
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
    if(!input.trim() || sendingRef.current) return;
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
    const text=input.trim().slice(0,500); setInput("");
    setTimeout(()=>{ sendingRef.current = false; }, 300); // 더블클릭 방지용 짧은 잠금
    const userMsg: Message={role:"user",text,translation:"",alternatives:[]};
    let snapshot: Message[]=[];
    updatePersona(persona.id,p=>{snapshot=[...p.messages,userMsg];return{...p,messages:snapshot};});
    translateWithAlts(text).then(trans=>{
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

  const FAILURE_TEXTS = new Set(["(오프라인 상태예요. 네트워크 연결 후 다시 시도해주세요)","(응답을 받지 못했어요. 다시 시도해주세요)","(연결에 실패했어요. 잠시 후 다시 시도해주세요)"]);
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
      {showSettings&&<SettingsTab fontSize={fontSize} setFontSize={setFontSize} fontFamily={fontFamily} setFontFamily={setFontFamily} onClearChat={clearChat} onClose={()=>setShowSettings(false)}/>}
      {/* Header — 고정 */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,position:"sticky",top:0,zIndex:20}}>
        <button onClick={onBack} aria-label="뒤로가기" style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#555",padding:"0 4px"}}>‹</button>
        <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:15,color:"#6a8fff"}}>{persona.name[0]}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{persona.name}</div>
          <div style={{fontSize:11,color:"#999"}}>{persona.age}세 · {persona.personality}</div>
        </div>
        <button onClick={()=>setShowEdit(true)} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,color:"#555",marginRight:4}}>편집</button>
        <button onClick={()=>setShowSettings(true)} aria-label="설정" style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16,color:"#888"}}>⚙️</button>
      </div>
      {!isOnline&&(
        <div style={{background:"#fff3cd",color:"#8a6d1f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>
          오프라인 상태입니다. 네트워크 연결을 확인해주세요.
        </div>
      )}
      {isOnline&&justReconnected&&(
        <div style={{background:"#e6f9ee",color:"#1f8a4f",fontSize:12,textAlign:"center",padding:"6px 0",flexShrink:0}}>
          다시 연결되었어요. 메시지를 보낼 수 있어요.
        </div>
      )}
      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:14}}>
        {persona.messages.map((m,i)=>{
          const isMe=m.role==="user";
          return (
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
              {!isMe&&<div style={{fontSize:11.5,fontWeight:600,color:"#777",marginBottom:3}}>{persona.name}</div>}
              <div style={{maxWidth:"78%",background:isMe?"#4a9fff":"#fff",color:isMe?"#fff":"#111",borderRadius:isMe?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"10px 13px",fontSize:fontSize,lineHeight:1.6,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                {m.text}
                {!isMe&&FAILURE_TEXTS.has(m.text)&&(
                  <div style={{marginTop:6}}>
                    <button onClick={()=>retryReply(i)} style={{fontSize:12,padding:"4px 10px",borderRadius:8,border:"1px solid #ddd",background:"#fafafa",color:"#555",cursor:"pointer"}}>다시 시도</button>
                  </div>
                )}
                {m.translation&&<TransBlock translation={m.translation} alternatives={m.alternatives} isMe={isMe} onRetry={()=>retryTranslate(i)}/>}
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
          placeholder={`${persona.name}에게 메시지 보내기...`} rows={1}
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
  const [personas,setPersonas]=useState<Persona[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [lastExportAt,setLastExportAt]=useState<number|null>(null);
  const BACKUP_REMINDER_MS = 7*24*60*60*1000; // 7일

  useEffect(()=>{
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
    const initial = personas.length>0 ? "list" : "landing";
    navigate(initial);
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
  if(screen==="consent") return <>{fl}<ConsentGate onAgree={agreeConsent}/></>;
  if(screen==="landing") return <>{fl}<Landing onStart={()=>navigate("list")}/></>;
  if(screen==="list") {
    const hasHistory = personas.some(p=>p.messages.length>0);
    const showBackupReminder = hasHistory && (!lastExportAt || Date.now()-lastExportAt>BACKUP_REMINDER_MS);
    return <>{fl}<PersonaList personas={personas} activeId={activeId} onSelect={id=>navigate("chat",id)} onCreate={()=>navigate("setup")} onBack={()=>navigate("landing")} onDelete={deletePersona} onExport={exportBackup} onImport={importBackup} showBackupReminder={showBackupReminder}/></>;
  }
  if(screen==="setup") return <>{fl}<SetupWizard onDone={handleSetupDone} onCancel={()=>navigate(personas.length>0?"list":"landing")}/></>;
  if(screen==="chat"&&active) return <>{fl}<Chat persona={active} onBack={()=>navigate("list")} updatePersona={updatePersona}/></>;
  return null;
}
