import { ExportSearch } from "../../core/Searches/ExportSearch.js";
import { ImportSearch } from "../../core/Searches/ImportSearch.js";
import { LanguageParserModule } from "../LanguageParserModule.js";
import { brackets, closingBrackets, openingBrackets, operators, operatorStarts, separators } from "./definitions.js";

/** @typedef {new (...args: any[]) => import("../../core/Searches/Search.js").Search} SearchClass */

export class JavaScriptParser extends LanguageParserModule {
	/** @type {readonly string[]} */
	static fileExtensions = Object.freeze([".js", ".jsx", ".mjs", ".cjs"]);

	/** @type {readonly Map<typeof import("../../core/Searches/Search.js").Search, Function>} */
	static supportedSearches = new Map([
		[ImportSearch, findImports],
		[ExportSearch, findExports],
	]);

	/** @type {Set<string>} */
	static statementKeywords = new Set([
		"import",
		"export",
		"class",
		"function",
		"async",
		"let",
		"var",
		"if",
		"const",
		"return",
	]);

	parse(file, search) {
		const find = this.supportedSearches.get(search.constructor);

		const tokens = this.getTokens(file);
		return find(tokens, findDeclarationTypes(tokens));
	}

	resolveImportPath(importerPath, source, filePaths) {
		return resolveImportPath(importerPath, source, new Set(filePaths), this.fileExtensions);
	}

	tokenize(file) {
		const tokens = tokenize(file);
		// console.log(file.name);
		// console.log(tokens);

		return tokens;
	}
}

function resolveImportPath(importerPath, source, filePaths, extensions) {
	const normalizedSource = source.replaceAll("\\", "/");
	const isAbsolute = normalizedSource.startsWith("/");
	if (!isAbsolute && !normalizedSource.startsWith(".")) return { path: null, status: "external" };
	const directory = isAbsolute ? [] : importerPath.split("/").slice(0, -1);
	const segments = [...directory, ...normalizedSource.split("/")];
	const normalized = [];
	for (const segment of segments) {
		if (!segment || segment === ".") continue;
		if (segment === "..") normalized.pop();
		else normalized.push(segment);
	}

	const base = normalized.join("/");
	const candidates = [base];
	if (!/\.[^/]+$/.test(base)) {
		for (const extension of extensions) candidates.push(`${base}${extension}`);
		for (const extension of extensions) candidates.push(`${base}/index${extension}`);
	}
	const exactMatch = candidates.find((candidate) => filePaths.has(candidate));
	if (exactMatch) return { path: exactMatch, status: "resolved" };
	if (!isAbsolute) return { path: null, status: "unresolved" };

	const suffixMatches = new Set();
	for (const candidate of candidates) {
		for (const filePath of filePaths) {
			if (pathsMatchBySuffix(filePath, candidate)) suffixMatches.add(filePath);
		}
	}
	if (suffixMatches.size === 1) return { path: suffixMatches.values().next().value, status: "resolved" };
	return {
		path: null,
		status: suffixMatches.size ? "ambiguous" : "unresolved",
	};
}

function pathsMatchBySuffix(filePath, candidate) {
	const fileSegments = filePath.replaceAll("\\", "/").split("/").filter(Boolean);
	const candidateSegments = candidate.split("/").filter(Boolean);
	return hasSuffix(fileSegments, candidateSegments) || hasSuffix(candidateSegments, fileSegments);
}

function hasSuffix(path, suffix) {
	if (suffix.length > path.length) return false;
	return suffix.every((segment, index) => segment === path[path.length - suffix.length + index]);
}

function tokenize(file) {
	const source = file.source;
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
				tokens.push({
					type: "template-text",
					value: source.slice(textStart, index),
					line: textLine,
				});
			}

			// Handle closing backtick
			if (source[index] === backtick) {
				const tokenIndex = tokens.length;
				const openIndex = openTemplates.at(-1).startTokenIndex;

				tokens[openIndex].closedBy = tokenIndex;
				tokens.push({
					type: "template-end",
					value: "`",
					line,
					closes: openIndex,
				});

				index++;
				openTemplates.pop();
				continue;
			}

			// Handle expression start
			if (source[index] === "$" && source[index + 1] === "{") {
				const expressionStartTokenIndex = tokens.length;
				tokens.push({
					type: "template-expression-start",
					value: "${",
					line,
				});

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

			tokens.push({
				type: "comment",
				value: source.slice(commentStart, index),
				line: commentLine,
			});

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

			const token = {
				type: "block-comment",
				value: source.slice(commentStart, index),
				line: commentLine,
			};

			if (!closed) {
				token.error = "Unterminated block comment";
			}

			tokens.push(token);
			continue;
		}

		// Handle template literal start
		if (character === backtick) {
			const tokenIndex = tokens.length;

			tokens.push({
				type: "template-start",
				value: "`",
				line,
			});

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

			const token = {
				type: "string",
				value,
				line: tokenLine,
			};

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

			tokens.push({
				type: "number",
				value: source.slice(start, index),
				line: tokenLine,
			});

			continue;
		}

		// handle identifiers
		if (/[A-Za-z_$]/.test(character)) {
			const tokenLine = line;
			const start = index++;
			while (index < source.length && /[\w$]/.test(source[index])) index++;
			tokens.push({ type: "identifier", value: source.slice(start, index), line: tokenLine });
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
					tokens.push({
						type: "template-expression-end",
						value: "}",
						line,
						closes: expressionStartTokenIndex,
					});

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

			const token = {
				type: "bracket",
				value: character,
				line,
			};

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
			tokens.push({
				type: "separator",
				value: character,
				line,
			});

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

				matchedOperator = {
					type: "operator",
					value,
					category: isAssignment ? "assignment" : operator.category,
					name: isAssignment ? `${operator.name}-assignment` : operator.name,
					line: tokenLine,
				};

				break;
			}

			if (matchedOperator) {
				tokens.push(matchedOperator);
				index += matchedOperator.value.length;
				continue;
			}
		}

		// handles other
		tokens.push({
			type: "other",
			value: character,
			line,
		});
		index++;
	}
	return tokens;

	function consumeLineBreak() {
		const character = source[index];
		if (!isLineBreak(source[index])) return false;

		line++;
		index++;
		if (character === "\r" && source[index] === "\n") index++;
		return true;
	}

	function isLineBreak(character) {
		return ["\n", "\r", "\u2028", "\u2029"].includes(character);
	}
}

