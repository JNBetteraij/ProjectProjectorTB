import { LineMatcher } from "./LineMatcher.js";

export class ImportMatcher extends LineMatcher {
	constructor() {
		super("Import");
	}

	getRegex() {
		return /\bimport\b.*$/;
	}

	parseMatch(match) {
		const statement = match[0].trim();
		const modulePath = statement.match(/\bfrom\s*(['"])(.*?)\1|^\s*import\s*(['"])(.*?)\3/);

		return {
			kind: /^import\s*\(/.test(statement)
				? "dynamic"
				: /^import\s*\./.test(statement)
					? "meta"
					: /^import\s*['"]/.test(statement)
						? "side-effect"
						: "declaration",
			module: modulePath ? modulePath[2] || modulePath[4] : null,
			statement,
		};
	}
}
