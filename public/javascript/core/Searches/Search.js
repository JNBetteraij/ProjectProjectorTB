export class Search {
	constructor(languageParserModule, key) {
		const searchType = this.constructor;
		if (!languageParserModule.supportedSearches.has(searchType)) {
			throw new TypeError(`The language implementation does not support ${key} searches.`);
		}
		/** @type {import("../../languageModules/LanguageParserModule.js").LanguageParserModule} */
		this.parserModule = languageParserModule;
		this.resultKey = key;
	}

	search(file) {
		return this.scan(file);
	}

	scan(file) {
		return this.parserModule.parse(file, this);
	}
}
