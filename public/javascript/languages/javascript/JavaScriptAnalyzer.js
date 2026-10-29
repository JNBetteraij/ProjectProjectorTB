import { ExportSearch } from "../../core/Searches/ExportSearch.js";
import { ImportSearch } from "../../core/Searches/ImportSearch.js";

const STATEMENT_KEYWORDS = new Set([
	"async",
	"class",
	"const",
	"export",
	"function",
	"if",
	"import",
	"let",
	"return",
	"var",
]);

export class JavaScriptAnalyzer {
	constructor() {
		console.log("creating this");
		this.fileExtensions = Object.freeze([".js", ".jsx", ".mjs", ".cjs"]);
		this.supportedSearches = new Map([
			[ImportSearch, this.parseImports.bind(this)],
			[ExportSearch, this.parseExports.bind(this)],
		]);
	}

	analyze(source) {
		const tokens = tokenize(source);
		const declarationTypes = findDeclarationTypes(tokens);

		console.log("calling this");

		return {
			imports: findImports(tokens, declarationTypes),
			exports: findExports(tokens, declarationTypes),
		};
	}

	parseImports(source) {
		const tokens = tokenize(source);
		return findImports(tokens, findDeclarationTypes(tokens));
	}

	parseExports(source) {
		const tokens = tokenize(source);
		return findExports(tokens, findDeclarationTypes(tokens));
	}

	resolveImportPath(importerPath, source, filePaths) {
		return resolveImportPath(importerPath, source, new Set(filePaths), this.fileExtensions);
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

function tokenize(source) {
	const tokens = [];
	let line = 1;
	let index = 0;

	while (index < source.length) {
		const character = source[index];
		const next = source[index + 1];

		if (character === "\n") {
			line++;
			index++;
			continue;
		}
		if (/\s/.test(character)) {
			index++;
			continue;
		}
		if (character === "/" && next === "/") {
			index += 2;
			while (index < source.length && source[index] !== "\n") index++;
			continue;
		}
		if (character === "/" && next === "*") {
			index += 2;
			while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
				if (source[index] === "\n") line++;
				index++;
			}
			index = Math.min(index + 2, source.length);
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			const tokenLine = line;
			const quote = character;
			let value = "";
			index++;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") {
					value += source[index + 1] || "";
					if (source[index + 1] === "\n") line++;
					index += 2;
					continue;
				}
				if (source[index] === "\n") line++;
				value += source[index];
				index++;
			}
			if (index < source.length) index++;
			tokens.push({ type: "string", value, line: tokenLine });
			continue;
		}
		if (/[A-Za-z_$]/.test(character)) {
			const tokenLine = line;
			const start = index++;
			while (index < source.length && /[\w$]/.test(source[index])) index++;
			tokens.push({ type: "identifier", value: source.slice(start, index), line: tokenLine });
			continue;
		}

		tokens.push({ type: "punctuation", value: character, line });
		index++;
	}

	return tokens;
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
				&& STATEMENT_KEYWORDS.has(value)
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
	if (tokens[index]?.type === "identifier" && tokens[index + 1]?.value === "=" && tokens[index + 2]?.value === ">") {
		return true;
	}
	if (tokens[index]?.value !== "(") return false;

	let depth = 0;
	for (let cursor = index; cursor < tokens.length; cursor++) {
		if (tokens[cursor].value === "(") depth++;
		else if (tokens[cursor].value === ")") {
			depth--;
			if (depth === 0) return tokens[cursor + 1]?.value === "=" && tokens[cursor + 2]?.value === ">";
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
				&& STATEMENT_KEYWORDS.has(tokens[cursor].value)
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
