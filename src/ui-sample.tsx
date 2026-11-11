import React from 'react';
import { Button, ConfigProvider, Radio, Tag, Input, Segmented, Tooltip, theme } from 'antd';
import { ArrowRightOutlined, FileTextOutlined, LinkOutlined, CheckOutlined, DiffOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { useGSAP } from '@gsap/react';
import { ReactLenis } from 'lenis/react';
import { flushSync } from 'react-dom';
import css from './ui.css';
import conversationCss from './ui-conversation.css';
import fontCSS from '@fontsource-variable/noto-sans-sc/index.css';

gsap.registerPlugin(Flip, useGSAP);
const baseline=[
  {id:'title',kind:'change',label:'改成信息明确的活动标题',body:'用“秋季技能体验日”替换口号式标题，让读者先知道活动是什么。',quote:'快来一起玩转新技能！'},
  {id:'tone',kind:'change',label:'说明内容用平实、正式的语气',body:'去掉感叹号和催促报名的表达，按体验内容、时间、地点组织信息。',quote:'好玩又有料，名额有限，冲就对了！'},
];
const preserved=[
  {id:'date',kind:'preserve',label:'保留活动日期和时间',body:'日期与时间保持原文，不推算、不调整。',quote:'11 月 20 日（周五）14:00–16:00'},
  {id:'signup',kind:'preserve',label:'保留原报名方式',body:'报名入口与截止时间不变，不增加新的报名条件。',quote:'通过校园服务平台报名，11 月 18 日 18:00 截止。'},
];

export function NativeTheme({children}:{children:React.ReactNode}) {
  const themeRoot=React.useRef<HTMLDivElement>(null);
  const [dark,setDark]=React.useState(false);
  const [palette,setPalette]=React.useState({muted:'#68736f',soft:'#f6f7f7',line:'#dde4e0'});
  React.useLayoutEffect(()=>{
    const update=()=>{if(!themeRoot.current)return;const s=getComputedStyle(themeRoot.current);const rgb=s.color.match(/\d+/g)?.map(Number);setDark(Boolean(rgb&&rgb.slice(0,3).reduce((a,b)=>a+b,0)>450));setPalette({muted:s.getPropertyValue('--dsw-alias-label-secondary').trim()||'#68736f',soft:s.getPropertyValue('--dsw-alias-bg-layer-1').trim()||'#f6f7f7',line:s.getPropertyValue('--dsw-alias-border-l3').trim()||'#dde4e0'});};
    update();const observer=new MutationObserver(update);for(let node:HTMLElement|null=themeRoot.current;node;node=node.parentElement)observer.observe(node,{attributes:true,attributeFilter:['class','style','data-theme']});const media=matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',update);return()=>{observer.disconnect();media.removeEventListener('change',update);};
  },[]);
  return <ConfigProvider prefixCls="eh3-ant" theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm,token:{colorPrimary:dark?'#77d0bd':'#207a69',fontFamily:'"Noto Sans SC Variable", sans-serif',fontSize:14,borderRadius:7,controlHeight:34},components:{Button:{primaryShadow:'none'},Segmented:{itemColor:dark?'#bdc6c2':'#56615d',itemHoverColor:dark?'#f2f5f4':'#21352e',itemSelectedColor:dark?'#f2f5f4':'#21352e',itemSelectedBg:dark?'#31423d':'#ffffff',trackBg:palette.soft,itemHoverBg:palette.line}}}}><style>{fontCSS}</style><style>{css}</style><style>{conversationCss}</style><style>{`.eh3-ant-drawer-body{--eh3-muted:${palette.muted};--eh3-soft:${palette.soft};--eh3-line:${palette.line};--eh3-accent:${dark?'#77d0bd':'#207a69'}}.eh3-ant-drawer .eh3-edit-item{background:${palette.soft};border-color:${palette.line}}`}</style><div ref={themeRoot} className={`eh3-root ${dark?'eh3-dark':''}`}>{children}</div></ConfigProvider>;
}

