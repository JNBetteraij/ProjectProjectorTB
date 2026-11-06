import { ExportSearch } from "../../core/Searches/ExportSearch.js";
import { ImportSearch } from "../../core/Searches/ImportSearch.js";
import { LanguageParserModule } from "../LanguageParserModule.js";
import {
	brackets,
	closingBrackets,
	numericPrefix,
	numericSuffix,
	numericTypes,
	openingBrackets,
	operatorPrecedence,
	operators,
	operatorStarts,
	separators,
} from "./definitions.js";

/** @typedef {new (...args: any[]) => import("../../core/Searches/Search.js").Search} SearchClass */

//#region Parser module
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

		this.parseSyntax(file);
		const tokens = this.getTokens(file);

		return find(tokens, findDeclarationTypes(tokens));
	}

	resolveImportPath(importerPath, source, filePaths) {
		return resolveImportPath(importerPath, source, new Set(filePaths), this.fileExtensions);
	}

	tokenize(file) {
		const tokens = tokenize(file);
		console.log(file.name);
		console.log(tokens);

		return tokens;
	}

	buildSyntaxTree(tokens) {
		const syntax = parseTokens(tokens);
		console.log(syntax);

		return syntax;
	}
}
//#endregion

//#region Import path resolution
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
//#endregion

