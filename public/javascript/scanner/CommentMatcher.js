import { LineMatcher } from "./LineMatcher.js";

export class CommentMatcher extends LineMatcher {
	constructor(pattern, name = "Comment/code search") {
		const source = pattern.trim();
		if (!source) throw new Error("Enter a regular expression.");

		const regex = new RegExp(source, "g");
		super(name);
		this.regex = regex;
	}

	getRegex() {
		return this.regex;
	}

	parseMatch(match, line, lineNumber, commentState) {
		return {
			lineNumber,
			match: match[0],
			classification: commentState.lineIsCommented ? "commented" : "not-commented",
			commentType: commentState.lineIsCommented ? commentState.commentType : null,
			lineText: line.trim(),
		};
	}
}
