import { JavaScriptAnalyzer } from "../languages/javascript/JavaScriptAnalyzer.js";

export class ProjectScanner {
	constructor({ languageAnalyzer = new JavaScriptAnalyzer() } = {}) {
		this.languageAnalyzer = languageAnalyzer;
	}

	async scan(fileEntries) {
		const files = [];
		for await (const entry of fileEntries) {
			const analysis = this.languageAnalyzer.analyze(entry.source);
			files.push({
				id: files.length + 1,
				path: entry.path,
				name: entry.file.name,
				sizeBytes: entry.file.size,
				linkedScopes: [],
				exports: analysis.exports,
				imports: analysis.imports,
			});
		}
		return files;
	}
}
