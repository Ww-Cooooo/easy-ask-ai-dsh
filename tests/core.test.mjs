import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RequirementStore, digest, safePath } from '../src/core.mjs';
const base=path.resolve(import.meta.dirname,'../fixtures/test-runs');
const user={kind:'user-ui',peerId:'test-user'};
const agent={kind:'agent',sessionId:'test-session'};
const operation=()=>randomUUID();
async function setup(t){
  await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'case-'));
  const sent=new Map();let failAfterAccept=false;
  const adapters={workspaces:async()=>[{id:'workspace',title:'测试',path:root}],verifySession:async(id,ws)=>{assert.equal(id,'test-session');assert.equal(ws.path,await fs.realpath(root));},deliver:async s=>{sent.set(s.requestId,s.prompt);if(failAfterAccept){failAfterAccept=false;throw Error('回执丢失');}return {accepted:true};}};
  const store=new RequirementStore(adapters);let p=(await store.create({workspaceId:'workspace',taskId:'registration',title:'报名页返修',goal:'报名页不够正式，明确改动并保留重要信息。',mode:'revise',operationId:operation()},user)).project;
  const ref={workspaceId:'workspace',taskId:'registration'};
  const input=extra=>({...ref,expectedRevision:p.revision,operationId:operation(),...extra});
  const apply=async(method,extra,actor=agent)=>{const result=await store[method](input(extra),actor);p=result.project;return result;};
  const report=(items)=>({goal:'让报名页适合正式培训通知',body:'准确呈现培训内容、时间与报名方式。去掉夸张口号，保留事实。',items,deliverables:['registration-result.md'],acceptance:['逐项对照正文及保留项。'],sourceIds:p.sources.map(s=>s.id)});
  const item=(id,text,kind='change')=>({id,text,kind,scope:'报名页',status:'active',sourceIds:p.sources.map(s=>s.id),eventIds:[p.events[0].id]});
  return {store,root,sent,ref,input,apply,report,item,get p(){return p;},set p(value){p=value;},loseReceipt(){failAfterAccept=true;},adapters};
}
test('V1 approval cannot launch V2; actual V2 snapshot and retry keep exact scope',async t=>{
  const c=await setup(t);await fs.writeFile(path.join(c.root,'registration.md'),'# 大数据培训招生\n学习大数据，马上起飞！\n日期：2026年12月1日\n报名：填写在线表单\n');
  await c.apply('source',{source:{kind:'text',label:'原报名页',path:'registration.md',excerpt:'学习大数据，马上起飞！'}});
  await c.apply('question',{text:'“马上起飞”这句让你感觉怎样？',options:['太夸张，改为具体培训内容','语气可以，只调整信息顺序','都不是／说不清'],sourceIds:c.p.sources.map(s=>s.id)});
  await c.apply('answer',{questionId:c.p.questions[0].id,text:'太夸张，写清课程内容就行。'},user);
  await c.apply('revise',{report:c.report([c.item('tone','去掉夸张宣传，写清课程内容。')])});
  const v1=c.p.reports.at(-1);await c.apply('decide',{version:1,hash:v1.hash,scope:['tone'],text:'认可这个改动。'},user);const d1=c.p.decisions.at(-1);
  await c.apply('revise',{report:c.report([c.item('tone','去掉夸张宣传，写清课程内容。'),c.item('date','保留日期：2026年12月1日','preserve'),c.item('signup','保留报名方式：填写在线表单','preserve')])},user);
  const v2=c.p.reports.at(-1);assert.equal(v2.version,2);assert.ok(v2.changes.some(x=>x.kind==='added'&&x.itemId==='date'));
  const args={version:2,hash:v2.hash,scope:['tone','date','signup'],decisionId:d1.id,sessionId:'test-session'};
  await assert.rejects(c.store.freeze(c.input(args),agent),e=>e.code==='approval');
  await assert.rejects(c.store.decide(c.input({...args,text:'用户已经同意'}),agent),e=>e.code==='permission');
  await c.apply('decide',{version:2,hash:v2.hash,scope:args.scope,text:'认可 V2 的完整范围。'},user);
  const frozen=await c.apply('freeze',{...args,decisionId:c.p.decisions.at(-1).id});const submissionId=frozen.resultId;
  const fixedPrompt=c.p.submissions[0].prompt;c.loseReceipt();let result=await c.store.deliver(c.ref,submissionId);assert.equal(result.project.submissions[0].status,'retryable');
  const recovered=new RequirementStore(c.adapters);result=await recovered.deliver(c.ref,submissionId);assert.equal(result.project.submissions[0].status,'accepted');assert.equal(c.sent.size,1);assert.equal(result.project.submissions[0].attempts,2);assert.equal(c.sent.values().next().value,fixedPrompt);
  c.p=result.project;await c.apply('revise',{report:c.report([c.item('extra','另加一条还未认可的改动。')])});assert.equal(c.p.submissions[0].prompt,fixedPrompt);assert.equal(c.p.submissions[0].version,2);
  await fs.writeFile(path.join(c.root,'registration-result.md'),'# 大数据培训招生\n课程介绍：数据分析与实践。\n日期：2026年12月1日\n');
  await c.apply('artifact',{submissionId,path:'registration-result.md',evidence:[{itemId:'tone',excerpt:'课程介绍：数据分析与实践。',judgment:'语气调整'},{itemId:'date',excerpt:'日期：2026年12月1日',judgment:'保留'}]});
  assert.equal(c.p.artifacts[0].checks.find(x=>x.itemId==='signup').status,'missing');assert.equal(c.p.artifacts[0].humanStatus,'pending');
});
test('stale agent proposal cannot overwrite user draft; repeated conflict is idempotent',async t=>{
  const c=await setup(t);const stale=c.input({report:c.report([c.item('a','过期建议')])});await c.apply('revise',{report:c.report([c.item('a','用户刚刚输入的要求')])},user);
  const conflict=await c.store.revise(stale,agent);assert.equal(conflict.status,'conflict');assert.equal(conflict.project.reports.at(-1).items[0].text,'用户刚刚输入的要求');assert.ok(conflict.project.conflicts[0].draft.includes('过期建议'));
  const retry=await c.store.revise(stale,agent);assert.equal(retry.status,'conflict');assert.equal(retry.project.revision,conflict.project.revision);assert.equal(retry.project.conflicts.length,1);
  await assert.rejects(c.store.revise({...stale,report:c.report([c.item('a','偷换操作内容')])},agent),e=>e.code==='idempotency');
});
test('single typo takes short path; exports do not touch human files or send sessions',async t=>{
  const c=await setup(t);const dir=path.join(c.root,'.prompt-ready/registration');await fs.writeFile(path.join(dir,'requirements.md'),'人工原稿，必须保留。');
  await c.apply('revise',{report:c.report([c.item('typo','仅将标题“招声”改为“招生”，其余内容和排版保持原样。')])},user);
  const report=c.p.reports[0];await c.apply('decide',{version:1,hash:report.hash,scope:['typo'],text:'只改这个错字。'},user);
  assert.equal(c.p.questions.length,0);await c.apply('export',{version:1},user);assert.equal(c.sent.size,0);assert.equal(await fs.readFile(path.join(dir,'requirements.md'),'utf8'),'人工原稿，必须保留。');
  const exported=c.p.exports[0];assert.equal(exported.files.length,3);for(const file of exported.files){assert.ok((await fs.readFile(path.join(c.root,file.path),'utf8')).includes(report.hash));}
  const edited=exported.files.find(x=>x.path.endsWith('requirements.md'));await fs.appendFile(path.join(c.root,edited.path),'\n人工增加验收说明。');assert.equal((await c.store.exportStatus(c.ref)).find(x=>x.path===edited.path).status,'edited');
  await c.apply('importText',{path:edited.path},user);assert.equal(c.p.reports.at(-1).version,2);assert.ok(c.p.reports.at(-1).body.includes('人工增加验收说明'));assert.equal(c.p.decisions[0].version,1);
});
test('source version changes retain old anchor and refuse frozen execution',async t=>{
  const c=await setup(t);const file=path.join(c.root,'source.txt');await fs.writeFile(file,'before\nOriginal title\nafter');await c.apply('source',{source:{kind:'text',label:'标题',path:'source.txt',excerpt:'Original title'}});
  const source=c.p.sources[0];await fs.writeFile(file,'before\nDifferent title\nafter');const checks=await c.store.checkSources(c.ref);assert.equal(checks[0].status,'changed');assert.equal((await c.store.read(c.ref)).sources[0].excerpt,source.excerpt);
  await c.apply('revise',{report:c.report([c.item('title','修改标题')])});const r=c.p.reports[0];await c.apply('decide',{version:1,hash:r.hash,scope:['title'],text:'测试认可'},user);
  await assert.rejects(c.store.freeze(c.input({version:1,hash:r.hash,scope:['title'],decisionId:c.p.decisions[0].id,sessionId:'test-session'}),agent),e=>e.code==='source');
  await assert.rejects(c.store.source(c.input({source:{kind:'text',label:'逃逸',path:'../outside.txt',excerpt:'x'}}),agent),e=>e.code==='path');
});
test('HEAD corruption fails closed and path links cannot escape fixture',async t=>{
  const c=await setup(t);const outside=await fs.mkdtemp(path.join(base,'outside-'));await fs.writeFile(path.join(outside,'secret.txt'),'not a permitted source');
  await fs.symlink(outside,path.join(c.root,'linked'),process.platform==='win32'?'junction':'dir');await assert.rejects(safePath(c.root,'linked/secret.txt',{mustExist:true}),e=>e.code==='path');
  const headPath=path.join(c.root,'.prompt-ready/registration/eh3-easy-ask-ai/HEAD.json');const head=JSON.parse(await fs.readFile(headPath,'utf8'));head.hash='0'.repeat(64);await fs.writeFile(headPath,JSON.stringify(head));await assert.rejects(c.store.read(c.ref),e=>e.code==='integrity');
});
test('concurrent edits have one winner and one preserved conflict',async t=>{
  const c=await setup(t);const a=c.input({report:c.report([c.item('a','Alpha')])});const b=c.input({report:c.report([c.item('a','Beta')])});
  const results=await Promise.all([c.store.revise(a,user),c.store.revise(b,agent)]);assert.deepEqual(results.map(r=>r.status).sort(),['conflict','ok']);const p=await c.store.read(c.ref);assert.equal(p.reports.length,1);assert.equal(p.conflicts.length,1);
});

