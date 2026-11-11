import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RequirementStore} from '../src/core.mjs';
import {createConversations,ownerMessage,approvesCurrentPlan,resultReviewIntent,reportPresentation} from '../src/conversation.mjs';
import {conversationProgress} from '../src/conversation-progress.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'easy-ask-chat-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const rows=new Map(),logs={one:[],two:[]},ws={id:'workspace',path:root,title:'Synthetic test only',sessionIds:['one','two']};let chat,deliveries=0;
  const index={get:k=>rows.get(k),put:async(k,v)=>rows.set(k,v)};
  const workspaces=async()=>[ws],verifySession=async id=>assert.ok(ws.sessionIds.includes(id));
  const store=new RequirementStore({workspaces,verifySession,changed:p=>chat?.changed(p),deliver:async()=>{deliveries++;return{accepted:true};}});
  let runtime={running:false,queue:[],pendingInput:[]};const calls={state:0,history:0};
  const ctx={sessionController:{state:async()=>{calls.state++;if(runtime instanceof Error)throw runtime;return runtime;},events:async({address,beforeSeq,throughSeq})=>{calls.history++;return{records:logs[address.sessionId].filter(e=>(beforeSeq===undefined||e.seq<beforeSeq)&&(throughSeq===undefined||e.seq<=throughSeq)).map(event=>({type:'event',event}))};}}};
  chat=createConversations({ctx,index,store,workspaces,verifySession});
  const user=async(text,id='one',source={kind:'user',principal:{kind:'owner'}})=>{const e={seq:logs[id].length+1,type:'user/message',data:{role:'user',source,content:[{type:'text',text}]}};logs[id].push(e);await chat.event({id},e);return e;};
  const p=()=>chat.read('one');
  const mutate=async(action,data)=>{const current=await p();return store[action]({workspaceId:ws.id,taskId:current.taskId,expectedRevision:current.revision,operationId:randomUUID(),...data},{kind:'agent',sessionId:'one'});};
  const report=async()=>mutate('revise',{report:{goal:'修改测试标题',body:'仅调整标题，保留事实。',items:[{id:'title',text:'改为正式标题',kind:'change',status:'active',scope:'标题',sourceIds:[],eventIds:[]}],deliverables:['新文件'],acceptance:['原文件不变'],sourceIds:[]}});
  const shown=async()=>{const current=await p(),r=current.reports.at(-1);const e={seq:logs.one.length+1,type:'assistant/message',data:{message:{role:'assistant',content:[{type:'text',text:reportPresentation(r)}]}}};logs.one.push(e);await chat.event({id:'one'},e);return e;};
  return {root,chat,store,logs,user,p,mutate,report,shown,deliveries:()=>deliveries,calls,setRuntime:value=>{runtime=value;}};
}
async function legacyReply(f,text,{nativeText=text,source={kind:'user',principal:{kind:'owner'}}}={}){
  const seq=f.logs.one.length+1;
  f.logs.one.push({seq,type:'user/message',data:{role:'user',source,content:[{type:'text',text:nativeText}]}});
  const p=await f.p();
  await f.store.mutate({workspaceId:p.workspaceId,taskId:p.taskId,expectedRevision:p.revision,operationId:randomUUID()},{kind:'system'},draft=>{
    const event=f.store.event({kind:'user-log',sessionId:'one',seq},text);draft.events.push(event);draft.conversation.lastUserSeq=seq;return event.id;
  });
  return seq;
}
async function publishResult(f,text='已完成 result.md。请看这版是否符合你的想法。'){
  const event={seq:f.logs.one.length+1,time:Date.now(),type:'assistant/message',data:{turn:2,message:{role:'assistant',content:[{type:'text',text}]}}};
  f.logs.one.push(event);await f.chat.event({id:'one'},event);return event;
}
async function deliveredResult(f,{present=true}={}){
  await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();await f.user('就按这个方案改');
  const packet=await f.chat.command('one',{action:'execute',expectedRevision:(await f.p()).revision});
  await writeFile(path.join(f.root,'result.md'),'正式标题');await f.mutate('artifact',{submissionId:packet.submission.id,path:'result.md',evidence:[]});
  if(present)await publishResult(f);
  return packet;
}
test('conversation captures only original owner words and never borrows another session',async t=>{
  const f=await fixture(t);await f.user('这个标题不够正式');await f.user('另一聊天的目标','two');
  const one=await f.chat.command('one',{action:'begin'}),two=await f.chat.command('two',{action:'begin'});
  assert.notEqual(one.project.taskId,two.project.taskId);assert.equal(one.project.events[0].text,'这个标题不够正式');
  await f.user('模型代替用户同意','one',{kind:'user',principal:{kind:'agent'}});assert.equal((await f.p()).events.length,1);
  assert.equal(ownerMessage({type:'user/message',data:{role:'user',source:{kind:'tool'},content:[{type:'text',text:'同意'}]}}),null);
});
test('a question answer cannot approve a report; new constraints invalidate the displayed version',async t=>{
  const f=await fixture(t);await f.user('改正式一些');await f.chat.command('one',{action:'begin'});
  await f.mutate('question',{text:'希望正式在哪里？',options:[],sourceIds:[]});
  await assert.rejects(f.report(),/先等用户/);
  await f.user('像学校通知');assert.equal((await f.p()).answers[0].text,'像学校通知');assert.equal((await f.p()).submissions.length,0);
  await f.report();await f.shown();await f.user('但请保留原来的标题');
  assert.equal((await f.p()).decisions.length,0);assert.equal((await f.chat.current('one')).stage,'understanding');
  await f.user('就按这个方案改');assert.equal((await f.p()).decisions.length,0,'stale proposal must not bind');
});
test('unseen proposal and quoted or conditional replies cannot authorize execution',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();
  await f.user('按这个方案改');assert.equal((await f.p()).decisions.length,0);
  for(const text of ['好','他说“按这个方案改”','按这个方案改，但增加地点','如果可以就按这个方案改','不同意这个方案'])assert.equal(approvesCurrentPlan(text),false,text);
  for(const text of ['对，就是这个意思，按这个方案改。','就按这个方案改','同意这个方案，开始执行'])assert.equal(approvesCurrentPlan(text),true,text);
  for(const text of ['就按这个方向改','按这个思路来修改','就按这版改','照你说的做','就这么改'])assert.equal(approvesCurrentPlan(text),true,text);
  for(const text of ['这个方向可以吗','就按这个方向改？','他说就按这个方向改','就按这个方向改，但不要保留日期','如果可以，就按这个方向改'])assert.equal(approvesCurrentPlan(text),false,text);
});
test('shown natural approval freezes exactly once in original turn without queuing another model prompt',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();await f.user('对，就是这个意思，按这个方案改。');
  let p=await f.p();assert.equal(p.decisions.length,1);assert.equal((await f.chat.current('one')).stage,'approved');
  const packet=await f.chat.command('one',{action:'execute',expectedRevision:p.revision});
  p=await f.p();const retry=await f.chat.command('one',{action:'execute',expectedRevision:p.revision});
  assert.equal(packet.submission.id,retry.submission.id);assert.equal(packet.submission.status,'accepted');assert.equal(packet.submission.sessionId,'one');assert.equal(f.deliveries(),0);
  await writeFile(path.join(f.root,'result.md'),'正式标题');await f.mutate('artifact',{submissionId:packet.submission.id,path:'result.md',evidence:[{itemId:'title',excerpt:'正式标题',judgment:'synthetic'}]});
  assert.equal((await f.p()).artifacts[0].humanStatus,'pending');
  await publishResult(f);
  await f.user('这版符合要求');assert.equal((await f.p()).artifacts[0].humanStatus,'accepted');
  assert.equal((await f.chat.current('one')).stage,'result');
  await f.user('还想加上一行地址');p=await f.p();await assert.rejects(f.chat.command('one',{action:'execute',expectedRevision:p.revision}),/尚未取得真实用户认可/);
  assert.equal((await f.chat.current('one')).stage,'understanding','new feedback must not be hidden by the old result');
});

