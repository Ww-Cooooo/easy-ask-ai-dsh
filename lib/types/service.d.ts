import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SaveReceipt, ProjectRef, CreateInput, Project, MutationResult, ListItem, Environment, Checks, Media, HumanCommand, Suggestion, LogDecision, NewSession, SessionInfo, FilePreview } from './types.js';
import type { ConversationCommand, ConversationView } from './types.js';
type Actor = {
    kind: string;
    peerId?: string;
    sessionId?: string;
    seq?: number;
};
interface BusinessPort {
    environment(): Promise<Environment>;
    create(input: CreateInput, actor: Actor): Promise<MutationResult>;
    read(ref: ProjectRef): Promise<Project>;
    list(workspaceId: string): Promise<ListItem[]>;
    command(input: HumanCommand, actor: Actor): Promise<MutationResult>;
    deliver(ref: ProjectRef, submissionId: string): Promise<MutationResult>;
    checks(ref: ProjectRef): Promise<Checks>;
    media(ref: ProjectRef, sourceId: string): Promise<Media>;
    logDecision(input: LogDecision): Promise<MutationResult>;
    createSession(input: NewSession): Promise<SessionInfo>;
    preview(ref: ProjectRef, path: string): Promise<FilePreview>;
    conversation(sessionId: string, input: ConversationCommand): Promise<ConversationView>;
    watchConversation(sessionId: string, signal: AbortSignal): AsyncIterable<ConversationView>;
    presented(sessionId: string, version: number, hash: string): Promise<ConversationView>;
}
type ReceiptStore = {
    get(id: string): SaveReceipt | undefined;
    put(id: string, value: SaveReceipt): Promise<void>;
};
/** Native UI and Agent adapters share this Host-owned requirements service. */
export declare class EasyAskService extends TypertRemoteService {
    private readonly receipts;
    private readonly port;
    constructor(ctx: Context, receipts: ReceiptStore, port: BusinessPort);
    private owner;
    /** Persist one installation receipt. @param operationId - Retry-stable operation identity. @returns Durable receipt. */
    checkSaving(operationId: string): Promise<SaveReceipt>;
    /** Read selectable workspaces and sessions. @returns Only the authenticated owner's environment. */
    environment(): Promise<Environment>;
    /** List persisted requirement projects. @param workspaceId - Registered workspace identity. @returns Project summaries. */
    list(workspaceId: string): Promise<ListItem[]>;
    /** Read a project without changing it. @param ref - Exact project identity. @returns Canonical project. */
    read(ref: ProjectRef): Promise<Project>;
    /** Create from a real user action. @param input - Initial goal and identity. @returns Persisted project. */
    create(input: CreateInput): Promise<MutationResult>;
    /** Apply an authenticated UI action; no Agent tool exposes this method. @param input - Versioned action. @returns Durable result or preserved conflict. */
    human(input: HumanCommand): Promise<MutationResult>;
    /** Submit an AI suggestion; this never grants user approval. @param input - Versioned proposal. @returns Durable result or conflict. */
    suggest(input: Suggestion): Promise<MutationResult>;
    /** Deliver an already frozen packet using its stable request id. @param ref - Project identity. @param submissionId - Prepared packet. @returns Acceptance state, never inferred completion. */
    deliver(ref: ProjectRef, submissionId: string): Promise<MutationResult>;
    /** Inspect current sources and edited exports. @param ref - Project identity. @returns Validation facts. */
    checks(ref: ProjectRef): Promise<Checks>;
    /** Read a captured image without executing its file contents. @param ref - Project identity. @param sourceId - Image reference. @returns Original captured image. */
    media(ref: ProjectRef, sourceId: string): Promise<Media>;
    /** Bind an existing owner user event after Host verification. @param input - Exact log event and displayed scope. @returns Verified decision. */
    logDecision(input: LogDecision): Promise<MutationResult>;
    /** Create a target only after the user chooses this action. @param input - Workspace and retry-stable operation. @returns Actual native Session. */
    createSession(input: NewSession): Promise<SessionInfo>;
    /** Read a bounded plain text file for comparison. @param ref - Registered task. @param path - Workspace relative path. @returns Literal text, never executed HTML. */
    preview(ref: ProjectRef, path: string): Promise<FilePreview>;
    /** Follow the current native conversation. @param sessionId - Original Session. @param signal - Transport cancellation. @returns Canonical snapshots after durable changes. */
    watchConversation(sessionId: string, signal: AbortSignal): AsyncIterable<ConversationView>;
    /** Record that this exact proposal was displayed; this is not approval. @param sessionId - Visible Session. @param version - Displayed version. @param hash - Exact content. @returns Current conversation. */
    presented(sessionId: string, version: number, hash: string): Promise<ConversationView>;
    /** Read or update the AI understanding of an original conversation. Never creates user answers. @param input - Conversation action. @returns Current project and optional frozen packet. */
    conversation(input: ConversationCommand): Promise<ConversationView>;
    agentConversation(input: ConversationCommand, sessionId: string): Promise<ConversationView>;
    agentSuggestion(input: Suggestion, sessionId: string): Promise<MutationResult>;
    agentRead(ref: ProjectRef): Promise<Project>;
    agentDeliver(ref: ProjectRef, submissionId: string): Promise<MutationResult>;
    agentLogDecision(input: LogDecision): Promise<MutationResult>;
}
export {};
