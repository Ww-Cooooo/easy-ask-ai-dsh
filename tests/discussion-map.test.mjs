import test from 'node:test';
import assert from 'node:assert/strict';
import { discussionMap, nodeTitle } from '../src/discussion-map.mjs';

const message=(seq,role,text)=>({seq,role,text,at:'2026-11-10',interrupted:false});
const snapshot=()=>({sessionId:'s1',history:{complete:true,messages:[message(1,'user','这个报名页不够正式'),message(2,'assistant','改完以后，更像通知还是邀请？')]},project:{questions:[{id:'q1',text:'改完以后，更像通知还是邀请？',status:'open',options:[]}],conversation:{lastUserSeq:1,understandings:[{id:'u1',basisSeq:1,summary:'希望调整口吻，具体程度待问清',guesses:['可能希望减少促销语']}]},events:[],decisions:[],reports:[]}});
test('overview is derived from the real question, no guessed confirmation',()=>{
  const state=snapshot(),result=discussionMap(state);
  assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].current,true);assert.equal(result.nodes[0].waiting,true);
  assert.equal(result.guessCount,1);assert.equal(result.answerCount,0);assert.equal(result.confirmedCount,0);
  assert.equal(result.nodes[0].question.text,state.project.questions[0].text);
});
test('owner reply attaches without moving nodes or approving the plan',()=>{
  const state=snapshot(),before=discussionMap(state);state.history.messages.push(message(3,'user','同意'));
  const after=discussionMap(state);assert.deepEqual(after.nodes.map(n=>n.id),before.nodes.map(n=>n.id));
  assert.equal(after.answerCount,1);assert.equal(after.confirmedCount,0);assert.notEqual(after.nodes[0].signature,before.nodes[0].signature);
  state.history.messages.push(message(4,'assistant','标题希望保留什么？'));
  const next=discussionMap(state);assert.equal(next.nodes.length,2);assert.equal(next.nodes[0].id,before.nodes[0].id);
});
test('confirmed node needs matching owner source, actual decision and report version/hash',()=>{
  const state=snapshot();state.history.messages.push(message(3,'user','认可这版范围'));
  state.project.events=[{id:'e3',kind:'user-log',sessionId:'s1',seq:3,text:'认可这版范围'}];
  state.project.reports=[{version:2,hash:'abc',items:[{id:'title',text:'只改标题'}]}];
  state.project.decisions=[{id:'d1',eventId:'e3',version:2,hash:'abc',scope:['title']}];
  const result=discussionMap(state);assert.equal(result.confirmedCount,1);assert.deepEqual(result.nodes[0].decisions[0].scope,['title']);assert.equal(result.nodes[0].decisions[0].quote,'认可这版范围');
  state.project.decisions[0].hash='old';assert.equal(discussionMap(state).confirmedCount,0);
  state.project.decisions[0].hash='abc';state.project.events[0].sessionId='other';assert.equal(discussionMap(state).confirmedCount,0);
  state.project.events[0].sessionId='s1';state.history.messages[2].role='assistant';assert.equal(discussionMap(state).confirmedCount,0);
});
test('recovered approval highlights its actual answered node rather than a redundant later request',()=>{
  const state=snapshot();state.project.questions[0].status='answered';state.history.messages.push(message(3,'user','就按这个方向改'),message(4,'assistant','相同方案又登记成 V2，请确认？'));
  state.project.events=[{id:'approval',kind:'user-log',sessionId:'s1',seq:3,text:'就按这个方向改'}];state.project.reports=[{version:1,hash:'same',items:[]},{version:2,hash:'same',items:[]}];
  state.project.decisions=[{id:'d1',eventId:'approval',version:1,hash:'same',scope:['title']}];state.stage='approved';state.activeReportVersion=1;
  const result=discussionMap(state);assert.equal(result.nodes.length,2);assert.equal(result.nodes[0].current,true);assert.equal(result.nodes[1].current,false);assert.equal(result.confirmedCount,1);
});
test('long old conversation remains navigable without a requirement record',()=>{
  const messages=[message(0,'user','开始')];for(let i=0;i<80;i++)messages.push(message(i*2+1,'assistant',`问题 ${i+1}：需要保留什么？`),message(i*2+2,'user',`保留第 ${i+1} 条`));
  const result=discussionMap({sessionId:'s2',project:null,history:{messages,complete:true}});
  assert.equal(result.nodes.length,80);assert.equal(result.answerCount,80);assert.equal(result.confirmedCount,0);assert.equal(result.nodes.filter(n=>n.current).length,1);
});
test('titles are bounded navigation excerpts, full conditional question is retained',()=>{
  const state=snapshot();state.project.questions[0].text='前面的原文保持不变——如果保留活动日期和报名条件，标题还希望怎么改？';
  const result=discussionMap(state);assert.equal(result.nodes[0].question.text,state.project.questions[0].text);assert.ok(Array.from(result.nodes[0].title).length<=30);
  assert.equal(nodeTitle('第一行说明\n**要保留日期吗？**\n1. 是'),'要保留日期吗？');
});

