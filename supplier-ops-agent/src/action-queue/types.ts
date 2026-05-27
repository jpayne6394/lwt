export type ActionQueueType = "PROMOTE" | "FIX" | "WRITE" | "AUTOMATE" | "REVIEW" | "IGNORE";

export type ActionQueuePriority = "Critical" | "High" | "Medium" | "Low";

export type ActionQueueRiskLevel = "Low" | "Medium" | "High" | "Vendor Sensitive" | "Claim Risk";

export type ActionQueueStatus =
  | "new"
  | "accepted"
  | "approved"
  | "edited"
  | "in_progress"
  | "waiting"
  | "done"
  | "rejected"
  | "ignored";

export type ActionQueueEventType = "created" | "deduped" | "approved" | "edited" | "rejected" | "completed" | "ignored";

export type ActionQueueInput = {
  id?: string;
  dedupe_key?: string;
  source_workflow: string;
  source_agent: string;
  action_type: ActionQueueType;
  priority: ActionQueuePriority;
  area: string;
  title: string;
  description: string;
  reason: string;
  related_product_handle?: string | null;
  related_product_title?: string | null;
  related_vendor?: string | null;
  related_collection?: string | null;
  related_campaign?: string | null;
  risk_level: ActionQueueRiskLevel;
  status?: ActionQueueStatus;
  owner?: string | null;
  due_date?: string | null;
  confidence_score?: number | null;
  source_payload?: Record<string, unknown>;
  source_reference?: string | null;
};

export type ActionQueueItem = Omit<ActionQueueInput, "id" | "dedupe_key" | "status"> & {
  id: string;
  dedupe_key: string;
  status: ActionQueueStatus;
  owner: string | null;
  due_date: string | null;
  confidence_score: number | null;
  source_payload: Record<string, unknown>;
  source_reference: string | null;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

export type ActionQueueEvent = {
  id: string;
  action_id: string;
  event_type: ActionQueueEventType;
  actor: string;
  note: string;
  created_at: string;
  snapshot: Record<string, unknown>;
};

export type ActionQueueEditInput = {
  actor: string;
  note: string;
  updates: Partial<
    Pick<
      ActionQueueItem,
      | "title"
      | "description"
      | "reason"
      | "priority"
      | "area"
      | "owner"
      | "due_date"
      | "related_product_handle"
      | "related_product_title"
      | "related_vendor"
      | "related_collection"
      | "related_campaign"
      | "risk_level"
    >
  >;
};

export type ActionQueueDecisionInput = {
  actor: string;
  note: string;
};

