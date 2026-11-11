// An extractive view of this Session's published conversation. No inferred
// answer, approval or private reasoning is created by rebuilding the archive.
import { projectActivities } from './discussion-provenance.mjs';
const textOf=content=>(content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
export function discussionMessage(event){
  const data=event?.data;
  if(event?.type==='user/message'){
    if(data?.role!=='user'||data.source?.kind!=='user'||data.source.principal&&data.source.principal.kind!=='owner'||data.source.rpcId?.startsWith('eh3-'))return null;
    const text=textOf(data.content);return text?{seq:event.seq,role:'user',text,at:event.time??'',interrupted:false}:null;
  }
  if(event?.type==='assistant/message'){
    const text=textOf(data?.message?.content);
    // Visible commentary is kept even when a message also contains tool calls;
    // tool arguments, tool results and reasoning blocks are never displayed.
    return text?{seq:event.seq,role:'assistant',text,at:event.time??'',interrupted:!!data.interrupted,...(Number.isSafeInteger(data.turn)?{turn:data.turn}:{})}:null;
  }
  return null;
}
const titleOf=(text)=>{
  const lines=text.split('\n').map(s=>s.replace(/^\s*(?:#{1,6}\s*|[-*>]\s*)/,'').replace(/\*\*/g,'').trim()).filter(Boolean);
  return (lines.find(s=>/[？?]/.test(s))??lines[0]??'').slice(0,220);
};
export function discussionRounds(messages){
  const rounds=[];let current;
  for(const m of messages){
    if(m.role==='assistant'){
      // A maintenance continuation is not a human answer, but its real model
      // turn still separates a new result from the preceding question.
      const previous=current?.assistant.at(-1);
      const newTurn=Number.isSafeInteger(previous?.turn)&&Number.isSafeInteger(m.turn)&&previous.turn!==m.turn;
      if(!current||current.answers.length||newTurn){current={id:`message-${m.seq}`,title:titleOf(m.text),opening:[],assistant:[],answers:[]};rounds.push(current);}
      current.assistant.push(m);if(!current.title||!/[？?]/.test(current.title)&&/[？?]/.test(m.text))current.title=titleOf(m.text);
    }else if(current?.assistant.length){current.answers.push(m);}
    else{
      if(!current){current={id:`message-${m.seq}`,title:'',opening:[],assistant:[],answers:[]};rounds.push(current);}
      current.opening.push(m);
    }
  }
  for(const r of rounds)if(!r.title)r.title=titleOf(r.opening[0]?.text??'');
  return rounds;
}

export function createDiscussionHistory(ctx){
  const caches=new Map(),loads=new Map(),ledgers=new Map();
  const empty=()=>({messages:[],activities:[],completedTurns:[],throughSeq:-1,complete:false,provenanceComplete:false});
  return {
    get:id=>caches.get(id)??empty(),
    async refresh(id,signal=AbortSignal.timeout(30000)){
      if(loads.has(id))return loads.get(id);
      const load=(async()=>{
        const previous=caches.get(id)??empty(),events=[];let beforeSeq;
        for(let pageNo=0;;pageNo++){
          signal.throwIfAborted();
          const page=await ctx.sessionController.events({address:{kind:'session',sessionId:id},maxMessages:100,...(beforeSeq===undefined?{}:{beforeSeq})},signal);
          const rows=page.records.filter(r=>r.type==='event').map(r=>r.event);
          if(!rows.length)break;
          const min=Math.min(...rows.map(e=>e.seq));
          events.push(...rows.filter(e=>e.seq>previous.throughSeq));
          if(min<=previous.throughSeq||min===0)break;
          if(beforeSeq!==undefined&&min>=beforeSeq)throw Error('聊天历史未完整返回，请重新打开侧栏重试。');
          beforeSeq=min;
          if(pageNo>=9999)throw Error('聊天历史尚未读取完整，请重新打开侧栏重试。');
        }
        const messages=[...new Map([...previous.messages,...events.map(discussionMessage).filter(Boolean)].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq);
        const {ledger,activities}=projectActivities(events,ledgers.get(id),id);
        const completedTurns=[...new Set([...previous.completedTurns,...events.filter(e=>e.type==='turn/end'&&e.data?.reason?.kind==='completed'&&Number.isSafeInteger(e.data.turn)).map(e=>e.data.turn)])];
        const result={messages,activities,completedTurns,throughSeq:events.reduce((last,e)=>Math.max(last,e.seq),previous.throughSeq),complete:true,provenanceComplete:true};
        ledgers.set(id,ledger);
        caches.set(id,result);return result;
      })();
      loads.set(id,load);try{return await load;}finally{loads.delete(id);}
    },
    forget(id){caches.delete(id);ledgers.delete(id);},
  };
}
