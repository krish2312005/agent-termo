// Session-scoped execution journal and run lifecycle.
// The engine owns durable state transitions; the CLI is only an event consumer.

import { randomUUID } from "node:crypto";
import type { ToolCall, ToolResult } from "../types/index.js";
import { projectRunEvents, SessionEventStore, type RunSnapshot } from "./events.js";

const MAX_OUTPUT_CHARS = 100_000;

function bounded(value: string | undefined): string {
  if (!value) return "";
  return value.length > MAX_OUTPUT_CHARS ? value.slice(-MAX_OUTPUT_CHARS) : value;
}

export class AgentRunJournal {
  private readonly store: SessionEventStore;
  private currentRunId: string | undefined;

  constructor(projectRoot: string, sessionId: string) {
    this.store = new SessionEventStore(projectRoot, sessionId);
    this.recoverInterruptedWork();
  }

  get runId(): string | undefined {
    return this.currentRunId;
  }

  private recoverInterruptedWork(): void {
    const runs = projectRunEvents(this.store.read());
    for (const run of runs) {
      if (run.status !== "running") continue;
      for (const tool of run.tools) {
        if (tool.status === "pending" || tool.status === "running") {
          this.store.append(run.runId, "tool.interrupted", {
            callId: tool.callId,
            name: tool.name,
            reason: "The process stopped before a durable tool result was recorded.",
          });
        }
      }
      this.store.append(run.runId, "run.interrupted", {
        reason: "The process restarted before this run reached a terminal state.",
      });
    }
  }

  startRun(goal: string): string {
    if (this.currentRunId) throw new Error("A run is already active in this journal.");
    this.currentRunId = randomUUID();
    this.store.append(this.currentRunId, "run.started", { goal });
    return this.currentRunId;
  }

  assistantStarted(): void {
    this.store.append(this.requireRun(), "assistant.started");
  }

  assistantTextDelta(text: string): void {
    if (text) this.store.append(this.requireRun(), "assistant.text.delta", { text }, false);
  }

  assistantCompleted(content: string, toolCalls: readonly ToolCall[] = []): void {
    this.store.append(this.requireRun(), "assistant.completed", {
      content,
      toolCalls: toolCalls.map((call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
      })),
    });
  }

  toolCalled(call: ToolCall): void {
    this.store.append(this.requireRun(), "tool.called", {
      callId: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }

  toolStarted(callId: string): void {
    this.store.append(this.requireRun(), "tool.started", { callId });
  }

  toolFinished(callId: string, result: ToolResult): void {
    const output = bounded(result.stdout ?? result.output);
    const stderr = bounded(result.stderr);
    const appendChunks = (stream: "stdout" | "stderr", value: string): void => {
      for (let offset = 0; offset < value.length; offset += 8192) {
        this.store.append(this.requireRun(), "tool.output.delta", {
          callId, stream, text: value.slice(offset, offset + 8192),
        }, false);
      }
    };
    appendChunks("stdout", output);
    appendChunks("stderr", stderr);
    const data = {
      callId,
      name: result.name,
      command: result.command,
      cwd: result.cwd,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      success: result.success,
      output: bounded(result.output),
      error: bounded(result.error),
      stdout: output,
      stderr,
    };
    this.store.append(this.requireRun(), result.success ? "tool.completed" : "tool.failed", data);
  }

  complete(summary: string): void {
    this.store.append(this.requireRun(), "run.completed", { summary });
    this.currentRunId = undefined;
  }

  pause(reason: string): void {
    this.store.append(this.requireRun(), "run.paused", { reason });
    this.currentRunId = undefined;
  }

  fail(error: string): void {
    this.store.append(this.requireRun(), "run.failed", { reason: error });
    this.currentRunId = undefined;
  }

  private requireRun(): string {
    if (!this.currentRunId) throw new Error("No active run exists in this journal.");
    return this.currentRunId;
  }
}

export function createRunJournal(projectRoot: string, sessionId: string): AgentRunJournal {
  return new AgentRunJournal(projectRoot, sessionId);
}

export function loadRunHistory(projectRoot: string, sessionId: string): RunSnapshot[] {
  const store = new SessionEventStore(projectRoot, sessionId);
  return projectRunEvents(store.read());
}
