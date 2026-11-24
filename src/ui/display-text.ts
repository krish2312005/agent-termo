// =============================================================================
// Display-text sanitizer — one render-boundary filter for untrusted text.
//
// Model output, tool output and repository-provided agent names can carry
// terminal control sequences. Every workspace surface and the existing main
// log run text through this module before it reaches an OpenTUI node.
//
// The scan is linear with no nested regex quantifiers, so hostile payloads
// cannot trigger backtracking. Normal text (ASCII, Unicode, CJK, emoji) is
// preserved unchanged; newlines can be kept for multi-line content.
// =============================================================================

const ESC = 0x1b;
const BEL = 0x07;
const BACKSLASH = 0x5c;

function isControl(code: number): boolean {
	return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

/** Skip a CSI body; returns the index after the final byte (or the end). */
function skipCsi(value: string, from: number): number {
	for (let index = from; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code >= 0x40 && code <= 0x7e) return index + 1;
	}
	return value.length;
}

/** Skip an OSC body; BEL or ESC \ terminates. An unterminated sequence is dropped. */
function skipOsc(value: string, from: number): number {
	for (let index = from; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code === BEL) return index + 1;
		if (code === ESC && value.charCodeAt(index + 1) === BACKSLASH) return index + 2;
	}
	return value.length;
}

/** Skip a DCS/SOS/PM/APC string; ESC \ terminates. An unterminated sequence is dropped. */
function skipControlString(value: string, from: number): number {
	for (let index = from; index < value.length; index++) {
		if (value.charCodeAt(index) === ESC && value.charCodeAt(index + 1) === BACKSLASH) return index + 2;
	}
	return value.length;
}

/**
 * Strip terminal control sequences from display text.
 * `keepNewlines` preserves `\n` (multi-line transcript/markdown content);
 * CR, tabs, BEL, remaining C0/C1 controls and every escape sequence are removed.
 */
export function sanitizeDisplayText(value: string, options: { keepNewlines?: boolean } = {}): string {
	if (typeof value !== "string" || value.length === 0) return "";
	const keepNewlines = options.keepNewlines === true;
	const output: string[] = [];
	let index = 0;
	while (index < value.length) {
		const code = value.charCodeAt(index);
		if (code === ESC) {
			const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1;
			if (next === 0x5b) { // ESC [ — CSI
				index = skipCsi(value, index + 2);
				continue;
			}
			if (next === 0x5d) { // ESC ] — OSC
				index = skipOsc(value, index + 2);
				continue;
			}
			if (next === 0x50 || next === 0x58 || next === 0x5e || next === 0x5f) { // P X ^ _ — DCS/SOS/PM/APC
				index = skipControlString(value, index + 2);
				continue;
			}
			// Other two-character ESC sequences: drop the ESC and one printable follower.
			index += 1;
			if (index < value.length && !isControl(value.charCodeAt(index))) index += 1;
			continue;
		}
		if (code === 0x9b) { // 8-bit CSI
			index = skipCsi(value, index + 1);
			continue;
		}
		if (code === 0x9d) { // 8-bit OSC
			index = skipOsc(value, index + 1);
			continue;
		}
		if (code === 0x90 || code === 0x98 || code === 0x9e || code === 0x9f) { // 8-bit DCS/SOS/PM/APC
			index = skipControlString(value, index + 1);
			continue;
		}
		if (code === 0x0a && keepNewlines) {
			output.push("\n");
			index++;
			continue;
		}
		if (isControl(code)) {
			index++;
			continue;
		}
		output.push(value[index]!);
		index++;
	}
	return output.join("");
}

/** Single-line variant: controls and escape sequences removed, whitespace flattened. */
export function sanitizeDisplayLine(value: string): string {
	return sanitizeDisplayText(value, { keepNewlines: true }).replace(/\s+/g, " ").trim();
}
