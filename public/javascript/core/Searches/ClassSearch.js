import { Search } from "./Search.js";

//#region Class declaration search

/** Search a parsed file for its class declarations. */
export class ClassSearch extends Search {
	static nextId = 0;

	/**
	 * Create the class declaration search for the selected language parser.
	 *
	 * @param {import("../../languageModules/LanguageParserModule.js").LanguageParserModule} languageParserModule Parser used to analyze source files.
	 * @returns {void} No value is returned.
	 */
	constructor(languageParserModule) {
		super(languageParserModule, "classes");
	}
}

//#endregion Class declaration search
