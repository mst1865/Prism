# Prism Industrial Knowledge Pipeline Design

Date: 2026-06-11

## Goal

Upgrade Prism from a script-like document watcher into a reliable first-stage knowledge extraction pipeline.

The first stage focuses on one durable loop: accept supported documents, deduplicate by SHA-256, filter obvious noise with deterministic rules, convert to Markdown, extract a clean knowledge card with AI, and write traceable outputs to a local vault.

This stage does not implement Windows right-click integration, a full task dashboard, or a long-running service daemon. Those future entry points must call the same ingestion pipeline designed here.

## Current Context

The repository currently has two main parts:

- `prism-core`: Node/TypeScript service that watches a `dropzone`, calls `markitdown`, sends text to Anthropic, writes Markdown to a hard-coded vault path, and broadcasts status over WebSocket.
- `prism-ui`: React/Tauri application that connects to the core WebSocket and displays processing results.

The current implementation has hard-coded paths, no durable task state, no content hash deduplication, no structured skip reasons, and no reusable ingestion boundary for future capture methods.

## Chosen Approach

Use a core-pipeline-first architecture with minimal UI configuration.

- `prism-core` owns execution: CLI, directory watching, SHA-256 hashing, SQLite state, deterministic rules, conversion, AI extraction, Markdown output, and task status.
- `prism-ui` owns configuration: a minimal settings page that writes user-level configuration for vault path and watched directories.
- SQLite is the fact source for deduplication, task status, skip reasons, errors, and output paths.
- The vault stores two output families: clean knowledge cards and raw converted Markdown.

This approach keeps the first stage narrow enough to implement and verify while preserving a clean path to future right-click ingestion and passive folder monitoring.

## Architecture

Prism should be organized around a single ingestion pipeline:

```text
Capture entry
  -> ingestPath()
  -> file discovery
  -> supported document filter
  -> SHA-256 hashing
  -> SQLite dedupe check
  -> deterministic value rules
  -> MarkItDown conversion
  -> converted text quality check
  -> AI knowledge extraction
  -> vault write
  -> SQLite terminal state
```

Capture entries can include CLI commands, a dropzone watcher, future right-click menu integration, or future desktop UI actions. None of those entries should duplicate pipeline logic.

### Component Boundaries

`prism-core` components:

- `config`: reads `%APPDATA%/Prism/config.json` and applies derived defaults.
- `cli`: exposes `ingest`, `watch`, and `status` commands.
- `watcher`: reads configured watched directories and forwards file events to ingestion.
- `pipeline`: coordinates the ordered task stages.
- `hashing`: streams files and calculates SHA-256.
- `rules`: applies deterministic value and noise filters.
- `converter`: wraps MarkItDown.
- `aiExtractor`: creates the clean knowledge card.
- `vaultWriter`: writes knowledge and raw Markdown files.
- `taskStore`: persists SQLite task records and dedupe checks.
- `events`: optionally emits WebSocket status for the existing UI surface.

`prism-ui` components:

- Settings page for `vaultDir` and `watchDirs`.
- User-level config read/write.
- No direct pipeline execution in the first stage.
- No direct SQLite querying in the first stage.

## Configuration

Configuration is user-level and managed by `prism-ui`.

Path:

```text
%APPDATA%/Prism/config.json
```

First-stage shape:

```json
{
  "vaultDir": "D:\\TolariaVault",
  "watchDirs": ["D:\\Downloads", "D:\\Documents\\Inbox"]
}
```

Derived defaults:

- SQLite database: `%APPDATA%/Prism/prism.db`
- Knowledge output: `<vaultDir>/knowledge`
- Raw output: `<vaultDir>/raw`

Model configuration and API secrets stay in environment variables or `.env` for this stage. The UI should not manage secrets yet.

## CLI And Runtime Entries

First-stage CLI:

```text
prism ingest <file|dir>
prism watch
prism status
```

Behavior:

- `ingest` expands files or directories and submits supported documents to the same pipeline.
- `watch` reads `config.watchDirs`, monitors those directories, and submits new supported files.
- `status` reads SQLite and prints task summary counts and recent failures.

The existing dropzone/WebSocket workflow may remain as a development path, but it must call the same ingestion service rather than maintaining a separate processing branch.

Future Windows right-click integration should call:

```text
prism ingest <selected-path>
```