function findDeclarationTypes(tokens) {
	const types = new Map();
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token.type !== "identifier") continue;

		if (token.value === "class" && tokens[index + 1]?.type === "identifier") {
			types.set(tokens[index + 1].value, "class");
		}
		if (token.value === "function") {
			const name = getFunctionName(tokens, index);
			if (name) types.set(name, "function");
		}
		if (["const", "let", "var"].includes(token.value)) {
			for (const declaration of readVariableDeclarations(tokens, index)) {
				types.set(declaration.name, declaration.type);
			}
		}
	}
	return types;
}

function readVariableDeclarations(tokens, keywordIndex) {
	const declarations = [];
	let index = keywordIndex + 1;

	while (index < tokens.length && tokens[index].type === "identifier") {
		const name = tokens[index].value;
		index++;
		let expressionStart = -1;
		if (tokens[index]?.value === "=") {
			expressionStart = index + 1;
			index = expressionStart;
		}
		declarations.push({
			name,
			type: expressionStart === -1 ? "variable" : inferValueType(tokens, expressionStart),
		});

		let depth = 0;
		while (index < tokens.length) {
			const value = tokens[index].value;
			if (["[", "{", "("].includes(value)) depth++;
			else if (["]", "}", ")"].includes(value)) depth = Math.max(0, depth - 1);
			if (depth === 0 && (value === ";" || value === ",")) break;
			if (
				depth === 0
				&& index > keywordIndex + 1
				&& tokens[index].line > tokens[index - 1].line
				&& tokens[index].type === "identifier"
				&& JavaScriptParser.statementKeywords.has(value)
			) {
				return declarations;
			}
			index++;
		}
		if (tokens[index]?.value !== ",") break;
		index++;
	}

	return declarations;
}

function inferValueType(tokens, index) {
	while (tokens[index]?.value === "(" && !isArrowFunction(tokens, index)) index++;
	const token = tokens[index];
	if (!token) return "variable";
	if (token.value === "class") return "class";
	if (token.value === "function" || isAsyncFunction(tokens, index) || isArrowFunction(tokens, index)) {
		return "function";
	}
	return "variable";
}

function isAsyncFunction(tokens, index) {
	return tokens[index]?.value === "async" && tokens[index + 1]?.value === "function";
}

function isArrowFunction(tokens, index) {
	if (tokens[index]?.value === "async") index++;
	if (tokens[index]?.type === "identifier" && tokens[index + 1]?.value === "=>") {
		return true;
	}
	if (tokens[index]?.value !== "(") return false;

	let depth = 0;
	for (let cursor = index; cursor < tokens.length; cursor++) {
		if (tokens[cursor].value === "(") depth++;
		else if (tokens[cursor].value === ")") {
			depth--;
			if (depth === 0) return tokens[index + 1]?.value === "=>";
		}
	}
	return false;
}

function getFunctionName(tokens, functionIndex) {
	let cursor = functionIndex + 1;
	if (tokens[cursor]?.value === "*") cursor++;
	return tokens[cursor]?.type === "identifier" ? tokens[cursor].value : null;
}

