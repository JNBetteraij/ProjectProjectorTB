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
	analyze(source) {
		const tokens = tokenize(source);
		const declarationTypes = findDeclarationTypes(tokens);

		return {
			imports: findImports(tokens, declarationTypes),
			exports: findExports(tokens, declarationTypes),
		};
	}
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
			type: expressionStart === -1 ? "variable (primitive)" : inferValueType(tokens[expressionStart]),
		});

		let depth = 0;
		while (index < tokens.length) {
			const value = tokens[index].value;
			if (["[", "{", "("].includes(value)) depth++;
			else if (["]", "}", ")"].includes(value)) depth = Math.max(0, depth - 1);
			if (depth === 0 && (value === ";" || value === ",")) break;
			if (
				depth === 0 &&
				index > keywordIndex + 1 &&
				tokens[index].line > tokens[index - 1].line &&
				tokens[index].type === "identifier" &&
				STATEMENT_KEYWORDS.has(value)
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

function inferValueType(token) {
	if (!token) return "variable (primitive)";
	if (token.value === "[") return "variable (array)";
	if (token.value === "{") return "object (generic)";
	if (token.value === "new") return "object (instance of class)";
	return "variable (primitive)";
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
				cursor > index + 1 &&
				tokens[cursor].line > tokens[cursor - 1].line &&
				tokens[cursor].type === "identifier" &&
				STATEMENT_KEYWORDS.has(tokens[cursor].value)
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
		items.push({ name: "default", localName: tokens[index].value, type: declarationTypes.get(tokens[index].value) || null });
		index++;
		if (tokens[index]?.value === ",") index++;
	}

	while (index < tokens.length) {
		if (tokens[index].value === "*" && tokens[index + 1]?.value === "as") {
			const localName = tokens[index + 2]?.value;
			if (localName) items.push({ name: "*", localName, type: null });
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
			const next = tokens[cursor];
			if (next?.value === "class") {
				exports.push({ name: "default", type: "class" });
			} else if (next && !["function", "async"].includes(next.value)) {
				exports.push({
					name: "default",
					type: declarationTypes.get(next.value) || inferValueType(next),
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
		if (tokens[cursor]?.value === "{" ) {
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