test('natural result acceptance is bound to the delivered artifact and genuine reply',async t=>{
  const f=await fixture(t);await deliveredResult(f);const before=await f.p();
  const owner=await f.user('都对了');const after=await f.p(),artifact=after.artifacts[0];
  assert.equal(artifact.humanStatus,'accepted');assert.equal(after.events.find(e=>e.id===artifact.humanEventId).seq,owner.seq);
  assert.equal(after.events.find(e=>e.id===artifact.humanEventId).text,'都对了');assert.equal(artifact.humanPresentationSeq,owner.seq-1);
  assert.deepEqual(after.reports,before.reports);assert.deepEqual(after.decisions,before.decisions);assert.deepEqual(after.submissions,before.submissions);
  const view=await f.chat.current('one');assert.equal(view.stage,'result');assert.equal(view.resultStatus,'accepted');
  assert.equal((await f.chat.current('one')).project.revision,after.revision,'review is idempotent');
});

test('missed result review recovers from the unchanged native event, without replaying a reply',async t=>{
  const f=await fixture(t);await deliveredResult(f);await legacyReply(f,'都对了');const before=await f.p(),eventCount=f.logs.one.length;
  const view=await f.chat.current('one');assert.equal(view.resultStatus,'accepted');assert.equal(view.stage,'result');
  assert.equal(f.logs.one.length,eventCount);assert.deepEqual(view.project.events,before.events);assert.deepEqual(view.project.reports,before.reports);
  assert.equal(view.project.artifacts[0].humanEventId,before.events.at(-1).id);
});

