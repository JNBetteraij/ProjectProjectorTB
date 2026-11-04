import { Token } from "../Token.js";
import { Tokenizer } from "../Tokenizer.js";
import { brackets, closingBrackets, openingBrackets, operators, operatorStarts, separators } from "./definitions.js";

/** @typedef {import("../Token.js").Token} Token */

/** Tokenize JavaScript source text into a sequence of tokens. */
function tokenizeJavaScript(source) {
	const tokens = [];
	let line = 1;
	let index = 0;

	const openBrackets = [];
	const openTemplates = [];
	const backtick = "`";

	while (index < source.length) {
		const character = source[index];
		const next = source[index + 1];

		// Handle template literal body and end
		const template = openTemplates.at(-1);
		if (template && !template.inExpression) {
			const textStart = index;
			const textLine = line;

			// Run until end of text
			while (index < source.length) {
				const current = source[index];

				// Handle escaped characters
				if (current === "\\") {
					index++;

					if (index < source.length) {
						if (!consumeLineBreak()) index++;
					}

					continue;
				}

				// Handle line breaks
				if (consumeLineBreak()) {
					continue;
				}

				// Break at expression or closing backtick
				if (current === backtick || (current === "$" && source[index + 1] === "{")) {
					break;
				}

				index++;
			}

			// handle template closing

			// Add template text token
			if (index > textStart) {
				tokens.push(new Token("template-text", source.slice(textStart, index), textLine));
			}

			// Handle closing backtick
			if (source[index] === backtick) {
				const tokenIndex = tokens.length;
				const openIndex = openTemplates.at(-1).startTokenIndex;

				tokens[openIndex].closedBy = tokenIndex;
				tokens.push(new Token("template-end", "`", line, { closes: openIndex }));

				index++;
				openTemplates.pop();
				continue;
			}

			// Handle expression start
			if (source[index] === "$" && source[index + 1] === "{") {
				const expressionStartTokenIndex = tokens.length;
				tokens.push(new Token("template-expression-start", "${", line));

				index += 2;

				template.inExpression = true;
				template.braceDepth = 0;
				template.expressionStartTokenIndex = expressionStartTokenIndex;

				continue;
			}

			// handle end of source
			if (index >= source.length) {
				tokens.at(-1).error = "Unterminated template literal string";
			}
			break;
		}

		// handle line breaks
		if (consumeLineBreak()) {
			continue;
		}

		// handle whitespace characters
		if (/\s/.test(character)) {
			index++;
			continue;
		}

		// Handle line comments
		if (character === "/" && next === "/") {
			const commentLine = line;
			const commentStart = index;

			index += 2;

			while (index < source.length && !isLineBreak(source[index])) {
				index++;
			}

			tokens.push(new Token("comment", source.slice(commentStart, index), commentLine));

			continue;
		}

		// Handle block comments
		if (character === "/" && next === "*") {
			const commentLine = line;
			const commentStart = index;

			index += 2;
			let closed = false;

			while (index < source.length) {
				if (source[index] === "*" && source[index + 1] === "/") {
					index += 2;
					closed = true;
					break;
				}

				if (!consumeLineBreak()) {
					index++;
				}
			}

			const token = new Token("block-comment", source.slice(commentStart, index), commentLine);

			if (!closed) {
				token.error = "Unterminated block comment";
			}

			tokens.push(token);
			continue;
		}

		// Handle template literal start
		if (character === backtick) {
			const tokenIndex = tokens.length;

			tokens.push(new Token("template-start", "`", line));

			openTemplates.push({
				inExpression: false,
				braceDepth: 0,
				startTokenIndex: tokenIndex,
			});

			index++;
			continue;
		}

		// handle single and double-quoted strings
		if (character === "'" || character === '"') {
			const quote = character;
			const tokenLine = line;

			index++;
			let value = "";
			let closed = false;
			let error = null;

			while (index < source.length) {
				const current = source[index];

				// Handle escaped characters
				if (current === "\\") {
					value += current;
					index++;

					if (index >= source.length) break;

					const escaped = source[index];

					// Handle escaped line breaks
					if (isLineBreak(escaped)) {
						value += escaped;
						line++;

						if (escaped === "\r" && source[index + 1] === "\n") {
							value += "\n";
							index++;
						}
					} else {
						value += escaped;
					}

					index++;
					continue;
				}

				// Handle closing quote
				if (current === quote) {
					closed = true;
					index++;
					break;
				}

				// Handle invalid literal line breaks
				if (isLineBreak(current)) {
					error = "Unescaped line break in string";
					break;
				}

				value += current;
				index++;
			}

			const token = new Token("string", value, tokenLine);

			if (error) {
				token.error = error;
			} else if (!closed) {
				token.error = "Unterminated string";
			}

			tokens.push(token);
			continue;
		}

		// handle numbers
		if (/[0-9]/.test(character)) {
			const tokenLine = line;
			const start = index;

			// Integer / decimal part
			while (index < source.length && /[0-9]/.test(source[index])) {
				index++;
			}

			// Decimal part
			if (source[index] === "." && /[0-9]/.test(source[index + 1])) {
				index++;

				while (index < source.length && /[0-9]/.test(source[index])) {
					index++;
				}
			}

			// Exponent: 1e10, 2E-3, etc.
			if (source[index] === "e" || source[index] === "E") {
				let exponentIndex = index + 1;

				if (source[exponentIndex] === "+" || source[exponentIndex] === "-") {
					exponentIndex++;
				}

				if (/[0-9]/.test(source[exponentIndex])) {
					index = exponentIndex;

					while (index < source.length && /[0-9]/.test(source[index])) {
						index++;
					}
				}
			}

			tokens.push(new Token("number", source.slice(start, index), tokenLine));

			continue;
		}

		// handle identifiers
		if (/[A-Za-z_$]/.test(character)) {
			const tokenLine = line;
			const start = index++;
			while (index < source.length && /[\w$]/.test(source[index])) index++;
			tokens.push(new Token("identifier", source.slice(start, index), tokenLine));
			continue;
		}

		// Handle template expression
		const activeTemplate = openTemplates.at(-1);
		if (activeTemplate?.inExpression) {
			// Handle nested opening curly braces
			if (character === "{") {
				activeTemplate.braceDepth++;
			}

			// Handle closing curly braces
			else if (character === "}") {
				// End of template expression
				if (activeTemplate.braceDepth === 0) {
					const tokenIndex = tokens.length;
					const expressionStartTokenIndex = activeTemplate.expressionStartTokenIndex;

					tokens[expressionStartTokenIndex].closedBy = tokenIndex;
					tokens.push(new Token("template-expression-end", "}", line, { closes: expressionStartTokenIndex }));

					activeTemplate.inExpression = false;
					activeTemplate.expressionStartTokenIndex = null;
					index++;
					continue;
				}

				// Closing a nested curly brace
				activeTemplate.braceDepth--;
			}
		}

		//handle brackets
		if (brackets.has(character)) {
			const tokenIndex = tokens.length;

			const token = new Token("bracket", character, line);

			tokens.push(token);
			index++;

			//handle opening brackets
			if (openingBrackets.has(character)) {
				openBrackets.push(tokenIndex);
				continue;
			}

			//handle closing brackets
			const startingBracketIndex = openBrackets.at(-1);

			if (startingBracketIndex === undefined) {
				token.error = "Unexpected closing bracket";
				continue;
			}

			const startingBracket = tokens[startingBracketIndex];
			const expectedBracket = closingBrackets[startingBracket.value];
			if (character !== expectedBracket) {
				token.error = `Mismatched closing bracket. Expected "${expectedBracket}" but encountered "${character}"`;
				continue;
			}

			//pair opening and closing brackets
			token.closes = startingBracketIndex;
			startingBracket.closedBy = tokenIndex;

			openBrackets.pop();
			continue;
		}

		// handle seperators
		if (separators.has(character)) {
			tokens.push(new Token("separator", character, line));

			index++;
			continue;
		}

		// handles operators
		if (operatorStarts.has(character)) {
			const tokenLine = line;
			let matchedOperator = null;

			for (const operator of operators) {
				if (!source.startsWith(operator.value, index)) continue;

				if (operator.validate && !operator.validate(source, index)) {
					continue;
				}

				let value = operator.value;

				// handles assignment operator
				const isAssignment = operator.assignable && source[index + operator.length] === "=";

				if (isAssignment) {
					value += "=";
				}

				matchedOperator = new Token("operator", value, tokenLine, {
					category: isAssignment ? "assignment" : operator.category,
					name: isAssignment ? `${operator.name}-assignment` : operator.name,
				});

				break;
			}

			if (matchedOperator) {
				tokens.push(matchedOperator);
				index += matchedOperator.value.length;
				continue;
			}
		}

		// handles other
		tokens.push(new Token("other", character, line));
		index++;
	}
	return tokens;

	/** Handle a line break and update the current source line.
	 *
	 * @returns {boolean} Whether a line break was consumed.
	 */
	function consumeLineBreak() {
		const character = source[index];
		if (!isLineBreak(source[index])) return false;

		line++;
		index++;
		if (character === "\r" && source[index] === "\n") index++;
		return true;
	}

	/** Check whether a character is one of JavaScript's line terminators.
	 *
	 * @param {string | undefined} character Character to check.
	 * @returns {boolean} Whether the character is a line terminator.
	 */
	function isLineBreak(character) {
		return ["\n", "\r", "\u2028", "\u2029"].includes(character);
	}
}

/** JavaScript tokenizer using the shared tokenizer interface. */
export const JavaScriptTokenizer = new Tokenizer(tokenizeJavaScript);
