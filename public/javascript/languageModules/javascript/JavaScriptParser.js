import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { ExportSearch } from "../../core/Searches/ExportSearch.js";
import { ImportSearch } from "../../core/Searches/ImportSearch.js";
import { ClassSearch } from "../../core/Searches/ClassSearch.js";
import { LanguageParserModule } from "../LanguageParserModule.js";

//#region JavaScript parser

/** Parse JavaScript modules once and expose their cached imports, exports, and classes. */
export class JavaScriptParser extends LanguageParserModule {
	static fileExtensions = Object.freeze([".js", ".mjs", ".cjs"]);

	static supportedSearches = new Map([
		[ImportSearch, "imports"],
		[ExportSearch, "exports"],
		[ClassSearch, "classes"],
	]);

	/**
	 * Return the requested result from a file's shared AST analysis.
	 *
	 * @param {{ name: string, source: string, analysis?: object }} file Source file to analyze.
	 * @param {import("../../core/Searches/Search.js").Search} search Search whose result is requested.
	 * @returns {Array<object>} Cached import, export, or class declaration records.
	 */
	parse(file, search) {
		const resultKey = this.supportedSearches.get(search.constructor);
		if (!resultKey) throw new TypeError(`Unsupported JavaScript search: ${search.constructor.name}.`);
		return analyzeFile(file)[resultKey];
	}

	/**
	 * Resolve a relative or absolute module source against the project file paths.
	 *
	 * @param {string} importerPath Path of the file containing the import.
	 * @param {string} source Module specifier from the import.
	 * @param {Iterable<string>} filePaths Paths available in the selected project.
	 * @returns {{ path: string | null, status: "resolved" | "external" | "unresolved" | "ambiguous" }} Resolution outcome.
	 */
	resolveImportPath(importerPath, source, filePaths) {
		return resolveImportPath(importerPath, source, new Set(filePaths), this.fileExtensions);
	}
}

//#endregion JavaScript parser

//#region AST analysis

/**
 * Parse the source once and cache its module declarations and class records on the file.
 *
 * @param {{ name: string, source: string, analysis?: object }} file File model with loaded source text.
 * @returns {{ imports: object[], exports: object[], classes: object[] }} The file's declaration breakdown.
 */
