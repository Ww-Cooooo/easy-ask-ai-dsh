import type { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SaveReceipt, ProjectRef, CreateInput, Project, MutationResult, ListItem, Environment, Checks, Media, HumanCommand, Suggestion, LogDecision, NewSession, SessionInfo, FilePreview } from './types.js';
import type { ConversationCommand, ConversationView } from './types.js';

type Actor={kind:string;peerId?:string;sessionId?:string;seq?:number};
interface BusinessPort {
  environment():Promise<Environment>;
  create(input:CreateInput,actor:Actor):Promise<MutationResult>;
  read(ref:ProjectRef):Promise<Project>;
  list(workspaceId:string):Promise<ListItem[]>;
  command(input:HumanCommand,actor:Actor):Promise<MutationResult>;
  deliver(ref:ProjectRef,submissionId:string):Promise<MutationResult>;
  checks(ref:ProjectRef):Promise<Checks>;
  media(ref:ProjectRef,sourceId:string):Promise<Media>;
  logDecision(input:LogDecision):Promise<MutationResult>;
  createSession(input:NewSession):Promise<SessionInfo>;
  preview(ref:ProjectRef,path:string):Promise<FilePreview>;
  conversation(sessionId:string,input:ConversationCommand):Promise<ConversationView>;
  watchConversation(sessionId:string,signal:AbortSignal):AsyncIterable<ConversationView>;
  presented(sessionId:string,version:number,hash:string):Promise<ConversationView>;
}
type ReceiptStore={get(id:string):SaveReceipt|undefined;put(id:string,value:SaveReceipt):Promise<void>};

/** Native UI and Agent adapters share this Host-owned requirements service. */
export class EasyAskService extends TypertRemoteService {
  constructor(ctx:Context,private readonly receipts:ReceiptStore,private readonly port:BusinessPort){super(ctx,'eh3-easy-ask-ai',{namespace:'eh3-easy-ask-ai'});}
  private owner():Actor {
    const invocation=this.ctx.invocation;
    if(!invocation||invocation.peer.principal.kind!=='owner')throw new Error('此入口仅供已认证的本机用户使用。');
    return {kind:'user-ui',peerId:String(invocation.peer.id)};
  }
  /** Persist one installation receipt. @param operationId - Retry-stable operation identity. @returns Durable receipt. */
  @Remote async checkSaving(operationId:string):Promise<SaveReceipt>{
    if(!/^[a-zA-Z0-9-]{1,100}$/.test(operationId))throw new Error('Invalid operation identifier');
    const previous=this.receipts.get(operationId);if(previous)return previous;const receipt={operationId,savedAt:new Date().toISOString()};await this.receipts.put(operationId,receipt);return receipt;
  }
  /** Read selectable workspaces and sessions. @returns Only the authenticated owner's environment. */
  @Remote async environment():Promise<Environment>{this.owner();return this.port.environment();}
  /** List persisted requirement projects. @param workspaceId - Registered workspace identity. @returns Project summaries. */
  @Remote async list(workspaceId:string):Promise<ListItem[]>{this.owner();return this.port.list(workspaceId);}
  /** Read a project without changing it. @param ref - Exact project identity. @returns Canonical project. */
  @Remote async read(ref:ProjectRef):Promise<Project>{this.owner();return this.port.read(ref);}
  /** Create from a real user action. @param input - Initial goal and identity. @returns Persisted project. */
  @Remote async create(input:CreateInput):Promise<MutationResult>{return this.port.create(input,this.owner());}
  /** Apply an authenticated UI action; no Agent tool exposes this method. @param input - Versioned action. @returns Durable result or preserved conflict. */
  @Remote async human(input:HumanCommand):Promise<MutationResult>{return this.port.command(input,this.owner());}
  /** Submit an AI suggestion; this never grants user approval. @param input - Versioned proposal. @returns Durable result or conflict. */
  @Remote async suggest(input:Suggestion):Promise<MutationResult>{this.owner();return this.port.command(input,{kind:'agent'});}
  /** Deliver an already frozen packet using its stable request id. @param ref - Project identity. @param submissionId - Prepared packet. @returns Acceptance state, never inferred completion. */
  @Remote async deliver(ref:ProjectRef,submissionId:string):Promise<MutationResult>{this.owner();return this.port.deliver(ref,submissionId);}
  /** Inspect current sources and edited exports. @param ref - Project identity. @returns Validation facts. */
  @Remote async checks(ref:ProjectRef):Promise<Checks>{this.owner();return this.port.checks(ref);}
  /** Read a captured image without executing its file contents. @param ref - Project identity. @param sourceId - Image reference. @returns Original captured image. */
  @Remote async media(ref:ProjectRef,sourceId:string):Promise<Media>{this.owner();return this.port.media(ref,sourceId);}
  /** Bind an existing owner user event after Host verification. @param input - Exact log event and displayed scope. @returns Verified decision. */
  @Remote async logDecision(input:LogDecision):Promise<MutationResult>{this.owner();return this.port.logDecision(input);}
  /** Create a target only after the user chooses this action. @param input - Workspace and retry-stable operation. @returns Actual native Session. */
  @Remote async createSession(input:NewSession):Promise<SessionInfo>{this.owner();return this.port.createSession(input);}
  /** Read a bounded plain text file for comparison. @param ref - Registered task. @param path - Workspace relative path. @returns Literal text, never executed HTML. */
  @Remote async preview(ref:ProjectRef,path:string):Promise<FilePreview>{this.owner();return this.port.preview(ref,path);}
  /** Follow the current native conversation. @param sessionId - Original Session. @param signal - Transport cancellation. @returns Canonical snapshots after durable changes. */
  @Remote({mode:'stream'}) watchConversation(sessionId:string,signal:AbortSignal):AsyncIterable<ConversationView>{this.owner();return this.port.watchConversation(sessionId,signal);}
  /** Record that this exact proposal was displayed; this is not approval. @param sessionId - Visible Session. @param version - Displayed version. @param hash - Exact content. @returns Current conversation. */
  @Remote async presented(sessionId:string,version:number,hash:string):Promise<ConversationView>{this.owner();return this.port.presented(sessionId,version,hash);}
  /** Read or update the AI understanding of an original conversation. Never creates user answers. @param input - Conversation action. @returns Current project and optional frozen packet. */
  @Remote async conversation(input:ConversationCommand):Promise<ConversationView>{this.owner();if(!input.sessionId)throw Error('请选择原聊天。');return this.port.conversation(input.sessionId,input);}
  async agentConversation(input:ConversationCommand,sessionId:string):Promise<ConversationView>{return this.port.conversation(sessionId,input);}
  async agentSuggestion(input:Suggestion,sessionId:string):Promise<MutationResult>{return this.port.command(input,{kind:'agent',sessionId});}
  async agentRead(ref:ProjectRef):Promise<Project>{return this.port.read(ref);}
  async agentDeliver(ref:ProjectRef,submissionId:string):Promise<MutationResult>{return this.port.deliver(ref,submissionId);}
  async agentLogDecision(input:LogDecision):Promise<MutationResult>{return this.port.logDecision(input);}
}
