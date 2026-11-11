import React from 'react';
import { Button, Collapse, Tag } from 'antd';
import Markdown from 'react-markdown';
import { discussionRounds } from './discussion.mjs';
import type { ConversationView, DiscussionMessage } from './types';

function ChatText({text}:{text:string}){return <div className="eh3-markdown"><Markdown skipHtml components={{img:({alt})=><span>{alt}</span>,a:({children})=><span>{children}</span>}}>{text}</Markdown></div>;}
type Round={id:string;title:string;opening:DiscussionMessage[];assistant:DiscussionMessage[];answers:DiscussionMessage[]};
export function DiscussionArchive({snapshot,say}:{snapshot:ConversationView;say:(s:string)=>string}){
  const rounds=React.useMemo(()=>discussionRounds(snapshot.history?.messages??[]) as Round[],[snapshot.history]);
  const [expanded,setExpanded]=React.useState<string[]|null>(null),[limit,setLimit]=React.useState(20);
  const p=snapshot.project;
  return <section className="eh3-discussion" aria-label={say('本次对话的讨论记录')}>
    <div className="eh3-discussion-heading"><h3>{say('讨论过的问题')}</h3><span>{rounds.length} {say('组记录')}</span></div>
    {!snapshot.history?.complete&&<p className="eh3-subtle" role="status">{say('正在读取这个对话的历史内容…')}</p>}
    {snapshot.history?.complete&&!rounds.length&&<p className="eh3-subtle">{say('这个对话还没有讨论内容。直接在原聊天开始即可。')}</p>}
    {!!rounds.length&&<>
      <p className="eh3-chat-note">{say('问题和后续回复放在一起，最近的在前。以下保留原话，不把回答或 AI 的说法当作你的认可。')}</p>
      <Collapse ghost activeKey={expanded??[rounds.at(-1)!.id]} onChange={keys=>setExpanded(typeof keys==='string'?[keys]:keys)} items={[...rounds].reverse().slice(0,limit).map((round,i)=>({
        key:round.id,label:<span className="eh3-discussion-title"><small>{rounds.length-i}</small><span>{round.title}</span></span>,
        children:<div className="eh3-discussion-body">
          {round.opening.map(m=><div className="eh3-discussion-message user" key={m.seq}><span className="eh3-chat-label">{say('你的原话')}</span><ChatText text={m.text}/></div>)}
          {round.assistant.map(m=><div className="eh3-discussion-message assistant" key={m.seq}><span className="eh3-chat-label">{say('AI 当时的回复')} {m.interrupted&&<Tag>{say('回复未完成')}</Tag>}</span><ChatText text={m.text}/></div>)}
          {round.answers.map(m=>{const decisions=p?.decisions.filter(d=>p.events.find(e=>e.id===d.eventId)?.seq===m.seq)??[];return <div className="eh3-discussion-message user" key={m.seq}><span className="eh3-chat-label">{say('你的回答 · 原话')}</span><ChatText text={m.text}/>{decisions.map(d=><Tag key={d.id} color="green">{say('你已认可的方案')} V{d.version}</Tag>)}</div>;})}
          {p?.conversation?.understandings.filter(u=>u.id!==p.conversation?.understandings.at(-1)?.id&&[...round.opening,...round.answers].some(m=>m.seq===u.basisSeq)).map(u=><div className="eh3-discussion-message" key={u.id}><span className="eh3-chat-label">{say('当时记录的 AI 理解')}<Tag>{say('AI 整理，待核对')}</Tag></span><ChatText text={u.summary}/>{u.guesses.length>0&&<><small>{say('当时的猜测')}</small><ul>{u.guesses.map((g,i)=><li key={i}>{g}</li>)}</ul></>}</div>)}
          {!round.answers.length&&!!round.assistant.length&&<small className="eh3-subtle">{say('此后还没有你的新回复。')}</small>}
        </div>
      }))}/>
      {rounds.length>limit&&<Button type="text" size="small" onClick={()=>setLimit(n=>n+20)}>{say('显示更早的讨论')}</Button>}
    </>}
  </section>;
}
