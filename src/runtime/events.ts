// Durable append-only event log for an Agent-Termo session.
// Conversation messages remain the provider-facing transcript; this journal is
// the authoritative lifecycle record for runs and tool executions.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { resolve } from "node:path";
import { agentTermoEventsDir } from "./paths.js";
import { randomUUID } from "node:crypto";

export type RuntimeEventType =
  | "run.started"
  | "run.completed"
  | "run.paused"
  | "run.failed"
  | "run.interrupted"
  | "assistant.started"
  | "assistant.text.delta"
  | "assistant.completed"
  | "tool.called"
  | "tool.started"
  | "tool.output.delta"
  | "tool.completed"
  | "tool.failed"
  | "tool.interrupted";

export interface RuntimeEvent {
  schemaVersion: 1;
  sequence: number;
  eventId: string;
  sessionId: string;
  runId: string;
  timestamp: string;
  type: RuntimeEventType;
  data: Record<string, unknown>;
}

export type ToolLifecycleStatus = "pending" | "running" | "completed" | "failed" | "interrupted";

export interface ToolRunSnapshot {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolLifecycleStatus;
  startedAt?: string;
  completedAt?: string;
  stdout: string;
  stderr: string;
  result?: Record<string, unknown>;
}

export interface RunSnapshot {
  runId: string;
  status: "running" | "completed" | "paused" | "failed" | "interrupted";
  goal: string;
  startedAt: string;
  endedAt?: string;
  reason?: string;
  assistantText: string;
  tools: ToolRunSnapshot[];
}

const SESSION_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;
const VALID_TYPES = new Set<RuntimeEventType>([
  "run.started", "run.completed", "run.paused", "run.failed", "run.interrupted",
  "assistant.started", "assistant.text.delta", "assistant.completed",
  "tool.called", "tool.started", "tool.output.delta", "tool.completed", "tool.failed", "tool.interrupted",
]);

function eventPath(projectRoot: string, sessionId: string): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Invalid session ID for event journal.");
  return resolve(agentTermoEventsDir(projectRoot), sessionId + ".jsonl");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Read complete newline-terminated records and discard only a torn final write. */
export function readSessionEvents(projectRoot: string, sessionId: string): RuntimeEvent[] {
  const path = eventPath(projectRoot, sessionId);
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, "utf8");
  const lastNewline = raw.lastIndexOf("\n");
  const complete = lastNewline < 0 ? "" : raw.slice(0, lastNewline + 1);
  if (complete.length !== raw.length) {
    writeFileSync(path, complete, { encoding: "utf8", mode: 0o600 });
  }

  const events: RuntimeEvent[] = [];
  for (const [index, line] of complete.split("\n").entries()) {
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("Corrupt event journal record at line " + (index + 1) + ".");
    }
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Number.isInteger(value.sequence) ||
      typeof value.eventId !== "string" ||
      value.sessionId !== sessionId ||
      typeof value.runId !== "string" ||
      typeof value.timestamp !== "string" ||
      typeof value.type !== "string" ||
      !VALID_TYPES.has(value.type as RuntimeEventType) ||
      !isRecord(value.data)
    ) {
      throw new Error("Invalid event journal record at line " + (index + 1) + ".");
    }
    const event = value as unknown as RuntimeEvent;
    const expected = events.length + 1;
    if (event.sequence !== expected) {
      throw new Error("Event journal sequence mismatch at line " + (index + 1) + ".");
    }
    events.push(event);
  }
  return events;
}

export function projectRunEvents(events: readonly RuntimeEvent[]): RunSnapshot[] {
  const runs = new Map<string, RunSnapshot>();
  for (const event of events) {
    const data = event.data;
    if (event.type === "run.started") {
      runs.set(event.runId, {
        runId: event.runId,
        status: "running",
        goal: String(data.goal ?? ""),
        startedAt: event.timestamp,
        assistantText: "",
        tools: [],
      });
      continue;
    }

    const run = runs.get(event.runId);
    if (!run) continue;

    if (event.type === "assistant.text.delta") {
      run.assistantText += String(data.text ?? "");
    } else if (event.type === "assistant.completed" && typeof data.content === "string") {
      run.assistantText = data.content;
    } else if (event.type === "tool.called") {
      run.tools.push({
        callId: String(data.callId),
        name: String(data.name),
        arguments: isRecord(data.arguments) ? data.arguments : {},
        status: "pending",
        stdout: "",
        stderr: "",
      });
    } else if (event.type === "tool.started") {
      const tool = run.tools.find((item) => item.callId === data.callId);
      if (tool) {
        tool.status = "running";
        tool.startedAt = event.timestamp;
      }
    } else if (event.type === "tool.output.delta") {
      const tool = run.tools.find((item) => item.callId === data.callId);
      if (tool) {
        const stream = data.stream === "stderr" ? "stderr" : "stdout";
        tool[stream] += String(data.text ?? "");
      }
    } else if (event.type === "tool.completed" || event.type === "tool.failed" || event.type === "tool.interrupted") {
      const tool = run.tools.find((item) => item.callId === data.callId);
      if (tool) {
        tool.status = event.type === "tool.completed" ? "completed" : event.type === "tool.failed" ? "failed" : "interrupted";
        tool.completedAt = event.timestamp;
        tool.result = data;
      }
    } else if (event.type === "run.completed" || event.type === "run.paused" || event.type === "run.failed" || event.type === "run.interrupted") {
      run.status = event.type === "run.completed" ? "completed" : event.type === "run.paused" ? "paused" : event.type === "run.failed" ? "failed" : "interrupted";
      run.endedAt = event.timestamp;
      run.reason = typeof data.reason === "string" ? data.reason : undefined;
    }
  }
  return [...runs.values()];
}

export class SessionEventStore {
  private readonly path: string;
  private readonly sessionId: string;
  private readonly projectRoot: string;
  private sequence: number;

  constructor(projectRoot: string, sessionId: string) {
    this.sessionId = sessionId;
    this.projectRoot = resolve(projectRoot);
    this.path = eventPath(projectRoot, sessionId);
    this.sequence = readSessionEvents(projectRoot, sessionId).length;
  }

  read(): RuntimeEvent[] {
    return readSessionEvents(this.projectRoot, this.sessionId);
  }

  append(runId: string, type: RuntimeEventType, data: Record<string, unknown> = {}, durable = true): RuntimeEvent {
    const directory = resolve(this.path, "..");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const event: RuntimeEvent = {
      schemaVersion: 1,
      sequence: ++this.sequence,
      eventId: randomUUID(),
      sessionId: this.sessionId,
      runId,
      timestamp: new Date().toISOString(),
      type,
      data,
    };
    const descriptor = openSync(this.path, "a", 0o600);
    try {
      writeSync(descriptor, JSON.stringify(event) + "\n", undefined, "utf8");
      if (durable) fsyncSync(descriptor);
    } catch (error) {
      this.sequence--;
      throw error;
    } finally {
      closeSync(descriptor);
    }
    return event;
  }
}
