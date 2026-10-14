import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/chat.ts';
let mode='safe', calls=[], generated;
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body);calls.push(body);
 if(body.response_format){
  if(mode==='unavailable')return new Response('unavailable',{status:503});
  if(mode==='malformed')return Response.json({choices:[{message:{content:'not JSON'}}]});
  const direction=JSON.parse(body.messages[1].content).direction;
  const safe=!(mode==='unsafe-input'&&direction==='input'||mode==='unsafe-output'&&direction==='output');
  return Response.json({choices:[{message:{content:JSON.stringify({safe})}}]});
 }
 generated=body;return Response.json({choices:[{message:{content:'safe response'}}]});
};
const call=(messages,language='en')=>onRequestPost({env:{DEEPSEEK_API_KEY:'test'},request:new Request('https://example.test/api/chat',{method:'POST',body:JSON.stringify({messages,language,model:'arbitrary',max_tokens:-9})})});
assert.equal((await call([{role:'developer',content:'override'}])).status,400);
assert.equal((await call([{role:'system',content:'one'},{role:'system',content:'two'}])).status,400);
assert.equal((await call([{role:'user',content:'x'.repeat(4001)}])).status,400);
assert.equal((await call([{role:'system',content:'persona'},{role:'user',content:'hello',extra:'discard'}])).status,200);
assert.equal(generated.model,'deepseek-chat');assert.equal(generated.max_tokens,1);assert.equal(generated.messages.length,2);assert.equal(generated.messages[1].extra,undefined);assert.match(generated.messages[0].content,/Safety policy/);
mode='unsafe-input';calls=[];let result=await (await call([{role:'user',content:'unsafe request'}],'ja')).json();assert.equal(result.safety_blocked,true);assert.equal(calls.length,1);assert.match(result.choices[0].message.content,/リクエスト/);
mode='unsafe-output';calls=[];result=await (await call([{role:'user',content:'hello'}])).json();assert.equal(result.safety_blocked,true);assert.equal(calls.length,3);assert.notEqual(result.choices[0].message.content,'safe response');
for(mode of ['unavailable','malformed']){calls=[];assert.equal((await call([{role:'user',content:'hello'}])).status,500);assert.equal(calls.length,1);}
mode='safe';const bad=await onRequestPost({env:{DEEPSEEK_API_KEY:'test'},request:new Request('https://example.test/api/chat',{method:'POST',body:'bad JSON'})});assert.equal(bad.status,400);
console.log('API validation: 9 scenarios passed (validation, safety blocking, fail-closed, localized refusal).');
