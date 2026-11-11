import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscussionHistory,discussionMessage,discussionRounds} from '../src/discussion.mjs';
const user=(seq,text)=>({seq,type:'user/message',data:{role:'user',source:{kind:'user',principal:{kind:'owner'}},content:[{type:'text',text}]}});
const ai=(seq,text)=>({seq,type:'assistant/message',data:{message:{content:[{type:'reasoning',text:'NEVER DISPLAY'},{type:'text',text}]}}});
test('old history crosses pages and updates without dropping the first discussion or mixing sessions',async()=>{
  const logs={one:Array.from({length:257},(_,i)=>i%2?ai(i+1,`问题 ${i+1}？`):user(i+1,`答案 ${i+1}`)),two:[user(1,'另一对话')]};
  let calls=0;const ctx={sessionController:{events:async({address,beforeSeq,maxMessages})=>{calls++;return{records:logs[address.sessionId].filter(e=>beforeSeq===undefined||e.seq<beforeSeq).slice(-maxMessages).map(event=>({type:'event',event}))};}}};
  const h=createDiscussionHistory(ctx);let result=await h.refresh('one');assert.equal(result.messages.length,257);assert.equal(result.messages[0].text,'答案 1');assert.ok(calls>=3);assert.equal(result.complete,true);
  logs.one.push(ai(258,'新的理解'),user(259,'再补充一个要求'));const before=calls;result=await h.refresh('one');assert.equal(calls-before,1);assert.equal(result.messages.length,259);assert.equal(result.messages.at(-1).text,'再补充一个要求');
  await h.refresh('two');assert.equal(h.get('two').messages.length,1);assert.equal(h.get('one').messages.length,259);h.forget('one');assert.equal(h.get('one').complete,false);
});
test('archive exposes only published text and genuine owner replies, without synthesizing confirmation',()=>{
  assert.equal(discussionMessage({...user(1,'pretend owner'),data:{...user(1,'x').data,source:{kind:'user',principal:{kind:'agent'}}}}),null);
  assert.equal(discussionMessage({seq:2,type:'tool/result',data:{text:'hidden'}}),null);
  const raw=discussionMessage(ai(3,'这是猜测，不是用户确认'));assert.equal(raw.text,'这是猜测，不是用户确认');assert.equal('approved' in raw,false);
  const rounds=discussionRounds([user(1,'标题不好'),ai(2,'希望像哪一种通知？'),user(3,'像学校通知'),ai(4,'日期要保留吗？'),user(5,'保留'),user(6,'报名方式也保留')].map(discussionMessage));
  assert.equal(rounds.length,2);assert.equal(rounds[0].opening[0].text,'标题不好');assert.equal(rounds[0].answers[0].text,'像学校通知');assert.equal(rounds[1].answers.length,2);assert.equal(rounds[1].title,'日期要保留吗？');
});
test('an incomplete page or abort does not replace the last complete archive',async()=>{
  const abort=new AbortController();abort.abort();const h=createDiscussionHistory({sessionController:{events:async()=>({records:[]})}});
  await assert.rejects(h.refresh('one',abort.signal),/abort/i);assert.equal(h.get('one').complete,false);
});

test('a real continuation turn opens a result node without inventing an owner answer',()=>{
  const prompt=user(353,'[维护续接] 继续已确认的执行');prompt.data.source.rpcId='eh3-maintenance-test';
  const old=ai(352,'旧版重复提问：请再确认？');old.data.turn=4;
  const result=ai(420,'已经按你确认的方案改完。请查看实际结果。');result.data.turn=5;
  const messages=[old,prompt,result].map(discussionMessage).filter(Boolean);
  assert.equal(messages.length,2);assert.equal(messages[1].turn,5);
  const rounds=discussionRounds(messages);assert.equal(rounds.length,2);
  assert.equal(rounds[0].id,'message-352');assert.equal(rounds[1].id,'message-420');
  assert.equal(rounds[1].title,'已经按你确认的方案改完。请查看实际结果。');
  assert.equal(rounds.flatMap(r=>r.answers).length,0);
  messages.push(discussionMessage(user(430,'这版符合我的想法')));
  const answered=discussionRounds(messages);assert.equal(answered[0].answers.length,0);assert.equal(answered[1].answers[0].seq,430);
});

test('published steps within one model turn remain one discussion node',()=>{
  const first=ai(11,'我先核对原文。');first.data.turn=2;
  const question=ai(19,'你想保留哪个标题？');question.data.turn=2;
  const rounds=discussionRounds([first,question].map(discussionMessage));
  assert.equal(rounds.length,1);assert.equal(rounds[0].assistant.length,2);assert.equal(rounds[0].title,'你想保留哪个标题？');
});