test('result review ignores quoted, partial, conditional and question-like approval',()=>{
  for(const text of ['都对了','这版没问题了。','是的，这版符合我的预期','我已看过，这版符合要求','满意了'])assert.equal(resultReviewIntent(text),'accepted',text);
  for(const text of ['都对了？','不是都对了','他说“都对了”','都对了，但标题还要改','大部分都对了','如果改好了就可以交付','好','这版还需要修改吗'])assert.equal(resultReviewIntent(text),null,text);
  assert.equal(resultReviewIntent('这版还需要修改，标题太活泼'),'needs-change');
});

test('short review cannot approve an unseen file, a question answer or an unrelated chat reply',async t=>{
  const unseen=await fixture(t);await deliveredResult(unseen,{present:false});await unseen.user('都对了');assert.equal((await unseen.p()).artifacts[0].humanStatus,'pending');
  const question=await fixture(t);await deliveredResult(question);await question.mutate('question',{text:'只核对日期和地点，对吗？',options:[],sourceIds:[]});await question.user('都对了');assert.equal((await question.p()).artifacts[0].humanStatus,'pending');
  const unrelated=await fixture(t);await deliveredResult(unrelated);await publishResult(unrelated,'另一个话题：这两条配置对吗？');await unrelated.user('都对了');assert.equal((await unrelated.p()).artifacts[0].humanStatus,'pending');
});

test('result recovery rejects a forged source, changed native text and ambiguous multiple artifacts',async t=>{
  for(const source of [{kind:'user',principal:{kind:'agent'}},{kind:'user',rpcId:'eh3-maintenance-example'}]){
    const f=await fixture(t);await deliveredResult(f);await legacyReply(f,'都对了',{source});assert.equal((await f.chat.current('one')).resultStatus,'pending');
  }
  const mismatch=await fixture(t);await deliveredResult(mismatch);await legacyReply(mismatch,'都对了',{nativeText:'标题还需要修改'});assert.equal((await mismatch.chat.current('one')).resultStatus,'pending');
  const multiple=await fixture(t);const packet=await deliveredResult(multiple);await writeFile(path.join(multiple.root,'other.md'),'其他结果');await multiple.mutate('artifact',{submissionId:packet.submission.id,path:'other.md',evidence:[]});await publishResult(multiple,'已交付 result.md 和 other.md，请核对。');await multiple.user('都对了');assert.ok((await multiple.p()).artifacts.every(a=>a.humanStatus==='pending'));
});

