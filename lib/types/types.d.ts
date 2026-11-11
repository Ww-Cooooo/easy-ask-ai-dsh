export interface SaveReceipt {
    operationId: string;
    savedAt: string;
}
export interface ProjectRef {
    workspaceId: string;
    taskId: string;
}
export interface Mutation extends ProjectRef {
    expectedRevision: number;
    operationId: string;
}
export interface CreateInput extends ProjectRef {
    title: string;
    goal: string;
    mode: 'new' | 'revise';
    operationId: string;
}
export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface SourceInput {
    kind: 'text' | 'image' | 'file' | 'web' | 'video';
    label: string;
    path?: string;
    excerpt?: string;
    url?: string;
    region?: Region;
    mediaReviewTask?: string;
    startSeconds?: number;
    endSeconds?: number;
}
export interface Source extends SourceInput {
    id: string;
    at: string;
    status: string;
    hash?: string;
    before?: string;
    after?: string;
    line?: number;
    width?: number;
    height?: number;
    mediaType?: string;
    mediaId?: string;
    captureNote?: string;
}
export interface UserEvent {
    id: string;
    kind: string;
    text: string;
    at: string;
    peerId?: string;
    sessionId?: string;
    seq?: number;
}
export interface Item {
    id: string;
    text: string;
    kind: 'change' | 'preserve' | 'unresolved' | 'exclude';
    scope: string;
    status: 'active' | 'discussion' | 'removed';
    sourceIds: string[];
    eventIds: string[];
    origin?: string;
    originEventId?: string;
}
export interface ReportInput {
    goal: string;
    body: string;
    items: Item[];
    deliverables: string[];
    acceptance: string[];
    sourceIds: string[];
}
export interface Change {
    kind: string;
    itemId: string;
    before: string;
    after: string;
}
export interface Report extends ReportInput {
    version: number;
    hash: string;
    at: string;
    changes: Change[];
    basisSeq?: number;
}
export interface Question {
    id: string;
    text: string;
    options: string[];
    sourceIds: string[];
    status: string;
    reportVersion: number;
    at: string;
}
export interface Answer {
    id: string;
    questionId: string;
    eventId: string;
    text: string;
    at: string;
}
export interface Decision {
    id: string;
    version: number;
    hash: string;
    scope: string[];
    eventId: string;
    method: string;
    at: string;
    recoveredAt?: string;
}
export interface Submission {
    id: string;
    kind: string;
    version: number;
    hash: string;
    scope: string[];
    decisionId?: string;
    sessionId: string;
    workspaceId: string;
    requestId: string;
    operationId: string;
    prompt: string;
    status: string;
    at: string;
    attempts: number;
    report?: Report;
    sources?: Source[];
    acceptedAt?: string;
    error?: string;
    delivery?: string;
}
export interface EvidenceInput {
    itemId: string;
    excerpt: string;
    judgment: string;
}
export interface Evidence {
    itemId: string;
    status: string;
    evidence: string;
    judgment: string;
    author: string;
}
export interface Artifact {
    id: string;
    submissionId: string;
    path: string;
    hash: string;
    at: string;
    checks: Evidence[];
    humanStatus: string;
    humanEventId?: string;
    humanPresentationSeq?: number;
    humanReviewedAt?: string;
}
export interface ExportFile {
    path: string;
    hash: string;
}
export interface ExportGroup {
    id: string;
    version: number;
    reportHash: string;
    files: ExportFile[];
    at: string;
}
export interface Conflict {
    id: string;
    operationId: string;
    expectedRevision: number;
    actualRevision: number;
    actor: string;
    draft: string;
    at: string;
}
export interface OperationReceipt {
    operationId: string;
    fingerprint: string;
    revision: number;
    resultId: string;
    at: string;
    status?: string;
}
export interface Understanding {
    id: string;
    summary: string;
    guesses: string[];
    unresolved: string[];
    eventIds: string[];
    basisSeq: number;
    at: string;
}
export interface Presentation {
    version: number;
    hash: string;
    basisSeq: number;
    method: string;
    seq?: number;
    at: string;
}
export interface Conversation {
    sessionId: string;
    lastUserSeq: number;
    understandings: Understanding[];
    presentations: Presentation[];
}
export interface DiscussionMessage {
    seq: number;
    role: 'user' | 'assistant';
    text: string;
    at: string;
    interrupted: boolean;
    turn?: number;
}
export interface DiscussionActivity {
    seq: number;
    turn?: number;
    resultSeq?: number;
    kind: 'native' | 'skill-read';
    action: string;
    status: 'pending' | 'failed' | 'succeeded' | 'unverified';
    workflow?: 'get-clear' | 'prompt-ready';
    recordId?: string;
}
export interface RoundProvenance {
    kind: 'workflow' | 'skill-read' | 'ordinary' | 'unknown';
    workflows: ('get-clear' | 'prompt-ready')[];
    skills: ('get-clear' | 'prompt-ready')[];
    activities: DiscussionActivity[];
}
export interface DiscussionHistory {
    messages: DiscussionMessage[];
    throughSeq: number;
    complete: boolean;
    activities?: DiscussionActivity[];
    completedTurns?: number[];
    provenanceComplete?: boolean;
}
export interface ConversationRuntime {
    known: boolean;
    running: boolean;
    queued: number;
    pendingInput: ('approval' | 'question' | 'other')[];
}
export interface ConversationView {
    sessionId: string;
    project: Project | null;
    stage: string;
    activeReportVersion?: number;
    resultStatus?: string;
    history?: DiscussionHistory;
    runtime?: ConversationRuntime;
    presentation?: string;
    submission?: Submission;
}
export interface ConversationCommand {
    action: 'begin' | 'read' | 'understand' | 'execute';
    sessionId?: string;
    title?: string;
    mode?: 'new' | 'revise';
    expectedRevision?: number;
    operationId?: string;
    summary?: string;
    guesses?: string[];
    unresolved?: string[];
    eventIds?: string[];
}
export interface Project extends ProjectRef {
    schemaVersion: number;
    title: string;
    mode: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    events: UserEvent[];
    sources: Source[];
    questions: Question[];
    answers: Answer[];
    reports: Report[];
    decisions: Decision[];
    submissions: Submission[];
    artifacts: Artifact[];
    exports: ExportGroup[];
    conflicts: Conflict[];
    receipts: OperationReceipt[];
    conversation?: Conversation;
}
export interface MutationResult {
    status: 'ok' | 'conflict';
    project: Project;
    resultId: string;
    message?: string;
}
export interface ListItem {
    taskId: string;
    title: string;
    revision: number;
    version: number;
    mode: string;
}
export interface WorkspaceInfo {
    id: string;
    title: string;
    path: string;
    sessionIds: string[];
}
export interface SessionInfo {
    id: string;
    title: string;
    workspaceId: string;
}
export interface Environment {
    workspaces: WorkspaceInfo[];
    sessions: SessionInfo[];
}
export interface NewSession {
    workspaceId: string;
    operationId: string;
}
export interface FilePreview {
    path: string;
    text: string;
    hash: string;
    truncated: boolean;
}
export interface SourceCheck {
    sourceId: string;
    status: string;
    message: string;
    line?: number;
}
export interface FileCheck {
    path: string;
    status: string;
}
export interface Checks {
    sources: SourceCheck[];
    exports: FileCheck[];
}
export interface Media {
    data: string;
    mediaType: string;
    width: number;
    height: number;
}
export interface SourceCommand extends Mutation {
    action: 'source';
    source: SourceInput;
}
export interface QuestionCommand extends Mutation {
    action: 'question';
    text: string;
    options: string[];
    sourceIds: string[];
}
export interface ReportCommand extends Mutation {
    action: 'revise';
    report: ReportInput;
}
export interface FreezeCommand extends Mutation {
    action: 'freeze';
    version: number;
    hash: string;
    scope: string[];
    decisionId: string;
    sessionId: string;
}
export interface ArtifactCommand extends Mutation {
    action: 'artifact';
    submissionId: string;
    path: string;
    evidence: EvidenceInput[];
}
export interface ExportCommand extends Mutation {
    action: 'export';
    version: number;
}
export type Suggestion = SourceCommand | QuestionCommand | ReportCommand | FreezeCommand | ArtifactCommand | ExportCommand;
export interface AnswerCommand extends Mutation {
    action: 'answer';
    questionId: string;
    text: string;
    sessionId?: string;
}
export interface DecideCommand extends Mutation {
    action: 'decide';
    version: number;
    hash: string;
    scope: string[];
    text: string;
}
export interface ReviewCommand extends Mutation {
    action: 'review';
    artifactId: string;
    status: 'accepted' | 'needs-change';
    text: string;
}
export interface CancelCommand extends Mutation {
    action: 'cancel';
    submissionId: string;
}
export interface ImportCommand extends Mutation {
    action: 'importText';
    path: string;
}
export interface ClarifyCommand extends Mutation {
    action: 'clarify';
    sessionId: string;
    text: string;
}
export type HumanCommand = Suggestion | AnswerCommand | DecideCommand | ReviewCommand | CancelCommand | ImportCommand | ClarifyCommand;
export interface LogDecision extends Mutation {
    sessionId: string;
    seq: number;
    version: number;
    hash: string;
    scope: string[];
}
