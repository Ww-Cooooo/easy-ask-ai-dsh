// Only allowlisted activity metadata leaves the Host. Never publish raw tool
// arguments/results, file paths, Skill content, private reasoning or call IDs.
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return undefined;}};
const textOf=content=>(content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
const actions={eh3_easy_ask_conversation:['begin','read','understand','execute'],eh3_easy_ask_propose:['source','question','revise','freeze','artifact','export'],eh3_easy_ask_register_artifact:['artifact'],eh3_easy_ask_read:['read']};
function callMetadata(event){
  const d=event.data,args=parse(d?.arguments),input=args?.input??{};
  if(!d?.callId||!Number.isSafeInteger(event.seq))return;
  const base={seq:event.seq,...(Number.isSafeInteger(d.turn)?{turn:d.turn}:{}),status:'pending'};
  if(actions[d.name]){
    const action=d.name==='eh3_easy_ask_read'?'read':input.action;
    if(actions[d.name].includes(action))return {...base,kind:'native',action};
  }
  if(d.name==='read'&&typeof args?.file_path==='string'){
    const path=args.file_path.replace(/\\+/g,'/');
    const match=path.match(/\/(get-clear|prompt-ready)\/(SKILL\.md|references\/[^/]+\.md)$/i);
    if(match)return {...base,kind:'skill-read',workflow:match[1].toLowerCase(),action:match[2].toLowerCase()==='skill.md'?'entry':'reference'};
  }
}
export function projectActivities(events,previous=new Map(),sessionId){
  const ledger=new Map([...previous].map(([id,row])=>[id,{...row}]));
  for(const e of [...events].sort((a,b)=>a.seq-b.seq)){
    if(e.type==='tool/call'){
      const row=callMetadata(e);if(row)ledger.set(e.data.callId,row);
    }
    if(e.type!=='tool/result')continue;
    const m=e.data?.message,row=ledger.get(m?.toolCallId??m?.source?.callId);
    if(!row)continue;
    row.resultSeq=e.seq;
    if(m.isError){row.status='failed';continue;}
    if(m.isError!==false){row.status='unverified';continue;}
    if(row.kind==='skill-read'){row.status=textOf(m.content).trim()?'succeeded':'unverified';continue;}
    const value=parse(textOf(m.content)),p=value?.project??(value?.schemaVersion?value:undefined);
    // A transport success/conflict or another conversation's project is not
    // successful participation in this conversation's workflow.
    if(!p||value?.status&&value.status!=='ok'||p.conversation?.sessionId!==sessionId){row.status='unverified';continue;}
    row.status='succeeded';
    if(p.mode==='new'||p.mode==='revise')row.workflow=p.mode==='new'?'prompt-ready':'get-clear';
    if(typeof value.resultId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value.resultId))row.recordId=value.resultId;
  }
  return {ledger,activities:[...ledger.values()].sort((a,b)=>a.seq-b.seq)};
}

export function roundProvenance(round,history){
  const turns=new Set(round.assistant.map(m=>m.turn).filter(Number.isSafeInteger));
  const activities=(history?.activities??[]).filter(a=>turns.has(a.turn)||a.recordId&&round.questions.some(q=>q.id===a.recordId));
  const active=activities.filter(a=>a.kind==='native'&&a.status==='succeeded'&&!['read','begin'].includes(a.action));
  const workflows=[...new Set(active.map(a=>a.workflow).filter(Boolean))];
  const skills=[...new Set(activities.filter(a=>a.kind==='skill-read'&&a.status==='succeeded').map(a=>a.workflow))];
  const recorded=round.questions.length||round.understandings.length||round.decisions.length||round.resultApprovals.length;
  const incomplete=activities.some(a=>a.status!=='succeeded')||[...turns].some(turn=>!history?.completedTurns?.includes(turn));
  const kind=active.length||recorded?'workflow':skills.length?'skill-read':incomplete||!history?.provenanceComplete||!turns.size?'unknown':'ordinary';
  return {kind,workflows,skills,activities};
}

// Adjacent ordinary rounds remain at their original position. Existing IDs,
// answers, confirmations and current-round navigation are never renumbered.
export function discussionGroups(nodes){
  const groups=[];
  for(const node of nodes){
    const ordinary=node.provenance.kind==='ordinary';
    const last=groups.at(-1);
    if(ordinary&&last?.ordinary)last.nodes.push(node);
    else groups.push({id:node.id,ordinary,nodes:[node]});
  }
  return groups;
}