test('a file mention, renewed plan or changed and reverted scope is not result acceptance',async t=>{
  const naming=await fixture(t);await deliveredResult(naming);await publishResult(naming,'已完成 result.md。只看文件名，对吗？');await naming.user('都对了');assert.equal((await naming.p()).artifacts[0].humanStatus,'pending');
  const plan=await fixture(t);await deliveredResult(plan);await plan.shown();await plan.user('都对了');assert.equal((await plan.p()).artifacts[0].humanStatus,'pending');
  const reverted=await fixture(t);await deliveredResult(reverted);const original=(await reverted.p()).reports[0];
  await reverted.mutate('revise',{report:{...original,body:'Changed scope after delivery.'}});await reverted.mutate('revise',{report:original});await publishResult(reverted);await reverted.user('都对了');assert.equal((await reverted.p()).artifacts[0].humanStatus,'pending');
});
test('a short approval refers to the shown complete plan, not a required password',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();
  const reply=await f.user('符合');let p=await f.p();const decision=p.decisions[0];
  assert.equal(p.decisions.length,1);assert.equal(p.events.find(e=>e.id===decision.eventId).seq,reply.seq);
  assert.equal(p.events.find(e=>e.id===decision.eventId).text,'符合');assert.equal(decision.version,1);
  assert.equal((await f.chat.current('one')).stage,'approved');
  await f.report();p=await f.p();assert.equal(p.reports.length,1,'identical republication must retain the accepted version');
  assert.equal((await f.chat.current('one')).stage,'approved');
  const packet=await f.chat.command('one',{action:'execute',expectedRevision:p.revision});
  assert.equal(packet.submission.version,1);assert.equal(packet.submission.decisionId,decision.id);assert.equal(f.deliveries(),0);
});
test('short approval cannot bypass an unanswered question, unseen report, conditions or new scope',async t=>{
  for(const text of ['符合，但先别改','不符合','部分符合','他说“符合”','符合？','符合，只改标题','同意，但删掉日期','好'])assert.equal(approvesCurrentPlan(text),false,text);
  for(const text of ['符合','符合我的想法。','同意','认可','确认'])assert.equal(approvesCurrentPlan(text),true,text);
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});
  await f.mutate('question',{text:'这种邀请口吻符合吗？',options:[],sourceIds:[]});await f.user('符合');
  assert.equal((await f.p()).answers.length,1);assert.equal((await f.p()).decisions.length,0);
  await f.report();await f.user('符合');assert.equal((await f.p()).decisions.length,0,'unseen report cannot be approved');
  await f.report();await f.shown();await f.user('符合，但原来的标题要保留');await f.user('符合');
  assert.equal((await f.p()).decisions.length,0,'new constraints invalidate the older report');
});
test('a changed report cannot inherit the approval of an earlier version',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();await f.user('同意');
  const report=structuredClone((await f.p()).reports[0]);report.items[0].text='改为另一种正式标题';
  await f.mutate('revise',{report});const p=await f.p();assert.equal(p.reports.length,2);assert.equal(p.decisions.length,1);
  assert.equal((await f.chat.current('one')).stage,'plan');await assert.rejects(f.chat.command('one',{action:'execute',expectedRevision:p.revision}),/尚未取得真实用户认可/);
});
test('a missed actual approval recovers its displayed version across identical legacy republication',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();
  const seq=await legacyReply(f,'就按这个方向改');await f.report();await f.shown();
  const before=await f.p(),event=before.events.find(e=>e.seq===seq);assert.equal(before.reports.length,2);assert.equal(before.decisions.length,0);
  const recovered=await f.chat.command('one',{action:'read'});let p=await f.p();
  assert.equal(recovered.stage,'approved');assert.equal(recovered.activeReportVersion,1);assert.ok(recovered.presentation.startsWith('修改方案 V1'));
  assert.deepEqual(p.reports,before.reports,'history must not be deleted or renamed');assert.equal(p.decisions[0].version,1);assert.equal(p.decisions[0].eventId,event.id);assert.ok(p.decisions[0].recoveredAt);
  assert.equal(p.events.find(e=>e.id===event.id).text,'就按这个方向改');
  await f.chat.command('one',{action:'read'});assert.equal((await f.p()).decisions.length,1);
  p=await f.p();const result=await f.chat.command('one',{action:'execute',expectedRevision:p.revision});assert.equal(result.submission.version,1);assert.equal(result.submission.decisionId,p.decisions[0].id);
});
test('recovery requires the original owner event, not just a matching stored claim',async t=>{
  for(const variant of [{nativeText:'我还没决定'},{source:{kind:'user',principal:{kind:'agent'}}},{source:{kind:'user',principal:{kind:'owner'},rpcId:'eh3-maintenance'}}]){
    const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();
    await legacyReply(f,'就按这个方向改',variant);await f.chat.command('one',{action:'read'});assert.equal((await f.p()).decisions.length,0);
  }
});
test('recovery cannot transfer an old reply to changed content, even after a revert',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await f.shown();
  await legacyReply(f,'就按这个方向改');const original=structuredClone((await f.p()).reports[0]);const changed=structuredClone(original);changed.items[0].text='新增未经认可的地点';
  await f.mutate('revise',{report:changed});await f.mutate('revise',{report:original});
  await f.chat.command('one',{action:'read'});assert.equal((await f.p()).decisions.length,0);
});
test('recovery refuses unseen reports, open questions and later user supplements',async t=>{
  const f=await fixture(t);await f.user('修改标题');await f.chat.command('one',{action:'begin'});await f.report();await legacyReply(f,'就按这个方向改');
  await f.chat.command('one',{action:'read'});assert.equal((await f.p()).decisions.length,0,'report was not shown');
  const g=await fixture(t);await g.user('修改标题');await g.chat.command('one',{action:'begin'});await g.report();await g.shown();await legacyReply(g,'就按这个方向改');
  await g.mutate('question',{text:'新增条件要保留吗？',options:[],sourceIds:[]});await g.chat.command('one',{action:'read'});assert.equal((await g.p()).decisions.length,0);
  const h=await fixture(t);await h.user('修改标题');await h.chat.command('one',{action:'begin'});await h.report();await h.shown();await legacyReply(h,'就按这个方向改');await h.user('但请先别改文件');
  await h.chat.command('one',{action:'read'});assert.equal((await h.p()).decisions.length,0,'later supplement cannot be ignored');
});
test('conversation stream follows durable changes and cancellation ends it',async t=>{
  const f=await fixture(t);await f.user('修改标题');const controller=new AbortController(),stream=f.chat.watch('one',controller.signal)[Symbol.asyncIterator]();
  assert.equal((await stream.next()).value.project,null);
  assert.equal((await stream.next()).value.history.complete,true);
  const changed=stream.next();await f.chat.command('one',{action:'begin'});assert.equal((await changed).value.project.events[0].text,'修改标题');
  const waiting=stream.next();controller.abort();assert.equal((await waiting).done,true);
});
test('reading old owner messages adds evidence without answering or approving the current question',async t=>{
  const f=await fixture(t);await f.user('原来的目标');await f.user('按这个方案改');await f.user('后来提出的新问题');
  await f.chat.command('one',{action:'begin'});await f.mutate('question',{text:'当前要改哪一处？',options:[],sourceIds:[]});
  const result=await f.chat.command('one',{action:'read'});assert.equal(result.history.messages.length,3);assert.equal(result.project.events.length,3);assert.equal(result.project.answers.length,0);assert.equal(result.project.decisions.length,0);assert.equal(result.project.questions[0].status,'open');
});
test('an unbound existing chat updates its archive without creating a requirements project',async t=>{
  const f=await fixture(t);await f.user('已经聊过的话');const controller=new AbortController(),stream=f.chat.watch('one',controller.signal)[Symbol.asyncIterator]();
  await stream.next();let snapshot=(await stream.next()).value;assert.equal(snapshot.history.messages[0].text,'已经聊过的话');assert.equal(snapshot.project,null);
  const next=stream.next();await f.user('后来继续聊');snapshot=(await next).value;assert.equal(snapshot.history.messages.at(-1).text,'后来继续聊');assert.equal(snapshot.project,null);controller.abort();await stream.return();
});
test('source activity and completed-turn events update the open sidebar without a manual read',async t=>{
  const f=await fixture(t),controller=new AbortController(),stream=f.chat.watch('one',controller.signal)[Symbol.asyncIterator]();
  await stream.next();await stream.next();
  const publish=async event=>{const next=stream.next();f.logs.one.push(event);await f.chat.event({id:'one'},event);return(await next).value;};
  let snapshot=await publish({seq:1,type:'tool/call',data:{turn:1,callId:'read-skill',name:'read',arguments:JSON.stringify({file_path:'C:/skills/prompt-ready/SKILL.md'})}});
  assert.equal(snapshot.history.activities[0].status,'pending');
  snapshot=await publish({seq:2,type:'tool/result',data:{message:{toolCallId:'read-skill',isError:false,content:[{type:'text',text:'private skill body'}]}}});
  assert.equal(snapshot.history.activities[0].status,'succeeded');assert.equal(snapshot.history.activities[0].workflow,'prompt-ready');assert.ok(!JSON.stringify(snapshot).includes('private skill body'));
  snapshot=await publish({seq:3,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});assert.deepEqual(snapshot.history.completedTurns,[1]);assert.equal(snapshot.project,null);
  controller.abort();await stream.return();
});

