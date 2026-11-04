import { Search } from "./Search.js";

export class ExportSearch extends Search {
	constructor(languageParserModule) {
		super(languageParserModule, "exports");
	}
}
