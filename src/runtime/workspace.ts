import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Check lexical containment and the real path of the nearest existing ancestor.
 * This rejects symlink escapes for existing paths and future destinations.
 */
export function isPathWithinWorkspace(path: string, projectRoot: string): boolean {
	try {
		const root = resolve(projectRoot);
		const candidate = isAbsolute(path) ? resolve(path) : resolve(root, path);
		const lexicalRelative = relative(root, candidate);
		if (lexicalRelative === '..' || lexicalRelative.startsWith('..' + sep) || isAbsolute(lexicalRelative)) return false;

		const realRoot = realpathSync(root);
		let ancestor = candidate;
		while (true) {
			try {
				lstatSync(ancestor);
				break;
			} catch {
				const parent = dirname(ancestor);
				if (parent === ancestor) return false;
				ancestor = parent;
			}
		}

		const realAncestor = realpathSync(ancestor);
		const realRelative = relative(realRoot, realAncestor);
		return realRelative !== '..' && !realRelative.startsWith('..' + sep) && !isAbsolute(realRelative);
	} catch {
		return false;
	}
}
