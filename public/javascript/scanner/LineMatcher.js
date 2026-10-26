export class LineMatcher {
	constructor(name) {
		if (new.target === LineMatcher) {
			throw new TypeError("LineMatcher is an abstract base class.");
		}

		this.name = name;
		this.regexTemplate = null;
	}

	getRegex() {
		throw new Error("A LineMatcher subclass must implement getRegex().");
	}

	parseMatch() {
		throw new Error("A LineMatcher subclass must implement parseMatch().");
	}

	findMatches(line, lineNumber, commentState) {
		if (!this.regexTemplate) this.regexTemplate = this.getRegex();
		const regexTemplate = this.regexTemplate;
		const flags = regexTemplate.flags.includes("g") ? regexTemplate.flags : `${regexTemplate.flags}g`;
		const regex = new RegExp(regexTemplate.source, flags);
		const findings = [];
		let match;

		while ((match = regex.exec(line)) !== null) {
			const matchedComment = commentState.commentRanges.find(
				(range) => match.index >= range.start && match.index < range.end,
			);
			const matchCommentState = {
				...commentState,
				lineIsCommented: Boolean(matchedComment),
				commentType: matchedComment?.type || null,
			};

			findings.push({
				line: lineNumber,
				column: match.index + 1,
				match: match[0],
				matcher: this.name,
				lineText: line.trim(),
				commentedOut: matchCommentState.lineIsCommented,
				commentType: matchCommentState.commentType,
				commentStatus: matchCommentState.lineIsCommented ? "commented" : "not-commented",
				context: line.trim(),
				details: this.parseMatch(match, line, lineNumber, matchCommentState),
			});

			if (match[0] === "") regex.lastIndex++;
		}

		return findings;
	}

	scanLines(lines) {
		const findings = [];
		let inBlockComment = false;

		lines.forEach((line, index) => {
			const commentState = LineMatcher.getCommentStateForLine(line, inBlockComment);
			inBlockComment = commentState.inBlockCommentAfter;
			findings.push(...this.findMatches(line, index + 1, commentState));
		});

		return findings;
	}

	static getCommentStateForLine(line, wasInBlockComment) {
		let inBlockComment = wasInBlockComment;
		let sawComment = wasInBlockComment;
		let blockCommentStart = wasInBlockComment ? 0 : -1;
		const commentRanges = [];
		let hasCode = false;
		let quote = null;
		let escaped = false;

		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			const next = line[i + 1];

			if (inBlockComment) {
				sawComment = true;
				if (ch === "*" && next === "/") {
					inBlockComment = false;
					commentRanges.push({ start: blockCommentStart, end: i + 2, type: "block" });
					blockCommentStart = -1;
					i++;
				}
				continue;
			}

			if (quote) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === quote) quote = null;
				continue;
			}

			if (ch === '"' || ch === "'" || ch === "`") {
				quote = ch;
				hasCode = true;
				continue;
			}

			if (ch === "/" && next === "/") {
				commentRanges.push({ start: i, end: line.length, type: "line" });
				return {
					lineIsCommented: !hasCode,
					commentType: !hasCode ? "line" : null,
					inBlockCommentAfter: false,
					commentRanges,
				};
			}

			if (ch === "/" && next === "*") {
				sawComment = true;
				inBlockComment = true;
				blockCommentStart = i;
				i++;
				continue;
			}

			if (!/\s/.test(ch)) hasCode = true;
		}

		return {
			lineIsCommented: sawComment && !hasCode,
			commentType: sawComment && !hasCode ? commentRanges[0]?.type || "block" : null,
			inBlockCommentAfter: inBlockComment,
			commentRanges: inBlockComment
				? [...commentRanges, { start: blockCommentStart, end: line.length, type: "block" }]
				: commentRanges,
		};
	}
}
