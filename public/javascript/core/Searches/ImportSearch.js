import { Search } from "./Search.js";

export class ImportSearch extends Search {
	constructor(languageSearchModule) {
		super(languageSearchModule, "imports");

		if (typeof languageSearchModule.resolveImportPath !== "function") {
			throw new TypeError("The language parse module must provide import path resolution.");
		}
	}

	search(file, files) {
		const filesByPath = new Map(files.map((candidate) => [candidate.path.full, candidate]));
		const filePaths = [...filesByPath.keys()];
		return this.scan(file).map((imported) => {
			const resolution = this.parserModule.resolveImportPath(file.path.full, imported.source, filePaths);
			return {
				...imported,
				path: resolution.path,
				status: resolution.status,
				sourceFile: resolution.path ? filesByPath.get(resolution.path) : undefined,
			};
		});
	}
}
