import { Search } from "./Search.js";

export class ExportSearch extends Search {
	constructor(languageSearchModule) {
		super(languageSearchModule, "exports");
	}
}