test('a real letter answer keeps a paraphrased tool question on one node',()=>{
  const state=snapshot();
  state.project.questions[0].text='原文是活泼的宣传语。你说“不够正式”——改完之后，整页更接近哪一种？';
  state.history.messages[1].text='我读了原文，先确认方向。\n\n**改完之后，整页更接近哪一种？**\nA. 正式通知\nB. 正式但亲切的邀请';
  const before=discussionMap(state);assert.equal(before.nodes.length,1);
  state.history.messages.push(message(143,'user','B'));
  state.project.events=[{id:'owner-143',kind:'user-log',sessionId:'s1',seq:143,text:'B'}];
  state.project.answers=[{questionId:'q1',eventId:'owner-143',text:'B'}];
  state.project.questions[0].status='answered';
  const after=discussionMap(state);
  assert.equal(after.nodes.length,1);assert.equal(after.answerCount,1);assert.equal(after.confirmedCount,0);
  assert.equal(after.nodes[0].id,before.nodes[0].id);assert.equal(after.nodes[0].answers[0].text,'B');
  state.history.messages[1].text='改写过的 AI 回复，和存储的提问文字完全不同。';
  assert.equal(discussionMap(state).nodes.length,1,'owner answer link is enough even without text match');
});

test('next question waits in its own stable node until its published reply arrives',()=>{
  const state=snapshot();state.project.questions[0].status='answered';
  state.history.messages.push(message(3,'user','B'));
  state.project.questions.push({id:'q2',text:'标题想保留哪一部分？',status:'open',options:[]});
  const waiting=discussionMap(state);assert.equal(waiting.nodes.length,2);assert.equal(waiting.nodes[0].questions.length,1);assert.equal(waiting.nodes[1].waiting,true);
  state.history.messages.push(message(4,'assistant','接下来核对标题。**标题想保留哪一部分？**'));
  const published=discussionMap(state);assert.equal(published.nodes.length,2);assert.deepEqual(published.nodes.map(n=>n.id),waiting.nodes.map(n=>n.id));
  assert.equal(published.nodes[1].assistant.length,1);
});

test('result confirmation stays on the actually answered result node and differs from scope approval',()=>{
  const state=snapshot();state.project.questions=[];state.history.messages=[message(420,'assistant','已完成 result.md，请看效果。'),message(429,'user','都对了'),message(438,'assistant','收到，这一版定下来了。')];
  state.project.events=[{id:'real-review',kind:'user-log',sessionId:'s1',seq:429,text:'都对了'}];
  state.project.reports=[{version:2,hash:'frozen',items:[]}];state.project.submissions=[{id:'execution',version:2,hash:'frozen'}];
  state.project.artifacts=[{id:'result',submissionId:'execution',path:'result.md',hash:'file-hash',humanStatus:'accepted',humanEventId:'real-review'}];
  const map=discussionMap(state);assert.equal(map.nodes.length,2);assert.equal(map.currentId,'message-438');assert.equal(map.answerCount,1);assert.equal(map.confirmedCount,1);
  assert.equal(map.nodes[0].decisions.length,0);assert.deepEqual(map.nodes[0].resultApprovals[0],{id:'result',path:'result.md',hash:'file-hash',version:2,quote:'都对了'});
  assert.equal(map.nodes[1].resultApprovals.length,0);state.project.events[0].text='不同意';assert.equal(discussionMap(state).confirmedCount,0);
});
