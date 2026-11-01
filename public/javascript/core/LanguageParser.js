export class LanguageParser {
	constructor() {
		this.fileExtensions = [];
		this.supportedSearches = new Map();
	}

	parse() {
		throw new TypeError(`${this.constructor.name} must implement parse().`);
	}

	resolveImportPath() {
		throw new TypeError(`${this.constructor.name} must implement resolveImportPath().`);
	}
}
