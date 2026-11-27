import type { ScrollBoxRenderable } from "@opentui/core";
import { For, Show, createEffect } from "solid-js";
import type { OmniaRun, OmniaStatus } from "../runtime/omnia/types.js";
import { MAX_OMNIA_REPAIR_ATTEMPTS } from "../runtime/omnia/index.js";
import { ROLES } from "./theme.js";

export interface OmniaDashboardStats {
  verified: number;
  total: number;
  evidenceCount: number;
  repairAttempts: number;
  progressPercent: number;
}

export function getOmniaDashboardStats(run: OmniaRun): OmniaDashboardStats {
  const verified = run.requirements.filter((item) => item.status === "verified").length;
  return {
    verified,
    total: run.requirements.length,
    evidenceCount: run.evidence.length,
    repairAttempts: run.repairAttempts,
    progressPercent: run.requirements.length === 0 ? 0 : Math.round((verified / run.requirements.length) * 100),
  };
}

export function getOmniaDashboardItemCount(run: OmniaRun): number {
  return run.requirements.length + Math.min(8, run.evidence.length);
}

const clip = (value: string, width: number): string =>
  [...value].length <= width ? value : [...value].slice(0, Math.max(0, width - 1)).join("") + "…";

function statusColor(status: OmniaStatus): string {
  if (status === "completed") return ROLES.success;
  if (status === "failed" || status === "blocked") return ROLES.error;
  if (status === "executing" || status === "verifying" || status === "completed_with_warnings") return ROLES.statusRunning;
  return ROLES.dimText;
}

function requirementColor(status: string): string {
  if (status === "verified") return ROLES.success;
  if (status === "blocked") return ROLES.error;
  if (status === "unverified") return ROLES.statusRunning;
  return ROLES.dimText;
}

function Stat(props: { label: string; value: string }) {
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0} paddingX={1}>
      <text fg={ROLES.mutedHeader} wrapMode="none">{props.label.toUpperCase()}</text>
      <text fg={ROLES.text} attributes={1} wrapMode="none">{props.value}</text>
    </box>
  );
}

export interface OmniaDashboardViewProps {
  run: OmniaRun;
  width: number;
  selected: number;
}

