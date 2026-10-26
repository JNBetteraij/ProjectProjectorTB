import { LineMatcher } from "./LineMatcher.js";

export class ExportMatcher extends LineMatcher {
	constructor() {
		super("Export");
	}

	getRegex() {
		return /\bexport\b.*$/;
	}

	parseMatch(match) {
		const statement = match[0].trim();
		const declaration = statement.replace(/^export\s+/, "");

		return {
			kind: declaration.startsWith("default ") ? "default" : "named",
			declaration,
			statement,
		};
	}
}
