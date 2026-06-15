import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { TaskRecord, TaskStage, TaskStatus } from "./types.js";

export type StatusSummary = Partial<Record<TaskStatus, number>>;

export class TaskStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  createTask(sourcePath: string): TaskRecord {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      insert into tasks (
        source_path, source_name, status, stage, created_at, updated_at
      ) values (?, ?, 'queued', 'discover', ?, ?)
    `).run(sourcePath, basename(sourcePath), now, now);

    return this.getTask(Number(result.lastInsertRowid));
  }

  getTask(id: number): TaskRecord {
    const task = this.db.prepare("select * from tasks where id = ?").get(id) as TaskRecord | undefined;
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  markProcessing(id: number, stage: TaskStage): void {
    this.update(id, { status: "processing", stage });
  }

  setHash(id: number, sha256: string): void {
    this.db.prepare("update tasks set sha256 = ?, updated_at = ? where id = ?").run(sha256, now(), id);
  }

  hasActiveOrCompletedHash(sha256: string): boolean {
    const row = this.db.prepare(`
      select id from tasks
      where sha256 = ?
        and status in ('queued', 'processing', 'completed')
      limit 1
    `).get(sha256);
    return Boolean(row);
  }

  hasActiveOrCompletedHashExcludingTask(sha256: string, taskId: number): boolean {
    const row = this.db.prepare(`
      select id from tasks
      where sha256 = ?
        and id != ?
        and status in ('queued', 'processing', 'completed')
      limit 1
    `).get(sha256, taskId);
    return Boolean(row);
  }

  skip(id: number, status: "skipped_duplicate" | "skipped_rule", stage: TaskStage, reason: string, sha256?: string): void {
    const timestamp = now();
    this.db.prepare(`
      update tasks
      set status = ?, stage = ?, skip_reason = ?, sha256 = coalesce(?, sha256), updated_at = ?, completed_at = ?
      where id = ?
    `).run(status, stage, reason, sha256 ?? null, timestamp, timestamp, id);
  }

  fail(id: number, stage: TaskStage, errorMessage: string, sha256?: string): void {
    const timestamp = now();
    this.db.prepare(`
      update tasks
      set status = 'failed', stage = ?, error_message = ?, sha256 = coalesce(?, sha256), updated_at = ?, completed_at = ?
      where id = ?
    `).run(stage, errorMessage, sha256 ?? null, timestamp, timestamp, id);
  }

  complete(id: number, sha256: string, knowledgePath: string, rawPath: string): void {
    const timestamp = now();
    this.db.prepare(`
      update tasks
      set status = 'completed',
          stage = 'complete',
          sha256 = ?,
          knowledge_path = ?,
          raw_path = ?,
          updated_at = ?,
          completed_at = ?
      where id = ?
    `).run(sha256, knowledgePath, rawPath, timestamp, timestamp, id);
  }

  getStatusSummary(): StatusSummary {
    const rows = this.db.prepare("select status, count(*) as count from tasks group by status").all() as Array<{
      status: TaskStatus;
      count: number;
    }>;
    return Object.fromEntries(rows.map((row) => [row.status, row.count])) as StatusSummary;
  }

  close(): void {
    this.db.close();
  }

  private update(id: number, fields: { status: TaskStatus; stage: TaskStage }): void {
    this.db.prepare("update tasks set status = ?, stage = ?, updated_at = ? where id = ?")
      .run(fields.status, fields.stage, now(), id);
  }

  private initialize(): void {
    this.db.exec(`
      create table if not exists tasks (
        id integer primary key autoincrement,
        source_path text not null,
        source_name text not null,
        sha256 text,
        status text not null,
        stage text not null,
        skip_reason text,
        error_message text,
        knowledge_path text,
        raw_path text,
        created_at text not null,
        updated_at text not null,
        completed_at text
      );

      create index if not exists idx_tasks_sha256 on tasks(sha256);
      create index if not exists idx_tasks_status_updated on tasks(status, updated_at);
    `);
  }
}

function now(): string {
  return new Date().toISOString();
}
