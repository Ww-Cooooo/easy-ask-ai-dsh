import React from 'react';
import { Steps } from 'antd';
import { CheckCircleOutlined, MessageOutlined, RobotOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { conversationProgress } from './conversation-progress.mjs';
import type { ConversationView } from './types';

const stages=['问清需求','核对方案','执行修改','查看成果','完成'];
const headings:Record<string,string>={loading:'正在读取进度',idle:'尚未进入需求流程',question:'正在问清需求',understanding:'正在整理你的意思',plan:'修改方案待核对','plan-draft':'方案已整理，尚未展示',approved:'方案已确认',execution:'已进入执行阶段',review:'成果已生成，待你查看',complete:'本次修改已完成','needs-change':'根据你的反馈继续修改'};
const actions:Record<string,[string,string]>={
  loading:['正在同步','读取本次对话的进度。'],
  chat:['继续在原聊天讨论','需要澄清时，进度会显示在这里。'],
  'chat-running':['AI 正在回复','当前还没有接入需求流程。'],
  answer:['等你在原聊天回答',''],
  'await-ai':['等待 AI 整理下一步','已收到你的原话，当前没有新的待答问题。'],
  'await-revision':['等待 AI 处理修改意见','原成果和已确认的记录仍保留。'],
  'review-plan':['等你在原聊天核对方案',''],
  'await-presentation':['等待 AI 展示完整方案','当前版本尚未完整展示，无需先确认。'],
  'not-started':['执行尚未开始','方案已确认，无需重复确认；在原聊天查看或继续。'],
  preparing:['AI 正在准备执行','已确认的范围保持不变。'],
  executing:['AI 正在执行',''],
  'execution-stopped':['AI 已停下，成果尚未登记','请在原聊天查看执行情况或继续。'],
  'delivery-failed':['执行请求未确认送达','请到原聊天或“原作、版本与结果”查看回执。'],
  'review-result':['等你查看成果，并在原聊天反馈',''],
  delivery:['AI 正在整理交付','成果已登记，等待原聊天展示。'],
  complete:['你已认可成果，当前没有待办',''],
  'wrap-up':['AI 正在收尾回复','你已认可成果，无需再次确认。'],
  permission:['等你处理权限请求','请查看原聊天的权限提示；这不是方案确认。'],
  'host-input':['等你回应原聊天提示','AI 正在等待你的输入。'],
  queued:['等待 AI 接手','请求已排队，尚未开始运行。'],
  'writing-plan':['AI 正在整理方案','等完整方案展示后再核对。'],
  organizing:['AI 正在整理和提问','请等本轮回复完成后，在原聊天回答。'],
  'runtime-unknown':['运行状态暂不可用','已保存的进度保留，请查看原聊天。'],
};
export function ConversationProgress({snapshot,connected,say}:{snapshot:ConversationView;connected:boolean;say:(s:string)=>string}){
  const progress=conversationProgress(connected?snapshot:{...snapshot,runtime:undefined});
  const action=actions[progress.next]??actions['runtime-unknown'];
  const Icon=progress.owner==='you'?MessageOutlined:progress.owner==='ai'?RobotOutlined:progress.step===4?CheckCircleOutlined:MinusCircleOutlined;
  return <section className="eh3-progress" aria-label={say('本次任务整体进度')} data-progress-step={progress.step} data-progress-next={progress.next}>
    <Steps className="eh3-progress-steps" size="small" current={progress.step} responsive={false} labelPlacement="vertical" items={stages.map((title,index)=>({
      title:<span aria-current={index===progress.step?'step':undefined} aria-label={`${say(title)} · ${say(index<progress.step||progress.step===4?'已完成':index===progress.step?'当前阶段':'尚未到达')}`}>{say(title)}</span>,
      status:index<progress.step||progress.step===4?'finish':index===progress.step?'process':'wait',
    }))}/>
    <div className="eh3-progress-status" role="status" aria-live="polite" aria-atomic="true">
      <strong>{say(headings[progress.heading])}</strong>
      <div className="eh3-progress-next"><Icon aria-hidden="true"/><span>{say(action[0])}</span></div>
      {action[1]&&<p>{say(action[1])}</p>}
    </div>
  </section>;
}
