import { DEFAULT_INCLUDE_COMMENTED_LINES } from "./SearchConfiguration.js";

export class Scanner {
	constructor({ includeCommentedLines = DEFAULT_INCLUDE_COMMENTED_LINES } = {}) {
		this.includeCommentedLines = includeCommentedLines;
	}

	async scan(fileEntries, matchers, { includeCommentedLines = this.includeCommentedLines } = {}) {
		const results = [];

		for await (const entry of fileEntries) {
			const lines = entry.source.split(/\r?\n/);
			const findings = matchers.flatMap((matcher) =>
				matcher.scanLines(lines, { includeCommentedLines }),
			);

			findings.sort((first, second) => first.line - second.line || first.column - second.column);

			results.push({
				path: entry.path,
				name: entry.file.name,
				sizeBytes: entry.file.size,
				totalLines: lines.length,
				findingCount: findings.length,
				findings,
			});
		}

		return results;
	}
}
