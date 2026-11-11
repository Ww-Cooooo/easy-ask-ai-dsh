import { discussionRounds } from './discussion.mjs';
import { roundProvenance } from './discussion-provenance.mjs';

const plain=text=>String(text??'').replace(/[#*_>`]/g,'').replace(/\s+/g,' ').trim();
// These are navigation excerpts, never new model conclusions. Full text stays
// on the node and is available through its evidence disclosure.
function questionExcerpt(text){
  const lines=String(text??'').split('\n').map(plain).filter(Boolean);
  let line=lines.find(s=>/[？?]/.test(s))??lines[0]??'';
  if(/[？?]/.test(line))line=line.split(/[。\n]/).filter(s=>/[？?]/.test(s)).at(-1)??line;
  if(/[？?]/.test(line)&&line.includes('——'))line=line.split('——').at(-1);
  return line;
}
export function nodeTitle(text){
  const line=questionExcerpt(text),characters=Array.from(line);
  return characters.length>30?characters.slice(0,29).join('')+'…':line;
}

export function discussionMap(snapshot){
  const p=snapshot.project, messages=snapshot.history?.messages??[];
  const rounds=discussionRounds(messages).map(r=>({...r,questions:[],understandings:[],decisions:[],resultApprovals:[]}));
  for(const [questionIndex,q] of (p?.questions??[]).entries()){
    const answerSeqs=new Set((p.answers??[]).filter(a=>a.questionId===q.id).map(a=>p.events.find(e=>e.id===a.eventId&&e.sessionId===snapshot.sessionId&&e.kind==='user-log')?.seq).filter(seq=>seq!==undefined));
    // The stored answer-to-question relation remains authoritative even when
    // the published assistant reply paraphrases the tool's question context.
    let round=rounds.find(r=>r.answers.some(m=>answerSeqs.has(m.seq)));
    const text=plain(q.text),excerpt=questionExcerpt(q.text);
    const matches=rounds.filter(r=>!r.questions.length&&r.assistant.some(m=>{const body=plain(m.text);return body.includes(text)||excerpt.length>=8&&/[？?]/.test(excerpt)&&body.includes(excerpt);}));
    if(!round&&matches.length===1)round=matches[0];
    const start=Date.parse(q.at),end=Date.parse(p.questions[questionIndex+1]?.at) || Infinity;
    if(!round&&Number.isFinite(start))round=rounds.find(r=>!r.questions.length&&r.assistant.some(m=>Date.parse(m.at)>=start&&Date.parse(m.at)<end));
    const last=rounds.at(-1);
    if(!round&&q.status==='open'&&last&&!last.questions.length&&!last.answers.length)round=last;
    if(!round){round={id:`question-${q.id}`,title:q.text,opening:[],assistant:[],answers:[],questions:[],understandings:[],decisions:[],resultApprovals:[]};rounds.push(round);}
    round.questions.push(q);
  }
  for(const r of rounds)if(r.questions.length)r.id=`question-${r.questions[0].id}`;
  for(const u of p?.conversation?.understandings??[]){
    const round=rounds.find(r=>[...r.opening,...r.answers].some(m=>m.seq===u.basisSeq));
    if(round)round.understandings.push(u);
  }
  for(const decision of p?.decisions??[]){
    const event=p.events.find(e=>e.id===decision.eventId);
    const report=p.reports.find(r=>r.version===decision.version&&r.hash===decision.hash);
    // A word such as 'yes', a model reply or a stale version is not proof.
    if(!event||event.kind!=='user-log'||event.sessionId!==snapshot.sessionId||!report)continue;
    const round=rounds.find(r=>[...r.opening,...r.answers].some(m=>m.role==='user'&&m.seq===event.seq&&m.text===event.text));
    if(round)round.decisions.push({...decision,quote:event.text,report});
  }
  for(const artifact of p?.artifacts??[]){
    if(artifact.humanStatus!=='accepted')continue;
    const event=p.events.find(e=>e.id===artifact.humanEventId&&e.kind==='user-log'&&e.sessionId===snapshot.sessionId);
    const submission=p.submissions?.find(s=>s.id===artifact.submissionId);
    if(!event||!submission||!p.reports.some(r=>r.version===submission.version&&r.hash===submission.hash))continue;
    const round=rounds.find(r=>r.answers.some(m=>m.role==='user'&&m.seq===event.seq&&m.text===event.text));
    if(round)round.resultApprovals.push({id:artifact.id,path:artifact.path,hash:artifact.hash,version:submission.version,quote:event.text});
  }
  const openId=p?.questions.find(q=>q.status==='open')?.id;
  const approvedRound=snapshot.stage==='approved'?rounds.findLast(r=>r.decisions.some(d=>d.version===snapshot.activeReportVersion)):undefined;
  const nodes=rounds.map((r,index)=>{
    const question=r.questions.find(q=>q.id===openId)??r.questions.at(-1);
    const understanding=r.understandings.at(-1);
    const provenance=roundProvenance(r,snapshot.history);
    return {...r,index,title:nodeTitle(question?.text??r.title),question,understanding,provenance,
      current:approvedRound?r.id===approvedRound.id:openId?r.questions.some(q=>q.id===openId):index===rounds.length-1,
      waiting:question?.status==='open'&&!r.answers.length,
      guesses:understanding?.guesses??[],
      signature:JSON.stringify([r.answers.map(a=>a.seq),r.assistant.map(a=>a.seq),understanding?.id,understanding?.summary,understanding?.guesses,r.decisions.map(d=>d.id),question?.status,r.resultApprovals.map(a=>[a.id,a.hash,a.quote]),provenance]),
    };
  });
  return {nodes,currentId:nodes.find(n=>n.current)?.id,
    answerCount:nodes.reduce((sum,n)=>sum+n.answers.length,0),
    confirmedCount:nodes.reduce((sum,n)=>sum+n.decisions.length+n.resultApprovals.length,0),
    guessCount:nodes.reduce((sum,n)=>sum+n.guesses.length,0)};
}
