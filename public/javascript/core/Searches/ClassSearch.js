import { Search } from "./Search.js";

export class classSearch extends Search {
	constructor(languageSearchModule) {
		super(languageSearchModule, "classes");
	}

	search(file) {
		return this.parserModule.parseExports(file.source);
	}
}