function findImports(tokens, declarationTypes) {
	const imports = [];
	for (let index = 0; index < tokens.length; index++) {
		const isReExport = tokens[index].value === "export";
		if (!["import", "export"].includes(tokens[index].value) || tokens[index - 1]?.value === ".") continue;
		if (isReExport && tokens[index + 1]?.value !== "*" && tokens[index + 1]?.value !== "{") continue;
		if (!isReExport && tokens[index + 1]?.value === "meta") continue;
		if (tokens[index + 1]?.value === "(" || tokens[index + 1]?.value === ".") continue;

		if (!isReExport && tokens[index + 1]?.type === "string") {
			imports.push({
				source: tokens[index + 1].value,
				path: null,
				items: [],
				reExport: false,
			});
			continue;
		}

		let fromIndex = -1;
		for (let cursor = index + 1; cursor < tokens.length; cursor++) {
			if (tokens[cursor].value === ";") break;
			if (
				cursor > index + 1
				&& tokens[cursor].line > tokens[cursor - 1].line
				&& tokens[cursor].type === "identifier"
				&& JavaScriptParser.statementKeywords.has(tokens[cursor].value)
			) {
				break;
			}
			if (tokens[cursor].value === "from" && tokens[cursor + 1]?.type === "string") {
				fromIndex = cursor;
				break;
			}
		}
		if (fromIndex === -1) continue;

		imports.push({
			source: tokens[fromIndex + 1].value,
			path: null,
			items: readImportItems(tokens.slice(index + 1, fromIndex), declarationTypes),
			reExport: isReExport,
		});
		index = fromIndex + 1;
	}
	return imports;
}

function readImportItems(tokens, declarationTypes) {
	const items = [];
	let index = 0;

	if (tokens[index]?.type === "identifier" && tokens[index].value !== "type") {
		items.push({
			name: "default",
			localName: tokens[index].value,
			type: declarationTypes.get(tokens[index].value) || null,
		});
		index++;
		if (tokens[index]?.value === ",") index++;
	}

	while (index < tokens.length) {
		if (tokens[index].value === "*" && tokens[index + 1]?.value === "as") {
			const localName = tokens[index + 2]?.value;
			if (localName) items.push({ name: "*", localName, type: "namespace" });
			break;
		}
		if (tokens[index].value === "*") {
			items.push({ name: "*", localName: null, type: null });
			break;
		}
		if (tokens[index].value === "{") {
			index++;
			while (index < tokens.length && tokens[index].value !== "}") {
				if (tokens[index].value === ",") {
					index++;
					continue;
				}
				const name = tokens[index++].value;
				let localName = name;
				if (tokens[index]?.value === "as") {
					index++;
					localName = tokens[index++]?.value || name;
				}
				items.push({ name, localName, type: declarationTypes.get(localName) || null });
			}
			break;
		}
		index++;
	}
	return items;
}

function findExports(tokens, declarationTypes) {
	const exports = [];
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index].value !== "export" || tokens[index - 1]?.value === ".") continue;
		let cursor = index + 1;
		if (tokens[cursor]?.value === "default") {
			cursor++;
			const declarationIndex = tokens[cursor]?.value === "async" ? cursor + 1 : cursor;
			if (tokens[declarationIndex]?.value === "class") {
				const localName =
					tokens[declarationIndex + 1]?.type === "identifier"
						? tokens[declarationIndex + 1].value
						: undefined;
				exports.push({ name: "default", type: "class", ...(localName && { localName }) });
			} else if (tokens[declarationIndex]?.value === "function") {
				const localName = getFunctionName(tokens, declarationIndex);
				exports.push({ name: "default", type: "function", ...(localName && { localName }) });
			} else if (isArrowFunction(tokens, cursor)) {
				exports.push({ name: "default", type: "function" });
			} else if (tokens[cursor]) {
				const localName = tokens[cursor].type === "identifier" ? tokens[cursor].value : undefined;
				exports.push({
					name: "default",
					type: declarationTypes.get(localName) || inferValueType(tokens, cursor),
					...(localName && { localName }),
				});
			}
			continue;
		}

		const declarationKeyword = tokens[cursor]?.value;
		if (["const", "let", "var"].includes(declarationKeyword)) {
			exports.push(...readVariableDeclarations(tokens, cursor));
			continue;
		}
		if (declarationKeyword === "class" && tokens[cursor + 1]?.type === "identifier") {
			exports.push({ name: tokens[cursor + 1].value, type: "class" });
			continue;
		}
		const functionIndex = declarationKeyword === "async" ? cursor + 1 : cursor;
		if (tokens[functionIndex]?.value === "function") {
			const name = getFunctionName(tokens, functionIndex);
			if (name) exports.push({ name, type: "function" });
			continue;
		}
		if (tokens[cursor]?.value === "{") {
			cursor++;
			while (cursor < tokens.length && tokens[cursor].value !== "}") {
				if (tokens[cursor].value === ",") {
					cursor++;
					continue;
				}
				const localName = tokens[cursor++].value;
				let name = localName;
				if (tokens[cursor]?.value === "as") {
					cursor++;
					name = tokens[cursor++]?.value || localName;
				}
				exports.push({ name, type: declarationTypes.get(localName) || "unknown" });
			}
			continue;
		}
		if (tokens[cursor]?.value === "*" && tokens[cursor + 1]?.value === "as") {
			const name = tokens[cursor + 2]?.value;
			if (name) exports.push({ name, type: "namespace" });
			continue;
		}
		if (tokens[cursor]?.value === "*" && tokens[cursor + 1]?.value === "from") {
			exports.push({ name: "*", type: "unknown" });
		}
	}
	return deduplicateExports(exports);
}

function deduplicateExports(exports) {
	const byName = new Map();
	for (const exported of exports) byName.set(exported.name, exported);
	return [...byName.values()];
}
