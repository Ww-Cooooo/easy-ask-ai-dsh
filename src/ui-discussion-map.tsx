import React from 'react';
import { Button, Collapse, Empty, Segmented, Tag } from 'antd';
import { ArrowDownOutlined, CheckOutlined, CloseOutlined, MessageOutlined, QuestionOutlined, ReadOutlined, AimOutlined } from '@ant-design/icons';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ReactLenis } from 'lenis/react';
import Markdown from 'react-markdown';
import { discussionMap } from './discussion-map.mjs';
import { discussionGroups } from './discussion-provenance.mjs';
import type { ConversationView, DiscussionMessage, Question, Understanding, Decision, Report, RoundProvenance } from './types';

type MapNode={id:string;index:number;title:string;current:boolean;waiting:boolean;signature:string;provenance:RoundProvenance;question?:Question;understanding?:Understanding;guesses:string[];opening:DiscussionMessage[];assistant:DiscussionMessage[];answers:DiscussionMessage[];decisions:(Decision&{quote:string;report:Report})[];resultApprovals:{id:string;path:string;hash:string;version:number;quote:string}[]};
type DetailPart='answer'|'ai'|'confirmed'|'question';
export function useReducedMotion(){
  const [reduced,setReduced]=React.useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  return reduced;
}
function SourceText({text}:{text:string}){return <div className="eh3-markdown"><Markdown skipHtml components={{img:({alt})=><span>{alt}</span>,a:({children})=><span>{children}</span>}}>{text}</Markdown></div>;}
function Evidence({label,text}:{label:string;text:string}){return <Collapse ghost size="small" className="eh3-map-evidence" items={[{key:'source',label,children:<SourceText text={text}/>}]}/>;}
const workflowName=(value:string)=>value==='get-clear'?'Get Clear':'Prompt Ready';
function SourceTags({source,say}:{source:RoundProvenance;say:(s:string)=>string}){
  return <span className="eh3-map-flow-tags" aria-label={say('流程来源')}>
    {source.workflows.map(flow=><span key={flow} className={`eh3-map-flow ${flow}`}>{workflowName(flow)}</span>)}
    {source.skills.filter(flow=>!source.workflows.includes(flow)).map(flow=><span key={flow} className={`eh3-map-flow ${flow}`}>{workflowName(flow)} · {say('已读 Skill')}</span>)}
    {!source.workflows.length&&!source.skills.length&&<span className={`eh3-map-flow ${source.kind}`}>{say(source.kind==='workflow'?'Easy Ask AI':source.kind==='ordinary'?'普通回复':'来源未核实')}</span>}
  </span>;
}
function ProvenanceEvidence({source,say}:{source:RoundProvenance;say:(s:string)=>string}){
  const actionNames:Record<string,string>={begin:'接入对话',read:'读取记录',understand:'整理理解',question:'记录问题',source:'记录原作',revise:'整理方案',execute:'接续已确认的执行',artifact:'记录成果',freeze:'准备执行范围',export:'导出记录'};
  const statusNames={pending:'进行中',failed:'未成功',unverified:'结果未核实',succeeded:'已完成'};
  const rows=[...new Set(source.activities.map(a=>a.kind==='skill-read'?`${workflowName(a.workflow!)} Skill ${say(a.action==='entry'?'入口':'参考')} · ${say(a.status==='succeeded'?'已读取':statusNames[a.status])}`:`Easy Ask AI · ${say(actionNames[a.action]??a.action)} · ${say(statusNames[a.status])}`))];
  return <Collapse ghost size="small" className="eh3-map-evidence eh3-map-provenance" items={[{key:'provenance',label:say('来源依据'),children:<>
    {!!source.workflows.length&&<p>{say('流程标签来自本轮已成功的 Easy Ask AI 插件操作。')}</p>}
    {rows.length?<ul>{rows.map(row=><li key={row}>{row}</li>)}</ul>:<p>{say(source.kind==='ordinary'?'本轮没有记录到 Get Clear 或 Prompt Ready 流程操作。':source.kind==='workflow'?'已关联 Easy Ask AI 记录，现有证据不足以细分流程。':'现有记录不足以判断这轮使用了哪种流程。')}</p>}
    {!!source.skills.length&&<p>{say('已读 Skill 只表示读取过说明，不代表完整流程已执行。')}</p>}
    <p>{say('流程来源与确认状态分开；只有你的实际确认才标为已确认。')}</p>
  </>}]}/>;
}

