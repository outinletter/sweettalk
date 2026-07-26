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
    storage: {
      get(key: string, shared: boolean): Promise<StorageResult|null>;
      set(key: string, value: string, shared: boolean): Promise<void>;
    };
  }
}

// ── 상수 ──
const FONT_URL = "https://fonts.googleapis.com/css2?family=Jua&display=swap";
const FONT_FAMILY = "'Jua','Apple SD Gothic Neo',sans-serif";
const ICON_URL = "https://raw.githubusercontent.com/outinletter/sweettalk/main/SweetTalk.jpg";
const STORAGE_KEY = "personas_v1";
const DEFAULT_FONT_SIZE = 16;
const grad = "linear-gradient(135deg,#6a8fff,#a56bff)";
const glass: CSSProperties = { background:"rgba(255,255,255,0.65)", backdropFilter:"blur(16px)" };
const BG: CSSProperties = { minHeight:"100vh", background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)", position:"relative", overflow:"hidden" };

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

// ── Storage ──
async function loadPersonas(): Promise<Persona[]> {
  try {
    const r = await window.storage.get(STORAGE_KEY, false);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}
async function savePersonas(list: Persona[]): Promise<void> {
  try {
    const trimmed = list.map(p=>({...p, messages: p.messages.slice(-40)}));
    await window.storage.set(STORAGE_KEY, JSON.stringify(trimmed), false);
  } catch {}
}
function cacheKey(t: string): string { return "tr:"+t.trim().toLowerCase().replace(/\s+/g," ").slice(0,180); }
async function cacheGet(k: string): Promise<TransResult|null> {
  try { const r = await window.storage.get(k,true); return r?JSON.parse(r.value):null; } catch { return null; }
}
function cacheSet(k: string, v: TransResult): void { window.storage.set(k,JSON.stringify(v),true).catch(()=>{}); }

// ── Claude API ──
function callGemini(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const key = (window as Record<string,string>)["__GEMINI_KEY__"] ?? "";
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
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body)
  }).then(r => r.json())
    .then((d: Record<string, unknown>) => {
      const candidates = d.candidates as {content:{parts:{text:string}[]}}[] | undefined;
      return candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    });
}