function analyzeFile(file) {
	if (file.analysis) return file.analysis;

	const ast = acorn.parse(file.source, {
		ecmaVersion: "latest",
		sourceType: "module",
		allowHashBang: true,
	});

	const declarationTypes = new Map();
	const declarations = [];
	const imports = [];
	const exports = [];
	const classes = [];

	/**
	 * Return an AST identifier or member expression as its readable qualified name.
	 *
	 * @param {object | null} node Expression used as a superclass.
	 * @returns {string | null} Qualified base-class name, or null for a dynamic expression.
	 */
	function getExpressionName(node) {
		if (!node) return null;
		if (node.type === "Identifier") return node.name;
		if (node.type === "PrivateIdentifier") return `#${node.name}`;
		if (node.type === "MemberExpression" && !node.computed) {
			const objectName = getExpressionName(node.object);
			const propertyName = getExpressionName(node.property);
			return objectName && propertyName ? `${objectName}.${propertyName}` : null;
		}
		return null;
	}

	/**
	 * Convert a declaration or initializer node into the export type used by the UI.
	 *
	 * @param {object | null} node Declaration or variable initializer.
	 * @returns {string} Inferred declaration kind.
	 */
	function getDeclarationType(node) {
		if (!node) return "unknown";
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") return "class";
		if (
			node.type === "FunctionDeclaration"
			|| node.type === "FunctionExpression"
			|| node.type === "ArrowFunctionExpression"
		) {
			return "function";
		}
		return "variable";
	}

	/**
	 * Record each identifier declared by a supported variable binding pattern.
	 *
	 * @param {object} pattern Variable declaration binding pattern.
	 * @param {string} type Inferred declaration type.
	 * @returns {void} No value is returned.
	 */
	function addBindingTypes(pattern, type) {
		if (pattern.type === "Identifier") {
			declarationTypes.set(pattern.name, type);
			declarations.push({ name: pattern.name, type });
			return;
		}
		if (pattern.type === "RestElement") {
			addBindingTypes(pattern.argument, "variable");
			return;
		}
		if (pattern.type === "AssignmentPattern") {
			addBindingTypes(pattern.left, "variable");
			return;
		}
		if (pattern.type === "ArrayPattern") {
			for (const element of pattern.elements) {
				if (element) addBindingTypes(element, "variable");
			}
			return;
		}
		if (pattern.type === "ObjectPattern") {
			for (const property of pattern.properties) {
				addBindingTypes(property.type === "RestElement" ? property.argument : property.value, "variable");
			}
		}
	}

	/**
	 * Describe a class method, field, or accessor without retaining its syntax-tree node.
	 *
	 * @param {object} member Class member AST node.
	 * @returns {{ name: string, static: boolean, private: boolean, kind: string, async: boolean, generator: boolean, parameters: number }} Member metadata.
	 */
	function describeMember(member) {
		const key = member.key;
		const name = key.type === "PrivateIdentifier"
			? `#${key.name}`
			: key.type === "Identifier" || key.type === "Literal"
				? String(key.name ?? key.value)
				: getExpressionName(key) || "[computed]";
		return {
			name,
			static: Boolean(member.static),
			private: key.type === "PrivateIdentifier",
			kind: member.kind || "property",
			async: Boolean(member.value?.async),
			generator: Boolean(member.value?.generator),
			parameters: member.value?.params?.length || 0,
		};
	}

	/**
	 * Create a class record from its AST node and collect all declared members.
	 *
	 * @param {object} node Class declaration or expression node.
	 * @param {string} [fallbackName="anonymous"] Name to use for an anonymous declaration.
	 * @returns {object} Project class declaration record.
	 */
	function createClassRecord(node, fallbackName = "anonymous") {
		const name = node.id?.name || fallbackName;
		const classRecord = {
			file,
			id: ClassSearch.nextId++,
			name,
			extension: Boolean(node.superClass),
			default: false,
			extends: null,
			extendsName: getExpressionName(node.superClass),
			constructor: null,
			methods: [],
			properties: [],
			accessors: [],
			inheritedBy: [],
		};
		const accessorsByKey = new Map();

		for (const member of node.body.body) {
			if (member.type !== "MethodDefinition" && member.type !== "PropertyDefinition") continue;
			const description = describeMember(member);
			if (member.type === "MethodDefinition" && description.kind === "constructor") {
				classRecord.constructor = description;
				continue;
			}
			if (member.type === "MethodDefinition" && ["get", "set"].includes(description.kind)) {
				const accessorKey = `${description.static}:${description.name}`;
				let accessor = accessorsByKey.get(accessorKey);
				if (!accessor) {
					accessor = {
						name: description.name,
						static: description.static,
						private: description.private,
						get: null,
						set: null,
					};
					accessorsByKey.set(accessorKey, accessor);
					classRecord.accessors.push(accessor);
				}
				accessor[description.kind] = description;
				continue;
			}
			if (member.type === "MethodDefinition") {
				classRecord.methods.push(description);
				continue;
			}
			classRecord.properties.push(description);
		}

		classes.push(classRecord);
		return classRecord;
	}

	/**
	 * Add an exported declaration record for a variable or declaration node.
	 *
	 * @param {object} declaration Exported declaration AST node.
	 * @returns {void} No value is returned.
	 */
	function addDeclarationExports(declaration) {
		if (declaration.type === "VariableDeclaration") {
			for (const variable of declaration.declarations) {
				if (variable.id.type !== "Identifier") continue;
				exports.push({
					name: variable.id.name,
					localName: variable.id.name,
					type: getDeclarationType(variable.init),
				});
			}
			return;
		}
		if (declaration.id?.name) {
			exports.push({
				name: declaration.id.name,
				localName: declaration.id.name,
				type: getDeclarationType(declaration),
			});
		}
	}

	/**
	 * Read a static import or re-export declaration into the existing import shape.
	 *
	 * @param {object} node Import or sourced export AST node.
	 * @returns {void} No value is returned.
	 */
	function addImport(node) {
		const isReExport = node.type !== "ImportDeclaration";
		const items = [];
		if (node.type === "ImportDeclaration") {
			for (const specifier of node.specifiers) {
				if (specifier.type === "ImportDefaultSpecifier") {
					items.push({ name: "default", localName: specifier.local.name, type: null });
				} else if (specifier.type === "ImportNamespaceSpecifier") {
					items.push({ name: "*", localName: specifier.local.name, type: "namespace" });
				} else {
					items.push({
						name: specifier.imported.name ?? specifier.imported.value,
						localName: specifier.local.name,
						type: null,
					});
				}
			}
		} else if (node.type === "ExportAllDeclaration") {
			items.push({
				name: "*",
				localName: node.exported?.name ?? node.exported?.value ?? null,
				type: node.exported ? "namespace" : null,
			});
		} else {
			for (const specifier of node.specifiers) {
				items.push({
					name: specifier.local.name ?? specifier.local.value,
					localName: specifier.exported.name ?? specifier.exported.value,
					type: declarationTypes.get(specifier.local.name ?? specifier.local.value) || null,
				});
			}
		}
		imports.push({
			source: node.source.value,
			path: null,
			items,
			reExport: isReExport,
		});
	}

	for (const statement of ast.body) {
		if (statement.type === "ImportDeclaration") {
			addImport(statement);
			continue;
		}
		if (statement.type === "ExportAllDeclaration") {
			addImport(statement);
			continue;
		}
		if (statement.type === "ExportNamedDeclaration" && statement.source) {
			addImport(statement);
			continue;
		}

		const declaration = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
			? statement.declaration
			: statement;
		if (!declaration) continue;
		if (declaration.type === "VariableDeclaration") {
			for (const variable of declaration.declarations) {
				addBindingTypes(variable.id, getDeclarationType(variable.init));
			}
		} else if (declaration.id?.name) {
			declarationTypes.set(declaration.id.name, getDeclarationType(declaration));
			declarations.push({ name: declaration.id.name, type: getDeclarationType(declaration) });
		}

		if (statement.type === "ExportNamedDeclaration" && declaration) {
			addDeclarationExports(declaration);
		} else if (statement.type === "ExportDefaultDeclaration") {
			const localName = declaration.id?.name || (declaration.type === "Identifier" ? declaration.name : null);
			if (localName && declaration.type !== "Identifier" && !declarations.some((entry) => entry.name === localName)) {
				declarations.push({ name: localName, type: getDeclarationType(declaration) });
			} else if (!localName) {
				declarations.push({ name: "default", type: getDeclarationType(declaration) });
			}
			exports.push({
				name: "default",
				...(localName && { localName }),
				type: declarationTypes.get(localName) || getDeclarationType(declaration),
			});
		}
	}

	for (const statement of ast.body) {
		if (statement.type !== "ExportNamedDeclaration" || statement.declaration) continue;
		for (const specifier of statement.specifiers) {
			const localName = specifier.local.name ?? specifier.local.value;
			const exportedName = specifier.exported.name ?? specifier.exported.value;
			exports.push({
				name: exportedName,
				localName,
				type: declarationTypes.get(localName) || "unknown",
			});
		}
	}

	/**
	 * Find a useful name for anonymous class expressions and declarations.
	 *
	 * @param {object} node Class AST node.
	 * @param {object[]} ancestors AST path leading to the class node.
	 * @returns {string} Class name, variable binding, default export, or anonymous fallback.
	 */
	function getClassFallbackName(node, ancestors) {
		const parent = ancestors[ancestors.length - 2];
		return parent?.type === "VariableDeclarator" && parent.id.type === "Identifier"
			? parent.id.name
			: parent?.type === "ExportDefaultDeclaration"
				? "default"
				: "anonymous";
	}

	walk.ancestor(ast, {
		ClassDeclaration(node, ancestors) {
			createClassRecord(node, node.id?.name || getClassFallbackName(node, ancestors));
		},
		ClassExpression(node, ancestors) {
			createClassRecord(node, node.id?.name || getClassFallbackName(node, ancestors));
		},
	});

	for (const exported of exports) {
		if (exported.name !== "default") continue;
		const classRecord = classes.find((candidate) =>
			exported.localName ? candidate.name === exported.localName : candidate.name === "default",
		);
		if (classRecord) classRecord.default = true;
	}

	file.analysis = { ast, declarations, imports, exports: deduplicateByName(exports), classes };
	file.declarations = declarations;
	return file.analysis;
}