//#region Tokenizer
function tokenize(file) {
	const source = file.source;
	const tokens = [];
	let line = 1;
	let index = 0;

	const openBrackets = [];
	const openTemplates = [];
	const backtick = "`";

	while (!endOfSource(index)) {
		const character = source[index];
		const next = source[index + 1];

		// Handle template literal body and end
		const template = openTemplates.at(-1);
		if (template && !template.inExpression) {
			const textStart = index;
			const textLine = line;

			// Run until end of text
			while (!endOfSource(index)) {
				const current = source[index];

				// Handle escaped characters
				if (current === "\\") {
					index++;

					if (!endOfSource(index)) {
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
			if (endOfSource(index)) {
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

			while (!endOfSource(index) && !isLineBreak(source[index])) {
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

			while (!endOfSource(index)) {
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

			while (!endOfSource(index)) {
				const current = source[index];

				// Handle escaped characters
				if (current === "\\") {
					value += current;
					index++;

					if (endOfSource(index)) break;

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

		// Handle numbers
		if (/[0-9]/.test(character) || (character === "." && !endOfSource(index) && /[0-9]/.test(next))) {
			const tokenLine = line;
			const start = index;

			let syntax = numericTypes.integer;
			let prefix = undefined;
			// Handle leading-dot (.5, .25, etc.)
			if (numericPrefix[source[index]]) {
				syntax = numericTypes.fraction;
				index++;
			} else {
				// Handle hexadecimal, binary, and octal prefixes (0x, 0b, 0o)
				prefix = numericPrefix[source.slice(index, index + 2).toLowerCase()];
				if (prefix) index += 2;

				syntax = prefix ?? syntax;
			}

			while (!endOfSource(index) && syntax.digits.test(source[index])) {
				if (syntax === numericTypes.integer) {
					// Handle decimal point
					if (source[index] === ".") {
						if (!endOfSource(index) && numericTypes.decimal.digits.test(source[index + 1])) {
							index++;
							syntax = numericTypes.decimal;
							continue;
						}
						break;
					}
				}
				if (
					syntax === numericTypes.integer
					|| syntax === numericTypes.decimal
					|| syntax === numericTypes.fraction
				) {
					// Handle exponents (1e10, 2E-3, 1.5e+2, etc.)
					if (source[index].toLowerCase() === "e") {
						let exponentIndex = index + 1;

						if (source[exponentIndex] === "+" || source[exponentIndex] === "-") {
							exponentIndex++;
						}

						if (/[0-9]/.test(source[exponentIndex] || "")) {
							index = exponentIndex + 1;
							syntax = numericTypes.exponent;
							continue;
						} else {
							break;
						}
					}
				}

				index++;
			}

			// Handle BigInt suffix (123n, 0xFFn, etc.)
			const suffix = numericSuffix[source[index]];
			if (suffix) index++;

			// Create number token
			tokens.push({
				type: "number",
				value: source.slice(start, index),
				line: tokenLine,
				syntax,
				prefix,
				suffix,
			});

			continue;
		}

		// Handle private elements
		if (character === "#" && !endOfSource(index) && /[A-Za-z_$]/.test(next)) {
			const tokenLine = line;
			const start = index++;
			while (!endOfSource(index) && /[\w$]/.test(source[index])) index++;
			tokens.push({ type: "private-identifier", value: source.slice(start, index), line: tokenLine });
			continue;
		}

		// handle identifiers
		if (/[A-Za-z_$]/.test(character)) {
			const tokenLine = line;
			const start = index++;
			while (!endOfSource(index) && /[\w$]/.test(source[index])) index++;
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

	function endOfSource(index) {
		return index >= source.length;
	}
}
//#endregion

//#region Syntax tree model and parser
/**
 * A relationship edge between syntax nodes. `targetId` refers to another node's stable `id`.
 *
 * @typedef {object} SyntaxNodeRelationship
 * @property {string} type Relationship kind, such as `contains`, `calls`, or `extends`.
 * @property {number} targetId ID of the related syntax node.
 * @property {string} [role] Child role for `contains` relationships.
 */

/**
 * Base shape shared by all nodes returned from {@link JavaScriptParser.buildSyntaxTree}.
 * Syntax-specific fields (such as `body`, `params`, and `operator`) are added by the parser.
 *
 * @property {string} type Node kind, for example `FunctionDeclaration` or `BinaryExpression`.
 * @property {number} id Stable, tree-local node identifier.
 * @property {number|null} startToken Index of the first token belonging to this node.
 * @property {number|null} endToken Index of the last token belonging to this node.
 * @property {number|null} startLine Source line of the first token.
 * @property {number|null} endLine Source line of the last token.
 * @property {SyntaxTreeNode[]} children Direct AST children in source/structural order.
 * @property {SyntaxNodeRelationship[]} relationships Typed edges to child or related nodes.
 */
export class SyntaxTreeNode {
	/**
	 * @param {string} type AST node kind.
	 * @param {number|null} [startToken] Index of the first token.
	 * @param {Record<string, any>} [properties] Node-specific fields.
	 */
	constructor(type, startToken = null, properties = {}) {
		this.type = type;
		this.startToken = startToken;
		this.endToken = startToken;
		this.startLine = null;
		this.endLine = null;
		this.relationships = [];
		Object.defineProperty(this, "children", { value: [], writable: true });
		Object.assign(this, properties);
	}
}

/** Parse tokenizer output into a syntax node tree.
 * Comments remain in the token stream for source indexing but are skipped by the parser cursor.
 *
 * @param {Array<{type: string, value: string, line: number}>} tokens
 * @returns {SyntaxTreeNode}
 */
function parseTokens(tokens) {
	return new JavaScriptSyntaxTreeParser(tokens).parse();
}

/**
 * Recursive-descent statement parser with precedence-climbing expression parsing.
 *
 * @param {Array<{type: string, value: string, line: number}>} tokens
 */
class JavaScriptSyntaxTreeParser {
	//#region file and statements
	constructor(tokens) {
		this.tokens = tokens;
		this.index = 0;
		this.lastIndex = null;
		this.nextNodeId = 0;
	}

	parse() {
		const file = this.createNode("File", 0, { body: [], sourceType: "module" });
		while (!this.atEnd()) {
			const start = this.index;
			const statement = this.parseStatement();
			if (statement) this.addChild(file, statement, "body");
			if (this.index === start) this.advance();
		}
		return this.finish(file);
	}

	parseStatement() {
		const token = this.lookAhead();
		if (!token) return null;
		if (token.value === ";") {
			const node = this.createNode("EmptyStatement");
			this.advance();
			return this.finish(node);
		}
		if (token.value === "{") return this.parseBlock();
		if (token.value === "import" && !["(", "."].includes(this.lookAhead(1)?.value))
			return this.parseImportDeclaration();
		if (token.value === "export") return this.parseExportDeclaration();
		if (token.value === "async" && this.lookAhead(1)?.value === "function") return this.parseFunction(true);
		if (token.value === "function") return this.parseFunction(false);
		if (token.value === "class") return this.parseClass();
		if (["const", "let", "var"].includes(token.value)) return this.parseVariableDeclaration(true);
		if (token.value === "if") return this.parseIfStatement();
		if (token.value === "for") return this.parseForStatement();
		if (token.value === "while") return this.parseWhileStatement();
		if (token.value === "do") return this.parseDoWhileStatement();
		if (token.value === "return") return this.parseJumpStatement("ReturnStatement");
		if (token.value === "break") return this.parseJumpStatement("BreakStatement");
		if (token.value === "continue") return this.parseJumpStatement("ContinueStatement");
		if (token.value === "throw") return this.parseThrowStatement();
		if (token.value === "try") return this.parseTryStatement();
		if (token.value === "switch") return this.parseSwitchStatement();
		if (token.value === "with") return this.parseWithStatement();
		if (token.value === "debugger") {
			const node = this.createNode("DebuggerStatement");
			this.advance();
			this.consumeSemicolon();
			return this.finish(node);
		}
		if (token.type === "identifier" && this.lookAhead(1)?.value === ":") return this.parseLabeledStatement();

		const node = this.createNode("ExpressionStatement");
		node.expression = this.parseExpression();
		this.addChild(node, node.expression, "expression");
		this.consumeSemicolon();
		return this.finish(node);
	}

	parseBlock() {
		const node = this.createNode("BlockStatement", this.index, { body: [] });
		this.advance();
		while (!this.atEnd() && this.lookAhead()?.value !== "}") {
			const start = this.index;
			const statement = this.parseStatement();
			if (statement) this.addChild(node, statement, "body");
			if (start === this.index) this.advance();
		}
		this.match("}");
		return this.finish(node);
	}

	parseImportDeclaration() {
		const node = this.createNode("ImportDeclaration", this.index, {
			specifiers: [],
			source: null,
			importKind: "value",
		});
		this.advance();
		if (this.lookAhead()?.type === "string") {
			node.source = this.parseLiteral();
			this.addChild(node, node.source, "source");
		} else {
			if (this.lookAhead()?.type === "identifier" && this.lookAhead()?.value !== "from") {
				const specifier = this.createNode("ImportDefaultSpecifier", this.index, {
					local: this.parseIdentifier(),
				});
				this.addChild(specifier, specifier.local, "local");
				this.addChild(node, this.finish(specifier), "specifiers");
				this.match(",");
			}
			if (this.match("*")) {
				this.match("as");
				const specifier = this.createNode("ImportNamespaceSpecifier", this.lastIndex, {
					local: this.parseIdentifier(),
				});
				this.addChild(specifier, specifier.local, "local");
				this.addChild(node, this.finish(specifier), "specifiers");
			} else if (this.match("{")) {
				while (!this.atEnd() && this.lookAhead()?.value !== "}") {
					if (this.match(",")) continue;
					const specifier = this.createNode("ImportSpecifier");
					specifier.imported = this.parseIdentifier();
					specifier.local = specifier.imported;
					if (this.match("as")) specifier.local = this.parseIdentifier();
					this.addChild(specifier, specifier.imported, "imported");
					if (specifier.local !== specifier.imported) this.addChild(specifier, specifier.local, "local");
					this.addChild(node, this.finish(specifier), "specifiers");
				}
				this.match("}");
			}
			this.match("from");
			if (this.lookAhead()?.type === "string") {
				node.source = this.parseLiteral();
				this.addChild(node, node.source, "source");
			}
		}
		this.consumeSemicolon();
		return this.finish(node);
	}

	parseExportDeclaration() {
		const node = this.createNode("ExportDeclaration", this.index, {
			declaration: null,
			specifiers: [],
			source: null,
			default: false,
		});
		this.advance();
		if (this.match("default")) {
			node.default = true;
			if (
				this.lookAhead()?.value === "function"
				|| (this.lookAhead()?.value === "async" && this.lookAhead(1)?.value === "function")
			) {
				node.declaration = this.parseFunction();
			} else if (this.lookAhead()?.value === "class") {
				node.declaration = this.parseClass();
			} else {
				node.declaration = this.parseExpression(1);
				this.consumeSemicolon();
			}
			if (node.declaration) {
				node.declaration.exported = true;
				node.declaration.defaultExport = true;
				this.addChild(node, node.declaration, "declaration");
			}
			return this.finish(node);
		}
		if (this.match("*")) {
			node.exportAll = true;
			if (this.match("as")) node.exportedName = this.parseIdentifier();
		} else if (this.match("{")) {
			while (!this.atEnd() && this.lookAhead()?.value !== "}") {
				if (this.match(",")) continue;
				const specifier = this.createNode("ExportSpecifier");
				specifier.local = this.parseIdentifier();
				specifier.exported = specifier.local;
				if (this.match("as")) specifier.exported = this.parseIdentifier();
				this.addChild(specifier, specifier.local, "local");
				if (specifier.local !== specifier.exported) this.addChild(specifier, specifier.exported, "exported");
				this.addChild(node, this.finish(specifier), "specifiers");
			}
			this.match("}");
		}
		if (this.match("from") && this.lookAhead()?.type === "string") {
			node.source = this.parseLiteral();
			this.addChild(node, node.source, "source");
		} else if (["const", "let", "var", "function", "class", "async"].includes(this.lookAhead()?.value)) {
			node.declaration =
				this.lookAhead()?.value === "async" && this.lookAhead(1)?.value === "function"
					? this.parseFunction()
					: this.parseStatement();
			if (node.declaration) {
				node.declaration.exported = true;
				node.declaration.defaultExport = false;
				this.addChild(node, node.declaration, "declaration");
			}
		}
		this.consumeSemicolon();
		return this.finish(node);
	}

	parseVariableDeclaration(consumeTerminator, inFor = false) {
		const kind = this.lookAhead()?.value;
		const node = this.createNode("VariableDeclaration", this.index, { kind, declarations: [] });
		this.advance();
		do {
			const declaration = this.createNode("VariableDeclarator");
			declaration.id = this.parsePattern(false);
			this.addChild(declaration, declaration.id, "id");
			if (this.match("=")) {
				declaration.init = this.parseExpression(2, { allowIn: !inFor });
				this.addChild(declaration, declaration.init, "init");
			} else {
				declaration.init = null;
			}
			this.addChild(node, this.finish(declaration), "declarations");
		} while (this.match(","));
		if (consumeTerminator) this.consumeSemicolon();
		return this.finish(node);
	}

	parseFunction(async = false, expression = false) {
		const start = this.index;
		if (this.lookAhead()?.value === "async") {
			async = true;
			this.advance();
		}
		this.match("function");
		const generator = Boolean(this.match("*"));
		const node = this.createNode(expression ? "FunctionExpression" : "FunctionDeclaration", start, {
			id: null,
			params: [],
			body: null,
			async,
			generator,
		});
		if (this.lookAhead()?.type === "identifier") {
			node.id = this.parseIdentifier();
			this.addChild(node, node.id, "id");
		}
		this.parseParameters(node);
		node.body = this.parseBlock();
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parseClass(expression = false) {
		const node = this.createNode(expression ? "ClassExpression" : "ClassDeclaration", this.index, {
			id: null,
			superClass: null,
			body: [],
		});
		this.advance();
		if (this.lookAhead()?.type === "identifier" && this.lookAhead()?.value !== "extends") {
			node.id = this.parseIdentifier();
			this.addChild(node, node.id, "id");
		}
		if (this.match("extends")) {
			node.superClass = this.parseExpression(14);
			this.addChild(node, node.superClass, "superClass");
			this.addRelationship(node, "extends", node.superClass);
		}
		this.match("{");
		while (!this.atEnd() && this.lookAhead()?.value !== "}") {
			const start = this.index;
			if (this.match(";")) continue;
			const element = this.parseClassElement();
			if (element) this.addChild(node, element, "body");
			if (start === this.index) this.advance();
		}
		this.match("}");
		return this.finish(node);
	}

	parseClassElement() {
		const start = this.index;
		let isStatic = false;
		let async = false;
		let generator = false;
		let kind = "method";
		if (this.lookAhead()?.value === "static" && !["(", "=", ";", "}"].includes(this.lookAhead(1)?.value)) {
			isStatic = true;
			this.advance();
		}
		if (isStatic && this.lookAhead()?.value === "{") {
			const block = this.parseBlock();
			const node = this.createNode("StaticBlock", start, { body: block.body });
			for (const statement of block.body) this.addChild(node, statement, "body");
			return this.finish(node);
		}
		if (this.lookAhead()?.value === "async" && this.hasMethodKey(1, true)) {
			async = true;
			this.advance();
		}
		if (this.match("*")) generator = true;
		if (["get", "set"].includes(this.lookAhead()?.value) && this.hasMethodKey(1)) {
			kind = this.lookAhead().value;
			this.advance();
		}
		const key = this.parsePropertyKey();
		if (this.lookAhead()?.value === "(") {
			const method = this.createNode("MethodDefinition", start, {
				key: key.node,
				kind,
				static: isStatic,
				async,
				generator,
				computed: key.computed,
				params: [],
				body: null,
			});
			this.addChild(method, key.node, "key");
			this.parseParameters(method);
			method.body = this.parseBlock();
			this.addChild(method, method.body, "body");
			return this.finish(method);
		}
		const field = this.createNode("PropertyDefinition", start, {
			key: key.node,
			static: isStatic,
			computed: key.computed,
			value: null,
		});
		this.addChild(field, key.node, "key");
		if (this.match("=")) {
			field.value = this.parseExpression(2);
			this.addChild(field, field.value, "value");
		}
		this.consumeSemicolon();
		return this.finish(field);
	}

	parseParameters(node) {
		this.match("(");
		while (!this.atEnd() && this.lookAhead()?.value !== ")") {
			if (this.match(",")) continue;
			const parameter = this.parsePattern();
			node.params.push(parameter);
			this.addChild(node, parameter, "params");
			if (!this.match(",")) break;
		}
		this.match(")");
	}

	parseIfStatement() {
		const node = this.createNode("IfStatement");
		this.advance();
		this.match("(");
		node.test = this.parseExpression();
		this.match(")");
		node.consequent = this.parseStatement();
		node.alternate = null;
		this.addChild(node, node.test, "test");
		this.addChild(node, node.consequent, "consequent");
		if (this.match("else")) {
			node.alternate = this.parseStatement();
			this.addChild(node, node.alternate, "alternate");
		}
		return this.finish(node);
	}

	parseForStatement() {
		const node = this.createNode("ForStatement", this.index, {
			init: null,
			test: null,
			update: null,
			body: null,
			await: false,
			loopKind: "classic",
		});
		this.advance();
		if (this.match("await")) node.await = true;
		this.match("(");
		if (this.lookAhead()?.value !== ";") {
			node.init = ["const", "let", "var"].includes(this.lookAhead()?.value)
				? this.parseVariableDeclaration(false, true)
				: this.parseExpression(1, { allowIn: false });
			this.addChild(node, node.init, "init");
		}
		if (["in", "of"].includes(this.lookAhead()?.value)) {
			node.loopKind = this.lookAhead().value === "in" ? "for-in" : "for-of";
			node.type = node.loopKind === "for-in" ? "ForInStatement" : "ForOfStatement";
			node.left = node.init;
			this.advance();
			node.right = this.parseExpression(1);
			this.addChild(node, node.right, "right");
		} else {
			this.match(";");
			if (this.lookAhead()?.value !== ";") {
				node.test = this.parseExpression();
				this.addChild(node, node.test, "test");
			}
			this.match(";");
			if (this.lookAhead()?.value !== ")") {
				node.update = this.parseExpression();
				this.addChild(node, node.update, "update");
			}
		}
		this.match(")");
		node.body = this.parseStatement();
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parseWhileStatement() {
		const node = this.createNode("WhileStatement", this.index, { test: null, body: null });
		this.advance();
		this.match("(");
		node.test = this.parseExpression();
		this.match(")");
		node.body = this.parseStatement();
		this.addChild(node, node.test, "test");
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parseDoWhileStatement() {
		const node = this.createNode("DoWhileStatement", this.index, { test: null, body: null });
		this.advance();
		node.body = this.parseStatement();
		this.match("while");
		this.match("(");
		node.test = this.parseExpression();
		this.match(")");
		this.consumeSemicolon();
		this.addChild(node, node.body, "body");
		this.addChild(node, node.test, "test");
		return this.finish(node);
	}

	parseJumpStatement(type) {
		const node = this.createNode(type);
		const keyword = this.lookAhead();
		this.advance();
		node.label = null;
		node.argument = null;
		if (
			type === "ReturnStatement"
			&& this.lookAhead()
			&& ![";", "}"].includes(this.lookAhead().value)
			&& this.lookAhead().line === keyword?.line
		) {
			node.argument = this.parseExpression();
			this.addChild(node, node.argument, "argument");
			this.addRelationship(node, "returns", node.argument);
		} else if (
			["BreakStatement", "ContinueStatement"].includes(type)
			&& this.lookAhead()?.type === "identifier"
			&& this.lookAhead()?.line === keyword?.line
		) {
			node.label = this.parseIdentifier();
			this.addChild(node, node.label, "label");
		}
		this.consumeSemicolon();
		return this.finish(node);
	}

	parseThrowStatement() {
		const node = this.createNode("ThrowStatement");
		this.advance();
		node.argument = this.parseExpression();
		this.addChild(node, node.argument, "argument");
		this.consumeSemicolon();
		return this.finish(node);
	}

	parseTryStatement() {
		const node = this.createNode("TryStatement", this.index, { block: null, handler: null, finalizer: null });
		this.advance();
		node.block = this.parseBlock();
		this.addChild(node, node.block, "block");
		if (this.match("catch")) {
			const handler = this.createNode("CatchClause", this.lastIndex, { param: null, body: null });
			if (this.match("(")) {
				handler.param = this.parsePattern();
				this.addChild(handler, handler.param, "param");
				this.match(")");
			}
			handler.body = this.parseBlock();
			this.addChild(handler, handler.body, "body");
			node.handler = this.finish(handler);
			this.addChild(node, node.handler, "handler");
		}
		if (this.match("finally")) {
			node.finalizer = this.parseBlock();
			this.addChild(node, node.finalizer, "finalizer");
		}
		return this.finish(node);
	}

	parseSwitchStatement() {
		const node = this.createNode("SwitchStatement", this.index, { discriminant: null, cases: [] });
		this.advance();
		this.match("(");
		node.discriminant = this.parseExpression();
		this.match(")");
		this.match("{");
		while (!this.atEnd() && !["}", null].includes(this.lookAhead()?.value)) {
			const switchCase = this.createNode("SwitchCase", this.index, { test: null, consequent: [] });
			if (this.match("case")) {
				switchCase.test = this.parseExpression();
				this.addChild(switchCase, switchCase.test, "test");
			} else if (!this.match("default")) {
				break;
			}
			this.match(":");
			while (!this.atEnd() && !["case", "default", "}"].includes(this.lookAhead()?.value)) {
				const statement = this.parseStatement();
				if (statement) this.addChild(switchCase, statement, "consequent");
			}
			this.addChild(node, this.finish(switchCase), "cases");
		}
		this.match("}");
		this.addChild(node, node.discriminant, "discriminant");
		return this.finish(node);
	}

	parseWithStatement() {
		const node = this.createNode("WithStatement", this.index, { object: null, body: null });
		this.advance();
		this.match("(");
		node.object = this.parseExpression();
		this.match(")");
		node.body = this.parseStatement();
		this.addChild(node, node.object, "object");
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parseLabeledStatement() {
		const node = this.createNode("LabeledStatement");
		node.label = this.parseIdentifier();
		this.match(":");
		node.body = this.parseStatement();
		this.addChild(node, node.label, "label");
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parsePattern(allowDefault = true) {
		if (this.match("...")) {
			const node = this.createNode("RestElement", this.lastIndex, { argument: null });
			node.argument = this.parsePattern();
			this.addChild(node, node.argument, "argument");
			return this.finish(node);
		}
		if (this.lookAhead()?.value === "[") {
			const node = this.createNode("ArrayPattern", this.index, { elements: [] });
			this.advance();
			while (!this.atEnd() && this.lookAhead()?.value !== "]") {
				if (this.match(",")) {
					node.elements.push(null);
					continue;
				}
				const element = this.parsePattern();
				node.elements.push(element);
				this.addChild(node, element, "elements");
				if (!this.match(",")) break;
			}
			this.match("]");
			return this.finish(node);
		}
		if (this.lookAhead()?.value === "{") {
			const node = this.createNode("ObjectPattern", this.index, { properties: [] });
			this.advance();
			while (!this.atEnd() && this.lookAhead()?.value !== "}") {
				if (this.match(",")) continue;
				const property = this.createNode("Property");
				if (this.match("...")) {
					property.type = "RestElement";
					property.argument = this.parsePattern();
					this.addChild(property, property.argument, "argument");
				} else {
					const key = this.parsePropertyKey();
					property.key = key.node;
					property.computed = key.computed;
					if (this.match(":")) {
						property.value = this.parsePattern();
					} else {
						property.value = key.node;
						property.shorthand = true;
					}
					if (this.match("=")) {
						const assignment = this.createNode("AssignmentPattern", key.node.startToken, {
							left: property.value,
							right: this.parseExpression(2),
						});
						this.addChild(assignment, assignment.left, "left");
						this.addChild(assignment, assignment.right, "right");
						property.value = this.finish(assignment);
					}
					this.addChild(property, property.key, "key");
					this.addChild(property, property.value, "value");
				}
				node.properties.push(this.finish(property));
				this.addChild(node, node.properties.at(-1), "properties");
				if (!this.match(",")) break;
			}
			this.match("}");
			return this.finish(node);
		}
		let pattern = this.parseIdentifier();
		if (allowDefault && this.match("=")) {
			const assignment = this.createNode("AssignmentPattern", pattern.startToken, {
				left: pattern,
				right: this.parseExpression(2),
			});
			this.addChild(assignment, pattern, "left");
			this.addChild(assignment, assignment.right, "right");
			pattern = this.finish(assignment);
		}
		return pattern;
	}

	//#endregion

	//#region Expressions
	/**
	 * Parse expressions using precedence climbing. Higher precedence binds more tightly;
	 * assignment and exponentiation are handled as right-associative operators.
	 *
	 * @param {number} [minPrecedence]
	 * @param {{allowIn?: boolean}} [options]
	 * @returns {SyntaxTreeNode|null}
	 */
	parseExpression(minPrecedence = 0, options = {}) {
		let left = this.parsePrefix();
		if (!left) return null;
		while (!this.atEnd()) {
			const token = this.lookAhead();
			if (!token) break;
			if ([".", "?.", "[", "("].includes(token.value)) {
				if (17 < minPrecedence) break;
				left = this.parseMemberOrCall(left);
				continue;
			}
			if (token.value === "`") {
				const quasi = this.parseTemplateLiteral();
				const node = this.createNode("TaggedTemplateExpression", left.startToken, { tag: left, quasi });
				this.addChild(node, left, "tag");
				this.addChild(node, quasi, "quasi");
				left = this.finish(node);
				continue;
			}
			if (["++", "--"].includes(token.value) && token.line === this.previousToken()?.line) {
				if (16 < minPrecedence) break;
				const node = this.createNode("UpdateExpression", left.startToken, {
					operator: token.value,
					argument: left,
					prefix: false,
				});
				this.advance();
				this.addChild(node, left, "argument");
				left = this.finish(node);
				continue;
			}
			if (token.value === "=>" && minPrecedence <= 2) {
				const parameters =
					left.type === "ParenthesizedExpression" ? left.expression?.elements || [left.expression] : [left];
				this.advance();
				const node = this.createNode("ArrowFunctionExpression", left.startToken, {
					params: parameters.filter(Boolean),
					body: null,
					async: Boolean(left.async),
					generator: false,
					expression: true,
				});
				for (const parameter of node.params) this.addChild(node, parameter, "params");
				if (this.lookAhead()?.value === "{") {
					node.body = this.parseBlock();
					node.expression = false;
				} else {
					node.body = this.parseExpression(1);
				}
				this.addChild(node, node.body, "body");
				left = this.finish(node);
				continue;
			}
			if (token.value === "?" && minPrecedence <= 3) {
				this.advance();
				const consequent = this.parseExpression(2, options);
				this.match(":");
				const alternate = this.parseExpression(2, options);
				const node = this.createNode("ConditionalExpression", left.startToken, {
					test: left,
					consequent,
					alternate,
				});
				this.addChild(node, left, "test");
				this.addChild(node, consequent, "consequent");
				this.addChild(node, alternate, "alternate");
				left = this.finish(node);
				continue;
			}
			const precedence = this.binaryPrecedence(token.value, options);
			if (precedence < minPrecedence || precedence === 0) break;
			this.advance();
			const assignment = precedence === 2;
			const rightAssociative = assignment || token.value === "**";
			const right = this.parseExpression(precedence + (rightAssociative ? 0 : 1), options);
			if (token.value === ",") {
				if (left.type === "SequenceExpression") {
					left.expressions.push(right);
					this.addChild(left, right, "expressions");
					left = this.finish(left);
				} else {
					const node = this.createNode("SequenceExpression", left.startToken, { expressions: [left, right] });
					this.addChild(node, left, "expressions");
					this.addChild(node, right, "expressions");
					left = this.finish(node);
				}
				continue;
			}
			const type = assignment
				? "AssignmentExpression"
				: ["&&", "||", "??"].includes(token.value)
					? "LogicalExpression"
					: "BinaryExpression";
			const node = this.createNode(type, left.startToken, { operator: token.value, left, right });
			this.addChild(node, left, "left");
			this.addChild(node, right, "right");
			if (type === "AssignmentExpression") this.addRelationship(node, "writes", left);
			left = this.finish(node);
		}
		return left;
	}

	parsePrefix() {
		const token = this.lookAhead();
		if (!token) return null;
		if (token.value === "async") {
			if (this.lookAhead(1)?.value === "function") return this.parseFunction(true, true);
			if (this.isArrowStart(this.index + 1)) {
				const start = this.index;
				this.advance();
				const arrow = this.parseArrowParameters(start, true);
				return arrow;
			}
		}
		if (token.value === "function") return this.parseFunction(false, true);
		if (token.value === "class") return this.parseClass(true);
		if (["!", "~", "+", "-", "typeof", "void", "delete", "await", "yield"].includes(token.value)) {
			const start = this.index;
			this.advance();
			const operator = token.value;
			const delegate = operator === "yield" && Boolean(this.match("*"));
			const next = this.lookAhead();
			const hasYieldArgument =
				operator !== "yield"
				|| (next && ![";", "}", ")", "]", ","].includes(next.value) && next.line === token.line);
			const argument = hasYieldArgument ? this.parseExpression(operator === "yield" ? 2 : 14) : null;
			const node = this.createNode(
				operator === "await" ? "AwaitExpression" : operator === "yield" ? "YieldExpression" : "UnaryExpression",
				start,
				{
					operator,
					argument,
					prefix: true,
					delegate,
				},
			);
			this.addChild(node, argument, "argument");
			return this.finish(node);
		}
		if (["++", "--"].includes(token.value)) {
			const start = this.index;
			this.advance();
			const argument = this.parseExpression(14);
			const node = this.createNode("UpdateExpression", start, { operator: token.value, argument, prefix: true });
			this.addChild(node, argument, "argument");
			return this.finish(node);
		}
		if (token.value === "new" && this.lookAhead(1)?.value === "." && this.lookAhead(2)?.value === "target") {
			const start = this.index;
			const node = this.createNode("MetaProperty", start);
			node.meta = this.createNode("Identifier", start, { name: "new" });
			this.advance();
			this.advance();
			node.property = this.parseIdentifier();
			this.addChild(node, node.meta, "meta");
			this.addChild(node, node.property, "property");
			return this.finish(node);
		}
		if (token.value === "new") return this.parseNewExpression();
		if (token.value === "...") return this.parseSpreadElement();
		if (token.value === "(") {
			if (this.isArrowStart(this.index)) return this.parseArrowParameters(this.index, false);
			const node = this.createNode("ParenthesizedExpression");
			this.advance();
			node.expression = this.parseExpression();
			this.match(")");
			this.addChild(node, node.expression, "expression");
			return this.finish(node);
		}
		if (token.value === "[") return this.parseArrayExpression();
		if (token.value === "{") return this.parseObjectExpression();
		if (token.value === "`") return this.parseTemplateLiteral();
		if (token.value === "this" || token.value === "super") {
			this.advance();
			return this.finish(this.createNode(token.value === "this" ? "ThisExpression" : "Super", this.lastIndex));
		}
		if (token.value === "import" && this.lookAhead(1)?.value === ".") {
			const start = this.index;
			const node = this.createNode("MetaProperty", start);
			node.meta = this.createNode("Identifier", start, { name: "import" });
			this.advance();
			this.advance();
			node.property = this.parseIdentifier();
			this.addChild(node, node.meta, "meta");
			this.addChild(node, node.property, "property");
			return this.finish(node);
		}
		if (token.value === "import" && this.lookAhead(1)?.value === "(") {
			const start = this.index;
			this.advance();
			this.advance();
			const source = this.parseExpression(2);
			this.match(")");
			const node = this.createNode("ImportExpression", start, { source });
			this.addChild(node, source, "source");
			return this.finish(node);
		}
		if (["true", "false", "null"].includes(token.value) || ["number", "string"].includes(token.type))
			return this.parseLiteral();
		if (token.type === "private-identifier") {
			const node = this.createNode("PrivateIdentifier", this.index, { name: token.value.slice(1) });
			this.advance();
			return this.finish(node);
		}
		return this.parseIdentifier();
	}

	parseArrowParameters(start, async) {
		const params = [];
		if (this.match("(")) {
			while (!this.atEnd() && this.lookAhead()?.value !== ")") {
				if (this.match(",")) continue;
				params.push(this.parsePattern());
				if (!this.match(",")) break;
			}
			this.match(")");
		} else {
			params.push(this.parsePattern());
		}
		this.match("=>");
		const node = this.createNode("ArrowFunctionExpression", start, {
			params,
			body: null,
			async,
			generator: false,
			expression: true,
		});
		for (const parameter of params) this.addChild(node, parameter, "params");
		if (this.lookAhead()?.value === "{") {
			node.body = this.parseBlock();
			node.expression = false;
		} else {
			node.body = this.parseExpression(1);
		}
		this.addChild(node, node.body, "body");
		return this.finish(node);
	}

	parseMemberOrCall(object) {
		const optional = Boolean(this.match("?."));
		if (!optional && this.match(".")) {
			const property =
				this.lookAhead()?.type === "private-identifier" ? this.parsePrefix() : this.parseIdentifier();
			const node = this.createNode("MemberExpression", object.startToken, {
				object,
				property,
				computed: false,
			});
			this.addChild(node, object, "object");
			this.addChild(node, property, "property");
			return this.finish(node);
		}
		if (optional && this.lookAhead()?.value !== "(" && this.lookAhead()?.value !== "[") {
			const property =
				this.lookAhead()?.type === "private-identifier" ? this.parsePrefix() : this.parseIdentifier();
			const node = this.createNode("OptionalMemberExpression", object.startToken, {
				object,
				property,
				computed: false,
				optional: true,
			});
			this.addChild(node, object, "object");
			this.addChild(node, property, "property");
			return this.finish(node);
		}
		if (this.match("[")) {
			const property = this.parseExpression();
			this.match("]");
			const node = this.createNode(
				optional ? "OptionalMemberExpression" : "MemberExpression",
				object.startToken,
				{
					object,
					property,
					computed: true,
					optional,
				},
			);
			this.addChild(node, object, "object");
			this.addChild(node, property, "property");
			return this.finish(node);
		}
		if (this.match("(")) {
			const args = [];
			while (!this.atEnd() && this.lookAhead()?.value !== ")") {
				if (this.match(",")) continue;
				const argument = this.parseExpression(2);
				args.push(argument);
				if (!this.match(",")) break;
			}
			this.match(")");
			const node = this.createNode(optional ? "OptionalCallExpression" : "CallExpression", object.startToken, {
				callee: object,
				arguments: args,
				optional,
			});
			this.addChild(node, object, "callee");
			for (const argument of args) this.addChild(node, argument, "arguments");
			this.addRelationship(node, "calls", object);
			return this.finish(node);
		}
		return object;
	}

	parseNewExpression() {
		const start = this.index;
		this.advance();
		let callee = this.parsePrefix();
		while ([".", "[", "?."].includes(this.lookAhead()?.value)) callee = this.parseMemberOrCall(callee);
		const args = [];
		if (this.match("(")) {
			while (!this.atEnd() && this.lookAhead()?.value !== ")") {
				if (this.match(",")) continue;
				args.push(this.parseExpression(2));
				if (!this.match(",")) break;
			}
			this.match(")");
		}
		const node = this.createNode("NewExpression", start, { callee, arguments: args });
		this.addChild(node, callee, "callee");
		for (const argument of args) this.addChild(node, argument, "arguments");
		this.addRelationship(node, "constructs", callee);
		return this.finish(node);
	}

	parseSpreadElement() {
		const node = this.createNode("SpreadElement", this.index);
		this.advance();
		node.argument = this.parseExpression(2);
		this.addChild(node, node.argument, "argument");
		return this.finish(node);
	}

	parseArrayExpression() {
		const node = this.createNode("ArrayExpression", this.index, { elements: [] });
		this.advance();
		while (!this.atEnd() && this.lookAhead()?.value !== "]") {
			if (this.match(",")) {
				node.elements.push(null);
				continue;
			}
			const element = this.lookAhead()?.value === "..." ? this.parseSpreadElement() : this.parseExpression(2);
			node.elements.push(element);
			this.addChild(node, element, "elements");
			if (!this.match(",")) break;
		}
		this.match("]");
		return this.finish(node);
	}

	parseObjectExpression() {
		const node = this.createNode("ObjectExpression", this.index, { properties: [] });
		this.advance();
		while (!this.atEnd() && this.lookAhead()?.value !== "}") {
			if (this.match(",")) continue;
			let async = false;
			let generator = false;
			let kind = "init";
			if (this.lookAhead()?.value === "async" && this.hasMethodKey(1, true)) {
				async = true;
				this.advance();
			}
			if (this.match("*")) generator = true;
			if (["get", "set"].includes(this.lookAhead()?.value) && this.hasMethodKey(1)) {
				kind = this.lookAhead().value;
				this.advance();
			}
			const property = this.createNode("Property");
			if (this.match("...")) {
				property.type = "SpreadElement";
				property.argument = this.parseExpression(2);
				this.addChild(property, property.argument, "argument");
			} else {
				const key = this.parsePropertyKey();
				property.key = key.node;
				property.computed = key.computed;
				property.shorthand = false;
				if (this.match(":")) {
					property.value = this.parseExpression(2);
				} else if (this.lookAhead()?.value === "(") {
					property.method = true;
					property.kind = kind === "init" ? "method" : kind;
					property.async = async;
					property.generator = generator;
					property.params = [];
					property.body = null;
					this.parseParameters(property);
					property.body = this.parseBlock();
					this.addChild(property, property.body, "body");
				} else {
					property.value = key.node;
					property.shorthand = true;
				}
				this.addChild(property, property.key, "key");
				if (property.value) this.addChild(property, property.value, "value");
			}
			node.properties.push(this.finish(property));
			this.addChild(node, node.properties.at(-1), "properties");
			if (!this.match(",")) break;
		}
		this.match("}");
		return this.finish(node);
	}

	parsePropertyKey() {
		if (this.match("[")) {
			const node = this.parseExpression();
			this.match("]");
			return { node, computed: true };
		}
		if (this.lookAhead()?.type === "private-identifier") {
			const node = this.createNode("PrivateIdentifier");
			node.name = this.lookAhead()?.value.slice(1);
			this.advance();
			return { node: this.finish(node), computed: false };
		}
		return { node: this.parsePrefix(), computed: false };
	}

	//#endregion

	//#region Parser utilities
	parseTemplateLiteral() {
		const node = this.createNode("TemplateLiteral", this.index, { quasis: [], expressions: [] });
		this.advance();
		while (!this.atEnd() && this.lookAhead()?.value !== "`") {
			if (this.lookAhead()?.type === "template-text") {
				const quasi = this.parseLiteral();
				quasi.type = "TemplateElement";
				node.quasis.push(quasi);
				this.addChild(node, quasi, "quasis");
			} else if (this.match("${")) {
				const expression = this.parseExpression();
				node.expressions.push(expression);
				this.addChild(node, expression, "expressions");
				this.match("}");
			} else {
				this.advance();
			}
		}
		this.match("`");
		return this.finish(node);
	}

	parseLiteral() {
		const token = this.lookAhead();
		const raw = token?.value;
		let value = raw;
		let literalType =
			token?.type === "number"
				? raw.endsWith("n")
					? "bigint"
					: "number"
				: token?.type === "string"
					? "string"
					: raw;
		if (raw === "true") value = true;
		else if (raw === "false") value = false;
		else if (raw === "null") value = null;
		if (raw === "true" || raw === "false") literalType = "boolean";
		else if (token?.type === "number") {
			const numericRaw = raw.replaceAll("_", "");
			value = numericRaw.endsWith("n") ? numericRaw.slice(0, -1) : Number(numericRaw);
		}
		const node = this.createNode("Literal", this.index, {
			value,
			raw,
			literalType,
		});
		this.advance();
		return this.finish(node);
	}

	parseIdentifier() {
		const token = this.lookAhead();
		const node = this.createNode("Identifier", this.index, { name: token?.value });
		this.advance();
		return this.finish(node);
	}

	/**
	 * Return the binding strength for an infix operator; zero means it is not consumed here.
	 * `allowIn` is disabled for classic `for` initializers so `in` can delimit a for-in loop.
	 *
	 * @param {string} operator
	 * @param {{allowIn?: boolean}} options
	 * @returns {number}
	 */
	binaryPrecedence(operator, options) {
		if (options?.allowIn === false && operator === "in") return 0;

		return operatorPrecedence[operator] ?? 0;
	}

	isArrowStart(index) {
		const tokenIndex = this.nextSignificantIndex(index);
		const token = this.tokens[tokenIndex];
		if (token?.value === "(") {
			const close = this.findClosingBracket(tokenIndex);
			return (
				close !== -1
				&& this.nextSignificantIndex(close + 1) >= 0
				&& this.tokens[this.nextSignificantIndex(close + 1)]?.value === "=>"
			);
		}
		return token?.type === "identifier" && this.tokens[this.nextSignificantIndex(tokenIndex + 1)]?.value === "=>";
	}

	hasMethodKey(offset = 0, allowGenerator = false) {
		let keyIndex = this.nextSignificantIndex(this.index + offset);
		if (allowGenerator && this.tokens[keyIndex]?.value === "*") {
			keyIndex = this.nextSignificantIndex(keyIndex + 1);
		}
		if (this.tokens[keyIndex]?.value === "[") {
			keyIndex = this.findMatchingBracket(keyIndex, "[", "]");
			if (keyIndex === -1) return false;
			keyIndex = this.nextSignificantIndex(keyIndex + 1);
		} else {
			if (!["identifier", "private-identifier", "string", "number"].includes(this.tokens[keyIndex]?.type))
				return false;
			keyIndex = this.nextSignificantIndex(keyIndex + 1);
		}
		return keyIndex >= 0 && this.tokens[keyIndex]?.value === "(";
	}

	findClosingBracket(index) {
		let depth = 0;
		for (let cursor = index; cursor < this.tokens.length; cursor++) {
			if (this.tokens[cursor].type === "comment" || this.tokens[cursor].type === "block-comment") continue;
			if (this.tokens[cursor].value === "(") depth++;
			if (this.tokens[cursor].value === ")" && --depth === 0) return cursor;
		}
		return -1;
	}

	findMatchingBracket(index, opening, closing) {
		let depth = 0;
		for (let cursor = index; cursor < this.tokens.length; cursor++) {
			if (["comment", "block-comment"].includes(this.tokens[cursor].type)) continue;
			if (this.tokens[cursor].value === opening) depth++;
			if (this.tokens[cursor].value === closing && --depth === 0) return cursor;
		}
		return -1;
	}

	createNode(type, start = this.index, properties = {}) {
		const node = new SyntaxTreeNode(type, start, { id: this.nextNodeId++, ...properties });
		const token = this.tokens[start];
		node.startLine = token?.line ?? null;
		return node;
	}

	finish(node, end = this.lastIndex) {
		if (!node) return null;
		node.endToken = end ?? node.startToken;
		node.endLine = this.tokens[node.endToken]?.line ?? node.startLine;
		return node;
	}

	/**
	 * Record both the direct-child list and its role-specific property; relationship edges
	 * contain IDs rather than object references so the AST remains serializable.
	 *
	 * @param {SyntaxTreeNode} parent
	 * @param {SyntaxTreeNode|null} child
	 * @param {string} [role]
	 */
	addChild(parent, child, role) {
		if (!parent || !child) return;
		parent.children.push(child);
		if (!role) return;
		if (Array.isArray(parent[role]) && !parent[role].includes(child)) parent[role].push(child);
		parent.relationships.push({ type: "contains", role, targetId: child.id });
	}

	/**
	 * Add a non-containment semantic edge, such as a call target or superclass.
	 *
	 * @param {SyntaxTreeNode|null} node
	 * @param {string} type
	 * @param {SyntaxTreeNode|null} target
	 */
	addRelationship(node, type, target) {
		if (node && target) node.relationships.push({ type, targetId: target.id });
	}

	consumeSemicolon() {
		this.match(";");
	}

	match(value) {
		if (this.lookAhead()?.value !== value) return false;
		this.advance();
		return true;
	}

	advance() {
		this.skipComments();
		if (this.index >= this.tokens.length) return null;
		this.lastIndex = this.index;
		return this.tokens[this.index++];
	}

	lookAhead(byOffset = 0) {
		let index = this.index;
		while (index < this.tokens.length) {
			const token = this.tokens[index];
			if (token.type !== "comment" && token.type !== "block-comment") {
				if (byOffset === 0) return token;
				byOffset--;
			}
			index++;
		}
		return null;
	}

	previousToken() {
		return this.tokens[this.lastIndex];
	}

	lastToken() {
		return this.tokens[this.lastIndex];
	}

	skipComments() {
		while (this.index < this.tokens.length && ["comment", "block-comment"].includes(this.tokens[this.index].type)) {
			this.index++;
		}
	}

	nextSignificantIndex(start) {
		for (let index = start; index < this.tokens.length; index++) {
			if (!["comment", "block-comment"].includes(this.tokens[index].type)) return index;
		}
		return -1;
	}

	atEnd() {
		return this.lookAhead() === null;
	}
	//#endregion
}
//#endregion

//#region Import and export search helpers
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
			if (depth === 0) return tokens[cursor + 1]?.value === "=>";
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
//#endregion