function callClaude(system: string, msgs: ClaudeMsg[]): Promise<string> {
  const geminiKey = (window as Record<string,string>)["__GEMINI_KEY__"];
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
async function translateWithAlts(text: string): Promise<TransResult> {
  const key = cacheKey(text);
  const cached = await cacheGet(key);
  if(cached) return cached;
  const prompt = `Translate the Korean text to English. Give 2 alternative phrasings. Output ONLY valid JSON: {"translation":"...","alternatives":["...","..."]} Korean: ${text}`;
  try {
    const raw = await callClaude("You are a Korean-English translator. Respond with valid JSON only.",[{role:"user",content:prompt}]);
    const p: TransResult = JSON.parse(raw.replace(/```json|```/g,"").trim());
    if(p.translation){ cacheSet(key,p); return p; }
  } catch {}
  return {translation:"(번역 실패)",alternatives:[]};
}

// ── Font Loader ──
function FontLoader() {
  useEffect(()=>{
    const font = document.createElement("link"); font.rel="stylesheet"; font.href=FONT_URL;
    document.head.appendChild(font);
    const tags: {rel:string;href:string;type?:string}[] = [
      {rel:"apple-touch-icon",href:ICON_URL},
      {rel:"icon",type:"image/jpeg",href:ICON_URL},
    ];
    const els = tags.map(attrs=>{ const el=document.createElement("link"); Object.assign(el,attrs); document.head.appendChild(el); return el; });
    document.title="SweetTalk";
    return ()=>{ document.head.removeChild(font); els.forEach(el=>document.head.removeChild(el)); };
  },[]);
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
function TransBlock({translation,alternatives,isMe}:{translation:string;alternatives:string[];isMe:boolean}) {
  const [open,setOpen]=useState(true);
  return (
    <div style={{marginTop:6,fontSize:11.5,color:isMe?"#a0c4ff":"#888",borderLeft:`2px solid ${isMe?"rgba(74,159,255,0.35)":"#ccc"}`,paddingLeft:8,lineHeight:1.7}}>
      <div style={{cursor:"pointer",fontWeight:600,userSelect:"none",marginBottom:2}} onClick={()=>setOpen(o=>!o)}>EN {open?"▾":"▸"}</div>
      {open&&<>
        <div style={{marginBottom:3,color:isMe?"#c8e0ff":"#555"}}>📌 {translation}</div>
        <div style={{fontSize:11,color:isMe?"rgba(123,184,255,0.6)":"#999"}}>다른 표현:</div>
        {alternatives.map((a:string,i:number)=><div key={i} style={{color:isMe?"#99ccff":"#777"}}>{i+1}. {a}</div>)}
      </>}
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
  const s: CSSProperties = {...BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 24px",fontFamily:FONT_FAMILY};
  return (
    <div style={s}>
      <Blobs/>
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",width:"100%"}}>
        <div style={{width:88,height:88,borderRadius:24,overflow:"hidden",boxShadow:"0 8px 32px rgba(106,143,255,0.35)",marginBottom:28}}>
          <img src={ICON_URL} alt="SweetTalk" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
        <div style={{fontSize:36,fontWeight:800,color:"#1a1a2e",letterSpacing:-1,marginBottom:8,textAlign:"center",fontFamily:FONT_FAMILY}}>SweetTalk</div>
        <div style={{fontSize:18,color:"#4a4a8a",marginBottom:8,textAlign:"center",fontFamily:FONT_FAMILY}}>AI 연인 채팅 + 영어 번역</div>
        <div style={{fontSize:14,color:"#6666aa",marginBottom:44,textAlign:"center",fontFamily:FONT_FAMILY}}>설레는 대화, 자연스러운 영어로</div>
        <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:340,marginBottom:44}}>
          {features.map(f=>(
            <div key={f.title} style={{...glass,borderRadius:16,padding:"16px 18px",display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{f.icon}</div>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e",marginBottom:3,fontFamily:FONT_FAMILY}}>{f.title}</div>
                <div style={{fontSize:12.5,color:"#6666aa",lineHeight:1.6,whiteSpace:"pre-line",fontFamily:FONT_FAMILY}}>{f.text}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onStart} style={{width:"100%",maxWidth:340,padding:"16px 0",borderRadius:16,border:"none",background:grad,color:"#fff",fontSize:17,cursor:"pointer",fontFamily:FONT_FAMILY}}>시작하기</button>
        <div style={{marginTop:28,fontSize:13,color:"#7777bb",textAlign:"center",lineHeight:1.8,fontFamily:FONT_FAMILY}}>설레는 대화로<br/>영어 실력이 자라요</div>
      </div>
    </div>
  );
}

// ── PersonaList ──
function PersonaList({personas,activeId,onSelect,onCreate,onBack}:{personas:Persona[];activeId:string|null;onSelect:(id:string)=>void;onCreate:()=>void;onBack:()=>void}) {
  return (
    <div style={{...BG,maxWidth:500,margin:"0 auto",fontFamily:FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,borderBottom:"1px solid rgba(255,255,255,0.4)",padding:"16px 18px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:1}}>
        <div style={{fontWeight:700,fontSize:18,color:"#1a1a3e"}}>연인 목록</div>
        <button onClick={onBack} style={{background:"none",border:"none",fontSize:13,color:"#7777bb",cursor:"pointer",fontWeight:600,fontFamily:FONT_FAMILY}}>처음으로</button>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:12,position:"relative",zIndex:1}}>
        {personas.map(p=>(
          <div key={p.id} onClick={()=>onSelect(p.id)} style={{...glass,borderRadius:14,padding:"16px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,border:`2px solid ${p.id===activeId?"#6a8fff":"rgba(255,255,255,0.5)"}`}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:18,color:"#6a8fff",flexShrink:0}}>{p.name[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:"#1a1a3e"}}>{p.name} <span style={{fontWeight:400,fontSize:12,color:"#8888bb"}}>{p.age}세</span></div>
              <div style={{fontSize:12,color:"#8888bb",marginTop:2}}>{p.gender} · {p.personality} · {p.interest}</div>
              <div style={{fontSize:11,color:"#aaaacc",marginTop:3}}>{p.messages.length>0?`대화 ${p.messages.length}개`:"대화 없음"}</div>
            </div>
            {p.id===activeId&&<div style={{fontSize:12,color:"#6a8fff",fontWeight:600}}>대화 중</div>}
          </div>
        ))}
        <button onClick={onCreate} style={{padding:"14px 0",borderRadius:14,border:"2px dashed rgba(106,143,255,0.4)",background:"rgba(255,255,255,0.35)",cursor:"pointer",fontSize:15,color:"#7777bb",fontWeight:600,fontFamily:FONT_FAMILY}}>+ 새 연인 추가</button>
      </div>
    </div>
  );
}

// ── SetupWizard ──
function SetupWizard({onDone,onCancel}:{onDone:(p:Omit<Persona,"id"|"messages">)=>void;onCancel:()=>void}) {
  const [step,setStep]=useState(0);
  const [draft,setDraft]=useState<Record<string,string>>({});
  const [txt,setTxt]=useState("");
  const opts = STEP_OPTS[step];
  const curVal = draft[STEP_KEYS[step]];
  const btnSt: CSSProperties = {width:"100%",padding:"13px 0",borderRadius:12,border:"none",background:grad,color:"#fff",fontSize:16,cursor:"pointer",fontFamily:FONT_FAMILY};
  function goNext() {
    const key=STEP_KEYS[step];
    const val=opts?draft[key]:txt.trim();
    if(!val) return;
    const nd={...draft,[key]:val}; setDraft(nd); setTxt("");
    if(step<5) setStep(s=>s+1);
    else onDone({gender:nd.gender,name:nd.name,age:nd.age,personality:nd.personality,tone:nd.tone,interest:nd.interest});
  }
  return (
    <div style={{...BG,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:FONT_FAMILY}}>
      <Blobs/>
      <div style={{...glass,width:"100%",maxWidth:420,borderRadius:20,padding:32,position:"relative",zIndex:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,color:"#9999cc"}}>{step+1} / 6</span>
          <button onClick={onCancel} style={{background:"none",border:"none",color:"#9999cc",cursor:"pointer",fontSize:13,fontFamily:FONT_FAMILY}}>취소</button>
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
                  style={{padding:"12px 18px",borderRadius:10,border:`1.5px solid ${curVal===o?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:curVal===o?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",textAlign:"left",fontSize:15,color:curVal===o?"#3a5fff":"#333",fontFamily:FONT_FAMILY}}>{o}</button>
              ))}
            </div>
            {curVal&&<button onClick={goNext} style={btnSt}>{step===5?"완료":"다음"}</button>}
          </>
        ):(
          <>
            <input autoFocus value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&goNext()}
              placeholder={STEP_PH[step]??""} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:15,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box",fontFamily:FONT_FAMILY}}/>
            <button onClick={goNext} disabled={!txt.trim()} style={{...btnSt,background:txt.trim()?grad:"#ccc",cursor:txt.trim()?"pointer":"default"}}>{step===5?"완료":"다음"}</button>
          </>
        )}
        {step>0&&<button onClick={()=>setStep(s=>s-1)} style={{marginTop:16,background:"none",border:"none",color:"#9999cc",fontSize:13,cursor:"pointer",fontFamily:FONT_FAMILY}}>이전으로</button>}
      </div>
    </div>
  );
}

// ── EditModal ──
function EditModal({profile,onSave,onClose}:{profile:Persona;onSave:(p:Persona)=>void;onClose:()=>void}) {
  const [p,setP]=useState<Persona>({...profile});
  const [name,setName]=useState(profile.name);
  const [age,setAge]=useState(profile.age);
  const chip=(v:string,cur:string):CSSProperties=>({padding:"8px 12px",borderRadius:8,border:`1.5px solid ${v===cur?"#6a8fff":"rgba(106,143,255,0.25)"}`,background:v===cur?"rgba(106,143,255,0.12)":"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:13,color:v===cur?"#3a5fff":"#333",fontWeight:v===cur?600:400,fontFamily:FONT_FAMILY});
  const inp: CSSProperties = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",fontSize:14,outline:"none",background:"rgba(255,255,255,0.7)",marginBottom:16,boxSizing:"border-box",fontFamily:FONT_FAMILY};
  const lbl: CSSProperties = {fontSize:12,fontWeight:600,color:"#7777aa",marginBottom:8,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"rgba(240,244,255,0.97)",backdropFilter:"blur(20px)",borderRadius:20,width:"100%",maxWidth:420,maxHeight:"88vh",overflowY:"auto",padding:24,fontFamily:FONT_FAMILY}}>
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
          <button onClick={onClose} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,color:"#666",fontFamily:FONT_FAMILY}}>취소</button>
          <button onClick={()=>onSave({...p,name:name.trim()||p.name,age:age.trim()||p.age})} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:grad,cursor:"pointer",fontSize:14,color:"#fff",fontWeight:700,fontFamily:FONT_FAMILY}}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsTab ──
function SettingsTab({fontSize,setFontSize,onClearChat,onClose}:{fontSize:number;setFontSize:(f:number|((n:number)=>number))=>void;onClearChat:()=>void;onClose:()=>void}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:500,padding:28,paddingBottom:36,fontFamily:FONT_FAMILY}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700,color:"#1a1a3e"}}>환경설정</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#aaa"}}>✕</button>
        </div>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:14}}>글자 크기</div>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <button onClick={()=>setFontSize((s:number)=>Math.max(12,s-1))} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:fontSize,color:"#333",lineHeight:1.6}}>안녕, 오늘 어때?</div>
              <div style={{fontSize:12,color:"#aaa",marginTop:4}}>{fontSize}px</div>
            </div>
            <button onClick={()=>setFontSize((s:number)=>Math.min(24,s+1))} style={{width:40,height:40,borderRadius:10,border:"1.5px solid rgba(106,143,255,0.3)",background:"#f5f5ff",cursor:"pointer",fontSize:20,color:"#6a8fff",display:"flex",alignItems:"center",justifyContent:"center"}}>＋</button>
          </div>
          <input type="range" min={12} max={24} value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{width:"100%",marginTop:12,accentColor:"#6a8fff"} as CSSProperties}/>
          <button onClick={()=>setFontSize(DEFAULT_FONT_SIZE)} style={{marginTop:8,background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",fontFamily:FONT_FAMILY}}>기본값으로 초기화 ({DEFAULT_FONT_SIZE}px)</button>
        </div>
        <div style={{borderTop:"1px solid #f0f0f0",paddingTop:20}}>
          <div style={{fontSize:14,fontWeight:600,color:"#555",marginBottom:12}}>대화 관리</div>
          <button onClick={()=>{if(window.confirm("대화 내용을 모두 삭제할까요?")){onClearChat();onClose();}}}
            style={{width:"100%",padding:"12px 0",borderRadius:12,border:"1.5px solid #ffaaaa",background:"#fff5f5",cursor:"pointer",fontSize:14,color:"#e05555",fontFamily:FONT_FAMILY,fontWeight:600}}>
            대화 내용 전체 삭제
          </button>
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
  const bottomRef=useRef<HTMLDivElement>(null);
  const personaRef=useRef<Persona>(persona);
  useEffect(()=>{personaRef.current=persona;},[persona]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[persona.messages,aiLoading]);

  const genReply=useCallback((msgs: Message[])=>{
    const p=personaRef.current;
    setAiLoading(true);
    const history: ClaudeMsg[]=msgs.map(m=>({role:m.role==="ai"?"assistant":"user",content:m.text}));
    callClaude(buildSystem(p),history)
      .then(raw=>{
        const reply=raw.trim(); if(!reply){setAiLoading(false);return;}
        return translateWithAlts(reply).then(trans=>{
          updatePersona(p.id,pr=>({...pr,messages:[...pr.messages,{role:"ai",text:reply,translation:trans.translation,alternatives:trans.alternatives}]}));
          setAiLoading(false);
        });
      }).catch(()=>setAiLoading(false));
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

  function sendMessage() {
    if(!input.trim()) return;
    const text=input.trim(); setInput("");
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

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#f0f2f5",maxWidth:500,margin:"0 auto",fontFamily:FONT_FAMILY}}>
      {showEdit&&<EditModal profile={persona} onSave={p=>{updatePersona(persona.id,()=>p);setShowEdit(false);}} onClose={()=>setShowEdit(false)}/>}
      {showSettings&&<SettingsTab fontSize={fontSize} setFontSize={setFontSize} onClearChat={()=>updatePersona(persona.id,p=>({...p,messages:[]}))} onClose={()=>setShowSettings(false)}/>}
      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #eee",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#555",padding:"0 4px"}}>‹</button>
        <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#e8ecff,#d8d0ff)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:15,color:"#6a8fff"}}>{persona.name[0]}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15,color:"#111"}}>{persona.name}</div>
          <div style={{fontSize:11,color:"#999"}}>{persona.age}세 · {persona.personality}</div>
        </div>
        <button onClick={()=>setShowEdit(true)} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12,color:"#555",marginRight:4,fontFamily:FONT_FAMILY}}>편집</button>
        <button onClick={()=>setShowSettings(true)} style={{background:"none",border:"1.5px solid #ddd",borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:16,color:"#888"}}>⚙️</button>
      </div>
      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 14px",display:"flex",flexDirection:"column",gap:14,paddingBottom:8}}>
        {persona.messages.map((m,i)=>{
          const isMe=m.role==="user";
          return (
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
              {!isMe&&<div style={{fontSize:11.5,fontWeight:600,color:"#777",marginBottom:3}}>{persona.name}</div>}
              <div style={{maxWidth:"78%",background:isMe?"#4a9fff":"#fff",color:isMe?"#fff":"#111",borderRadius:isMe?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"10px 13px",fontSize:fontSize,lineHeight:1.6,boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                {m.text}
                {m.translation&&<TransBlock translation={m.translation} alternatives={m.alternatives} isMe={isMe}/>}
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
      {/* Input — 하단 고정, 안전 영역(노치/홈바) 고려 */}
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
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
          placeholder={`${persona.name}에게 메시지 보내기...`} rows={1}
          style={{flex:1,border:"1.5px solid #ddd",borderRadius:12,padding:"10px 13px",fontSize:14,resize:"none",outline:"none",fontFamily:FONT_FAMILY,lineHeight:1.5,maxHeight:120,overflowY:"auto"}}/>
        <button onClick={sendMessage} disabled={!input.trim()} style={{width:42,height:42,borderRadius:12,border:"none",background:input.trim()?"#4a9fff":"#ccc",cursor:input.trim()?"pointer":"default",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>↑</button>
      </div>
    </div>
  );
}

// ── App ──
export default function App() {
  const [screen,setScreen]=useState<"loading"|"landing"|"list"|"setup"|"chat">("loading");
  const [personas,setPersonas]=useState<Persona[]>([]);
  const [activeId,setActiveId]=useState<string|null>(null);

  useEffect(()=>{
    loadPersonas().then(saved=>{
      if(saved.length>0){ setPersonas(saved); setScreen("list"); }
      else setScreen("landing");
    });
  },[]);

  useEffect(()=>{
    if(screen==="loading") return;
    savePersonas(personas);
  },[personas, screen]);

  function updatePersona(id:string, fn:(p:Persona)=>Persona) {
    setPersonas(prev=>prev.map(p=>p.id===id?fn(p):p));
  }
  function handleSetupDone(profile:Omit<Persona,"id"|"messages">) {
    const id=Date.now().toString();
    setPersonas(prev=>[...prev,{id,...profile,messages:[]}]);
    setActiveId(id); setScreen("chat");
  }
  const active=personas.find(p=>p.id===activeId);

  const fl=<FontLoader/>;
  if(screen==="loading") return <>{fl}<div style={{minHeight:"100vh",background:"linear-gradient(145deg,#c9b8f0 0%,#a8c4f0 40%,#b8d4f8 70%,#d4e8ff 100%)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT_FAMILY}}><div style={{color:"#7777bb",fontSize:15}}>SweetTalk 불러오는 중...</div></div></>;
  if(screen==="landing") return <>{fl}<Landing onStart={()=>setScreen("list")}/></>;
  if(screen==="list") return <>{fl}<PersonaList personas={personas} activeId={activeId} onSelect={id=>{setActiveId(id);setScreen("chat");}} onCreate={()=>setScreen("setup")} onBack={()=>setScreen("landing")}/></>;
  if(screen==="setup") return <>{fl}<SetupWizard onDone={handleSetupDone} onCancel={()=>setScreen(personas.length>0?"list":"landing")}/></>;
  if(screen==="chat"&&active) return <>{fl}<Chat persona={active} onBack={()=>setScreen("list")} updatePersona={updatePersona}/></>;
  return null;
}
