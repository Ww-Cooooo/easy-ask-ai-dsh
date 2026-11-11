import React from 'react';
import { Alert, Button, InputNumber, Select, Space } from 'antd';
import { Canvas, FabricImage, Rect } from 'fabric';
import { Graph, type NodeData } from '@antv/g6';
import type { Project, Source, Report, Region, Item } from './types';

export function ImageRegion({api,project,source,onSave,say}:{api:any;project:Project;source:Source;onSave:(r:Region)=>void;say:(s:string)=>string}){
  const host=React.useRef<HTMLDivElement>(null);
  const model=React.useRef<{canvas:Canvas;box:Rect;w:number;h:number}|null>(null);
  const [region,setRegion]=React.useState<Region>(source.region||{x:0,y:0,width:1,height:1});
  const [error,setError]=React.useState('');
  const [ready,setReady]=React.useState(false);
  const [url,setUrl]=React.useState('');
  const normalize=(r:Region):Region=>{const x=Math.max(0,Math.min(.9999,r.x));const y=Math.max(0,Math.min(.9999,r.y));return {x,y,width:Math.max(.0001,Math.min(1-x,r.width)),height:Math.max(.0001,Math.min(1-y,r.height))};};
  function applyRegion(next:Region){const safe=normalize(next);setRegion(safe);const current=model.current;if(current){current.box.set({left:safe.x*current.w,top:safe.y*current.h,width:safe.width*current.w,height:safe.height*current.h,scaleX:1,scaleY:1});current.box.setCoords();current.canvas.requestRenderAll();}}
  React.useEffect(()=>{
    let stopped=false;let canvas:Canvas|undefined;let observer:ResizeObserver|undefined;setReady(false);setError('');setUrl('');setRegion(source.region||{x:0,y:0,width:1,height:1});
    const element=document.createElement('canvas');host.current!.append(element);
    (async()=>{
      const response=await api.media({workspaceId:project.workspaceId,taskId:project.taskId},source.id);if(!response.ok)throw Error(response.error.message);if(stopped)return;
      const media=response.value;const data=`data:${media.mediaType};base64,${media.data}`;setUrl(data);
      const original=await FabricImage.fromURL(data);if(stopped)return;
      const w=media.width,h=media.height;canvas=new Canvas(element,{selection:false,preserveObjectStacking:true,enableRetinaScaling:true});
      original.set({left:0,top:0,originX:'left',originY:'top',selectable:false,evented:false});canvas.add(original);
      const initial=source.region||{x:0,y:0,width:1,height:1};
      const box=new Rect({left:initial.x*w,top:initial.y*h,width:initial.width*w,height:initial.height*h,originX:'left',originY:'top',fill:'rgba(32,122,105,.12)',stroke:'#207a69',strokeWidth:2,strokeUniform:true,cornerColor:'#207a69',cornerStrokeColor:'#ffffff',transparentCorners:false,cornerSize:10,lockRotation:true,hasRotatingPoint:false} as any);
      box.setControlsVisibility({mtr:false});canvas.add(box);canvas.setActiveObject(box);model.current={canvas,box,w,h};
      const adapt=()=>{if(stopped||!host.current)return;const width=Math.max(140,host.current.clientWidth),scale=Math.min(width/w,440/h);canvas!.setDimensions({width,height:h*scale});canvas!.setViewportTransform([scale,0,0,scale,0,0]);canvas!.requestRenderAll();};
      observer=new ResizeObserver(adapt);observer.observe(host.current!);adapt();
      let anchor:{x:number;y:number}|null=null;
      canvas.on('mouse:down',event=>{if((event.e as MouseEvent).button!==0||event.target===box)return;const p=canvas!.getScenePoint(event.e);anchor={x:Math.min(w,Math.max(0,p.x)),y:Math.min(h,Math.max(0,p.y))};canvas!.discardActiveObject();});
      canvas.on('mouse:move',event=>{if(!anchor)return;const p=canvas!.getScenePoint(event.e);const end={x:Math.min(w,Math.max(0,p.x)),y:Math.min(h,Math.max(0,p.y))};applyRegion({x:Math.min(anchor.x,end.x)/w,y:Math.min(anchor.y,end.y)/h,width:Math.abs(end.x-anchor.x)/w,height:Math.abs(end.y-anchor.y)/h});});
      canvas.on('mouse:up',()=>{if(anchor){anchor=null;canvas!.setActiveObject(box);canvas!.requestRenderAll();}});
      canvas.on('object:modified',()=>applyRegion({x:box.left/w,y:box.top/h,width:box.width*box.scaleX/w,height:box.height*box.scaleY/h}));
      setReady(true);
    })().catch(e=>{if(!stopped)setError(e.message);});
    return()=>{stopped=true;observer?.disconnect();model.current=null;if(canvas)void canvas.dispose().catch(()=>{}).finally(()=>element.remove());else element.remove();};
  },[source.id]);
  return <div className="eh3-image-region"><div ref={host} role="img" aria-label={`${source.label} ${say('可选区域的原图')}`}/>{error&&<><Alert type="warning" title={error}/>{url&&<img src={url} alt={source.label}/>}</>}<p className="eh3-subtle">{say('拖动选择区域，或填写下方百分比。原图不会被裁切。')}</p><div className="eh3-region-fields">{(['x','y','width','height'] as const).map((key,i)=><label key={key}>{say(['左侧','顶部','宽度','高度'][i])}<InputNumber aria-label={say(['选区左侧百分比','选区顶部百分比','选区宽度百分比','选区高度百分比'][i])} value={Number((region[key]*100).toFixed(2))} min={0} max={100} step={.5} onChange={value=>applyRegion({...region,[key]:Number(value)/100})}/></label>)}</div><Space><Button size="small" disabled={!ready} onClick={()=>onSave(region)}>{say('保存为新选区')}</Button><span className="eh3-subtle">{source.width} × {source.height} · {say('原图像素')}</span></Space></div>;
}

