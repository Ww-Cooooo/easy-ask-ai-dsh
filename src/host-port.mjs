import { promises as fs } from 'node:fs';
import path from 'node:path';
import { RequirementStore, BusinessError, safePath, digest } from './core.mjs';
import { createConversations } from './conversation.mjs';

export function createHostPort(ctx, index, config={}) {
  const signal=()=>AbortSignal.timeout(30000);
  const creating=new Map();
  const roots=config.allowedWorkspaceRoots?.map(p=>path.resolve(p));
  const workspaces=async()=>ctx.workspaceRegistry.list().filter(w=>!roots||roots.some(r=>path.resolve(w.path).toLowerCase()===r.toLowerCase())).map(w=>({id:String(w.id),title:w.title,path:w.path,sessionIds:[...w.sessionIds].map(String)}));
  const sessionList=()=>ctx.sessionController.list({},signal());
  const verifySession=async(sessionId,workspace)=>{
    if(!workspace.sessionIds.includes(sessionId)||ctx.workspaceRegistry.archivedSessionIds.map(String).includes(sessionId))throw new BusinessError('session','目标会话不在当前工作区，或已经归档。');
    const row=(await sessionList()).items.find(s=>s.sessionId===sessionId);
    if(!row||row.origin==='subagent')throw new BusinessError('session','请选择当前工作区中的普通会话。');
    const cwd=row.projections?.values?.workingDirectory??row.cwd;
    if(!cwd||path.resolve(await fs.realpath(cwd)).toLowerCase()!==path.resolve(workspace.path).toLowerCase())throw new BusinessError('session','会话当前目录与需求工作区不一致，请先在原会话核对目录。');
  };
  let conversations;
  const store=new RequirementStore({
    workspaces,verifySession,
    changed:p=>conversations?.changed(p),
    index:row=>index.put(`${row.workspaceId}/${row.taskId}`,row),
    deliver:s=>ctx.sessionController.prompt({sessionId:s.sessionId,requestId:s.requestId,mode:'queue',content:[{type:'text',text:s.prompt}]},signal()),
  });
  conversations=createConversations({ctx,index,store,workspaces,verifySession});
  return {
    store,conversations,
    conversation:(id,input)=>conversations.command(id,input),
    watchConversation:(id,signal)=>conversations.watch(id,signal),
    presented:(id,version,hash)=>conversations.presented(id,version,hash),
    async environment(){const available=await workspaces();const list=await sessionList();return {workspaces:available,sessions:list.items.filter(s=>!s.origin&&available.some(w=>w.sessionIds.includes(s.sessionId))).map(s=>({id:s.sessionId,title:s.projections?.values?.title||s.sessionId,workspaceId:available.find(w=>w.sessionIds.includes(s.sessionId)).id}))};},
    create:(input,actor)=>store.create(input,actor),
    read:ref=>store.read(ref),
    list:workspaceId=>store.list(workspaceId),
    async createSession(input){
      const workspace=await store.workspace(input.workspaceId);
      if(!/^[a-zA-Z0-9-]{1,80}$/.test(input.operationId))throw new BusinessError('invalid','操作标识不正确。');
      const key=`target:${input.operationId}`;
      const inFlight=creating.get(key);
      if(inFlight){if(inFlight.workspaceId!==workspace.id)throw new BusinessError('session','同一创建操作不能切换工作区。');return inFlight.promise;}
      const create=async()=>{
      const previous=index.get(key);
      if(previous){if(previous.workspaceId!==workspace.id)throw new BusinessError('session','同一创建操作不能切换工作区。');await verifySession(previous.taskId,await store.workspace(input.workspaceId));return {id:previous.taskId,title:previous.title,workspaceId:workspace.id};}
      const sessionId=`eh3-target-${input.operationId}`;
      let result;
      if(workspace.sessionIds.includes(sessionId)){await verifySession(sessionId,workspace);result={sessionId};}
      else result=await ctx.sessionController.create({workspaceId:workspace.id,sessionId},signal());
      await index.put(key,{workspaceId:workspace.id,taskId:String(result.sessionId),title:'Easy Ask AI DSH 新会话',revision:1});
      return {id:String(result.sessionId),title:'Easy Ask AI DSH 新会话',workspaceId:workspace.id};
      };
      const promise=create();creating.set(key,{workspaceId:workspace.id,promise});try{return await promise;}finally{creating.delete(key);}
    },
    async preview(ref,relative){
      await store.read(ref);const workspace=await store.workspace(ref.workspaceId);const file=await safePath(workspace.path,relative,{mustExist:true});
      if(!/\.(?:txt|md|json|html?|css|[cm]?[jt]sx?|ya?ml|csv|xml|log)$/i.test(file))throw new BusinessError('preview','此格式提供文件引用，暂不支持内置全文预览。');
      const stat=await fs.stat(file);if(!stat.isFile()||stat.size>1024*1024)throw new BusinessError('preview','全文预览支持 1 MB 以内的文本文件。');
      const bytes=await fs.readFile(file);return {path:relative,text:bytes.toString('utf8'),hash:digest(bytes),truncated:false};
    },
    async command(input,actor){
      const run=async()=>{
      const allowed=actor.kind==='agent'?['source','question','revise','freeze','artifact','export']:['source','question','revise','freeze','artifact','export','answer','decide','review','cancel','importText','clarify'];
      if(!allowed.includes(input.action))throw new BusinessError('permission','Agent 不能代替用户回答、认可或评价成果。');
      const current=await store.read(input);
      if(current.conversation){
        if(actor.kind==='agent'&&actor.sessionId!==current.conversation.sessionId)throw new BusinessError('session','此记录只跟随它所在的原聊天。');
        if(['answer','clarify','decide','freeze'].includes(input.action))throw new BusinessError('conversation','请在原聊天回答或确认；执行会沿用同一聊天。');
        await conversations.sync(current.conversation.sessionId);
      }
      if(['answer','clarify'].includes(input.action)&&input.sessionId)await verifySession(input.sessionId,await store.workspace(input.workspaceId));
      const result=await store[input.action](input,actor);
      if(result.status==='ok'&&['answer','clarify'].includes(input.action)&&input.sessionId){const submission=result.project.submissions.find(s=>s.operationId===input.operationId);if(submission)return store.deliver(input,submission.id);}
      return result;
      };
      const p=await store.read(input);return p.conversation?conversations.serial(p.conversation.sessionId,run):run();
    },
    deliver:(ref,id)=>store.deliver(ref,id),
    async checks(ref){return {sources:await store.checkSources(ref),exports:await store.exportStatus(ref)};},
    async media(ref,sourceId){
      const p=await store.read(ref);const source=p.sources.find(s=>s.id===sourceId&&s.kind==='image');if(!source)throw new BusinessError('source','图片快照不存在。');
      const loc=await store.location(ref);const file=await safePath(loc.ws.path,`${loc.relative}/media/${source.mediaId}`,{mustExist:true});const bytes=await fs.readFile(file);if(digest(bytes)!==source.hash)throw new BusinessError('source','图片快照已改变。');
      return {data:bytes.toString('base64'),mediaType:source.mediaType,width:source.width,height:source.height};
    },
    async logDecision(input){
      const p=await store.read(input);const workspace=await store.workspace(input.workspaceId);await verifySession(input.sessionId,workspace);
      if(p.conversation)throw new BusinessError('conversation','本记录从原聊天自动核对明确认可，无需输入版本校验码。请用 conversation read 检查状态。');
      const report=p.reports.find(r=>r.version===input.version&&r.hash===input.hash);if(!report)throw new BusinessError('approval','待绑定报告不存在。');
      const page=await ctx.sessionController.events({address:{kind:'session',sessionId:input.sessionId},throughSeq:input.seq,maxMessages:1},signal());
      const event=page.records.find(r=>r.type==='event'&&r.event.seq===input.seq)?.event;
      const source=event?.data?.source;
      if(event?.type!=='user/message'||event.data.role!=='user'||source?.kind!=='user'||source.principal&&source.principal.kind!=='owner'||source.rpcId?.startsWith('eh3-'))throw new BusinessError('approval','该事件不是可验证的原始用户消息。');
      const content=event.data.content.filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();
      const scope=[...new Set(input.scope)].sort();const all=report.items.filter(i=>i.status==='active'&&i.kind!=='unresolved').map(i=>i.id).sort();
      const explicit=new RegExp(`^(?:认可|同意执行|按此执行)\\s*V${report.version}\\s*[（(]?${report.hash.slice(0,12)}[）)]?\\s*(?:全部范围|${scope.join('、')})[。.!！]?$`);
      const short=all.length===1&&scope.length===1&&scope[0]===all[0]&&report.items.length===1&&report.items[0].text===content&&report.goal===content&&report.body===content&&report.deliverables.length===0&&report.acceptance.length===0;
      if(!short&&(!explicit.test(content)||JSON.stringify(scope)!==JSON.stringify(all)))throw new BusinessError('approval','已找到用户消息，但无法核实它对应本报告的具体版本与范围。请使用面板补齐绑定，或在原会话注明版本与校验码。');
      return store.decide({...input,text:content},{kind:'user-log',sessionId:input.sessionId,seq:input.seq});
    },
  };
}