export function DiscussionMap({snapshot,say,visible}:{snapshot:ConversationView;say:(s:string)=>string;visible:boolean}){
  const model=React.useMemo(()=>discussionMap(snapshot),[snapshot]);
  const nodes=model.nodes as MapNode[];
  const groups=discussionGroups(nodes) as {id:string;ordinary:boolean;nodes:MapNode[]}[];
  const [selected,setSelected]=React.useState<string|null>(null),[part,setPart]=React.useState<DetailPart>('question');
  const [expanded,setExpanded]=React.useState<Set<string>>(()=>new Set());
  const [location,setLocation]=React.useState<{id:string;tick:number}|null>(null);
  const root=React.useRef<HTMLDivElement>(null),scroller=React.useRef<any>(null);
  const previous=React.useRef(new Map<string,string>()),trigger=React.useRef<HTMLElement|null>(null);
  const reduced=useReducedMotion();
  const node=nodes.find(n=>n.id===selected);
  const {contextSafe}=useGSAP({scope:root});
  const scrollTo=(id:string)=>{
    const element=Array.from(root.current!.querySelectorAll<HTMLElement>('[data-map-node]')).find(el=>el.dataset.mapNode===id);
    if(element)scroller.current?.lenis?.scrollTo(element,{immediate:reduced,offset:-8,duration:.45});
  };
  const locate=(id:string)=>{
    const group=groups.find(g=>g.nodes.some(n=>n.id===id));
    if(group?.ordinary)setExpanded(old=>new Set([...old,group.id]));
    setLocation(old=>({id,tick:(old?.tick??0)+1}));
  };
  const toggleGroup=(group:{id:string;nodes:MapNode[]})=>{
    if(expanded.has(group.id)&&group.nodes.some(n=>n.id===selected))setSelected(null);
    setExpanded(old=>{const next=new Set(old);next.has(group.id)?next.delete(group.id):next.add(group.id);return next;});
  };
  const select=contextSafe((id:string,next:DetailPart,event?:React.MouseEvent<HTMLElement>)=>{
    if(event)trigger.current=event.currentTarget;setSelected(id);setPart(next);
  });
  const close=()=>{setSelected(null);trigger.current?.focus({preventScroll:true});};
  React.useLayoutEffect(()=>{
    if(!selected)return;
    scroller.current?.lenis?.resize();
    scrollTo(selected);
  },[selected]);
  React.useLayoutEffect(()=>{scroller.current?.lenis?.resize();if(location)scrollTo(location.id);},[location,expanded]);
  useGSAP(()=>{
    const elements=Array.from(root.current!.querySelectorAll<HTMLElement>('[data-map-node]'));
    const nextById=new Map(nodes.map(n=>[n.id,n]));
    const before=previous.current;
    const changed=elements.filter(el=>before.get(el.dataset.mapNode!)!==nextById.get(el.dataset.mapNode!)?.signature);
    const initial=previous.current.size===0;
    previous.current=new Map(nodes.map(n=>[n.id,n.signature]));
    if(reduced||!visible||document.hidden)return;
    const affected=changed.filter(el=>{const r=el.getBoundingClientRect(),view=scroller.current?.wrapper?.getBoundingClientRect();return !view||r.bottom>=view.top&&r.top<=view.bottom;});
    const tl=gsap.timeline();
    for(const [i,el] of affected.entries()){
      const start=initial?Math.min(i*.08,.24):0;
      const old=before.get(el.dataset.mapNode!),now=nextById.get(el.dataset.mapNode!)!;
      const oldParts=old?JSON.parse(old):null;
      const branches=[...(!oldParts||JSON.stringify(oldParts[0])!==JSON.stringify(now.answers.map(a=>a.seq))?['answer']:[]),...(!oldParts||oldParts[2]!==now.understanding?.id||oldParts[3]!==now.understanding?.summary||JSON.stringify(oldParts[4])!==JSON.stringify(now.understanding?.guesses)?['guess']:[])];
      if(initial)tl.fromTo(el.querySelector('.eh3-map-question'),{opacity:.3,x:-12},{opacity:1,x:0,duration:.38,clearProps:'opacity,transform'},start);
      branches.forEach((branch,j)=>{const wire=el.querySelector(`.eh3-map-wire.${branch}`),button=el.querySelector(`.eh3-map-branch.${branch}`);if(wire)tl.fromTo(wire,{strokeDashoffset:1},{strokeDashoffset:0,autoRound:false,duration:.46,ease:'power2.out'},start+.08);if(button)tl.fromTo(button,{opacity:.4,y:-6},{opacity:1,y:0,duration:.3,clearProps:'opacity,transform'},start+.17+j*.07);});
      tl.fromTo(el.querySelector('.eh3-map-change'),{opacity:.22},{opacity:0,duration:.95},start);
    }
    const settle=()=>{if(document.hidden)tl.progress(1);};document.addEventListener('visibilitychange',settle);
    return()=>document.removeEventListener('visibilitychange',settle);
  },{scope:root,dependencies:[nodes.map(n=>n.id+n.signature).join('|'),reduced,visible],revertOnUpdate:true});
  useGSAP(()=>{
    if(!node||reduced||!visible||document.hidden)return;
    gsap.fromTo('.eh3-map-detail-content',{clipPath:'inset(0 0 100% 0)',y:-8},{clipPath:'inset(0 0 0% 0)',y:0,duration:.34,ease:'power2.out',clearProps:'clipPath,transform'});
  },{scope:root,dependencies:[selected,part,reduced,visible],revertOnUpdate:true});
  return <div className="eh3-map" ref={root} data-map-version="1" data-detail-open={Boolean(node)}>
    <div className="eh3-map-overline"><span>{nodes.length} {say('个讨论节点')}</span><Button type="text" size="small" disabled={!model.currentId} icon={<AimOutlined aria-hidden="true"/>} onClick={()=>locate(model.currentId!)}>{say('当前')}</Button></div>
    <div className="eh3-map-legend" aria-label={say('内容状态图例')}><span className="guess"><QuestionOutlined aria-hidden="true"/>{say('AI 猜测')}</span><span><MessageOutlined aria-hidden="true"/>{say('我的回答')} {model.answerCount}</span><span className="confirmed"><CheckOutlined aria-hidden="true"/>{say('已确认')} {model.confirmedCount}</span></div>
    {nodes.length>6&&<nav className="eh3-map-index" aria-label={say('整场讨论索引')}>{nodes.map(n=><Button key={n.id} size="small" type="text" className={n.current?'is-current':''} aria-label={`${say('定位讨论')} ${n.index+1}: ${n.title}`} onClick={()=>locate(n.id)}>{n.index+1}</Button>)}</nav>}
    <ReactLenis ref={scroller} className="eh3-map-scroll" options={{autoRaf:true,smoothWheel:!reduced,prevent:el=>Boolean(el.closest('.eh3-ant-collapse'))}}>
      {!snapshot.history?.complete&&<p className="eh3-chat-note" role="status">{say('正在读取对话…')}</p>}
      {snapshot.history?.complete&&!nodes.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={say('在原聊天开始，讨论会出现在这里。')}/>}
      <ol className="eh3-map-nodes" aria-label={say('讨论节点，按聊天顺序')}>
        {groups.map(group=><React.Fragment key={group.id}>
        {group.ordinary&&<li className="eh3-map-ordinary-group" data-ordinary-group={group.id}><Button type="text" className="eh3-map-ordinary-toggle" aria-expanded={expanded.has(group.id)} aria-label={`${say(expanded.has(group.id)?'收起普通回复':'展开普通回复')} ${group.nodes.length}`} onClick={()=>toggleGroup(group)}><MessageOutlined aria-hidden="true"/><span>{say('普通回复')} <b>{group.nodes.length}</b></span>{group.nodes.some(n=>n.current)&&<span className="eh3-map-current-mark">{say('当前')}</span>}<ArrowDownOutlined className={expanded.has(group.id)?'is-open':''} aria-hidden="true"/></Button></li>}
        {(!group.ordinary||expanded.has(group.id))&&group.nodes.map(n=><li key={n.id} data-map-node={n.id} data-source-kind={n.provenance.kind} data-current={n.current} data-selected={n.id===selected} className={`eh3-map-node ${n.current?'is-current':''} ${n.decisions.length||n.resultApprovals.length?'has-confirmation':''}`}>
          <span className="eh3-map-order" aria-hidden="true">{String(n.index+1).padStart(2,'0')}</span>
          <div className="eh3-map-question-wrap"><span className="eh3-map-change" aria-hidden="true"/><Button type="text" className="eh3-map-question" aria-expanded={n.id===selected} aria-controls="eh3-map-detail" onClick={event=>select(n.id,n.decisions.length||n.resultApprovals.length?'confirmed':'question',event)}><SourceTags source={n.provenance} say={say}/><span className="eh3-map-node-label">{n.title||say('对话记录')}</span><span className="eh3-map-node-status"><span>{n.resultApprovals.length?<><CheckOutlined aria-hidden="true"/> {say('已确认效果')}</>:n.decisions.length?<><CheckOutlined aria-hidden="true"/> {say('已确认方案')} V{n.decisions.at(-1)!.version}</>:say(n.waiting?'当前 · 等你回答':n.current?'当前':n.answers.length?'已回答':n.provenance.kind==='ordinary'?'查看原回复':'待查看')}</span><ArrowDownOutlined aria-hidden="true"/></span></Button></div>
          {n.provenance.kind!=='ordinary'?<div className="eh3-map-branches"><svg className="eh3-map-connections" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><path className="eh3-map-wire answer" pathLength="1" d="M50 0V7H24V16"/><path className="eh3-map-wire guess" pathLength="1" d="M50 0V7H76V16"/></svg>
            <Button size="small" type="text" className={`eh3-map-branch answer ${n.answers.length?'has-answer':''}`} icon={<MessageOutlined aria-hidden="true"/>} onClick={event=>select(n.id,'answer',event)}>{say('我的回答')}<b>{n.answers.length||'—'}</b></Button>
            <Button size="small" type="text" className="eh3-map-branch guess" icon={<QuestionOutlined aria-hidden="true"/>} onClick={event=>select(n.id,'ai',event)}>{say(n.guesses.length?'AI 猜测':'AI 理解')}<b>{n.guesses.length||'·'}</b></Button>
          </div>:!!n.answers.length&&<Button size="small" type="text" className="eh3-map-ordinary-answer" onClick={event=>select(n.id,'answer',event)}>{say('我的回答')} {n.answers.length}</Button>}
        </li>)}</React.Fragment>)}
      </ol>
      {!!nodes.length&&<div className="eh3-map-tip"><ReadOutlined aria-hidden="true"/>{say('点节点，看回答与理解')}</div>}
    </ReactLenis>
    {node&&<section className="eh3-map-detail" id="eh3-map-detail" aria-label={`${say('讨论详情')} ${node.index+1}`} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}}>
      <div className="eh3-map-detail-heading"><strong><span>{String(node.index+1).padStart(2,'0')}</span>{node.title}</strong><Button size="small" type="text" aria-label={say('收起节点详情')} icon={<CloseOutlined/>} onClick={close}/></div>
      <SourceTags source={node.provenance} say={say}/>
      <Segmented block size="small" value={part} aria-label={say('节点内容')} onChange={value=>setPart(value as DetailPart)} options={[{value:'question',label:say(node.provenance.kind==='ordinary'?'原回复':'问题')},...(node.provenance.kind!=='ordinary'||node.answers.length?[{value:'answer',label:say('我的回答')}]:[]),...(node.provenance.kind!=='ordinary'?[{value:'ai',label:say('AI 理解')}]:[]),...(node.decisions.length||node.resultApprovals.length?[{value:'confirmed',label:say('已确认')}]:[])]}/>
      <div className="eh3-map-detail-scroll" data-lenis-prevent><div className="eh3-map-detail-content" key={node.id+part}>
        {part==='question'&&<><span className="eh3-map-source-label">{say(node.provenance.kind==='ordinary'?'AI 原回复':'问题原文')}</span><SourceText text={node.question?.text??(node.assistant.map(m=>m.text).join('\n\n')||node.opening.map(m=>m.text).join('\n\n')||node.title)}/>{!!node.question?.options.length&&<Evidence label={say('展开完整选项')} text={node.question.options.map((x,i)=>`${i+1}. ${x}`).join('\n')}/>}</>}
        {part==='answer'&&(node.answers.length?node.answers.map(m=><article className="eh3-map-owner" key={m.seq}><span className="eh3-map-source-label"><MessageOutlined aria-hidden="true"/>{say('你的原话')}</span><p className="eh3-map-excerpt">{m.text}</p><Evidence label={say('展开完整回答')} text={m.text}/></article>):<p className="eh3-map-empty">{say('还没有回答，请继续在原聊天回复。')}</p>)}
        {part==='ai'&&<>{node.understanding?<><span className="eh3-map-source-label guess"><QuestionOutlined aria-hidden="true"/>{say('AI 整理 · 待核对')}</span><p className="eh3-map-excerpt">{node.understanding.summary}</p><Evidence label={say('展开完整理解')} text={node.understanding.summary}/>{node.guesses.map((g,i)=><div className="eh3-map-guess" key={i}><QuestionOutlined aria-hidden="true"/><p>{g}</p></div>)}{node.current&&node.understanding.basisSeq!==snapshot.project?.conversation?.lastUserSeq&&<small>{say('已收到新回答，等待 AI 更新理解。')}</small>}</>:<p className="eh3-map-empty">{say('这轮尚未单独整理理解，可展开 AI 原回复。')}</p>}{node.assistant.map(m=><Evidence key={m.seq} label={say('展开 AI 当时的原回复')} text={m.text}/>)}</>}
        {part==='confirmed'&&node.decisions.map(d=><article className="eh3-map-approved" key={d.id}><Tag color="green" icon={<CheckOutlined/>}>{say('已确认方案')} V{d.version}</Tag><span className="eh3-map-source-label">{say('确认原话')}</span><SourceText text={d.quote}/><span className="eh3-map-source-label">{say('本次确认范围')}</span><ul>{d.scope.map(id=><li key={id}>{d.report.items.find(i=>i.id===id)?.text??id}</li>)}</ul></article>)}
        {part==='confirmed'&&node.resultApprovals.map(a=><article className="eh3-map-approved" key={a.id}><Tag color="green" icon={<CheckOutlined/>}>{say('已确认效果')}</Tag><p>{a.path}</p><span className="eh3-map-source-label">{say('确认原话')}</span><SourceText text={a.quote}/></article>)}
        {part==='question'&&node.opening.map(m=><Evidence key={m.seq} label={say('展开最初的原话')} text={m.text}/>) }
        <ProvenanceEvidence source={node.provenance} say={say}/>
      </div></div>
    </section>}
  </div>;
}