The practical first implementation can be a registry-based context menu entry that invokes the executable. A shell extension, COM integration, dynamic menu, or Windows 11 modern context menu is out of scope for the first stage.

## Supported Inputs

First-stage supported extensions:

```text
.pdf
.docx
.pptx
.xlsx
.txt
.md
```

Other file types are not processed in this stage.

## Deduplication

Deduplication is strict and content-based.

The pipeline calculates SHA-256 before conversion or AI calls. If SQLite already contains the same SHA-256 in a completed or active task, the new file is recorded as `skipped_duplicate`.

Duplicate files do not run conversion, do not call AI, and do not write additional Markdown outputs.

## Rule-Based Value Funnel

The first-stage value funnel is deterministic. AI does not decide whether a file is worth processing.

Default rules:

- Accept only supported extensions.
- Reject common temporary and system names: `~$*`, `._*`, `Thumbs.db`, `desktop.ini`.
- Reject known noise path segments such as `.git`, `node_modules`, cache directories, and temp directories.
- Reject files outside size limits. Default range: 1 KB to 100 MB.
- Reject converted Markdown whose non-whitespace text length is below the configured quality threshold.

Rules should return structured skip reasons so that skipped files are inspectable through SQLite and future UI surfaces.

## Output Structure

The vault uses two fixed folders:

```text
vault/
  knowledge/
    original-name--shortsha.md
  raw/
    original-name--shortsha.raw.md
```

`knowledge/*.md` contains the clean AI-generated knowledge card.

`raw/*.raw.md` contains the full MarkItDown output.

The knowledge card should include YAML frontmatter with:

- source file name
- source path
- SHA-256
- generated time
- raw relative path
- tags

The knowledge body should include:

- title
- concise summary
- key points
- important facts or data
- optional caveats if the source text is incomplete or low quality

The raw text is not appended to the knowledge card body.

## SQLite State Model

First-stage task statuses:

```text
queued
processing
skipped_duplicate
skipped_rule
completed
failed
```

Task fields:

- `id`
- `source_path`
- `source_name`
- `sha256`
- `status`
- `stage`
- `skip_reason`
- `error_message`
- `knowledge_path`
- `raw_path`
- `created_at`
- `updated_at`
- `completed_at`

`sha256` should be indexed. Status and updated time should also be indexed for status queries.

## Error Handling

Errors are recorded by stage.

- `hash`: file read or hashing failure becomes `failed`.
- `dedupe`: duplicate content becomes `skipped_duplicate`.
- `rules`: unsupported type, temporary file, system noise, size rejection, or low converted text becomes `skipped_rule`.
- `convert`: MarkItDown failure or empty output becomes `failed`.
- `ai`: timeout, rate limit, and network errors retry a limited number of times before `failed`.
- `write`: vault write failure retries once before `failed`.

Future `retry <id|path>` can requeue failed tasks, but the first stage only needs a state model that supports retry cleanly later.

## Testing Strategy

Unit tests:

- SHA-256 hashing returns stable values.
- Rule funnel accepts and rejects expected paths.
- Output file names are deterministic and collision-safe.
- Config read/write handles missing config and invalid paths.
- Task status transitions are valid.

Integration tests:

- Ingest a fixture document and verify SQLite status is `completed`.
- Verify both `knowledge` and `raw` outputs exist.
- Ingest the same document twice and verify the second task is `skipped_duplicate`.
- Ingest unsupported and temporary files and verify `skipped_rule`.
- Simulate AI failure and verify retry then `failed`.

Manual acceptance:

- `prism-ui` writes `%APPDATA%/Prism/config.json`.
- `prism-core` CLI reads the same config.
- `prism ingest <file>` produces one knowledge file and one raw file.
- Re-ingesting the same file does not call conversion or AI again.
- Failures are visible in SQLite with stage and error message.

## Out Of Scope For Stage One

- Windows right-click menu implementation.
- Windows shell extension or COM integration.
- Full Tauri task dashboard.
- User-facing AI secret management.
- Topic-based or AI-classified vault folders.
- Full digital asset indexing for non-document files.
- Background service installation and process supervision.

## Open Follow-Up Work

After the first stage is stable:

1. Add registry-based Windows right-click integration that calls `prism ingest <path>`.
2. Add a task dashboard in `prism-ui` backed by SQLite or a local core API.
3. Add optional AI-based value judgment after deterministic rules.
4. Add retry command and failed-task management.
5. Add service installation for truly passive operation.
