export type Provenance = "user_fact" | "user_approved" | "source_document" | "ai_draft" | "ai_interpretation";

export interface Attachment {
  id: string; workspace_id: string | null; filename: string; kind: "pdf" | "docx" | "txt" | "md" | "image"; mime_type: string;
  size_bytes: number; checksum: string; duplicate_of: string | null;
  status: "uploaded" | "extracting" | "ready" | "needs_vision" | "failed"; error: string | null;
  page_count: number | null; text_chars: number; vision_pages: number; transcribed: boolean; width: number | null; height: number | null; created_at: string;
  doc_meta?: { comments?: number; tracked_insertions?: number; tracked_deletions?: number; pages_as_saved?: number | null };
}

export interface SourceRef {
  id: number; label: string; attachment_id: string | null; chunk_id: number | null; filename: string | null; page: number | null;
  section: string | null; quote: string; explanation: string; verification: "verified" | "vision" | "unverified"; location: Record<string, unknown>;
}

export interface Message {
  id: string; role: "user" | "assistant"; content: string; workflow: string | null; attachment_ids: string[]; run_id: string | null;
  result_type: "analysis" | "review" | "draft" | "error" | "cancelled" | null; result_id: string | null; created_at: string;
}

export interface Evidence { source: string; quote: string; explanation?: string }
export interface Fact { statement: string; basis: "observed" | "document" | "user_provided" | "assumption" | "inference"; source?: string | null }
export interface ActionItem { title: string; kind: "action" | "respond" | "waiting_on"; owner?: string | null; due?: string | null; source?: string | null }
export interface DecisionItem { question: string; options: string[]; recommendation?: string | null }

export interface EmailContent {
  title: string; asking: string; context: string[]; decisions: DecisionItem[]; approach: string; draft_subject: string | null; draft_body: string;
  uncertainties: string[]; deadlines: string[]; implied_expectations: string[]; unresolved_questions: string[]; dynamics: string | null;
  thread: { sender: string | null; recipients: string | null; date: string | null; subject: string | null; summary: string; source: string | null }[];
  action_items: ActionItem[]; draft_id?: string;
}

export interface AnalysisContent {
  title: string; answer_type: "concise" | "full"; executive_conclusion: string; facts: Fact[]; key_issues: string[]; analysis: string;
  alternatives: string[]; risks: string[]; next_steps: string[]; missing_information: string[]; external_guidance_note: string | null;
  action_items: ActionItem[]; decisions: DecisionItem[];
}

export interface DocFinding { id: string; tier: "primary" | "secondary"; title: string; location: string; summary: string; comment: string; guidance_cited: string[] }
export interface KeyQuestion { ref: string; topic: string; document_conclusion: string; reviewer_view: string;
  assessment: "agree" | "agree_with_changes" | "disagree" | "incomplete" | "not_addressed"; findings: string[] }
export interface DocReviewContent {
  title: string; document_name: string; document_description: string; scope_note: string; score: number; score_reasons: string[];
  presentation_notes: string[]; strengths: string[]; elevator_pitch: string; key_questions: KeyQuestion[]; findings: DocFinding[];
  missing_documents: string[]; selection?: { full: string[]; excerpted: string[]; passages: number } | null;
}

export interface ReviewIssue { severity: "critical" | "high" | "medium" | "low"; category: string; issue: string; why_it_matters: string; suggestion: string }
export interface ReviewContent {
  title: string; verdict: "sound" | "needs_revision" | "unsound"; overall_assessment: string; issues: ReviewIssue[];
  strongest_counterargument: string; revised_conclusion: string;
}

export interface Analysis {
  id: string; workspace_id: string | null; workflow: string; title: string; summary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any; markdown: string; structured: boolean; provider: string; parent_analysis_id: string | null; approved: boolean;
  created_at: string; sources: SourceRef[]; revisions?: Analysis[]; parent?: Analysis | null;
}

export interface Review {
  id: string; workspace_id: string | null; target_type: "analysis" | "draft"; target_id: string; target_version: number | null;
  content: ReviewContent; markdown: string; provider: string; created_at: string; sources: SourceRef[];
}

export interface DraftVersion { version: number; subject: string | null; body: string; note: string; author: "ai" | "user"; provider: string; created_at: string }
export interface Draft {
  id: string; workspace_id: string | null; workspace_title?: string | null; title: string; kind: string; status: "draft" | "final";
  source_analysis_id: string | null; current_version: number; created_at: string; updated_at: string; subject: string | null; body: string;
  version_count: number; versions?: DraftVersion[];
}

export interface Run {
  id: string; workspace_id: string | null; workflow: string; steps: string[]; status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  step_label: string; provider: string; model: string; input_tokens: number; output_tokens: number; cost_estimate: number | null;
  duration_ms: number | null; calls: number; error: string | null; result_type: string | null; result_id: string | null; message_id: string | null;
  created_at: string; finished_at: string | null;
}

export interface Task {
  id: string; workspace_id: string | null; title: string; details: string; kind: "action" | "respond" | "waiting_on"; status: "open" | "done";
  due_date: string | null; owner: string | null; source: "user" | "extracted"; source_excerpt: string | null; created_at: string; completed_at: string | null;
}

export interface Decision {
  id: string; workspace_id: string | null; title: string; context: string; options: string[]; recommendation: string | null;
  status: "pending" | "decided" | "dropped"; outcome: string | null; rationale: string | null; due_date: string | null;
  source: "user" | "ai_suggested"; created_at: string; decided_at: string | null;
}

export interface KnowledgeItem {
  id: string; category: string; title: string; body: string; tags: string[]; provenance: Provenance; workspace_id: string | null;
  source_ref: Record<string, string>; created_at: string; updated_at: string;
}

export interface WorkspaceSummary {
  id: string; title: string; description: string; status: "active" | "waiting" | "completed" | "archived"; tags: string[];
  created_at: string; updated_at: string; file_count: number; message_count: number;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  messages: Message[]; attachments: Attachment[]; analyses: Analysis[]; reviews: Review[]; drafts: Draft[];
  tasks: Task[]; decisions: Decision[]; knowledge: KnowledgeItem[]; runs: Run[];
}

export interface SearchResult {
  kind: "chunk" | "knowledge" | "analysis" | "draft"; id: string; title: string; excerpt: string; provenance: Provenance;
  workspace_id: string | null; workspace_title: string | null; created_at: string;
  attachment_id?: string; page?: number | null; section?: string | null; text_source?: string; doctype?: string;
  category?: string; tags?: string[]; workflow?: string; draft_kind?: string;
}

export interface WritingProfile {
  id: string; status: "proposed" | "approved" | "superseded"; profile: Record<string, string | string[]>; sample_excerpt: string;
  provider: string; created_at: string; approved_at: string | null;
}

export interface SettingsData {
  ai: { provider: string; model: string; default_model: string; key_configured: boolean; key_masked: string | null; key_source: string | null;
    consent: boolean; consent_at: string | null };
  prefs: { theme: "light" | "dark" | "system"; tone: string; length: string; use_writing_profile: boolean; analysis_depth: string };
  storage: Record<string, string | number>;
  app: { name: string; version: string; schema_version: number; python: string; host: string; port: number; max_upload_mb: number };
  usage: { days: number; total_runs: number; total_cost_estimate: number;
    by_model: { model: string; provider: string; runs: number; input_tokens: number; output_tokens: number; cost_estimate: number | null }[] };
}

export interface BriefItem { type: string; id: string; title: string; reason: string; due_date?: string | null; workspace_id: string | null; workspace_title: string | null }
