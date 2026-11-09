import { File } from "../../core/FileLoader.js";
import { SyntaxNode } from "./SyntaxNode.js";
import { buildSyntaxTree, SyntaxTreeNodeType } from "./syntaxTreeBuilder.js";
import { SyntaxToken } from "./SyntaxToken.js";

//#region High-level syntax node builder
/** Build a flat node list and a parent/child tree from JavaScript tokenizer output.
 * @param {SyntaxToken[]} tokens Tokenizer output.
 * @param {import("../../core/FileLoader.js").File} file Source file metadata.
 * @returns {{nodes: SyntaxNode[], tree: SyntaxNode}} Flat nodes and the root syntax node.
 */
export function buildSyntaxNodes(tokens, file) {
	if (!(file instanceof File)) {
		throw new TypeError("buildSyntaxNodes expects a File instance.");
	}

	const ast = buildSyntaxTree(tokens);
	const nodes = [];
	const converted = new WeakMap();
	const sourceName = file.name;
	const tree = convertNode(ast);
	const pending = [tree];
	while (pending.length) {
		const node = pending.pop();
		nodes.push(node);
		pending.push(...node.children.slice().reverse());
	}
	return { nodes, tree };

	/** Convert one AST node and its children to the higher-level node model.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode AST node to convert.
	 * @returns {SyntaxNode|null}
	 */
	function convertNode(astNode) {
		if (converted.has(astNode)) return converted.get(astNode);
		if (astNode.type === SyntaxTreeNodeType.File) return convertFile(astNode);
		if (astNode.type === SyntaxTreeNodeType.ClassDeclaration || astNode.type === SyntaxTreeNodeType.ClassExpression) {
			return convertClass(astNode);
		}
		if (astNode.type === SyntaxTreeNodeType.ExportDeclaration) {
			return astNode.declaration ? convertNode(astNode.declaration) : null;
		}

		const { type, structure } = getNodeKind(astNode.type);
		const node = createNode(type, structure, astNode, { name: getNodeName(astNode) });
		converted.set(astNode, node);

		for (const child of astNode.contains) {
			if (isLoop(astNode) && child === astNode.body && child.type === SyntaxTreeNodeType.BlockStatement) {
				for (const statement of child.body) addChild(node, convertNode(statement));
			} else {
				addChild(node, convertNode(child));
			}
		}
		for (const [key, value] of Object.entries(astNode)) {
			if (["type", "id", "startToken", "endToken", "contains", "container"].includes(key)) continue;
			if (key === "body" && isLoop(astNode)) {
				node.body = astNode.body?.type === SyntaxTreeNodeType.BlockStatement
					? astNode.body.body.map(convertNode)
					: astNode.body
						? [convertNode(astNode.body)]
						: [];
				continue;
			}
			if (key === "test" && isLoop(astNode)) {
				node.condition = value ? convertValue(value) : undefined;
				continue;
			}
			if (key === "init" && astNode.type === SyntaxTreeNodeType.ForStatement) {
				node.initializer = value ? convertValue(value) : undefined;
				continue;
			}
			if (key === "left" && astNode.type === SyntaxTreeNodeType.ForInStatement) {
				node.left = value ? convertValue(value) : undefined;
				continue;
			}
			if (key === "right" && astNode.type === SyntaxTreeNodeType.ForInStatement) {
				node.right = value ? convertValue(value) : undefined;
				continue;
			}
			node[key] = convertValue(value);
		}

		if (astNode.type === SyntaxTreeNodeType.ForStatement) {
			node.initializer = astNode.init ? convertValue(astNode.init) : undefined;
			node.condition = astNode.test ? convertValue(astNode.test) : undefined;
			node.update = astNode.update ? convertValue(astNode.update) : undefined;
		} else if (astNode.type === SyntaxTreeNodeType.ForInStatement) {
			node.left = convertValue(astNode.left ?? astNode.init);
			node.right = convertValue(astNode.right);
		}
		return node;
	}

	/** Convert the file root while merging exports into their declarations.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode File AST node.
	 * @returns {SyntaxNode}
	 */
	function convertFile(astNode) {
		const node = createNode("file", "file", astNode, {
			name: sourceName,
			body: [],
			exports: [],
		});
		converted.set(astNode, node);

		const declarationsByName = new Map();
		for (const statement of astNode.body) {
			collectTopLevelDeclarations(statement, declarationsByName);
		}

		for (const statement of astNode.body) {
			if (statement.type === SyntaxTreeNodeType.ExportDeclaration) {
				addExport(statement, node, declarationsByName);
				continue;
			}
			const child = convertNode(statement);
			if (!child) continue;
			node.body.push(child);
			addChild(node, child);
		}
		return node;
	}

	/** Add exported declaration nodes and export metadata to the file.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} exportNode Export AST node.
	 * @param {SyntaxNode} fileNode File SyntaxNode.
	 * @param {Map<string, import("./syntaxTreeBuilder.js").SyntaxTreeNode>} declarationsByName Top-level declarations.
	 * @returns {void}
	 */
	function addExport(exportNode, fileNode, declarationsByName) {
		if (exportNode.declaration) {
			const declaration = convertNode(exportNode.declaration);
			declaration.exported = true;
			declaration.default = exportNode.default ? true : undefined;
			declaration.defaultExport = exportNode.default ? true : undefined;
			if (declaration.startToken && exportNode.startToken) declaration.startToken = exportNode.startToken;
			fileNode.body.push(declaration);
			addChild(fileNode, declaration);
			fileNode.exports.push(declaration);
			return;
		}

		if (exportNode.source) return;
		for (const specifier of exportNode.specifiers ?? []) {
			const declaration = declarationsByName.get(specifier.local?.name);
			if (!declaration) continue;
			const exported = convertNode(declaration);
			if (!exported) continue;
			exported.exported = true;
			exported.exportedNames ??= [];
			if (!exported.exportedNames.includes(specifier.exported?.name)) {
				exported.exportedNames.push(specifier.exported?.name);
			}
			if (specifier.exported?.name === "default") {
				exported.default = true;
				exported.defaultExport = true;
			}
			if (!fileNode.exports.includes(exported)) fileNode.exports.push(exported);
		}
	}

	/** Index the names declared by a top-level declaration.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Declaration AST node.
	 * @param {Map<string, import("./syntaxTreeBuilder.js").SyntaxTreeNode>} declarationsByName Declaration lookup.
	 * @returns {void}
	 */
	function collectTopLevelDeclarations(astNode, declarationsByName) {
		if (astNode.type === SyntaxTreeNodeType.ExportDeclaration) {
			if (astNode.declaration) collectTopLevelDeclarations(astNode.declaration, declarationsByName);
			return;
		}
		if (astNode.id?.type === SyntaxTreeNodeType.Identifier) {
			declarationsByName.set(astNode.id.name, astNode);
		}
		if (astNode.type === SyntaxTreeNodeType.VariableDeclaration) {
			for (const declarator of astNode.declarations) {
				for (const name of getPatternNames(declarator.id)) declarationsByName.set(name, astNode);
			}
		}
	}

	/** Read all identifiers bound by a pattern.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode|null} pattern Binding pattern.
	 * @returns {string[]}
	 */
	function getPatternNames(pattern) {
		if (!pattern) return [];
		if (pattern.type === SyntaxTreeNodeType.Identifier) return [pattern.name];
		if (pattern.type === SyntaxTreeNodeType.AssignmentPattern) return getPatternNames(pattern.left);
		if (pattern.type === SyntaxTreeNodeType.RestElement) return getPatternNames(pattern.argument);
		if (pattern.type === SyntaxTreeNodeType.ArrayPattern) return pattern.elements.flatMap(getPatternNames);
		if (pattern.type === SyntaxTreeNodeType.ObjectPattern) {
			return pattern.properties.flatMap((property) =>
				property.type === SyntaxTreeNodeType.RestElement
					? getPatternNames(property.argument)
					: getPatternNames(property.value),
			);
		}
		return [];
	}

	/** Convert a class and categorize its members while retaining declaration order.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Class AST node.
	 * @returns {SyntaxNode}
	 */
	function convertClass(astNode) {
		const nodeType = astNode.type === SyntaxTreeNodeType.ClassDeclaration ? "declaration" : "expression";
		const node = createNode(nodeType, "class", astNode, {
			name: astNode.id?.name ?? getInferredName(astNode),
			extends: astNode.superClass ? sourceText(astNode.superClass) : undefined,
			exported: astNode.exported ? true : undefined,
			default: astNode.defaultExport ? true : undefined,
			constructor: undefined,
			properties: [],
			methods: [],
			accessors: [],
			staticBlocks: [],
			staticInitializers: [],
			members: [],
		});
		converted.set(astNode, node);

		for (const member of astNode.body) {
			if (member.type === SyntaxTreeNodeType.StaticBlock) {
				const staticBlock = convertStaticBlock(member);
				node.staticBlocks.push(staticBlock);
				node.staticInitializers.push(staticBlock);
				node.members.push(staticBlock);
				addChild(node, staticBlock);
				continue;
			}
			if (member.type === SyntaxTreeNodeType.PropertyDefinition) {
				const property = convertClassProperty(member);
				node.properties.push(property);
				node.members.push(property);
				addChild(node, property);
				if (property.static) node.staticInitializers.push(property);
				continue;
			}

			const method = convertClassMethod(member);
			if (method.kind === "get" || method.kind === "set") {
				const accessor = findAccessor(node.accessors, method);
				if (accessor) {
					accessor[method.kind === "get" ? "getter" : "setter"] = method;
					addChild(accessor, method);
				} else {
					const newAccessor = createNode("declaration", "accessor", member, {
						name: method.name,
						key: method.key,
						computed: method.computed,
						static: method.static,
						private: method.private,
						getter: method.kind === "get" ? method : undefined,
						setter: method.kind === "set" ? method : undefined,
					});
					addChild(newAccessor, method);
					node.accessors.push(newAccessor);
					node.members.push(newAccessor);
					addChild(node, newAccessor);
				}
			} else if (method.kind === "constructor" && !method.static && !method.private) {
				node.constructor = method;
				node.members.push(method);
				addChild(node, method);
			} else {
				node.methods.push(method);
				node.members.push(method);
				addChild(node, method);
			}
		}

		return node;
	}

	/** Convert a class property node and its initializer.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Property AST node.
	 * @returns {SyntaxNode}
	 */
	function convertClassProperty(astNode) {
		const node = createNode("declaration", "property", astNode, {
			name: getPropertyName(astNode.key),
			key: sourceText(astNode.key),
			keyNode: convertNode(astNode.key),
			computed: Boolean(astNode.computed),
			static: Boolean(astNode.static),
			private: astNode.key?.type === SyntaxTreeNodeType.PrivateIdentifier,
			initializer: astNode.value ? convertNode(astNode.value) : undefined,
		});
		converted.set(astNode, node);
		if (node.keyNode) addChild(node, node.keyNode);
		if (node.initializer) addChild(node, node.initializer);
		return node;
	}

	/** Convert a class method node, including constructor and accessor methods.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Method AST node.
	 * @returns {SyntaxNode}
	 */
	function convertClassMethod(astNode) {
		const key = sourceText(astNode.key);
		const isConstructor = astNode.kind === "method"
			&& !astNode.computed
			&& astNode.key?.type === SyntaxTreeNodeType.Identifier
			&& key === "constructor";
		const kind = isConstructor ? "constructor" : astNode.kind;
		const node = createNode("declaration", "method", astNode, {
			name: getPropertyName(astNode.key),
			key,
			kind,
			keyNode: convertNode(astNode.key),
			computed: Boolean(astNode.computed),
			static: Boolean(astNode.static),
			private: astNode.key?.type === SyntaxTreeNodeType.PrivateIdentifier,
			async: Boolean(astNode.async),
			generator: Boolean(astNode.generator),
			parameters: astNode.params.map(convertNode),
			body: astNode.body ? astNode.body.body.map(convertNode) : [],
		});
		converted.set(astNode, node);
		if (node.keyNode) addChild(node, node.keyNode);
		for (const parameter of node.parameters) addChild(node, parameter);
		for (const statement of node.body) addChild(node, statement);
		return node;
	}

	/** Convert a class static initialization block.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Static block AST node.
	 * @returns {SyntaxNode}
	 */
	function convertStaticBlock(astNode) {
		const node = createNode("statement", "static-block", astNode, {
			body: astNode.body.map(convertNode),
		});
		converted.set(astNode, node);
		for (const statement of node.body) addChild(node, statement);
		return node;
	}

	/** Find a matching accessor whose other half has not already been defined.
	 * @param {SyntaxNode[]} accessors Existing class accessors.
	 * @param {SyntaxNode} method Getter or setter candidate.
	 * @returns {SyntaxNode|undefined}
	 */
	function findAccessor(accessors, method) {
		const counterpart = method.kind === "get" ? "getter" : "setter";
		return accessors.find((accessor) =>
			accessor.key === method.key
			&& accessor.computed === method.computed
			&& accessor.static === method.static
			&& accessor.private === method.private
			&& !accessor[counterpart],
		);
	}

	/** Derive a user-facing name for an AST node when its syntax supplies one.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode AST node.
	 * @returns {string|undefined}
	 */
	function getNodeName(astNode) {
		if (typeof astNode.name === "string") return astNode.name;
		if (astNode.id?.type === SyntaxTreeNodeType.Identifier) return astNode.id.name;
		if ([SyntaxTreeNodeType.MethodDefinition, SyntaxTreeNodeType.PropertyDefinition, SyntaxTreeNodeType.Property].includes(astNode.type)) {
			return getPropertyName(astNode.key);
		}
		if (astNode.type === SyntaxTreeNodeType.VariableDeclarator) return getBindingName(astNode.id);
		if (astNode.type === SyntaxTreeNodeType.LabeledStatement) return astNode.label?.name;
		if (
			astNode.type === SyntaxTreeNodeType.ImportDefaultSpecifier
			|| astNode.type === SyntaxTreeNodeType.ImportNamespaceSpecifier
			|| astNode.type === SyntaxTreeNodeType.ImportSpecifier
		) {
			return astNode.local?.name;
		}
		if (astNode.type === SyntaxTreeNodeType.ExportSpecifier) return astNode.exported?.name;
		if ([SyntaxTreeNodeType.FunctionExpression, SyntaxTreeNodeType.ArrowFunctionExpression, SyntaxTreeNodeType.ClassExpression].includes(astNode.type)) {
			return getInferredName(astNode);
		}
		return undefined;
	}

	/** Return a static name for a class or object property key.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode|null} key Property key AST node.
	 * @returns {string|undefined}
	 */
	function getPropertyName(key) {
		if (!key) return undefined;
		if (key.type === SyntaxTreeNodeType.Identifier) return key.name;
		if (key.type === SyntaxTreeNodeType.PrivateIdentifier) return `#${key.name}`;
		if (key.type === SyntaxTreeNodeType.Literal) return String(key.value);
		return sourceText(key);
	}

	/** Return a binding name from a simple identifier pattern.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode|null} pattern Binding pattern.
	 * @returns {string|undefined}
	 */
	function getBindingName(pattern) {
		return pattern?.type === SyntaxTreeNodeType.Identifier ? pattern.name : undefined;
	}

	/** Infer a name from the declaration that directly contains an anonymous function or class.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Function or class expression.
	 * @returns {string|undefined}
	 */
	function getInferredName(astNode) {
		const declaration = astNode.container;
		if (declaration?.type === SyntaxTreeNodeType.VariableDeclarator) {
			return getBindingName(declaration.id);
		}
		if ([SyntaxTreeNodeType.PropertyDefinition, SyntaxTreeNodeType.Property].includes(declaration?.type)) {
			return getPropertyName(declaration.key);
		}
		return undefined;
	}

	/** Create a node and append it to the flat result list.
	 * @param {string} type Broad node category.
	 * @param {string} structure Specific node kind.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode Source AST node.
	 * @param {Record<string, unknown>} [properties={}] Additional node values.
	 * @returns {SyntaxNode}
	 */
	function createNode(type, structure, astNode, properties = {}) {
		const node = new SyntaxNode(type, structure, astNode.startToken, astNode.endToken, {
			name: getNodeName(astNode),
			file,
			...properties,
		});
		return node;
	}

	/** Attach a child node to its parent.
	 * @param {SyntaxNode} parent Parent node.
	 * @param {SyntaxNode|null} child Child node.
	 * @returns {void}
	 */
	function addChild(parent, child) {
		if (!child) return;
		if (parent.children.includes(child)) return;
		parent.children.push(child);
		child.parent = parent;
	}

	/** Convert an AST property value to its higher-level equivalent.
	 * @param {unknown} value AST property value.
	 * @returns {unknown}
	 */
	function convertValue(value) {
		if (value instanceof SyntaxToken || value === null || typeof value !== "object") return value;
		if (Array.isArray(value)) return value.map(convertValue);
		if (value instanceof Object && typeof value.type === "string" && Array.isArray(value.contains)) {
			return convertNode(value);
		}
		return value;
	}

	/** Return a readable key or superclass expression from an AST node.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode|null} astNode AST expression.
	 * @returns {string|undefined}
	 */
	function sourceText(astNode) {
		if (!astNode) return undefined;
		if (astNode.type === SyntaxTreeNodeType.Identifier) return astNode.name;
		if (astNode.type === SyntaxTreeNodeType.PrivateIdentifier) return `#${astNode.name}`;
		if (astNode.type === SyntaxTreeNodeType.Literal) return String(astNode.raw ?? astNode.value);
		if (astNode.type === SyntaxTreeNodeType.MemberExpression) {
			const property = sourceText(astNode.property);
			return astNode.computed ? `${sourceText(astNode.object)}[${property}]` : `${sourceText(astNode.object)}.${property}`;
		}
		if (astNode.startToken && astNode.endToken) {
			return astNode.startToken === astNode.endToken
				? astNode.startToken.value
				: astNode.startToken.value + " " + astNode.endToken.value;
		}
		return undefined;
	}

	/** Return broad and specific kinds for an AST node type.
	 * @param {string} astType AST node type.
	 * @returns {{type: string, structure: string}}
	 */
	function getNodeKind(astType) {
		if (astType === SyntaxTreeNodeType.File) return { type: "file", structure: "file" };
		if (astType === SyntaxTreeNodeType.BlockStatement) return { type: "statement", structure: "block" };
		if (astType === SyntaxTreeNodeType.ForInStatement) return { type: "statement", structure: "for-in" };
		if (astType === SyntaxTreeNodeType.ForOfStatement) return { type: "statement", structure: "for-of" };
		if (astType === SyntaxTreeNodeType.ForStatement) return { type: "statement", structure: "for" };
		if (astType === SyntaxTreeNodeType.WhileStatement) return { type: "statement", structure: "while" };
		if ([SyntaxTreeNodeType.Identifier, SyntaxTreeNodeType.Literal, SyntaxTreeNodeType.PrivateIdentifier, SyntaxTreeNodeType.Super, SyntaxTreeNodeType.MetaProperty].includes(astType)) {
			return { type: "expression", structure: toKebabCase(astType) };
		}
		if (astType.endsWith("Declaration")) return { type: "declaration", structure: toKebabCase(astType.replace(/Declaration$/, "")) };
		if (astType.endsWith("Statement")) return { type: "statement", structure: toKebabCase(astType.replace(/Statement$/, "")) };
		if (astType.endsWith("Expression")) return { type: "expression", structure: toKebabCase(astType.replace(/Expression$/, "")) };
		if (astType === SyntaxTreeNodeType.VariableDeclarator) return { type: "declaration", structure: "variable-declarator" };
		return { type: "syntax", structure: toKebabCase(astType) };
	}

	/** Convert an AST type name to kebab case.
	 * @param {string} value Type name.
	 * @returns {string}
	 */
	function toKebabCase(value) {
		return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, "");
	}

	/** Check whether an AST node represents one of the requested loop statements.
	 * @param {import("./syntaxTreeBuilder.js").SyntaxTreeNode} astNode AST node.
	 * @returns {boolean}
	 */
	function isLoop(astNode) {
		return [
			SyntaxTreeNodeType.ForStatement,
			SyntaxTreeNodeType.ForInStatement,
			SyntaxTreeNodeType.ForOfStatement,
			SyntaxTreeNodeType.WhileStatement,
		].includes(astNode.type);
	}
}
//#endregion High-level syntax node builder
