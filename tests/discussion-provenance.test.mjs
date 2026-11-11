import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscussionHistory} from '../src/discussion.mjs';
import {projectActivities,roundProvenance,discussionGroups} from '../src/discussion-provenance.mjs';
import {discussionMap} from '../src/discussion-map.mjs';
const call=(seq,turn,action,name='eh3_easy_ask_conversation',args)=>({type:'tool/call',seq,data:{turn,callId:`c${seq}`,name,arguments:JSON.stringify(args??{input:{action,summary:'PRIVATE ARG'}})}});
const result=(seq,c,mode='revise',error=false,overrides={})=>({type:'tool/result',seq,data:{turn:c.data.turn,message:{toolCallId:c.data.callId,isError:error,content:[{type:'text',text:JSON.stringify({project:{mode,conversation:{sessionId:'s1'},events:[{text:'PRIVATE RESULT'}]},...overrides})}]}}});
const round=(turn)=>({assistant:[{turn}],questions:[],understandings:[],decisions:[],resultApprovals:[]});
const history=(activities)=>({activities,provenanceComplete:true,completedTurns:[1,2,3,4,5,6]});

test('same chat can mix workflows, read-only replies and ordinary turns without inheriting project mode',()=>{
  const a=call(1,1,'understand'),b=call(5,2,'question','eh3_easy_ask_propose'),c=call(10,3,'read');
  const {activities}=projectActivities([a,result(2,a),b,result(6,b,'new',false,{status:'ok'}),c,result(11,c)],undefined,'s1');
  assert.deepEqual(roundProvenance(round(1),history(activities)).workflows,['get-clear']);
  assert.deepEqual(roundProvenance(round(2),history(activities)).workflows,['prompt-ready']);
  assert.equal(roundProvenance(round(3),history(activities)).kind,'ordinary');
  assert.equal(roundProvenance(round(4),history(activities)).kind,'ordinary');
  assert.ok(!JSON.stringify(activities).includes('PRIVATE'));
  assert.ok(!JSON.stringify(activities).includes('callId'));
});
test('failed, conflicting, unknown and cross-conversation results do not prove workflow participation',()=>{
  for(const [error,overrides] of [[true,{}],[false,{status:'conflict'}],[false,{project:{mode:'revise',conversation:{sessionId:'other'}}}]]){
    const c=call(1,1,'understand'),{activities}=projectActivities([c,result(2,c,'revise',error,overrides)],undefined,'s1');
    const source=roundProvenance(round(1),history(activities));assert.equal(source.kind,'unknown');assert.deepEqual(source.workflows,[]);
  }
  assert.equal(roundProvenance(round(1),{}).kind,'unknown');
  assert.equal(roundProvenance(round(1),{...history([]),completedTurns:[]}).kind,'unknown','in-flight commentary is not prematurely collapsed');
});
test('reading the original Skill is distinct from running the native workflow; quoted mentions prove neither',()=>{
  const c=call(1,1,null,'read',{file_path:'C:\\private\\skills\\get-clear\\SKILL.md'});
  const r={type:'tool/result',seq:2,data:{message:{toolCallId:'c1',isError:false,content:[{type:'text',text:'PRIVATE SKILL CONTENT'}]}}};
  const {activities}=projectActivities([c,r],undefined,'s1'),source=roundProvenance(round(1),history(activities));
  assert.equal(source.kind,'skill-read');assert.deepEqual(source.skills,['get-clear']);assert.deepEqual(source.workflows,[]);
  assert.ok(!JSON.stringify(activities).includes('private'));assert.ok(!JSON.stringify(activities).includes('CONTENT'));
  const ignored=call(4,2,null,'pwsh',{command:'read get-clear/SKILL.md'});
  assert.equal(projectActivities([ignored],undefined,'s1').activities.length,0);
  const model=discussionMap({sessionId:'s1',project:null,history:{...history([]),messages:[{seq:8,role:'assistant',turn:2,text:'我使用了 Prompt Ready 并且全部确认了'}]}});
  assert.equal(model.nodes[0].provenance.kind,'ordinary');assert.equal(model.confirmedCount,0);
});
test('results crossing history refreshes update old activities without leaking arguments or duplicating replies',async()=>{
  const c=call(1,1,'understand');let events=[c,{type:'assistant/message',seq:2,data:{turn:1,message:{content:[{type:'text',text:'请核对这处意思。'}]}}}];
  const h=createDiscussionHistory({sessionController:{events:async({beforeSeq})=>({records:events.filter(e=>beforeSeq===undefined||e.seq<beforeSeq).map(event=>({type:'event',event}))})}});
  const first=await h.refresh('s1');assert.equal(first.activities[0].status,'pending');
  events.push(result(3,c),{type:'turn/end',seq:4,data:{turn:1,reason:{kind:'completed'}}});
  const next=await h.refresh('s1');assert.equal(next.activities.length,1);assert.equal(next.activities[0].status,'succeeded');assert.equal(next.messages.length,1);assert.deepEqual(next.completedTurns,[1]);
  assert.ok(!JSON.stringify(next).includes('PRIVATE'));assert.equal(first.activities[0].status,'pending');
  h.forget('s1');assert.deepEqual(h.get('s1').activities,[]);
});
test('ordinary grouping preserves chronological identities and never hides recorded human decisions',()=>{
  const nodes=[['a','ordinary'],['b','ordinary'],['c','workflow'],['d','ordinary']].map(([id,kind],index)=>({id,index,provenance:{kind}}));
  const groups=discussionGroups(nodes);assert.deepEqual(groups.map(g=>g.nodes.map(n=>n.id)),[['a','b'],['c'],['d']]);
  const r=round(1);r.decisions.push({id:'real-decision'});assert.equal(roundProvenance(r,history([])).kind,'workflow');
});
