import { useState } from 'react';
import { getLanguage } from './i18n';
import { readPhrases, writePhrases } from './phrasebook';

export const copy = (ko:string,en:string,ja:string,zh:string) => ({ko,en,ja,'zh-CN':zh}[getLanguage()] || en);
export function Practice({onUse}:{onUse:(text:string)=>void}) {
  const [phrases,setPhrases]=useState(readPhrases);
  const [index,setIndex]=useState(0);
  const [answer,setAnswer]=useState('');
  const [revealed,setRevealed]=useState(false);
  const [completed,setCompleted]=useState(0);
  const phrase=phrases[index];
  const button={padding:12,minHeight:44,borderRadius:10,border:'1px solid #aaa',background:'#fff',font:'inherit',cursor:'pointer'};
  function next(){setCompleted(n=>n+1);setIndex(i=>(i+1)%Math.max(phrases.length,1));setAnswer('');setRevealed(false);}
  return <section style={{padding:16,color:'#222',fontFamily:'system-ui,sans-serif'}}>
    <h3>{copy('표현 다시 쓰기','Use your phrases','表現を使う','运用表达')}</h3>
    <p style={{margin:'12px 0'}}>{copy('번역을 보고 원래 표현을 떠올린 뒤, 새 문장에 써보세요.','Recall the original from its translation, then use it in a new sentence.','訳から元の表現を思い出し、新しい文で使いましょう。','根据译文回忆原文，再用于新句子。')}</p>
    <p aria-live="polite">{copy('이번 복습 완료','Completed this session','今回の復習完了','本次已复习')}: {completed}</p>
    {!phrase?<p>{copy('대화의 별 버튼으로 표현을 먼저 저장하세요.','Save a phrase using the star in a conversation first.','会話の星ボタンで表現を保存してください。','请先用对话中的星号保存表达。')}</p>:<>
      <p style={{padding:16,background:'#eef2ff',margin:'12px 0'}}>{phrase.translation}</p>
      <textarea aria-label={copy('새 문장','New sentence','新しい文','新句子')} value={answer} onChange={e=>setAnswer(e.target.value.slice(0,2000))} placeholder={copy('기억나는 표현으로 새 문장을 써보세요','Write a new sentence using the phrase','表現を使って新しい文を書きましょう','用这个表达写一个新句子')} style={{width:'100%',minHeight:90,font:'inherit',padding:12}}/>
      <button style={button} onClick={()=>setRevealed(true)}>{copy('원문 확인','Reveal original','原文を見る','查看原文')}</button>
      {revealed&&<><p style={{margin:'12px 0'}}>{phrase.text}</p><p>{copy('자동 채점이 아닙니다. 원문과 비교하여 확인하세요.','Self-review: compare with the original; this is not automatic grading.','自動採点ではありません。原文と比べて確認してください。','请自行对照原文；这不是自动评分。')}</p><button style={button} onClick={next}>{copy('확인 완료 · 다음','Reviewed · Next','確認済み・次へ','已复习 · 下一个')}</button></>}
      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button style={button} disabled={!answer.trim()} onClick={()=>onUse(answer.trim())}>{copy('대화에서 사용','Use in chat','会話で使う','用于对话')}</button><button style={button} onClick={()=>{const nextPhrases=phrases.filter((_,i)=>i!==index);writePhrases(nextPhrases);setPhrases(nextPhrases);setIndex(0);setAnswer('');setRevealed(false);}}>{copy('표현 삭제','Delete phrase','表現を削除','删除表达')}</button></div>
    </>}
    <h4 style={{marginTop:24}}>{copy('상황 연습 시작','Start a scenario','場面練習を始める','开始情景练习')}</h4>
    {[
      copy('카페에서 음료를 주문하는 대화를 연습하고 싶어요. 먼저 주문을 물어봐 주세요.','Help me practice ordering a drink at a café. Ask for my order first.','カフェで飲み物を注文する練習をしたいです。まず注文を聞いてください。','我想练习在咖啡店点饮料，请先问我点什么。'),
      copy('친구에게 주말 약속을 제안하는 대화를 연습하고 싶어요. 제가 먼저 제안할게요.','Help me practice inviting a friend to meet this weekend. I will suggest a plan first.','友達を週末の予定に誘う練習をしたいです。私から提案します。','我想练习邀请朋友周末见面，我先提出计划。'),
      copy('이 대화에서 제가 쓴 문장 하나의 자연스러운 교정과 이유를 알려주세요.','Suggest a natural correction and explain why for one sentence I wrote in this conversation.','この会話で私が書いた文を一つ自然に直し、理由も説明してください。','请自然地修改我在这段对话中写的一句话，并解释原因。')
    ].map((text,i)=><button key={i} style={{...button,display:'block',width:'100%',textAlign:'left',marginTop:8}} onClick={()=>onUse(text)}>{text}</button>)}
  </section>;
}
