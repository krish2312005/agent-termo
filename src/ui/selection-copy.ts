import type { ClipboardService } from "@opentui/core";

type ClipboardWriter = Pick<ClipboardService, "writeText">;

/** Copy selected TUI text using the local clipboard or terminal OSC 52 fallback. */
export async function copySelectedText(
  text: string,
  clipboard: ClipboardWriter | null,
  fallback: (value: string) => boolean,
): Promise<boolean> {
  if (!text) return false;

  if (clipboard) {
    try {
      const result = await clipboard.writeText(text, { destination: "best-available" });
      if (result.host.status === "written" || result.terminal.status === "attempted") return true;
    } catch {
      // Fall back to the renderer's direct OSC 52 support.
    }
  }

  try {
    return fallback(text);
  } catch {
    return false;
  }
}
