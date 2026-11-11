// Read-only presentation. This never grants approval or starts execution.
export function conversationProgress(snapshot){
  const p=snapshot.project,runtime=snapshot.runtime;
  if(!snapshot.history?.complete)return {step:-1,heading:'loading',next:'loading',owner:'none'};
  if(!p)return {step:-1,heading:'idle',next:runtime?.running?'chat-running':'chat',owner:runtime?.running?'ai':'none'};
  const report=p.reports.find(r=>r.version===snapshot.activeReportVersion)??p.reports.at(-1);
  const submission=p.submissions.findLast(s=>s.kind==='execution'&&s.sessionId===snapshot.sessionId&&s.hash===report?.hash&&s.status!=='cancelled'&&p.decisions.some(d=>d.id===s.decisionId&&d.hash===s.hash&&d.version===s.version));
  const artifacts=submission?p.artifacts.filter(a=>a.submissionId===submission.id):[];
  const humanReview=a=>p.events.some(e=>e.id===a.humanEventId&&(e.kind==='user-ui'||e.kind==='user-log'&&e.sessionId===snapshot.sessionId));
  const complete=artifacts.length>0&&artifacts.every(a=>a.humanStatus==='accepted'&&humanReview(a));
  const needsChange=artifacts.some(a=>a.humanStatus==='needs-change'&&humanReview(a));
  const question=p.questions.find(q=>q.status==='open');
  const shown=report&&p.conversation?.presentations.some(s=>s.version===report.version&&s.hash===report.hash);
  let step=0,heading=question?'question':'understanding',next=question?'answer':'await-ai',owner=question?'you':'ai';
  if(snapshot.stage==='result'&&complete){step=4;heading='complete';next='complete';owner='none';}
  else if(snapshot.stage==='result'&&needsChange){heading='needs-change';next='await-revision';owner='ai';}
  else if(snapshot.stage==='result'&&artifacts.length){step=3;heading='review';next='review-result';owner='you';}
  else if(snapshot.stage==='approved'){
    step=2;
    const started=submission&&['accepted','result-recorded'].includes(submission.status);
    heading=started?'execution':'approved';
    next=submission?.status==='retryable'?'delivery-failed':started?'execution-stopped':'not-started';owner='ai';
  }else if(snapshot.stage==='plan'){
    step=1;heading=shown?'plan':'plan-draft';next=shown?'review-plan':'await-presentation';owner=shown?'you':'ai';
  }
  // Passive live state is separate from durable progress. A queued/accepted
  // request or an old turn/start is never evidence that the model is running.
  if(!runtime?.known)return {step,heading,next:'runtime-unknown',owner:'none'};
  if(runtime.pendingInput.includes('approval'))return {step,heading,next:'permission',owner:'you'};
  if(runtime.pendingInput.length)return {step,heading,next:'host-input',owner:'you'};
  if(runtime.queued&&!runtime.running)return {step,heading,next:'queued',owner:'ai'};
  if(runtime.running){
    next=step===4?'wrap-up':step===3?'delivery':step===2?(heading==='execution'?'executing':'preparing'):step===1?'writing-plan':'organizing';owner='ai';
  }
  return {step,heading,next,owner};
}
