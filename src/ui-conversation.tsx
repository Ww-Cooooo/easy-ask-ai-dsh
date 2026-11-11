import React from 'react';
import { Alert, Button, Drawer, Empty, Segmented, Tag } from 'antd';
import { MessageOutlined, ExpandOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ReactLenis } from 'lenis/react';
import Markdown from 'react-markdown';
import { WorkspaceApp } from './ui-app';
import { DiscussionMap, useReducedMotion } from './ui-discussion-map';
import { ConversationProgress } from './ui-conversation-progress';
import type { ConversationView } from './types';

type Props={api:any;sessionId:string;copy:(s:string)=>string;subscribeReset:(fn:()=>void)=>()=>void;visible?:boolean};
export function useConversation({api,sessionId,subscribeReset,visible=true}:Props){
  const [snapshot,setSnapshot]=React.useState<ConversationView>({sessionId,project:null,stage:'idle'});
  const [error,setError]=React.useState(''),[connected,setConnected]=React.useState(false),[generation,restart]=React.useReducer(x=>x+1,0);
  React.useEffect(()=>subscribeReset(restart),[subscribeReset]);
  React.useEffect(()=>{
    if(!visible)return;
    let ended=false,stream:any,timer:ReturnType<typeof setTimeout>;
    setConnected(false);setError('');setSnapshot(previous=>previous.sessionId===sessionId?previous:{sessionId,project:null,stage:'idle'});
    void(async()=>{
      try{stream=api.watchConversation(sessionId);for await(const next of stream){if(ended)break;setSnapshot(next);setConnected(true);setError('');}}
      catch(e){if(!ended){setConnected(false);setError((e as Error).message||'连接暂时中断');}}
      finally{if(!ended){setConnected(false);timer=setTimeout(restart,3000);}}
    })();
    return()=>{ended=true;clearTimeout(timer);stream?.dispose();};
  },[api,sessionId,generation,visible]);
  return {snapshot:snapshot.sessionId===sessionId?snapshot:{sessionId,project:null,stage:'idle'} as ConversationView,connected,error};
}

export function ConversationDock(props:{sessionId:string;copy:(s:string)=>string;open:()=>void}){
  return <div className="eh3-chat-dock" data-session-id={props.sessionId}><Button size="small" type="text" icon={<MessageOutlined aria-hidden="true"/>} onClick={props.open}>{props.copy('查看本次对话')}<span className="eh3-dock-state">{props.copy('问题 · 回答 · 理解')}</span></Button></div>;
}

export function ConversationPane(props:Props&{visible:boolean}){
  const {snapshot,connected,error}=useConversation(props),p=snapshot.project,say=props.copy;
  const [section,setSection]=React.useState('understanding'),[details,setDetails]=React.useState(false);
  const root=React.useRef<HTMLDivElement>(null);
  const report=p?.reports.find(r=>r.version===snapshot.activeReportVersion)??p?.reports.at(-1);
  const reduced=useReducedMotion();
  const {contextSafe}=useGSAP({scope:root});
  const switchSection=contextSafe((next:string)=>{setSection(next);if(!reduced)requestAnimationFrame(()=>gsap.fromTo(root.current?.querySelector('.eh3-chat-content')??{}, {opacity:.45,y:5},{opacity:1,y:0,duration:.24,clearProps:'opacity,transform'}));});
  React.useEffect(()=>{
    if(!props.visible||section!=='plan'||!report||!connected)return;
    void props.api.presented(props.sessionId,report.version,report.hash).catch(()=>{});
  },[props.visible,section,report?.version,report?.hash,connected]);
  return <div className="eh3-chat" ref={root} data-easy-ask-ai="conversation" data-session-id={props.sessionId} data-sidebar-visible={props.visible}>
    <header className="eh3-chat-head"><span className="eh3-product">Easy Ask AI DSH</span><Tag color={connected?'green':'default'}>{say(connected?'随聊天更新':'正在连接')}</Tag></header>
    {error&&<Alert type="warning" title={say('暂时无法同步，已有记录保留')} description={error}/>}
    <>
      <div className="eh3-chat-title"><h2>{p?.title||say('当前对话')}</h2></div>
      <ConversationProgress snapshot={snapshot} connected={connected} say={say}/>
      <Segmented block aria-label={say('理解与方案')} value={section} onChange={switchSection} options={[{value:'understanding',label:say('讨论概览')},{value:'plan',label:say(report?'查看修改方案':'准备怎么改')}]}/>
      <div className="eh3-chat-map-host" hidden={section!=='understanding'}><DiscussionMap snapshot={snapshot} say={say} visible={props.visible&&section==='understanding'}/></div>
      {section==='plan'&&<ReactLenis className="eh3-chat-scroll" options={{autoRaf:true,smoothWheel:!reduced}}>
        <div className="eh3-chat-content" key={section}>
        {report?<>
          <div className="eh3-chat-plan-status"><strong>{say('修改方案')} V{report.version}</strong><Tag color={(snapshot.stage==='approved'||snapshot.stage==='result')?'green':'gold'}>{say(snapshot.stage==='approved'||snapshot.stage==='result'?'你已认可本版范围':snapshot.stage==='understanding'?'有新补充，等待更新':'AI 建议，待你核对')}</Tag></div>
          <h3>{report.goal}</h3><div className="eh3-markdown"><Markdown skipHtml components={{img:({alt})=><span>{alt}</span>,a:({children})=><span>{children}</span>}}>{report.body}</Markdown></div>
          {report.items.filter(i=>i.status!=='removed').map(item=><section className={`eh3-chat-plan-item ${item.kind}`} key={item.id}><span>{say(({change:'修改',preserve:'保留',unresolved:'待问清',exclude:'范围之外'})[item.kind])}</span><div><strong>{item.text}</strong><p>{item.scope}</p></div></section>)}
          <section className="eh3-chat-delivery"><h3>{say('交付')}</h3>{report.deliverables.map((s,i)=><p key={i}>{s}</p>)}<h3>{say('验收')}</h3>{report.acceptance.map((s,i)=><p key={i}>{s}</p>)}</section>
          {snapshot.stage==='approved'||snapshot.stage==='result'?<p className="eh3-chat-confirmed"><CheckCircleOutlined aria-hidden="true"/> {say('本版范围已由你的原聊天回复确认。')}</p>:<p className="eh3-chat-note">{say('在原聊天继续补充或明确确认。确认前，修改方案仍是 AI 的建议。')}</p>}
          {!!p?.artifacts.length&&<section><h3>{say('实际产物')}</h3>{p.artifacts.map(a=><p key={a.id}>{a.path} <Tag>{say(a.humanStatus==='accepted'?'你已认可效果':a.humanStatus==='needs-change'?'你要求继续修改':'待你查看效果')}</Tag></p>)}</section>}
        </>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={say('先问清你的意思，再形成具体方案。')}/>}
        </div>
      </ReactLenis>}
      <footer className="eh3-chat-footer"><span>{say('回答和确认都留在原聊天')}</span>{p&&<Button size="small" icon={<ExpandOutlined aria-hidden="true"/>} onClick={()=>setDetails(true)}>{say('原作、版本与结果')}</Button>}</footer>
      {p&&<Drawer title={say('原作、完整需求与版本记录')} open={details} onClose={()=>setDetails(false)} width="min(1280px, 96vw)" styles={{body:{padding:0,overflow:'hidden'}}}><WorkspaceApp api={props.api} copy={say} subscribeReset={props.subscribeReset} boundProject={p}/></Drawer>}
    </>
  </div>;
}