export function OmniaDashboardView(props: OmniaDashboardViewProps) {
  const stats = () => getOmniaDashboardStats(props.run);
  const evidence = () => props.run.evidence.slice(-8);
  const progressBar = () => {
    const filled = Math.round(stats().progressPercent / 5);
    return "█".repeat(filled) + "░".repeat(20 - filled);
  };
  const statusLabel = () => clip(props.run.status.replace(/_/g, " ").toUpperCase(), Math.max(8, props.width - 32));
  const maxText = () => Math.max(12, props.width - 26);
  const rowIndex = (index: number) => props.selected === index;
  let listScrollbox: ScrollBoxRenderable | undefined;
  createEffect(() => {
    const selected = props.selected;
    if (listScrollbox) listScrollbox.scrollTo(selected + 5);
  });
  return (
    <box width="100%" flexDirection="column" flexGrow={1} flexBasis={0} flexShrink={1} minWidth={0} minHeight={0} gap={1} paddingX={1} backgroundColor={ROLES.pageBackground}>
      <box flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <box flexDirection="column" minWidth={0}>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">TERMO OMNIA · MISSION CONTROL</text>
          <text fg={ROLES.mutedText} wrapMode="none">{clip(props.run.goal.replace(/\s+/g, " "), Math.max(16, props.width - 24))}</text>
        </box>
        <text fg={statusColor(props.run.status)} attributes={1} wrapMode="none">{statusLabel()}</text>
      </box>
      <box flexDirection="row" border borderStyle="single" borderColor={ROLES.border} flexShrink={0} paddingY={1}>
        <Stat label="Verified" value={stats().verified + "/" + stats().total} />
        <Stat label="Evidence" value={String(stats().evidenceCount)} />
        <Stat label="Repairs" value={stats().repairAttempts + "/" + MAX_OMNIA_REPAIR_ATTEMPTS} />
        <Stat label="Progress" value={stats().progressPercent + "%"} />
      </box>
      <box flexDirection="row" alignItems="center" gap={2} flexShrink={0} paddingX={1}>
        <text fg={ROLES.brand} attributes={1} wrapMode="none">OUTCOME</text>
        <text fg={stats().progressPercent === 100 ? ROLES.success : ROLES.statusRunning} wrapMode="none">{progressBar()}</text>
        <text fg={ROLES.mutedText} wrapMode="none">{stats().progressPercent}%</text>
      </box>
      <scrollbox
        ref={(element) => {
          listScrollbox = element;
          element.scrollTo(props.selected + 5);
        }}
        flexGrow={1}
        flexBasis={0}
        minHeight={0}
        viewportCulling
        contentOptions={{ layoutMode: "list" }}
      >
        <box flexDirection="column" gap={1}>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">REQUIREMENT CONTRACT</text>
          <For each={props.run.requirements}>
            {(requirement, index) => (
              <box flexDirection="column" paddingX={1} paddingY={0} backgroundColor={rowIndex(index()) ? ROLES.selection : undefined}>
                <box flexDirection="row" alignItems="center" gap={1}>
                  <text fg={requirementColor(requirement.status)} attributes={1} wrapMode="none">{requirement.status === "verified" ? "✓" : requirement.status === "blocked" ? "!" : "○"}</text>
                  <text fg={ROLES.text} attributes={1} wrapMode="none">{requirement.id}</text>
                  <text fg={ROLES.mutedText} wrapMode="none">{requirement.strategy.toUpperCase()}</text>
                  <text fg={requirementColor(requirement.status)} wrapMode="none">{requirement.status.toUpperCase()}</text>
                </box>
                <text fg={ROLES.text} wrapMode="none">{clip(requirement.description, maxText())}</text>
                <text fg={ROLES.dimText} wrapMode="none">{clip(requirement.verificationPlan, Math.max(12, props.width - 14))}</text>
              </box>
            )}
          </For>
          <text fg={ROLES.brand} attributes={1} wrapMode="none">LATEST EXECUTION EVIDENCE</text>
          <For each={evidence()}>
            {(item, index) => (
              <box flexDirection="column" paddingX={1} backgroundColor={rowIndex(props.run.requirements.length + index()) ? ROLES.selection : undefined}>
                <box flexDirection="row" alignItems="center" gap={1}>
                  <text fg={item.success ? ROLES.success : ROLES.error} attributes={1} wrapMode="none">{item.success ? "●" : "×"}</text>
                  <text fg={ROLES.mutedCompletion} wrapMode="none">{item.type.toUpperCase()}</text>
                  <text fg={ROLES.text} wrapMode="none">{clip(item.source, Math.max(8, props.width - 34))}</text>
                </box>
                <text fg={ROLES.dimText} wrapMode="none">{clip(item.description, Math.max(12, props.width - 12))}</text>
              </box>
            )}
          </For>
          <Show when={props.run.blocker} fallback={<box height={0} />}>
            <text fg={ROLES.error} wrapMode="none">{clip("BLOCKER · " + props.run.blocker, Math.max(12, props.width - 8))}</text>
          </Show>
          <Show when={props.run.summary} fallback={<box height={0} />}>
            <text fg={ROLES.detailText} wrapMode="none">{clip("SUMMARY · " + props.run.summary, Math.max(12, props.width - 8))}</text>
          </Show>
        </box>
      </scrollbox>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <text fg={ROLES.dimText} wrapMode="none">↑ ↓ navigate · R refresh · Esc close</text>
        <text fg={ROLES.mutedText} wrapMode="none">{props.run.id.slice(0, 8)}</text>
      </box>
    </box>
  );
}
