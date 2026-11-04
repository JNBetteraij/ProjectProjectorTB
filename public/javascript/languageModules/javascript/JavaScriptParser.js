import { ExportSearch } from "../../core/Searches/ExportSearch.js";
import { ImportSearch } from "../../core/Searches/ImportSearch.js";
import { LanguageParserModule } from "../LanguageParserModule.js";
import { JavaScriptTokenizer } from "./tokenizer.js";

/** @typedef {new (...args: any[]) => import("../../core/Searches/Search.js").Search} SearchClass */
/** @typedef {import("../Token.js").Token} Token */

export class JavaScriptParser extends LanguageParserModule {
	/** @type {import("../Tokenizer.js").Tokenizer} */
	tokenizer = JavaScriptTokenizer;
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

	/** Parse the file and run the requested search over its tokens.
	 *
	 * @param {{name: string, source: string}} file Source file to analyze.
	 * @param {import("../../core/Searches/Search.js").Search} search Search instance whose results should be produced.
	 * @returns {*} Results produced by the selected search.
	 */
	parse(file, search) {
		const find = this.supportedSearches.get(search.constructor);

		const tokens = this.getTokens(file);

		console.log(file.name);
		console.log(tokens);
		console.log(findDeclarations(tokens));

		return find(tokens, findDeclarations(tokens));
	}

	/** Resolve an imported source path against the available project files.
	 *
	 * @param {string} importerPath Path of the file containing the import.
	 * @param {string} source Module specifier from the import.
	 * @param {Iterable<string>} filePaths Project file paths to search.
	 * @returns {{path: string | null, status: "resolved" | "external" | "unresolved" | "ambiguous"}} Resolution result containing the matched path, if any, and its status.
	 */
	resolveImportPath(importerPath, source, filePaths) {
		return resolveImportPath(importerPath, source, new Set(filePaths), this.fileExtensions);
	}

	/** Tokenize a file and return its tokens.
	 *
	 * @param {{name: string, source: string}} file Source file to tokenize.
	 * @returns {Token[]} Tokens created from the file source.
	 */
	tokenize(file) {
		const tokens = this.tokenizer.tokenize(file.source);
		// console.log(file.name);
		// console.log(tokens);

		return tokens;
	}
}

/** Resolve a module source to a matching project file when possible.
 *
 * @param {string} importerPath Path of the file containing the import.
 * @param {string} source Module specifier from the import.
 * @param {Set<string>} filePaths Project file paths to search.
 * @param {readonly string[]} extensions File extensions to try when resolving extensionless paths.
 * @returns {{path: string | null, status: "resolved" | "external" | "unresolved" | "ambiguous"}} Resolution result containing the matched path, if any, and its status.
 */
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

/** Check whether two normalized paths match by their trailing segments.
 *
 * @param {string} filePath Project file path to compare.
 * @param {string} candidate Candidate module path to compare.
 * @returns {boolean} Whether the paths match by their trailing segments.
 */
function pathsMatchBySuffix(filePath, candidate) {
	const fileSegments = filePath.replaceAll("\\", "/").split("/").filter(Boolean);
	const candidateSegments = candidate.split("/").filter(Boolean);
	return hasSuffix(fileSegments, candidateSegments) || hasSuffix(candidateSegments, fileSegments);
}

/** Determine whether one path segment list ends with another.
 *
 * @param {string[]} path Path segments to inspect.
 * @param {string[]} suffix Segments expected at the end of the path.
 * @returns {boolean} Whether the path ends with the supplied segments.
 */
function hasSuffix(path, suffix) {
	if (suffix.length > path.length) return false;
	return suffix.every((segment, index) => segment === path[path.length - suffix.length + index]);
}

/** Map declared identifiers and infer the type of declarition from preceding tokens.
 *
 * @param {Token[]} tokens Tokens to inspect for declarations.
 * @returns {Map<string, string>} Map from declared identifier names to inferred types.
 */
function findDeclarations(tokens) {
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

/** Read variable declarations following a const, let, or var keyword.
 *
 * @param {Token[]} tokens Token stream containing the declarations.
 * @param {number} keywordIndex Index of the const, let, or var keyword.
 * @returns {{name: string, type: string}[]} Declarations and their inferred value types.
 */
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
				&& index >= keywordIndex
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

/** Infer whether an expression begins with a class, function, or other value.
 *
 * @param {Token[]} tokens Expression token stream.
 * @param {number} index Index at which the expression begins.
 * @returns {"variable" | "class" | "function"} Inferred declaration type.
 */
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

/** Check whether tokens at the given index begin an async function expression.
 *
 * @param {Token[]} tokens Token stream to inspect.
 * @param {number} index Index at which the potential async function begins.
 * @returns {boolean} Whether the tokens begin with an async function expression.
 */
function isAsyncFunction(tokens, index) {
	return tokens[index]?.value === "async" && tokens[index + 1]?.value === "function";
}

/** Check whether tokens at the given index form an arrow function expression.
 *
 * @param {Token[]} tokens Token stream to inspect.
 * @param {number} index Index at which the potential arrow function begins.
 * @returns {boolean} Whether the tokens form an arrow function expression.
 */
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

/** Read the declared name following a function keyword, if present.
 *
 * @param {Token[]} tokens Token stream containing the function.
 * @param {number} functionIndex Index of the function keyword.
 * @returns {string | null} Function name, or null for an anonymous function.
 */
function getFunctionName(tokens, functionIndex) {
	let cursor = functionIndex + 1;
	if (tokens[cursor]?.value === "*") cursor++;
	return tokens[cursor]?.type === "identifier" ? tokens[cursor].value : null;
}

/** Collect import declarations and re-exports represented by the tokens.
 *
 * @param {Token[]} tokens Tokens to inspect for imports and re-exports.
 * @param {Map<string, string>} declarationTypes Known local declaration types.
 * @returns {{source: string, path: null, items: Object[], reExport: boolean}[]} Import and re-export records found in the token stream.
 */
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

/** Extract imported names, aliases, and known declaration types.
 *
 * @param {Token[]} tokens Tokens representing the import clause.
 * @param {Map<string, string>} declarationTypes Known local declaration types.
 * @returns {{name: string, localName: string | null, type: string | null}[]} Imported names, local aliases, and known types.
 */
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

/** Collect named, default, and namespace exports represented by the tokens.
 *
 * @param {Token[]} tokens Tokens to inspect for export declarations.
 * @param {Map<string, string>} declarationTypes Known local declaration types.
 * @returns {{name: string, type: string, localName?: string}[]} Export records found in the token stream.
 */
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

/** Keep only the last export encountered for each exported name.
 *
 * @param {{name: string, type: string, localName?: string}[]} exports Export records that may contain duplicate names.
 * @returns {{name: string, type: string, localName?: string}[]} Export records with only the last occurrence of each name.
 */
function deduplicateExports(exports) {
	const byName = new Map();
	for (const exported of exports) byName.set(exported.name, exported);
	return [...byName.values()];
}

function findClasses(tokens, declarationTypes) {}
