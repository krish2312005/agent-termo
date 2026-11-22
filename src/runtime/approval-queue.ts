/** FIFO mutex for interactive prompts sharing one terminal input stream. */
export function createApprovalQueue() {
	let tail: Promise<void> = Promise.resolve();

	return async function run<T>(prompt: () => Promise<T>): Promise<T> {
		const previous = tail;
		let release!: () => void;
		tail = new Promise<void>((resolve) => { release = resolve; });
		await previous;
		try {
			return await prompt();
		} finally {
			release();
		}
	};
}
