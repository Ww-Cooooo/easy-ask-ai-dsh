import test from'node:test';
import assert from'node:assert/strict';
import{mkdir,mkdtemp}from'node:fs/promises';
import path from'node:path';
import{createHostPort}from'../src/host-port.mjs';

test('in-flight session creation cannot transfer the same operation to another workspace',async()=>{
 const base=path.resolve(import.meta.dirname,'../fixtures/runtime-data');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'host-port-'));
 const a=path.join(root,'a'),b=path.join(root,'b');await mkdir(a);await mkdir(b);
 let enter,finish;const entered=new Promise(r=>enter=r),pending=new Promise(r=>finish=r);let created=0;
 const index=new Map();index.put=async(key,value)=>index.set(key,value);
 const workspaces=[{id:'a',path:a,title:'A',sessionIds:[]},{id:'b',path:b,title:'B',sessionIds:[]}],sessions=[];
 const ctx={workspaceRegistry:{list:()=>workspaces,archivedSessionIds:[]},sessionController:{list:async()=>({items:sessions}),create:async({sessionId,workspaceId})=>{created++;enter();await pending;const ws=workspaces.find(w=>w.id===workspaceId);ws.sessionIds.push(sessionId);sessions.push({sessionId,cwd:ws.path});return{sessionId};}}};
 const port=createHostPort(ctx,index),first=port.createSession({workspaceId:'a',operationId:'same-operation'});await entered;
 await assert.rejects(port.createSession({workspaceId:'b',operationId:'same-operation'}),/不能切换工作区/);
 const retry=port.createSession({workspaceId:'a',operationId:'same-operation'});finish();assert.deepEqual(await first,await retry);assert.equal(created,1);
});
