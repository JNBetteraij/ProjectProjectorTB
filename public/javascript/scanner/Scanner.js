export class Scanner {
	async scan(fileEntries, matchers) {
		const results = [];

		for await (const entry of fileEntries) {
			const lines = entry.source.split(/\r?\n/);
			const findings = matchers.flatMap((matcher) => matcher.scanLines(lines));

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
