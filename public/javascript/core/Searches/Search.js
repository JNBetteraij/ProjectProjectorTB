export class Search {
	constructor(languageParserModule, key) {
		const searchType = this.constructor;
		if (!languageParserModule.supportedSearches.has(searchType)) {
			throw new TypeError(`The language implementation does not support ${key} searches.`);
		}
		this.parserModule = languageParserModule;
		this.parser = languageParserModule.supportedSearches.get(searchType);
		this.resultKey = key;
	}

	search(file) {
		return this.scan(file);
	}

	scan(file) {
		return this.parser(file.source);
	}
}