export function Sample({onBack}:{onBack:()=>void}) {
  const container=React.useRef<HTMLDivElement>(null);
  const [layout,setLayout]=React.useState('split');
  const [view,setView]=React.useState('report');
  const [version,setVersion]=React.useState(2);
  const [selected,setSelected]=React.useState('date');
  const [answer,setAnswer]=React.useState('');
  const [answered,setAnswered]=React.useState(false);
  const [reduced,setReduced]=React.useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  const items=version===2?[...baseline,...preserved]:baseline;
  const focused=items.find(i=>i.id===selected)||items[0];
  const {contextSafe}=useGSAP({scope:container});
  const changeVersion=contextSafe((value:number)=>{const state=Flip.getState(container.current!.querySelectorAll('.eh3-requirement,.eh3-deliverable'));flushSync(()=>{setVersion(value);if(value===1&&!baseline.some(i=>i.id===selected))setSelected('title');});if(!reduced&&!document.hidden)Flip.from(state,{duration:.46,ease:'power2.inOut',nested:true,prune:true,onEnter:els=>gsap.fromTo(els,{opacity:0,x:24},{opacity:1,x:0,duration:.36,delay:.12})});});
  const focusItem=contextSafe((id:string)=>{setSelected(id);if(!reduced){gsap.fromTo(container.current!.querySelector(`[data-source="${id}"]`),{backgroundColor:'#c5e7df'},{backgroundColor:'#e5f3ee',duration:.65});}});
  const swapLayout=(next:string)=>setLayout(next);
  const source=<article className="eh3-source-paper" aria-label="报名页示例原作">
    <div className="eh3-source-tag">校园活动 · 示例原作</div>
    <h2 data-source="title" className={selected==='title'?'selected':''}>快来一起玩转新技能！</h2>
    <p data-source="tone" className={selected==='tone'?'selected':''}>好玩又有料，名额有限，冲就对了！</p>
    <p>秋季技能体验日面向在校学生开放。现场可体验摄影、机器人搭建和数字设计，了解不同技能的入门方法。</p>
    <dl><dt>活动时间</dt><dd data-source="date" className={selected==='date'?'selected':''}>11 月 20 日（周五）14:00–16:00</dd><dt>活动地点</dt><dd>实训中心一层</dd><dt>报名方式</dt><dd data-source="signup" className={selected==='signup'?'selected':''}>通过校园服务平台报名，11 月 18 日 18:00 截止。</dd></dl>
    <div className="eh3-fake-link">校园服务平台 <ArrowRightOutlined aria-hidden="true"/></div>
    <small>此处展示样例原文，不会打开或提交报名。</small>
  </article>;
  return <div className="eh3-sample" ref={container}>
    <header className="eh3-top"><div><Button type="text" icon={<ArrowLeftOutlined aria-hidden="true"/>} onClick={onBack}>返回任务</Button><span className="eh3-product">Easy Ask AI DSH</span></div><Tag bordered={false}>界面样例 · 未投递</Tag></header>
    <div className="eh3-sample-choice"><span>原作和需求怎样放在一起？</span><Radio.Group value={layout} onChange={e=>swapLayout(e.target.value)} optionType="button" buttonStyle="solid" options={[{label:'A · 原作并排',value:'split'},{label:'B · 来源随条目',value:'inline'}]}/></div>
    <div className="eh3-task-title"><div><div className="eh3-eyebrow">修改已有成果 / 报名页示例</div><h1>让报名页更正式，保留必要信息</h1><p>原始反馈：<q>这个报名页看着不够正式。</q></p></div><div className="eh3-version"><span>正在查看</span><Segmented aria-label="需求版本" value={version} onChange={v=>changeVersion(Number(v))} options={[{label:'V1',value:1},{label:'V2',value:2}]}/></div></div>
    <div className={`eh3-workbench ${layout}`}>
      {layout==='split'&&<aside className="eh3-source-pane" data-flip-id="source"><div className="eh3-pane-heading"><FileTextOutlined aria-hidden="true"/><strong>原作</strong><span>只读</span></div>{source}<div className="eh3-link-note"><LinkOutlined aria-hidden="true"/> 选择右侧条目，对照它引用的原文。</div></aside>}
      <main className="eh3-report-pane" data-flip-id="report">
        <div className="eh3-report-nav"><Segmented value={view} onChange={setView} options={[{label:'当前问题',value:'question'},{label:'完整需求',value:'report'},{label:'版本差异',value:'diff'}]}/><span className="eh3-subtle">{version===2?'V2 · 补充保留要求':'V1 · 明确修改方向'}</span></div>
        <ReactLenis options={{autoRaf:true,smoothWheel:!reduced,prevent:node=>Boolean(node.closest('textarea,input,[role="dialog"],.eh3-ant-select-dropdown'))}} className="eh3-report-scroll">
        {view==='question'?<div className="eh3-question"><div className="eh3-eyebrow">只问当前这件事</div><h2>标题里的“快来一起玩”显得活泼。你希望读者看到的感觉更接近哪种？</h2><Radio.Group value={answer} onChange={e=>setAnswer(e.target.value)} className="eh3-options" options={['像学校活动通知，先说清活动内容','保留亲切感，去掉夸张和催促','都不是／说不清']}/><Input.TextArea aria-label="补充回答" placeholder="也可以用自己的话补充" value={answer} onChange={e=>setAnswer(e.target.value)} autoSize={{minRows:3}}/><Button type="primary" disabled={!answer.trim()} onClick={()=>{setAnswered(true);setView('report');}}>查看回答后的样例 <ArrowRightOutlined aria-hidden="true"/></Button><p className="eh3-subtle">样例操作只切换展示状态，不会发给模型。</p></div>:view==='diff'?<div className="eh3-diff"><div className="eh3-eyebrow">V1 → V2</div><h2>新增两项保留要求</h2><p>标题和语气的修改方向沿用 V1。V2 补充活动时间与报名方式的边界。</p>{preserved.map(i=><div key={i.id} className="eh3-diff-added"><Tag color="green">新增 · 必须保留</Tag><h3>{i.label}</h3><p>{i.body}</p><blockquote>{i.quote}</blockquote></div>)}<p className="eh3-subtle">V1 的认可不会自动覆盖 V2。这里没有模拟认可记录。</p></div>:<div className="eh3-document"><div className="eh3-doc-heading"><span>需求报告</span><Tag color="gold">待用户核对</Tag></div><h2>调整表达，准确传达活动信息</h2><p className="eh3-goal">面向在校学生，让页面更像正式的活动通知。先讲清活动是什么，再说明时间、地点和报名方式。</p>{answered&&<div className="eh3-answer-note">样例回答：{answer}</div>}
          {items.map(i=><section key={i.id} data-flip-id={i.id} className={`eh3-requirement ${selected===i.id?'is-selected':''} ${i.kind}`}><button className="eh3-item-heading" onClick={()=>focusItem(i.id)} aria-expanded={selected===i.id}><span className="eh3-item-kind">{i.kind==='preserve'?<CheckOutlined aria-hidden="true"/>:<DiffOutlined aria-hidden="true"/>}{i.kind==='preserve'?'保留':'修改'}</span><h3>{i.label}</h3><LinkOutlined aria-hidden="true"/></button><p>{i.body}</p>{layout==='inline'&&selected===i.id&&<blockquote className="eh3-inline-source" data-flip-id="source"><span>来源 · 报名页原文</span><p>{i.quote}</p></blockquote>}</section>)}
          <section className="eh3-deliverable" data-flip-id="delivery"><h3>交付与核对</h3><p>提供修改后的报名页文件。核对标题、语气和信息顺序；按当前版本检查必须保留的内容。</p><span>不涉及：新增活动内容、修改报名流程。</span></section>
        </div>}
        </ReactLenis>
        <footer className="eh3-action-bar"><div><strong>还没有执行这版需求</strong><span>认可会绑定当前版本与具体范围。</span></div><Tooltip title="样例不会记录认可或发送任务"><Button disabled type="primary">认可并交给会话 <ArrowRightOutlined aria-hidden="true"/></Button></Tooltip></footer>
      </main>
    </div>
  </div>;
}
