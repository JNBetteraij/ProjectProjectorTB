/** @typedef {new (...args: any[]) => import("../core/Searches/Search.js").Search} SearchClass */

export class LanguageParserModule {
	/** @returns {readonly string[]} */
	get fileExtensions() {
		return this.constructor.fileExtensions;
	}

	/** @returns {Map<SearchClass, Function>} */
	get supportedSearches() {
		return this.constructor.supportedSearches;
	}

	parse() {
		throw new TypeError(`${this.constructor.name} must implement parse().`);
	}

	resolveImportPath() {
		throw new TypeError(`${this.constructor.name} must implement resolveImportPath().`);
	}

	parseSyntax(file) {
		if (file.syntax) return file.syntax;

		const tokens = this.getTokens(file);

		file.syntax = this.buildSyntaxTree(tokens);
		return file.syntax;
	}

	getTokens(file) {
		if (file.tokens) return file.tokens;

		const tokens = this.tokenize(file);

		//cache tokens on file
		file.tokens = tokens;
		return tokens;
	}

	tokenize(file) {
		throw new TypeError(`${this.constructor.name} must implement tokenize().`);
	}
}
