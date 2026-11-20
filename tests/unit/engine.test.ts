import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRunJournal, loadRunHistory } from "../../src/runtime/engine.js";

const roots: string[] = [];
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-termo-engine-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("durable run engine", () => {
  it("persists ordered assistant and tool lifecycle events and projects completed state", () => {
    const root = project();
    const sessionId = randomUUID();
    const journal = createRunJournal(root, sessionId);
    const observed: string[] = [];
    const unsubscribe = journal.subscribe((event) => observed.push(event.type));
    const unsubscribeFaulty = journal.subscribe(() => { throw new Error("terminal renderer failed"); });
    const runId = journal.startRun("Fix the compiler errors");
    journal.assistantStarted();
    journal.assistantTextDelta("I will inspect the code.");
    journal.assistantCompleted("I will inspect the code.", [{
      id: "tool-1", name: "bash:execute", arguments: { command: "npm run typecheck" },
    }]);
    journal.toolCalled({ id: "tool-1", name: "bash:execute", arguments: { command: "npm run typecheck" } });
    journal.toolStarted("tool-1");
    journal.toolOutputDelta("tool-1", "stdout", "typecheck ");
    journal.toolOutputDelta("tool-1", "stdout", "passed");
    journal.toolFinished("tool-1", {
      id: "tool-1",
      name: "bash:execute",
      success: true,
      command: "npm run typecheck",
      stdout: "typecheck passed",
      exitCode: 0,
      durationMs: 12,
    });
    journal.complete("Fixed and verified.");

    const [run] = loadRunHistory(root, sessionId);
    expect(run?.runId).toBe(runId);
    expect(run?.status).toBe("completed");
    expect(run?.assistantText).toBe("I will inspect the code.");
    expect(run?.tools[0]).toMatchObject({
      callId: "tool-1",
      status: "completed",
      stdout: "typecheck passed",
      result: { exitCode: 0, success: true },
    });
    expect(observed).toContain("tool.output.delta");
    expect(observed).toContain("tool.completed");
    unsubscribe();
    unsubscribeFaulty();
  });

  it("marks in-flight tools and runs interrupted after a process restart", () => {
    const root = project();
    const sessionId = randomUUID();
    const first = createRunJournal(root, sessionId);
    first.startRun("Generate a project");
    first.toolCalled({ id: "tool-running", name: "bash:execute", arguments: { command: "npm run build" } });
    first.toolStarted("tool-running");
    first.toolOutputDelta("tool-running", "stderr", "partial compiler output");

    createRunJournal(root, sessionId);
    const [run] = loadRunHistory(root, sessionId);
    expect(run?.status).toBe("interrupted");
    expect(run?.tools[0]?.status).toBe("interrupted");
    expect(run?.tools[0]?.stderr).toBe("partial compiler output");
    expect(run?.reason).toContain("restarted");
  });

  it("discards only an incomplete final JSONL record", () => {
    const root = project();
    const sessionId = randomUUID();
    const journal = createRunJournal(root, sessionId);
    journal.startRun("Persist a session");
    journal.complete("Done");
    const path = resolve(root, ".agent-termo", "events", sessionId + ".jsonl");
    expect(existsSync(path)).toBe(true);
    appendFileSync(path, '{"schemaVersion":1,"sequence":3');
    expect(loadRunHistory(root, sessionId)[0]?.status).toBe("completed");
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });
});
