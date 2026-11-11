import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationProgress as progress} from '../src/conversation-progress.mjs';

function view(){return {sessionId:'one',stage:'understanding',activeReportVersion:1,history:{complete:true},runtime:{known:true,running:false,queued:0,pendingInput:[]},project:{reports:[{version:1,hash:'frozen'}],decisions:[{id:'decision',version:1,hash:'frozen'}],submissions:[],artifacts:[],events:[],questions:[],conversation:{presentations:[]}}};}
function submitted(v){v.project.submissions.push({id:'submission',kind:'execution',sessionId:'one',hash:'frozen',version:1,decisionId:'decision',status:'accepted'});return v;}
function result(v){submitted(v);v.stage='result';v.project.artifacts.push({id:'artifact',submissionId:'submission',humanStatus:'pending'});return v;}
function accepted(v){result(v);v.project.artifacts[0].humanStatus='accepted';v.project.artifacts[0].humanEventId='owner';v.project.events.push({id:'owner',kind:'user-log',sessionId:'one',text:'都对了'});return v;}

test('unseen plans and permission prompts do not request business approval prematurely',()=>{
  const v=view();v.stage='plan';assert.equal(progress(v).next,'await-presentation');
  v.project.conversation.presentations.push({version:1,hash:'other'});assert.equal(progress(v).next,'await-presentation');
  v.project.conversation.presentations.push({version:1,hash:'frozen'});assert.equal(progress(v).next,'review-plan');
  v.runtime.pendingInput=['approval'];assert.equal(progress(v).next,'permission');assert.equal(progress(v).step,1);
});
test('approval, admission, queueing and real runtime are distinct',()=>{
  const v=view();v.stage='approved';assert.equal(progress(v).next,'not-started');
  submitted(v);assert.equal(progress(v).next,'execution-stopped');
  v.runtime.queued=1;assert.equal(progress(v).next,'queued');
  v.runtime.running=true;assert.equal(progress(v).next,'executing');
  v.runtime.running=false;v.runtime.queued=0;v.project.submissions[0].status='retryable';assert.equal(progress(v).next,'delivery-failed');
  v.project.submissions[0].sessionId='other';assert.equal(progress(v).next,'not-started');
  v.project.submissions[0].sessionId='one';v.project.submissions[0].kind='export';assert.equal(progress(v).next,'not-started');
});
test('generated artifacts and guessed acceptance cannot finish a task',()=>{
  const v=result(view());assert.equal(progress(v).step,3);assert.equal(progress(v).next,'review-result');
  v.project.artifacts[0].humanStatus='accepted';assert.equal(progress(v).step,3);
  v.project.artifacts[0].humanEventId='model';v.project.events.push({id:'model',kind:'agent',sessionId:'one'});assert.equal(progress(v).step,3);
  v.project.events[0].kind='user-log';v.project.events[0].sessionId='other';assert.equal(progress(v).step,3);
});
test('all current artifacts need actual human acceptance; selected nodes and ordinary closing do not rewind it',()=>{
  const v=accepted(view());assert.equal(progress(v).step,4);assert.equal(progress(v).next,'complete');
  v.selectedNode='first-question';v.history.messages=[{role:'assistant',text:'好，收到'}];assert.equal(progress(v).step,4);
  v.runtime.running=true;assert.equal(progress(v).next,'wrap-up');assert.equal(progress(v).step,4);
  v.runtime.running=false;v.project.artifacts.push({id:'second',submissionId:'submission',humanStatus:'pending'});assert.equal(progress(v).step,3);
});
test('new feedback reopens clarification while preserving old confirmation evidence',()=>{
  const v=accepted(view()),before=JSON.stringify(v.project);v.stage='understanding';v.project.questions.push({status:'open'});
  assert.equal(progress(v).step,0);assert.equal(progress(v).next,'answer');
  v.project.questions=[];assert.equal(JSON.stringify(v.project),before);
  v.stage='result';v.project.artifacts[0].humanStatus='needs-change';assert.equal(progress(v).next,'await-revision');assert.equal(progress(v).step,0);
});
test('disconnected runtime and incomplete history never claim running or completion',()=>{
  const v=accepted(view());v.runtime=undefined;assert.equal(progress(v).step,4);assert.equal(progress(v).next,'runtime-unknown');
  v.history.complete=false;assert.equal(progress(v).step,-1);assert.equal(progress(v).next,'loading');
});