/**
 * Keep the last export record encountered for each exported name.
 *
 * @param {object[]} exports Export records which may contain duplicate names.
 * @returns {object[]} Export records with unique names.
 */
function deduplicateByName(exports) {
	const byName = new Map();
	for (const exported of exports) byName.set(exported.name, exported);
	return [...byName.values()];
}

//#endregion AST analysis

//#region Import path resolution

/**
 * Resolve a module source to a matching project file when possible.
 *
 * @param {string} importerPath Path of the importing file.
 * @param {string} source Module specifier to resolve.
 * @param {Set<string>} filePaths Available project file paths.
 * @param {readonly string[]} extensions File extensions to try for extensionless imports.
 * @returns {{ path: string | null, status: "resolved" | "external" | "unresolved" | "ambiguous" }} Resolution outcome.
 */
function resolveImportPath(importerPath, source, filePaths, extensions) {
	const normalizedSource = source.replaceAll("\\", "/");
	const isAbsolute = normalizedSource.startsWith("/");
	if (!isAbsolute && !normalizedSource.startsWith(".")) return { path: null, status: "external" };
	const directory = isAbsolute ? [] : importerPath.split("/").slice(0, -1);
	const normalized = [];
	for (const segment of [...directory, ...normalizedSource.split("/")]) {
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

/**
 * Check whether normalized file paths match by their trailing segments.
 *
 * @param {string} filePath Project file path to compare.
 * @param {string} candidate Candidate module path to compare.
 * @returns {boolean} Whether the paths match by suffix.
 */
function pathsMatchBySuffix(filePath, candidate) {
	const fileSegments = filePath.replaceAll("\\", "/").split("/").filter(Boolean);
	const candidateSegments = candidate.split("/").filter(Boolean);
	/**
	 * Check whether one path segment list ends with another.
	 *
	 * @param {string[]} path Path segments to inspect.
	 * @param {string[]} suffix Segments expected at the end of the path.
	 * @returns {boolean} Whether the path ends with the supplied segments.
	 */
	const hasSuffix = (path, suffix) => suffix.length <= path.length
		&& suffix.every((segment, index) => segment === path[path.length - suffix.length + index]);
	return hasSuffix(fileSegments, candidateSegments) || hasSuffix(candidateSegments, fileSegments);
}

//#endregion Import path resolution
