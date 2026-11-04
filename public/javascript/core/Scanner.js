//TODO seperate this into a text scanner and a seperate file analyzer that handles the parsing of the file.

export class Scanner {
	constructor(searches) {
		if (!Array.isArray(searches)) {
			throw new TypeError("Search strategies must be provided as an array.");
		}
		const resultKeys = new Set();
		for (const search of searches) {
			if (
				!search
				|| typeof search.search !== "function"
				|| typeof search.resultKey !== "string"
				|| !search.resultKey
			) {
				throw new TypeError("Each search strategy must provide a resultKey and search method.");
			}
			if (
				["id", "path", "name", "sizeBytes", "source", "constructor", "prototype"].includes(search.resultKey)
				|| search.resultKey === "__proto__"
			) {
				throw new TypeError(`The result key "${search.resultKey}" is reserved for file metadata.`);
			}
			if (resultKeys.has(search.resultKey)) {
				throw new TypeError(`Multiple search strategies use the result key "${search.resultKey}".`);
			}
			resultKeys.add(search.resultKey);
		}
		this.searches = [...searches];
	}

	scan(files) {
		for (const file of files) {
			for (const search of this.searches) {
				file[search.resultKey] = search.search(file, files);
			}
		}
		for (const file of files) {
			delete file.source;
		}
		return files;
	}
}
