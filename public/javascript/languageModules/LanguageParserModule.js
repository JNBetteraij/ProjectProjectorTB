export class LanguageParserModule {
	/** @returns {readonly string[]} */
	get fileExtensions() {
		return this.constructor.fileExtensions;
	}

	/** @returns {Readonly Map<Function, Function>} */
	get supportedSearches() {
		return this.constructor.supportedSearches;
	}

	parse() {
		throw new TypeError(`${this.constructor.name} must implement parse().`);
	}

	resolveImportPath() {
		throw new TypeError(`${this.constructor.name} must implement resolveImportPath().`);
	}
}
