import { LineMatcher } from "./LineMatcher.js";

export class ConsoleMatcher extends LineMatcher {
	constructor() {
		super("Console");
	}

	getRegex() {
		return /\bconsole\s*\.\s*[A-Za-z_$][\w$]*/;
	}

	parseMatch(match, line) {
		return {
			statement: match[0],
			lineText: line.trim(),
		};
	}
}