test('overall progress follows the real canonical lifecycle without changing it',async t=>{
  const f=await fixture(t),get=async()=>conversationProgress(await f.chat.command('one',{action:'read'}));
  await f.user('修改标题');await f.chat.command('one',{action:'begin'});
  await f.mutate('question',{text:'希望正式在哪里？',options:[],sourceIds:[]});assert.equal((await get()).next,'answer');
  await f.user('正式但亲切');assert.equal((await get()).next,'await-ai');
  await f.report();assert.equal((await get()).next,'await-presentation');await f.shown();assert.equal((await get()).next,'review-plan');
  await f.user('就按这个方案改');assert.equal((await get()).next,'not-started');
  const packet=await f.chat.command('one',{action:'execute',expectedRevision:(await f.p()).revision});assert.equal((await get()).next,'execution-stopped');
  f.setRuntime({running:true,queue:[],pendingInput:[]});assert.equal((await get()).next,'executing');
  await writeFile(path.join(f.root,'result.md'),'正式标题');await f.mutate('artifact',{submissionId:packet.submission.id,path:'result.md',evidence:[]});
  await publishResult(f);f.setRuntime({running:false,queue:[],pendingInput:[]});assert.equal((await get()).next,'review-result');
  await f.user('都对了');assert.equal((await get()).step,4);
  await publishResult(f,'好，收到。');const before=JSON.stringify(await f.p());assert.equal((await get()).next,'complete');assert.equal(JSON.stringify(await f.p()),before);
  await f.user('再加一行地址');assert.equal((await get()).step,0);assert.equal((await f.p()).artifacts[0].humanStatus,'accepted');
});