export function SourceGraph({project,report,selectedItemId,say,onSelect}:{project:Project;report:Report;selectedItemId?:string;say:(s:string)=>string;onSelect:(item:Item)=>void}){
  const host=React.useRef<HTMLDivElement>(null);
  const [itemId,setItemId]=React.useState(report.items.find(i=>i.id===selectedItemId)?.id||report.items[0]?.id||'');
  const [error,setError]=React.useState('');
  const item=report.items.find(i=>i.id===itemId);
  const sources=item?.sourceIds.map(sid=>project.sources.find(s=>s.id===sid)).filter(Boolean) as Source[]||[];
  const events=item?.eventIds.map(eid=>project.events.find(e=>e.id===eid)).filter(Boolean)||[];
  React.useEffect(()=>{
    if(!host.current||!item)return;
    let stopped=false;setError('');const width=Math.max(540,host.current.clientWidth);const labels=[...sources.map(s=>({id:`source:${s.id}`,label:s.label,kind:say('材料')})),...events.map(e=>({id:`event:${e!.id}`,label:e!.text,kind:say(e!.kind.startsWith('user')?'用户原话':'操作记录')}))];
    const step=66,height=Math.max(240,labels.length*step+60),mid=height/2;
    const nodes:NodeData[]=[...labels.map((s,i)=>({id:s.id,data:s,style:{x:105,y:40+i*step,labelText:`${s.kind}\n${s.label.slice(0,11)}${s.label.length>11?'…':''}`,fill:'#eef4f0',stroke:'#a7bfb3'}})),{id:`item:${item.id}`,style:{x:width*.55,y:mid,labelText:`${say('需求条目')}\n${item.text.slice(0,11)}${item.text.length>11?'…':''}`,fill:'#dceee6',stroke:'#207a69'}},{id:`report:${report.version}`,style:{x:width-74,y:mid,labelText:`${say('需求报告')}\nV${report.version}`,size:[112,48],fill:'#f3f4f5',stroke:'#b7bdc0'}}];
    const edges=[...labels.map(s=>({source:s.id,target:`item:${item.id}`})),{source:`item:${item.id}`,target:`report:${report.version}`}];
    // The official default renderer is 2D Canvas; no WebGL renderer or GPU layout.
    const graph=new Graph({container:host.current,width,height:Math.min(420,height),data:{nodes,edges},autoFit:'view',padding:18,animation:false,node:{type:'rect',style:{size:[178,48],radius:6,labelPlacement:'center',labelFontSize:13,labelFontFamily:'Noto Sans SC Variable',labelFill:'#26382f',labelLineHeight:18}},edge:{type:'cubic-horizontal',style:{stroke:'#93a99e',endArrow:true}},behaviors:['drag-canvas','zoom-canvas',{type:'hover-activate',degree:1,animation:false}]});
    graph.on('node:click',(event:any)=>{if(event.target.id===`item:${item.id}`)onSelect(item);});
    void graph.render().catch(e=>{if(!stopped)setError(e.message);});
    const observer=new ResizeObserver(()=>{if(!stopped&&host.current)graph.setSize(Math.max(540,host.current.clientWidth),Math.min(420,height));});observer.observe(host.current);
    return()=>{stopped=true;observer.disconnect();graph.destroy();};
  },[itemId,report.hash]);
  return <div className="eh3-source-graph"><Select aria-label={say('选择要追溯的需求')} value={itemId} onChange={setItemId} options={report.items.map(i=>({value:i.id,label:i.text}))} style={{width:'100%'}}/><div ref={host} className="eh3-graph-canvas" aria-label={say('材料与原话指向需求条目，需求条目属于所选报告版本')}/>{error&&<Alert type="warning" title={error}/>}<h3>{say('这条要求的依据')}</h3>{sources.map(s=><p key={s.id}><strong>{s.label}</strong> → {item?.text}</p>)}{events.map(e=><blockquote key={e!.id}>{e!.text}</blockquote>)}{!sources.length&&!events.length&&<p>{say('这条建议还没有引用材料或用户原话。')}</p>}{item&&<Button onClick={()=>onSelect(item)}>{say('回到这条需求')}</Button>}</div>;
}