test('clarification is persisted before send; wrong session and Agent user-actions are refused',async t=>{
  const c=await setup(t);await assert.rejects(c.store.clarify(c.input({text:'梳理要求',sessionId:'test-session'}),agent),e=>e.code==='permission');
  await assert.rejects(c.store.clarify(c.input({text:'梳理要求',sessionId:'outside-session'}),user));
  await c.apply('clarify',{text:'先提出一个具体效果问题',sessionId:'test-session'},user);assert.equal(c.sent.size,0);assert.equal(c.p.submissions[0].status,'prepared');
  const id=c.p.submissions[0].id;await c.apply('cancel',{submissionId:id},user);const result=await c.store.deliver(c.ref,id);assert.equal(result.project.submissions[0].status,'cancelled');assert.equal(c.sent.size,0);
  await c.apply('clarify',{text:'保留旧版，继续问清效果',sessionId:'test-session'},user);c.p=(await c.store.deliver(c.ref,c.p.submissions[1].id)).project;
  await assert.rejects(c.store.cancel(c.input({submissionId:c.p.submissions[1].id}),user),e=>e.code==='running');
});

test('unchanged items keep original attribution; unresolved scope does not launch',async t=>{
  const c=await setup(t);await c.apply('revise',{report:c.report([c.item('tone','修改语气')])},user);const original=c.p.reports[0].items[0];
  await c.apply('revise',{report:c.report([c.item('tone','修改语气'),c.item('open','是否替换标题尚未明确','unresolved')])});
  assert.equal(c.p.reports[1].items[0].originEventId,original.originEventId);assert.equal(c.p.reports[1].items[0].origin,'user');
  const r=c.p.reports[1];await c.apply('decide',{version:2,hash:r.hash,scope:['tone'],text:'测试认可'},user);
  await assert.rejects(c.store.freeze(c.input({version:2,hash:r.hash,scope:['tone'],decisionId:c.p.decisions[0].id,sessionId:'test-session'}),agent),e=>e.code==='approval');
});
