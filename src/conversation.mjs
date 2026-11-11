import { randomUUID } from 'node:crypto';
import { BusinessError, digest, currentReport, sameCurrentReport } from './core.mjs';
import { createDiscussionHistory } from './discussion.mjs';

const fail=message=>{throw new BusinessError('conversation',message);};
const plain=content=>(content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
export function ownerMessage(event){
  const source=event?.data?.source;
  if(event?.type!=='user/message'||event.data.role!=='user'||source?.kind!=='user'||source.principal&&source.principal.kind!=='owner'||source.rpcId?.startsWith('eh3-'))return null;
  const text=plain(event.data.content);return text?{seq:event.seq,text}:null;
}
// Recognize clear approval in the pending-report context checked by ingest.
// This predicate alone never authorizes: the current complete report must have
// been shown, with no open question, new constraint or unresolved scope.
export function approvesCurrentPlan(text){
  if(/^(?:符合(?:我的想法|要求|预期)?|同意|认可|确认)[。.!！\s]*$/.test(text.trim()))return true;
  return /^(?:(?:对|是的|好的|好|可以|没问题|就是这个意思)[，,。!！\s]*)*(?:(?:就)?(?:按|照)(?:这个|这份|当前|上述|此)?(?:方案|报告|方向|思路|版本|要求|内容)(?:来)?(?:修改|改|执行|做|实施)|(?:就)?(?:按这个|照这个|按这版|照这版|按你说的|照你说的|这样|这么)(?:来)?(?:修改|改|执行|做)|(?:我)?(?:认可|同意)(?:这个|这份|当前|上述)?(?:方案|报告)(?:[，,\s]*(?:可以|开始|请)?(?:执行|修改|实施))?)(?:[。.!！\s]*)$/.test(text.trim());
}
// This describes an utterance, not authority. Result review additionally needs
// a genuine owner reply to the delivered artifact in the same native chat.
export function resultReviewIntent(text){
  const value=text.trim();
  if(/^(?:我已(?:看过|查看)[，,\s]*)?(?:(?:对|是的|嗯|好|好的)[，,。!！\s]*)?(?:(?:这版|这个版本|这份(?:成果|结果)?|这个(?:成果|结果)?)(?:已经|已)?[，,\s]*)?(?:都对了|全都对了|都没问题(?:了)?|没有问题(?:了)?|没问题(?:了)?|符合(?:我的)?(?:要求|预期|想法)|满意(?:了)?|通过验收|可以交付|可以定稿|可以了|就这样(?:定稿)?(?:了)?)[。.!！\s]*$/.test(value))return 'accepted';
  if(/^(?:这版|这份|这个)(?:成果|结果)?还(?:需|需要)修改(?:[，,:：\s]|[。.!！]*$)/.test(value))return 'needs-change';
  return null;
}
export function reportPresentation(report){
  return `修改方案 V${report.version}\n\n${report.goal}\n\n${report.body}\n\n${report.items.map(i=>`${({change:'修改',preserve:'保留',exclude:'范围之外',unresolved:'待问清'})[i.kind]}：${i.text}`).join('\n')}\n\n交付：${report.deliverables.join('；')}\n验收：${report.acceptance.join('；')}`;
}
function assistantPresented(event,report){
  if(event.type!=='assistant/message'||event.data?.interrupted)return false;
  const message=event.data?.message;
  if(message?.content?.some(b=>b.type==='tool-call'))return false;
  const text=plain(message?.content);
  return text.includes(`方案 V${report.version}`)&&[report.goal,report.body,...report.items.map(i=>i.text),...report.deliverables,...report.acceptance].every(s=>text.includes(s));
}

/** One binding per real native Session. Canonical records remain workspace files. */
export function createConversations({ctx,index,store,workspaces,verifySession}){
  const queues=new Map(),listeners=new Map(),runtime=new Map(),history=createDiscussionHistory(ctx);
  async function readRuntime(id,signal=AbortSignal.timeout(5000)){
    let value={known:false,running:false,queued:0,pendingInput:[]};
    try{
      const state=await ctx.sessionController.state({sessionId:id},signal);
      value={known:true,running:state.running===true,queued:state.queue?.length??0,pendingInput:state.pendingInput.filter(x=>['approval','question','other'].includes(x))};
    }catch(error){if(signal.aborted&&signal.reason?.name!=='TimeoutError')signal.throwIfAborted();}
    const changed=JSON.stringify(runtime.get(id))!==JSON.stringify(value);runtime.set(id,value);return changed;
  }
  const notify=id=>{for(const fn of listeners.get(id)??[])fn();};
  const serial=(id,fn)=>{
    const next=(queues.get(id)??Promise.resolve()).catch(()=>{}).then(fn);
    queues.set(id,next);void next.finally(()=>{if(queues.get(id)===next)queues.delete(id);}).catch(()=>{});return next;
  };
  const binding=id=>index.get(`chat:${id}`);
  const refOf=p=>({workspaceId:p.workspaceId,taskId:p.taskId});
  const mutation=p=>({...refOf(p),expectedRevision:p.revision,operationId:randomUUID()});
  async function workspaceFor(id){
    const ws=(await workspaces()).find(w=>w.sessionIds.includes(id));
    if(!ws)fail('请先在原聊天选择一个工作区，需求会自动跟随该聊天。');
    await verifySession(id,ws);return ws;
  }
  async function read(id){const ref=binding(id);return ref?store.read(ref):null;}
  async function events(id){
    // Walk backwards until the binding's last owner message, rather than dropping
    // replies when a long tool-heavy turn crosses one history page.
    const p=await read(id),cut=p?.conversation?.lastUserSeq??-1,all=[];let beforeSeq;
    for(let pageNo=0;pageNo<100;pageNo++){
      const page=await ctx.sessionController.events({address:{kind:'session',sessionId:id},maxMessages:50,...(beforeSeq===undefined?{}:{beforeSeq})},AbortSignal.timeout(30000));
      const rows=page.records.filter(r=>r.type==='event').map(r=>r.event);
      if(!rows.length)break;all.push(...rows);const min=Math.min(...rows.map(e=>e.seq));
      if(!p||min<=cut||min===0)break;
      if(beforeSeq!==undefined&&min>=beforeSeq)fail('聊天历史暂未完整读取，请稍后重试。');beforeSeq=min;
      if(pageNo===99)fail('聊天历史较长，本次尚未同步完成。');
    }
    return [...new Map(all.map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq);
  }
  async function present(id,version,hash,method,seq){
    const p=await read(id);if(!p?.conversation)return null;
    const r=p.reports.at(-1);if(!r||r.version!==version||r.hash!==hash||r.basisSeq!==p.conversation.lastUserSeq)return p;
    if(p.conversation.presentations.some(x=>x.version===version&&x.hash===hash))return p;
    return (await store.mutate(mutation(p),{kind:'system'},draft=>{draft.conversation.presentations.push({version,hash,basisSeq:r.basisSeq,method,...(seq===undefined?{}:{seq}),at:new Date().toISOString()});return `V${version}`;})).project;
  }
  async function ingest(id,event){
    let p=await read(id);if(!p?.conversation)return;
    const r=p.reports.at(-1),user=ownerMessage(event);
    if(!user){if(r&&assistantPresented(event,r))await present(id,r.version,r.hash,'chat',event.seq);return;}
    if(user.seq<=p.conversation.lastUserSeq)return;
    await store.mutate(mutation(p),{kind:'user-log',sessionId:id,seq:user.seq},draft=>{
      const c=draft.conversation,q=draft.questions.find(q=>q.status==='open');
      const ev=store.event({kind:'user-log',sessionId:id,seq:user.seq},user.text);draft.events.push(ev);
      const shown=r&&c.presentations.some(x=>x.version===r.version&&x.hash===r.hash&&(x.seq===undefined||x.seq<user.seq));
      if(q){draft.answers.push({id:randomUUID(),questionId:q.id,eventId:ev.id,text:user.text,at:ev.at});q.status='answered';}
      else if(r&&r.basisSeq===c.lastUserSeq&&shown&&approvesCurrentPlan(user.text)&&!r.items.some(i=>i.kind==='unresolved'&&i.status==='active')){
        const scope=r.items.filter(i=>i.status==='active'&&i.kind!=='unresolved').map(i=>i.id).sort();
        if(scope.length)draft.decisions.push({id:randomUUID(),version:r.version,hash:r.hash,scope,eventId:ev.id,method:'user-log',at:ev.at});
      }
      c.lastUserSeq=user.seq;return ev.id;
    });
  }
  async function recoverApproval(id){
    const p=await read(id);if(!p?.conversation||p.questions.some(q=>q.status==='open'))return p;
    const owners=p.events.filter(e=>e.kind==='user-log'&&e.sessionId===id).sort((a,b)=>a.seq-b.seq);
    const event=owners.at(-1),previous=owners.at(-2);
    if(!event||event.seq!==p.conversation.lastUserSeq||!approvesCurrentPlan(event.text)||p.answers.some(a=>a.eventId===event.id)||p.decisions.some(d=>d.eventId===event.id))return p;
    const report=p.reports.findLast(r=>r.basisSeq===previous?.seq&&sameCurrentReport(p,r)&&!r.items.some(i=>i.kind==='unresolved'&&i.status==='active')&&p.conversation.presentations.some(s=>s.version===r.version&&s.hash===r.hash&&(s.seq===undefined?Date.parse(s.at)<Date.parse(event.at):s.seq<event.seq)));
    if(!report)return p;
    // Re-read the native owner event. Stored text or an Agent's interpretation
    // alone cannot turn a past message into approval during an upgrade.
    const page=await ctx.sessionController.events({address:{kind:'session',sessionId:id},throughSeq:event.seq,maxMessages:1},AbortSignal.timeout(30000));
    const verified=ownerMessage(page.records.find(r=>r.type==='event'&&r.event.seq===event.seq)?.event);
    if(!verified||verified.text!==event.text)return p;
    const scope=report.items.filter(i=>i.status==='active'&&i.kind!=='unresolved').map(i=>i.id).sort();if(!scope.length)return p;
    return (await store.mutate(mutation(p),{kind:'system'},draft=>{
      draft.decisions.push({id:randomUUID(),version:report.version,hash:report.hash,scope,eventId:event.id,method:'user-log',at:event.at,recoveredAt:new Date().toISOString()});return event.id;
    })).project;
  }
  async function reconcileResultReview(id){
    const p=await read(id);if(!p?.conversation||p.questions.some(q=>q.status==='open'))return p;
    const owners=p.events.filter(e=>e.kind==='user-log'&&e.sessionId===id).sort((a,b)=>a.seq-b.seq);
    const event=owners.at(-1),previous=owners.at(-2),status=event&&resultReviewIntent(event.text);
    if(!status||event.seq!==p.conversation.lastUserSeq||p.answers.some(a=>a.eventId===event.id))return p;
    const report=currentReport(p),submission=p.submissions.findLast(s=>s.kind==='execution'&&s.sessionId===id&&s.status==='result-recorded'&&s.hash===report?.hash);
    if(!submission||!p.decisions.some(d=>d.id===submission.decisionId&&d.hash===submission.hash))return p;
    const deliveredReport=p.reports.find(r=>r.version===submission.version&&r.hash===submission.hash);
    if(!sameCurrentReport(p,deliveredReport))return p;
    const artifacts=p.artifacts.filter(a=>a.submissionId===submission.id);
    // A short answer cannot silently choose among several delivered files.
    if(artifacts.length!==1)return p;
    const artifact=artifacts[0];
    if(artifact.humanEventId===event.id&&artifact.humanStatus===status)return p;
    if(Date.parse(artifact.at)>Date.parse(event.at))return p;
    // Also covers an old client's missed reply, without replaying or inventing
    // a human message. The native history must still contain the exact source.
    const page=await ctx.sessionController.events({address:{kind:'session',sessionId:id},throughSeq:event.seq,maxMessages:50},AbortSignal.timeout(30000));
    const rows=page.records.filter(r=>r.type==='event').map(r=>r.event);
    const verified=ownerMessage(rows.find(e=>e.seq===event.seq));
    if(!verified||verified.text!==event.text)return p;
    const prior=rows.filter(e=>e.seq<event.seq&&e.seq>(previous?.seq??-1)&&e.type==='assistant/message'&&!e.data?.interrupted&&!e.data?.message?.content?.some(b=>b.type==='tool-call')&&plain(e.data?.message?.content)).sort((a,b)=>a.seq-b.seq).at(-1);
    const shown=prior&&plain(prior.data.message.content);
    if(!shown?.includes(artifact.path)||p.reports.some(r=>assistantPresented(prior,r)))return p;
    if(!/(?:已(?:经)?[^\n]{0,30}(?:完成|改完|生成|交付)|最终成果)/.test(shown))return p;
    if(!/(?:看(?:一下|看)?这版|(?:这版|效果|结果|成果)[^\n]{0,30}(?:符合|满意|如何|怎么样)|请[^\n]{0,20}(?:核对|查看|验收))/.test(shown))return p;
    const nativeTime=typeof prior.time==='number'?prior.time:Date.parse(prior.time);
    if(Number.isFinite(nativeTime)&&nativeTime<Date.parse(artifact.at))return p;
    return (await store.mutate(mutation(p),{kind:'system'},draft=>{
      const target=draft.artifacts.find(a=>a.id===artifact.id);
      target.humanStatus=status;target.humanEventId=event.id;
      target.humanPresentationSeq=prior.seq;target.humanReviewedAt=new Date().toISOString();
      return target.id;
    })).project;
  }
  async function sync(id){for(const event of await events(id))await ingest(id,event);await recoverApproval(id);return reconcileResultReview(id);}
  function view(id,p){
    const report=currentReport(p),decision=p?.decisions.findLast(d=>d.hash===report?.hash&&d.version===report?.version);
    const approved=decision&&p.events.find(e=>e.id===decision.eventId)?.seq===p.conversation?.lastUserSeq;
    const artifact=p?.artifacts.findLast(a=>p.submissions.find(s=>s.id===a.submissionId)?.hash===report?.hash);
    const reviewed=artifact&&p.events.find(e=>e.id===artifact.humanEventId)?.seq===p.conversation?.lastUserSeq;
    return {sessionId:id,project:p,history:history.get(id),runtime:runtime.get(id)??{known:false,running:false,queued:0,pendingInput:[]},activeReportVersion:report?.version,resultStatus:artifact?.humanStatus,stage:!p?'idle':artifact&&(approved||reviewed)?'result':approved?'approved':report&&report.basisSeq===p.conversation?.lastUserSeq?'plan':'understanding'};
  }
  return {
    serial,read,sync,view,
    changed(p){const id=p.conversation?.sessionId;if(id&&binding(id)?.taskId===p.taskId)notify(id);},
    event(session,event){const id=String(session.id);if(['user/message','assistant/message'].includes(event.type))return serial(id,async()=>{if(binding(id)){await ingest(id,event);await reconcileResultReview(id);}notify(id);});if(['tool/call','tool/result','turn/start','turn/end'].includes(event.type))notify(id);},
    async current(id){await workspaceFor(id);const p=await serial(id,()=>sync(id));await readRuntime(id);return view(id,p);},
    async command(id,input){return serial(id,async()=>{
      const ws=await workspaceFor(id);let p=await sync(id);await readRuntime(id);
      if(input.action==='begin'){
        if(!p){
          const latest=(await events(id)).map(ownerMessage).filter(Boolean).at(-1);if(!latest)fail('当前聊天还没有可核对的用户原话。');
          const taskId=`chat-${digest(id).slice(0,16)}-${latest.seq}`;
          p=(await store.create({workspaceId:ws.id,taskId,title:input.title?.trim()||latest.text.slice(0,80),goal:latest.text,mode:input.mode??'revise',operationId:`chat-${digest(id).slice(0,16)}-${latest.seq}`},{kind:'user-log',sessionId:id,seq:latest.seq})).project;
          await index.put(`chat:${id}`,{...refOf(p),title:p.title,revision:p.revision});this.changed(p);
        }
        return view(id,p);
      }
      if(!p)fail('先调用 begin，把当前原聊天接入可视化。');
      if(input.action==='read'){
        // Backfill evidence only. Old user words cannot answer today's open
        // question or approve a report that did not exist at that time.
        const archive=await history.refresh(id),missing=archive.messages.filter(m=>m.role==='user'&&!p.events.some(e=>e.kind==='user-log'&&e.seq===m.seq));
        if(missing.length)p=(await store.mutate(mutation(p),{kind:'system'},draft=>{for(const m of missing){const ev=store.event({kind:'user-log',sessionId:id,seq:m.seq},m.text);draft.events.push(ev);}draft.events.sort((a,b)=>(a.seq??Infinity)-(b.seq??Infinity));return 'history-evidence';})).project;
        return {...view(id,p),...(p.reports.length?{presentation:reportPresentation(currentReport(p))}:{})};
      }
      if(input.expectedRevision!==p.revision)fail(`聊天已更新，请重新 read 后继续。当前修订 ${p.revision}。`);
      const base={...mutation(p),operationId:input.operationId||randomUUID()};
      if(input.action==='understand'){
        if(!input.summary?.trim())fail('请写出当前理解。');
        const basis=[...new Set(input.eventIds??[])];if(basis.some(id=>!p.events.some(e=>e.id===id&&e.kind==='user-log')))fail('理解只能引用本聊天的真实用户原话。');
        const result=await store.mutate(base,{kind:'agent',sessionId:id},draft=>{const entry={id:randomUUID(),summary:input.summary,guesses:input.guesses??[],unresolved:input.unresolved??[],eventIds:basis,basisSeq:draft.conversation.lastUserSeq,at:new Date().toISOString()};draft.conversation.understandings.push(entry);return entry.id;});return view(id,result.project);
      }
      if(input.action==='execute'){
        const r=currentReport(p),d=p.decisions.findLast(d=>d.version===r?.version&&d.hash===r?.hash&&p.events.find(e=>e.id===d.eventId)?.seq===p.conversation.lastUserSeq);
        if(!r||!d)fail('当前方案尚未取得真实用户认可，请继续在原聊天问清。');
        const existing=p.submissions.find(s=>s.decisionId===d.id&&s.delivery==='current-turn');
        if(existing)return {...view(id,p),submission:existing};
        const result=await store.freeze({...base,version:r.version,hash:r.hash,scope:d.scope,decisionId:d.id,sessionId:id,inline:true},{kind:'agent',sessionId:id});
        return {...view(id,result.project),submission:result.project.submissions.find(s=>s.id===result.resultId)};
      }
      fail('未知聊天操作。');
    });},
    presented(id,version,hash){return serial(id,async()=>{await workspaceFor(id);await sync(id);await present(id,version,hash,'panel');return view(id,await read(id));});},
    async *watch(id,signal){
      await workspaceFor(id);let dirty=true,wake,timer;const changed=()=>{dirty=true;wake?.();};
      if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(changed);
      signal.addEventListener('abort',changed);
      try{
        yield view(id,await read(id));
        await serial(id,()=>sync(id));
        while(!signal.aborted){
          // The official state API samples pending approval/question requests;
          // those alone do not emit observeState. Poll only this open pane's
          // passive state, without rereading unchanged history or waking AI.
          if(!dirty)await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,1500);if(dirty||signal.aborted)resolve();});
          clearTimeout(timer);timer=undefined;
          if(signal.aborted)break;const historyChanged=dirty;dirty=false;wake=undefined;
          if(historyChanged)await history.refresh(id,signal);
          const stateChanged=await readRuntime(id,AbortSignal.any([signal,AbortSignal.timeout(5000)]));
          if(historyChanged||stateChanged)yield view(id,await read(id));
        }
      }finally{clearTimeout(timer);signal.removeEventListener('abort',changed);listeners.get(id)?.delete(changed);if(!listeners.get(id)?.size){listeners.delete(id);history.forget(id);runtime.delete(id);}}
    },
  };
}