test('passive runtime changes stream without history writes, payload exposure or a manual refresh',async t=>{
  const f=await fixture(t),controller=new AbortController(),stream=f.chat.watch('one',controller.signal)[Symbol.asyncIterator]();
  await stream.next();let snapshot=(await stream.next()).value;assert.equal(snapshot.runtime.known,true);
  const historyReads=f.calls.history;
  f.setRuntime({running:false,queue:[{text:'private queued request'}],pendingInput:['approval','private-extra']});
  snapshot=(await stream.next()).value;assert.deepEqual(snapshot.runtime,{known:true,running:false,queued:1,pendingInput:['approval']});
  assert.equal(f.calls.history,historyReads);assert.ok(!JSON.stringify(snapshot).includes('private'));assert.equal(snapshot.project,null);
  f.setRuntime({running:true,queue:[],pendingInput:[]});const started=stream.next();await f.chat.event({id:'one'},{type:'turn/start'});assert.equal((await started).value.runtime.running,true);
  f.setRuntime(new Error('private transport failure'));snapshot=(await stream.next()).value;assert.equal(snapshot.runtime.known,false);assert.equal(snapshot.runtime.running,false);
  const waiting=stream.next();controller.abort();assert.equal((await waiting).done,true);assert.equal((await f.chat.view('one',null)).runtime.known,false);
});
