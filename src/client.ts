import React from 'react';
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js';
import en from '../locale/en.json';
import zh from '../locale/zh.json';
import { NativeTheme, Sample } from './ui-sample';
import { WorkspaceApp } from './ui-app';
import { ConversationDock, ConversationPane } from './ui-conversation';
import { uiCopy, copyKeys } from './ui-copy.generated';
declare const __EH3_DEV__: boolean;

export const inject = ['slots', 'remote', 'locale', 'sidebarRight', 'sidebarRightTabs'];
export function apply(ctx: any) {
  const labels=Object.fromEntries(Object.entries(uiCopy).map(([key,value])=>[`ui.${key}`,value]));
  ctx.effect(() => ctx.locale.register('eh3-easy-ask-ai', { en:{...en,...labels}, zh:{...zh,...labels} }));
  const t = ctx.locale.bind('eh3-easy-ask-ai');
  ctx.remote.$mount(TYPERT_REMOTE);
  ctx.inject(['remote.eh3-easy-ask-ai'], (ctx: any) => {
  if(__EH3_DEV__)ctx.effect(()=>{(window as any).__EH3_TEST__=ctx.remote['eh3-easy-ask-ai'];return()=>{delete (window as any).__EH3_TEST__;};});
  const h = React.createElement;
  const copy=(label:string)=>copyKeys[label]?t(`ui.${copyKeys[label]}`):label;
  const subscribeReset=(fn:()=>void)=>ctx.on('connection/reset',fn);
  const definition={id:'eh3-dsh-easy-ask-ai/conversation',kind:'eh3-easy-ask-conversation',title:()=>t('panel'),priority:'extension'};
  ctx.effect(()=>ctx.sidebarRightTabs.register(definition));
  const api=ctx.remote['eh3-easy-ask-ai'];
  function ChatPane({sessionId,useTabInfo}:any){const info=useTabInfo();return h(NativeTheme,null,h(ConversationPane,{key:sessionId,api,sessionId,copy,subscribeReset,visible:info.tab.visible}));}
  function ChatDock({sessionId}:any){return h(NativeTheme,null,h(ConversationDock,{sessionId,copy,open:()=>ctx.sidebarRight.openTab(definition.kind)}));}
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:definition.id},ChatPane));
  ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'eh3-easy-ask-ai-dock',order:40},ChatDock));
  function Icon({ size = 18 }: { size?: number }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
      h('path', { d: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16l2 2 5-5' }));
  }
  function Panel() {
    const [sample,setSample]=React.useState(false);
    return h('section', { 'data-easy-ask-ai': 'native', style:{height:'100%',minHeight:0} },h(NativeTheme,null,__EH3_DEV__&&sample?h(Sample,{onBack:()=>setSample(false)}):h(WorkspaceApp,{api:ctx.remote['eh3-easy-ask-ai'],copy:(label:string)=>copyKeys[label]?t(`ui.${copyKeys[label]}`):label,subscribeReset:(fn:()=>void)=>ctx.on('connection/reset',fn),...(__EH3_DEV__?{onSample:()=>setSample(true)}:{})})));
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'eh3-easy-ask-ai', order: 30, label: () => t('panel') }, Icon));
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'eh3-easy-ask-ai', id: 'eh3-easy-ask-ai-main' }, Panel));
  });
}
