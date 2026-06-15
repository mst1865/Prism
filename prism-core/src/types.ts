export type TaskStatus =
  | "queued"
  | "processing"
  | "skipped_duplicate"
  | "skipped_rule"
  | "completed"
  | "failed";

export type TaskStage =
  | "discover"
  | "hash"
  | "dedupe"
  | "rules"
  | "convert"
  | "ai"
  | "write"
  | "complete";

export interface PrismConfig {
  vaultDir: string;
  watchDirs: string[];
}

export interface ResolvedPrismConfig extends PrismConfig {
  appDataDir: string;
  databasePath: string;
  knowledgeDir: string;
  rawDir: string;
}

export interface RuleResult {
  accepted: boolean;
  reason?: string;
}

export interface TaskRecord {
  id: number;
  source_path: string;
  source_name: string;
  sha256: string | null;
  status: TaskStatus;
  stage: TaskStage;
  skip_reason: string | null;
  error_message: string | null;
  knowledge_path: string | null;
  raw_path: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
