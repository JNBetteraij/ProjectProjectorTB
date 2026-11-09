import { operatorPrecedence } from "./definitions.js";
import { SyntaxToken } from "./SyntaxToken.js";

export const SyntaxTreeNodeType = Object.freeze({
	File: "File",
	EmptyStatement: "EmptyStatement",
	DebuggerStatement: "DebuggerStatement",
	ExpressionStatement: "ExpressionStatement",
	BlockStatement: "BlockStatement",
	ImportDeclaration: "ImportDeclaration",
	ImportDefaultSpecifier: "ImportDefaultSpecifier",
	ImportNamespaceSpecifier: "ImportNamespaceSpecifier",
	ImportSpecifier: "ImportSpecifier",
	ExportDeclaration: "ExportDeclaration",
	ExportSpecifier: "ExportSpecifier",
	VariableDeclaration: "VariableDeclaration",
	VariableDeclarator: "VariableDeclarator",
	FunctionExpression: "FunctionExpression",
	FunctionDeclaration: "FunctionDeclaration",
	ClassExpression: "ClassExpression",
	ClassDeclaration: "ClassDeclaration",
	StaticBlock: "StaticBlock",
	MethodDefinition: "MethodDefinition",
	PropertyDefinition: "PropertyDefinition",
	IfStatement: "IfStatement",
	ForStatement: "ForStatement",
	ForInStatement: "ForInStatement",
	ForOfStatement: "ForOfStatement",
	WhileStatement: "WhileStatement",
	DoWhileStatement: "DoWhileStatement",
	ReturnStatement: "ReturnStatement",
	BreakStatement: "BreakStatement",
	ContinueStatement: "ContinueStatement",
	ThrowStatement: "ThrowStatement",
	TryStatement: "TryStatement",
	CatchClause: "CatchClause",
	SwitchStatement: "SwitchStatement",
	SwitchCase: "SwitchCase",
	WithStatement: "WithStatement",
	LabeledStatement: "LabeledStatement",
	RestElement: "RestElement",
	ArrayPattern: "ArrayPattern",
	ObjectPattern: "ObjectPattern",
	Property: "Property",
	AssignmentPattern: "AssignmentPattern",
	TaggedTemplateExpression: "TaggedTemplateExpression",
	UpdateExpression: "UpdateExpression",
	ArrowFunctionExpression: "ArrowFunctionExpression",
	ConditionalExpression: "ConditionalExpression",
	SequenceExpression: "SequenceExpression",
	AssignmentExpression: "AssignmentExpression",
	LogicalExpression: "LogicalExpression",
	BinaryExpression: "BinaryExpression",
	AwaitExpression: "AwaitExpression",
	YieldExpression: "YieldExpression",
	UnaryExpression: "UnaryExpression",
	MetaProperty: "MetaProperty",
	Identifier: "Identifier",
	ParenthesizedExpression: "ParenthesizedExpression",
	ThisExpression: "ThisExpression",
	Super: "Super",
	ImportExpression: "ImportExpression",
	PrivateIdentifier: "PrivateIdentifier",
	MemberExpression: "MemberExpression",
	OptionalMemberExpression: "OptionalMemberExpression",
	OptionalCallExpression: "OptionalCallExpression",
	CallExpression: "CallExpression",
	NewExpression: "NewExpression",
	SpreadElement: "SpreadElement",
	ArrayExpression: "ArrayExpression",
	ObjectExpression: "ObjectExpression",
	TemplateLiteral: "TemplateLiteral",
	TemplateElement: "TemplateElement",
	Literal: "Literal",
});

/** @typedef {typeof SyntaxTreeNodeType[keyof typeof SyntaxTreeNodeType]} SyntaxTreeNodeTypeValue */

//#region Syntax tree builder
/** Build a syntax tree from tokenizer output using recursive-descent and precedence-climbing parsing.
 *
 * @param {SyntaxToken[]} tokens Tokenizer output.
 * @returns {SyntaxTreeNode} The root syntax tree node.
 */
export function buildSyntaxTree(tokens) {
	if (!Array.isArray(tokens) || tokens.some((token) => !(token instanceof SyntaxToken))) {
		throw new TypeError("buildSyntaxTree expects an array of SyntaxToken instances.");
	}

	let index = 0;
	let lastIndex = null;
	let nextNodeId = 0;

	const file = createNode(SyntaxTreeNodeType.File, 0, { body: [], sourceType: "module" });
	while (!atEnd()) {
		const start = index;
		const statement = parseStatement();
		if (statement) addChild(file, statement, "body");
		if (index === start) advance();
	}

	return finish(file);

	//#region Parse functions
	/** Parse the next statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseStatement() {
		const token = lookAhead();
		if (!token) return null;
		if (token.value === ";") {
			const node = createNode(SyntaxTreeNodeType.EmptyStatement);
			advance();
			return finish(node);
		}
		if (token.value === "{") return parseBlock();
		if (token.value === "import" && !["(", "."].includes(lookAhead(1)?.value)) return parseImportDeclaration();
		if (token.value === "export") return parseExportDeclaration();
		if (token.value === "async" && lookAhead(1)?.value === "function") return parseFunction(true);
		if (token.value === "function") return parseFunction(false);
		if (token.value === "class") return parseClass();
		if (["const", "let", "var"].includes(token.value)) return parseVariableDeclaration(true);
		if (token.value === "if") return parseIfStatement();
		if (token.value === "for") return parseForStatement();
		if (token.value === "while") return parseWhileStatement();
		if (token.value === "do") return parseDoWhileStatement();
		if (token.value === "return") return parseJumpStatement(SyntaxTreeNodeType.ReturnStatement);
		if (token.value === "break") return parseJumpStatement(SyntaxTreeNodeType.BreakStatement);
		if (token.value === "continue") return parseJumpStatement(SyntaxTreeNodeType.ContinueStatement);
		if (token.value === "throw") return parseThrowStatement();
		if (token.value === "try") return parseTryStatement();
		if (token.value === "switch") return parseSwitchStatement();
		if (token.value === "with") return parseWithStatement();
		if (token.value === "debugger") {
			const node = createNode(SyntaxTreeNodeType.DebuggerStatement);
			advance();
			consumeSemicolon();
			return finish(node);
		}
		if (token.type === "identifier" && lookAhead(1)?.value === ":") return parseLabeledStatement();

		const node = createNode(SyntaxTreeNodeType.ExpressionStatement);
		node.expression = parseExpression();
		addChild(node, node.expression, "expression");
		consumeSemicolon();
		return finish(node);
	}

	/** Parse a block statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseBlock() {
		const node = createNode(SyntaxTreeNodeType.BlockStatement, index, { body: [] });
		advance();
		while (!atEnd() && lookAhead()?.value !== "}") {
			const start = index;
			const statement = parseStatement();
			if (statement) addChild(node, statement, "body");
			if (start === index) advance();
		}
		match("}");
		return finish(node);
	}

	/** Parse an import declaration.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseImportDeclaration() {
		const node = createNode(SyntaxTreeNodeType.ImportDeclaration, index, {
			specifiers: [],
			source: null,
			importKind: "value",
		});
		advance();
		if (lookAhead()?.type === "string") {
			node.source = parseLiteral();
			addChild(node, node.source, "source");
		} else {
			if (lookAhead()?.type === "identifier" && lookAhead()?.value !== "from") {
				const specifier = createNode(SyntaxTreeNodeType.ImportDefaultSpecifier, index, {
					local: parseIdentifier(),
				});
				addChild(specifier, specifier.local, "local");
				addChild(node, finish(specifier), "specifiers");
				match(",");
			}
			if (match("*")) {
				match("as");
				const specifier = createNode(SyntaxTreeNodeType.ImportNamespaceSpecifier, lastIndex, {
					local: parseIdentifier(),
				});
				addChild(specifier, specifier.local, "local");
				addChild(node, finish(specifier), "specifiers");
			} else if (match("{")) {
				while (!atEnd() && lookAhead()?.value !== "}") {
					if (match(",")) continue;
					const specifier = createNode(SyntaxTreeNodeType.ImportSpecifier);
					specifier.imported = parseIdentifier();
					specifier.local = specifier.imported;
					if (match("as")) specifier.local = parseIdentifier();
					addChild(specifier, specifier.imported, "imported");
					if (specifier.local !== specifier.imported) addChild(specifier, specifier.local, "local");
					addChild(node, finish(specifier), "specifiers");
				}
				match("}");
			}
			match("from");
			if (lookAhead()?.type === "string") {
				node.source = parseLiteral();
				addChild(node, node.source, "source");
			}
		}
		consumeSemicolon();
		return finish(node);
	}

	/** Parse an export declaration.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseExportDeclaration() {
		const node = createNode(SyntaxTreeNodeType.ExportDeclaration, index, {
			declaration: null,
			specifiers: [],
			source: null,
			default: false,
		});
		advance();
		if (match("default")) {
			node.default = true;
			if (
				lookAhead()?.value === "function"
				|| (lookAhead()?.value === "async" && lookAhead(1)?.value === "function")
			) {
				node.declaration = parseFunction();
			} else if (lookAhead()?.value === "class") {
				node.declaration = parseClass();
			} else {
				node.declaration = parseExpression(1);
				consumeSemicolon();
			}
			if (node.declaration) {
				node.declaration.exported = true;
				node.declaration.defaultExport = true;
				addChild(node, node.declaration, "declaration");
			}
			return finish(node);
		}
		if (match("*")) {
			node.exportAll = true;
			if (match("as")) node.exportedName = parseIdentifier();
		} else if (match("{")) {
			while (!atEnd() && lookAhead()?.value !== "}") {
				if (match(",")) continue;
				const specifier = createNode(SyntaxTreeNodeType.ExportSpecifier);
				specifier.local = parseIdentifier();
				specifier.exported = specifier.local;
				if (match("as")) specifier.exported = parseIdentifier();
				addChild(specifier, specifier.local, "local");
				if (specifier.local !== specifier.exported) addChild(specifier, specifier.exported, "exported");
				addChild(node, finish(specifier), "specifiers");
			}
			match("}");
		}
		if (match("from") && lookAhead()?.type === "string") {
			node.source = parseLiteral();
			addChild(node, node.source, "source");
		} else if (["const", "let", "var", "function", "class", "async"].includes(lookAhead()?.value)) {
			node.declaration =
				lookAhead()?.value === "async" && lookAhead(1)?.value === "function"
					? parseFunction()
					: parseStatement();
			if (node.declaration) {
				node.declaration.exported = true;
				node.declaration.defaultExport = false;
				addChild(node, node.declaration, "declaration");
			}
		}
		consumeSemicolon();
		return finish(node);
	}

	/** Parse a variable declaration.
	 * @param {boolean} consumeTerminator
	 * @param {boolean} [inFor=false]
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseVariableDeclaration(consumeTerminator, inFor = false) {
		const kind = lookAhead()?.value;
		const node = createNode(SyntaxTreeNodeType.VariableDeclaration, index, { kind, declarations: [] });
		advance();
		do {
			const declaration = createNode(SyntaxTreeNodeType.VariableDeclarator);
			declaration.id = parsePattern(false);
			addChild(declaration, declaration.id, "id");
			if (match("=")) {
				declaration.init = parseExpression(2, { allowIn: !inFor });
				addChild(declaration, declaration.init, "init");
			} else {
				declaration.init = null;
			}
			addChild(node, finish(declaration), "declarations");
		} while (match(","));
		if (consumeTerminator) consumeSemicolon();
		return finish(node);
	}

	/** Parse a function declaration or expression.
	 * @param {boolean} [async=false]
	 * @param {boolean} [expression=false]
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseFunction(async = false, expression = false) {
		const start = index;
		if (lookAhead()?.value === "async") {
			async = true;
			advance();
		}
		match("function");
		const generator = Boolean(match("*"));
		const node = createNode(expression ? SyntaxTreeNodeType.FunctionExpression : SyntaxTreeNodeType.FunctionDeclaration, start, {
			id: null,
			params: [],
			body: null,
			async,
			generator,
		});
		if (lookAhead()?.type === "identifier") {
			node.id = parseIdentifier();
			addChild(node, node.id, "id");
		}
		parseParameters(node);
		node.body = parseBlock();
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a class declaration or expression.
	 * @param {boolean} [expression=false]
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseClass(expression = false) {
		const node = createNode(expression ? SyntaxTreeNodeType.ClassExpression : SyntaxTreeNodeType.ClassDeclaration, index, {
			id: null,
			superClass: null,
			body: [],
		});
		advance();
		if (lookAhead()?.type === "identifier" && lookAhead()?.value !== "extends") {
			node.id = parseIdentifier();
			addChild(node, node.id, "id");
		}
		if (match("extends")) {
			node.superClass = parseExpression(14);
			addChild(node, node.superClass, "superClass");
		}
		match("{");
		while (!atEnd() && lookAhead()?.value !== "}") {
			const start = index;
			if (match(";")) continue;
			const element = parseClassElement();
			if (element) addChild(node, element, "body");
			if (start === index) advance();
		}
		match("}");
		return finish(node);
	}

	/** Parse a class element.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseClassElement() {
		const start = index;
		let isStatic = false;
		let async = false;
		let generator = false;
		let kind = "method";
		if (lookAhead()?.value === "static" && !["(", "=", ";", "}"].includes(lookAhead(1)?.value)) {
			isStatic = true;
			advance();
		}
		if (isStatic && lookAhead()?.value === "{") {
			const block = parseBlock();
			const node = createNode(SyntaxTreeNodeType.StaticBlock, start, { body: block.body });
			for (const statement of block.body) addChild(node, statement, "body");
			return finish(node);
		}
		if (lookAhead()?.value === "async" && hasMethodKey(1, true)) {
			async = true;
			advance();
		}
		if (match("*")) generator = true;
		if (["get", "set"].includes(lookAhead()?.value) && hasMethodKey(1)) {
			kind = lookAhead().value;
			advance();
		}
		const key = parsePropertyKey();
		if (lookAhead()?.value === "(") {
			const method = createNode(SyntaxTreeNodeType.MethodDefinition, start, {
				key: key.node,
				kind,
				static: isStatic,
				async,
				generator,
				computed: key.computed,
				params: [],
				body: null,
			});
			addChild(method, key.node, "key");
			parseParameters(method);
			method.body = parseBlock();
			addChild(method, method.body, "body");
			return finish(method);
		}
		const field = createNode(SyntaxTreeNodeType.PropertyDefinition, start, {
			key: key.node,
			static: isStatic,
			computed: key.computed,
			value: null,
		});
		addChild(field, key.node, "key");
		if (match("=")) {
			field.value = parseExpression(2);
			addChild(field, field.value, "value");
		}
		consumeSemicolon();
		return finish(field);
	}

	/** Parse a parameter list into the given node.
	 * @param {SyntaxTreeNode} node
	 * @returns {void}
	 */
	function parseParameters(node) {
		match("(");
		while (!atEnd() && lookAhead()?.value !== ")") {
			if (match(",")) continue;
			const parameter = parsePattern();
			node.params.push(parameter);
			addChild(node, parameter, "params");
			if (!match(",")) break;
		}
		match(")");
	}

	/** Parse an if statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseIfStatement() {
		const node = createNode(SyntaxTreeNodeType.IfStatement);
		advance();
		match("(");
		node.test = parseExpression();
		match(")");
		node.consequent = parseStatement();
		node.alternate = null;
		addChild(node, node.test, "test");
		addChild(node, node.consequent, "consequent");
		if (match("else")) {
			node.alternate = parseStatement();
			addChild(node, node.alternate, "alternate");
		}
		return finish(node);
	}

	/** Parse a for statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseForStatement() {
		const node = createNode(SyntaxTreeNodeType.ForStatement, index, {
			init: null,
			test: null,
			update: null,
			body: null,
			await: false,
			loopKind: "classic",
		});
		advance();
		if (match("await")) node.await = true;
		match("(");
		if (lookAhead()?.value !== ";") {
			node.init = ["const", "let", "var"].includes(lookAhead()?.value)
				? parseVariableDeclaration(false, true)
				: parseExpression(1, { allowIn: false });
			addChild(node, node.init, "init");
		}
		if (["in", "of"].includes(lookAhead()?.value)) {
			node.loopKind = lookAhead().value === "in" ? "for-in" : "for-of";
			node.type = node.loopKind === "for-in" ? SyntaxTreeNodeType.ForInStatement : SyntaxTreeNodeType.ForOfStatement;
			node.left = node.init;
			advance();
			node.right = parseExpression(1);
			addChild(node, node.right, "right");
		} else {
			match(";");
			if (lookAhead()?.value !== ";") {
				node.test = parseExpression();
				addChild(node, node.test, "test");
			}
			match(";");
			if (lookAhead()?.value !== ")") {
				node.update = parseExpression();
				addChild(node, node.update, "update");
			}
		}
		match(")");
		node.body = parseStatement();
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a while statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseWhileStatement() {
		const node = createNode(SyntaxTreeNodeType.WhileStatement, index, { test: null, body: null });
		advance();
		match("(");
		node.test = parseExpression();
		match(")");
		node.body = parseStatement();
		addChild(node, node.test, "test");
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a do-while statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseDoWhileStatement() {
		const node = createNode(SyntaxTreeNodeType.DoWhileStatement, index, { test: null, body: null });
		advance();
		node.body = parseStatement();
		match("while");
		match("(");
		node.test = parseExpression();
		match(")");
		consumeSemicolon();
		addChild(node, node.body, "body");
		addChild(node, node.test, "test");
		return finish(node);
	}

	/** Parse a return, break, or continue statement.
	 * @param {SyntaxTreeNodeTypeValue} type
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseJumpStatement(type) {
		const node = createNode(type);
		const keyword = lookAhead();
		advance();
		node.label = null;
		node.argument = null;
		if (
			type === SyntaxTreeNodeType.ReturnStatement
			&& lookAhead()
			&& ![";", "}"].includes(lookAhead().value)
			&& lookAhead().line === keyword?.line
		) {
			node.argument = parseExpression();
			addChild(node, node.argument, "argument");
		} else if (
			[SyntaxTreeNodeType.BreakStatement, SyntaxTreeNodeType.ContinueStatement].includes(type)
			&& lookAhead()?.type === "identifier"
			&& lookAhead()?.line === keyword?.line
		) {
			node.label = parseIdentifier();
			addChild(node, node.label, "label");
		}
		consumeSemicolon();
		return finish(node);
	}

	/** Parse a throw statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseThrowStatement() {
		const node = createNode(SyntaxTreeNodeType.ThrowStatement);
		advance();
		node.argument = parseExpression();
		addChild(node, node.argument, "argument");
		consumeSemicolon();
		return finish(node);
	}

	/** Parse a try statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseTryStatement() {
		const node = createNode(SyntaxTreeNodeType.TryStatement, index, { block: null, handler: null, finalizer: null });
		advance();
		node.block = parseBlock();
		addChild(node, node.block, "block");
		if (match("catch")) {
			const handler = createNode(SyntaxTreeNodeType.CatchClause, lastIndex, { param: null, body: null });
			if (match("(")) {
				handler.param = parsePattern();
				addChild(handler, handler.param, "param");
				match(")");
			}
			handler.body = parseBlock();
			addChild(handler, handler.body, "body");
			node.handler = finish(handler);
			addChild(node, node.handler, "handler");
		}
		if (match("finally")) {
			node.finalizer = parseBlock();
			addChild(node, node.finalizer, "finalizer");
		}
		return finish(node);
	}

	/** Parse a switch statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseSwitchStatement() {
		const node = createNode(SyntaxTreeNodeType.SwitchStatement, index, { discriminant: null, cases: [] });
		advance();
		match("(");
		node.discriminant = parseExpression();
		match(")");
		match("{");
		while (!atEnd() && !["}", null].includes(lookAhead()?.value)) {
			const switchCase = createNode(SyntaxTreeNodeType.SwitchCase, index, { test: null, consequent: [] });
			if (match("case")) {
				switchCase.test = parseExpression();
				addChild(switchCase, switchCase.test, "test");
			} else if (!match("default")) {
				break;
			}
			match(":");
			while (!atEnd() && !["case", "default", "}"].includes(lookAhead()?.value)) {
				const statement = parseStatement();
				if (statement) addChild(switchCase, statement, "consequent");
			}
			addChild(node, finish(switchCase), "cases");
		}
		match("}");
		addChild(node, node.discriminant, "discriminant");
		return finish(node);
	}

	/** Parse a with statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseWithStatement() {
		const node = createNode(SyntaxTreeNodeType.WithStatement, index, { object: null, body: null });
		advance();
		match("(");
		node.object = parseExpression();
		match(")");
		node.body = parseStatement();
		addChild(node, node.object, "object");
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a labeled statement.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseLabeledStatement() {
		const node = createNode(SyntaxTreeNodeType.LabeledStatement);
		node.label = parseIdentifier();
		match(":");
		node.body = parseStatement();
		addChild(node, node.label, "label");
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a binding or assignment pattern.
	 * @param {boolean} [allowDefault=true]
	 * @returns {SyntaxTreeNode|null}
	 */
	function parsePattern(allowDefault = true) {
		if (match("...")) {
			const node = createNode(SyntaxTreeNodeType.RestElement, lastIndex, { argument: null });
			node.argument = parsePattern();
			addChild(node, node.argument, "argument");
			return finish(node);
		}
		if (lookAhead()?.value === "[") {
			const node = createNode(SyntaxTreeNodeType.ArrayPattern, index, { elements: [] });
			advance();
			while (!atEnd() && lookAhead()?.value !== "]") {
				if (match(",")) {
					node.elements.push(null);
					continue;
				}
				const element = parsePattern();
				node.elements.push(element);
				addChild(node, element, "elements");
				if (!match(",")) break;
			}
			match("]");
			return finish(node);
		}
		if (lookAhead()?.value === "{") {
			const node = createNode(SyntaxTreeNodeType.ObjectPattern, index, { properties: [] });
			advance();
			while (!atEnd() && lookAhead()?.value !== "}") {
				if (match(",")) continue;
				const property = createNode(SyntaxTreeNodeType.Property);
				if (match("...")) {
					property.type = SyntaxTreeNodeType.RestElement;
					property.argument = parsePattern();
					addChild(property, property.argument, "argument");
				} else {
					const key = parsePropertyKey();
					property.key = key.node;
					property.computed = key.computed;
					if (match(":")) {
						property.value = parsePattern();
					} else {
						property.value = key.node;
						property.shorthand = true;
					}
					if (match("=")) {
						const assignment = createNode(SyntaxTreeNodeType.AssignmentPattern, key.node.startToken, {
							left: property.value,
							right: parseExpression(2),
						});
						addChild(assignment, assignment.left, "left");
						addChild(assignment, assignment.right, "right");
						property.value = finish(assignment);
					}
					addChild(property, property.key, "key");
					addChild(property, property.value, "value");
				}
				node.properties.push(finish(property));
				addChild(node, node.properties.at(-1), "properties");
				if (!match(",")) break;
			}
			match("}");
			return finish(node);
		}
		let pattern = parseIdentifier();
		if (allowDefault && match("=")) {
			const assignment = createNode(SyntaxTreeNodeType.AssignmentPattern, pattern.startToken, {
				left: pattern,
				right: parseExpression(2),
			});
			addChild(assignment, pattern, "left");
			addChild(assignment, assignment.right, "right");
			pattern = finish(assignment);
		}
		return pattern;
	}

	/** Parse an expression using operator precedence.
	 * @param {number} [minPrecedence=0]
	 * @param {{allowIn?: boolean}} [options={}]
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseExpression(minPrecedence = 0, options = {}) {
		let left = parsePrefix();
		if (!left) return null;
		while (!atEnd()) {
			const token = lookAhead();
			if (!token) break;
			if ([".", "?.", "[", "("].includes(token.value)) {
				if (17 < minPrecedence) break;
				left = parseMemberOrCall(left);
				continue;
			}
			if (token.value === "`") {
				const quasi = parseTemplateLiteral();
				const node = createNode(SyntaxTreeNodeType.TaggedTemplateExpression, left.startToken, { tag: left, quasi });
				addChild(node, left, "tag");
				addChild(node, quasi, "quasi");
				left = finish(node);
				continue;
			}
			if (["++", "--"].includes(token.value) && token.line === previousToken()?.line) {
				if (16 < minPrecedence) break;
				const node = createNode(SyntaxTreeNodeType.UpdateExpression, left.startToken, {
					operator: token.value,
					argument: left,
					prefix: false,
				});
				advance();
				addChild(node, left, "argument");
				left = finish(node);
				continue;
			}
			if (token.value === "=>" && minPrecedence <= 2) {
				const parameters =
					left.type === SyntaxTreeNodeType.ParenthesizedExpression ? left.expression?.elements || [left.expression] : [left];
				advance();
				const node = createNode(SyntaxTreeNodeType.ArrowFunctionExpression, left.startToken, {
					params: parameters.filter(Boolean),
					body: null,
					async: Boolean(left.async),
					generator: false,
					expression: true,
				});
				for (const parameter of node.params) addChild(node, parameter, "params");
				if (lookAhead()?.value === "{") {
					node.body = parseBlock();
					node.expression = false;
				} else {
					node.body = parseExpression(1);
				}
				addChild(node, node.body, "body");
				left = finish(node);
				continue;
			}
			if (token.value === "?" && minPrecedence <= 3) {
				advance();
				const consequent = parseExpression(2, options);
				match(":");
				const alternate = parseExpression(2, options);
				const node = createNode(SyntaxTreeNodeType.ConditionalExpression, left.startToken, {
					test: left,
					consequent,
					alternate,
				});
				addChild(node, left, "test");
				addChild(node, consequent, "consequent");
				addChild(node, alternate, "alternate");
				left = finish(node);
				continue;
			}
			const precedence = binaryPrecedence(token.value, options);
			if (precedence < minPrecedence || precedence === 0) break;
			advance();
			const assignment = precedence === 2;
			const rightAssociative = assignment || token.value === "**";
			const right = parseExpression(precedence + (rightAssociative ? 0 : 1), options);
			if (token.value === ",") {
				if (left.type === SyntaxTreeNodeType.SequenceExpression) {
					left.expressions.push(right);
					addChild(left, right, "expressions");
					left = finish(left);
				} else {
					const node = createNode(SyntaxTreeNodeType.SequenceExpression, left.startToken, {
						expressions: [left, right],
					});
					addChild(node, left, "expressions");
					addChild(node, right, "expressions");
					left = finish(node);
				}
				continue;
			}
			const type = assignment
				? SyntaxTreeNodeType.AssignmentExpression
				: ["&&", "||", "??"].includes(token.value)
					? SyntaxTreeNodeType.LogicalExpression
					: SyntaxTreeNodeType.BinaryExpression;
			const node = createNode(type, left.startToken, { operator: token.value, left, right });
			addChild(node, left, "left");
			addChild(node, right, "right");
			left = finish(node);
		}
		return left;
	}

	/** Parse a prefix expression or primary expression.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parsePrefix() {
		const token = lookAhead();
		if (!token) return null;
		if (token.value === "async") {
			if (lookAhead(1)?.value === "function") return parseFunction(true, true);
			if (isArrowStart(index + 1)) {
				const start = index;
				advance();
				const arrow = parseArrowParameters(start, true);
				return arrow;
			}
		}
		if (token.value === "function") return parseFunction(false, true);
		if (token.value === "class") return parseClass(true);
		if (["!", "~", "+", "-", "typeof", "void", "delete", "await", "yield"].includes(token.value)) {
			const start = index;
			advance();
			const operator = token.value;
			const delegate = operator === "yield" && Boolean(match("*"));
			const next = lookAhead();
			const hasYieldArgument =
				operator !== "yield"
				|| (next && ![";", "}", ")", "]", ","].includes(next.value) && next.line === token.line);
			const argument = hasYieldArgument ? parseExpression(operator === "yield" ? 2 : 14) : null;
			const node = createNode(
				operator === "await" ? SyntaxTreeNodeType.AwaitExpression : operator === "yield" ? SyntaxTreeNodeType.YieldExpression : SyntaxTreeNodeType.UnaryExpression,
				start,
				{
					operator,
					argument,
					prefix: true,
					delegate,
				},
			);
			addChild(node, argument, "argument");
			return finish(node);
		}
		if (["++", "--"].includes(token.value)) {
			const start = index;
			advance();
			const argument = parseExpression(14);
			const node = createNode(SyntaxTreeNodeType.UpdateExpression, start, {
				operator: token.value,
				argument,
				prefix: true,
			});
			addChild(node, argument, "argument");
			return finish(node);
		}
		if (token.value === "new" && lookAhead(1)?.value === "." && lookAhead(2)?.value === "target") {
			const start = index;
			const node = createNode(SyntaxTreeNodeType.MetaProperty, start);
			node.meta = createNode(SyntaxTreeNodeType.Identifier, start, { name: "new" });
			advance();
			advance();
			node.property = parseIdentifier();
			addChild(node, node.meta, "meta");
			addChild(node, node.property, "property");
			return finish(node);
		}
		if (token.value === "new") return parseNewExpression();
		if (token.value === "...") return parseSpreadElement();
		if (token.value === "(") {
			if (isArrowStart(index)) return parseArrowParameters(index, false);
			const node = createNode(SyntaxTreeNodeType.ParenthesizedExpression);
			advance();
			node.expression = parseExpression();
			match(")");
			addChild(node, node.expression, "expression");
			return finish(node);
		}
		if (token.value === "[") return parseArrayExpression();
		if (token.value === "{") return parseObjectExpression();
		if (token.value === "`") return parseTemplateLiteral();
		if (token.value === "this" || token.value === "super") {
			advance();
			return finish(createNode(token.value === "this" ? SyntaxTreeNodeType.ThisExpression : SyntaxTreeNodeType.Super, lastIndex));
		}
		if (token.value === "import" && lookAhead(1)?.value === ".") {
			const start = index;
			const node = createNode(SyntaxTreeNodeType.MetaProperty, start);
			node.meta = createNode(SyntaxTreeNodeType.Identifier, start, { name: "import" });
			advance();
			advance();
			node.property = parseIdentifier();
			addChild(node, node.meta, "meta");
			addChild(node, node.property, "property");
			return finish(node);
		}
		if (token.value === "import" && lookAhead(1)?.value === "(") {
			const start = index;
			advance();
			advance();
			const source = parseExpression(2);
			match(")");
			const node = createNode(SyntaxTreeNodeType.ImportExpression, start, { source });
			addChild(node, source, "source");
			return finish(node);
		}
		if (["true", "false", "null"].includes(token.value) || ["number", "string"].includes(token.type))
			return parseLiteral();
		if (token.type === "private-identifier") {
			const node = createNode(SyntaxTreeNodeType.PrivateIdentifier, index, { name: token.value.slice(1) });
			advance();
			return finish(node);
		}
		return parseIdentifier();
	}

	/** Parse parameters and body for an arrow function.
	 * @param {number} start
	 * @param {boolean} async
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseArrowParameters(start, async) {
		const params = [];
		if (match("(")) {
			while (!atEnd() && lookAhead()?.value !== ")") {
				if (match(",")) continue;
				params.push(parsePattern());
				if (!match(",")) break;
			}
			match(")");
		} else {
			params.push(parsePattern());
		}
		match("=>");
		const node = createNode(SyntaxTreeNodeType.ArrowFunctionExpression, start, {
			params,
			body: null,
			async,
			generator: false,
			expression: true,
		});
		for (const parameter of params) addChild(node, parameter, "params");
		if (lookAhead()?.value === "{") {
			node.body = parseBlock();
			node.expression = false;
		} else {
			node.body = parseExpression(1);
		}
		addChild(node, node.body, "body");
		return finish(node);
	}

	/** Parse a member or call suffix for an expression.
	 * @param {SyntaxTreeNode} object
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseMemberOrCall(object) {
		const optional = Boolean(match("?."));
		if (!optional && match(".")) {
			const property = lookAhead()?.type === "private-identifier" ? parsePrefix() : parseIdentifier();
			const node = createNode(SyntaxTreeNodeType.MemberExpression, object.startToken, {
				object,
				property,
				computed: false,
			});
			addChild(node, object, "object");
			addChild(node, property, "property");
			return finish(node);
		}
		if (optional && lookAhead()?.value !== "(" && lookAhead()?.value !== "[") {
			const property = lookAhead()?.type === "private-identifier" ? parsePrefix() : parseIdentifier();
			const node = createNode(SyntaxTreeNodeType.OptionalMemberExpression, object.startToken, {
				object,
				property,
				computed: false,
				optional: true,
			});
			addChild(node, object, "object");
			addChild(node, property, "property");
			return finish(node);
		}
		if (match("[")) {
			const property = parseExpression();
			match("]");
			const node = createNode(optional ? SyntaxTreeNodeType.OptionalMemberExpression : SyntaxTreeNodeType.MemberExpression, object.startToken, {
				object,
				property,
				computed: true,
				optional,
			});
			addChild(node, object, "object");
			addChild(node, property, "property");
			return finish(node);
		}
		if (match("(")) {
			const args = [];
			while (!atEnd() && lookAhead()?.value !== ")") {
				if (match(",")) continue;
				const argument = parseExpression(2);
				args.push(argument);
				if (!match(",")) break;
			}
			match(")");
			const node = createNode(optional ? SyntaxTreeNodeType.OptionalCallExpression : SyntaxTreeNodeType.CallExpression, object.startToken, {
				callee: object,
				arguments: args,
				optional,
			});
			addChild(node, object, "callee");
			for (const argument of args) addChild(node, argument, "arguments");
			return finish(node);
		}
		return object;
	}

	/** Parse a constructor expression.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseNewExpression() {
		const start = index;
		advance();
		let callee = parsePrefix();
		while ([".", "[", "?."].includes(lookAhead()?.value)) callee = parseMemberOrCall(callee);
		const args = [];
		if (match("(")) {
			while (!atEnd() && lookAhead()?.value !== ")") {
				if (match(",")) continue;
				args.push(parseExpression(2));
				if (!match(",")) break;
			}
			match(")");
		}
		const node = createNode(SyntaxTreeNodeType.NewExpression, start, { callee, arguments: args });
		addChild(node, callee, "callee");
		for (const argument of args) addChild(node, argument, "arguments");
		return finish(node);
	}

	/** Parse a spread element.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseSpreadElement() {
		const node = createNode(SyntaxTreeNodeType.SpreadElement, index);
		advance();
		node.argument = parseExpression(2);
		addChild(node, node.argument, "argument");
		return finish(node);
	}

	/** Parse an array expression.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseArrayExpression() {
		const node = createNode(SyntaxTreeNodeType.ArrayExpression, index, { elements: [] });
		advance();
		while (!atEnd() && lookAhead()?.value !== "]") {
			if (match(",")) {
				node.elements.push(null);
				continue;
			}
			const element = lookAhead()?.value === "..." ? parseSpreadElement() : parseExpression(2);
			node.elements.push(element);
			addChild(node, element, "elements");
			if (!match(",")) break;
		}
		match("]");
		return finish(node);
	}

	/** Parse an object expression.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseObjectExpression() {
		const node = createNode(SyntaxTreeNodeType.ObjectExpression, index, { properties: [] });
		advance();
		while (!atEnd() && lookAhead()?.value !== "}") {
			if (match(",")) continue;
			let async = false;
			let generator = false;
			let kind = "init";
			if (lookAhead()?.value === "async" && hasMethodKey(1, true)) {
				async = true;
				advance();
			}
			if (match("*")) generator = true;
			if (["get", "set"].includes(lookAhead()?.value) && hasMethodKey(1)) {
				kind = lookAhead().value;
				advance();
			}
			const property = createNode(SyntaxTreeNodeType.Property);
			if (match("...")) {
				property.type = SyntaxTreeNodeType.SpreadElement;
				property.argument = parseExpression(2);
				addChild(property, property.argument, "argument");
			} else {
				const key = parsePropertyKey();
				property.key = key.node;
				property.computed = key.computed;
				property.shorthand = false;
				if (match(":")) {
					property.value = parseExpression(2);
				} else if (lookAhead()?.value === "(") {
					property.method = true;
					property.kind = kind === "init" ? "method" : kind;
					property.async = async;
					property.generator = generator;
					property.params = [];
					property.body = null;
					parseParameters(property);
					property.body = parseBlock();
					addChild(property, property.body, "body");
				} else {
					property.value = key.node;
					property.shorthand = true;
				}
				addChild(property, property.key, "key");
				if (property.value) addChild(property, property.value, "value");
			}
			node.properties.push(finish(property));
			addChild(node, node.properties.at(-1), "properties");
			if (!match(",")) break;
		}
		match("}");
		return finish(node);
	}

	/** Parse an object property key.
	 * @returns {{node: SyntaxTreeNode|null, computed: boolean}}
	 */
	function parsePropertyKey() {
		if (match("[")) {
			const node = parseExpression();
			match("]");
			return { node, computed: true };
		}
		if (lookAhead()?.type === "private-identifier") {
			const node = createNode(SyntaxTreeNodeType.PrivateIdentifier);
			node.name = lookAhead()?.value.slice(1);
			advance();
			return { node: finish(node), computed: false };
		}
		return { node: parsePrefix(), computed: false };
	}

	/** Parse a template literal.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseTemplateLiteral() {
		const node = createNode(SyntaxTreeNodeType.TemplateLiteral, index, { quasis: [], expressions: [] });
		advance();
		while (!atEnd() && lookAhead()?.value !== "`") {
			if (lookAhead()?.type === "template-text") {
				const quasi = parseLiteral();
				quasi.type = SyntaxTreeNodeType.TemplateElement;
				node.quasis.push(quasi);
				addChild(node, quasi, "quasis");
			} else if (match("${")) {
				const expression = parseExpression();
				node.expressions.push(expression);
				addChild(node, expression, "expressions");
				match("}");
			} else {
				advance();
			}
		}
		match("`");
		return finish(node);
	}

	/** Parse a literal value.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseLiteral() {
		const token = lookAhead();
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
		const node = createNode(SyntaxTreeNodeType.Literal, index, {
			value,
			raw,
			literalType,
		});
		advance();
		return finish(node);
	}

	/** Parse an identifier.
	 * @returns {SyntaxTreeNode|null}
	 */
	function parseIdentifier() {
		const token = lookAhead();
		const node = createNode(SyntaxTreeNodeType.Identifier, index, { name: token?.value });
		advance();
		return finish(node);
	}

	/** Return the binding strength for an infix operator.
	 * @param {string} operator
	 * @param {{allowIn?: boolean}} options
	 * @returns {number}
	 */
	function binaryPrecedence(operator, options) {
		if (options?.allowIn === false && operator === "in") return 0;

		return operatorPrecedence[operator] ?? 0;
	}
	//#endregion

	/** Check whether an arrow function starts at the given token index.
	 * @param {number} index
	 * @returns {boolean}
	 */
	function isArrowStart(index) {
		const tokenIndex = nextSignificantIndex(index);
		const token = tokens[tokenIndex];
		if (token?.value === "(") {
			const close = findClosingBracket(tokenIndex);
			return (
				close !== -1
				&& nextSignificantIndex(close + 1) >= 0
				&& tokens[nextSignificantIndex(close + 1)]?.value === "=>"
			);
		}
		return token?.type === "identifier" && tokens[nextSignificantIndex(tokenIndex + 1)]?.value === "=>";
	}

	/** Check whether the current token sequence has a method key.
	 * @param {number} [offset=0]
	 * @param {boolean} [allowGenerator=false]
	 * @returns {boolean}
	 */
	function hasMethodKey(offset = 0, allowGenerator = false) {
		let keyIndex = nextSignificantIndex(index + offset);
		if (allowGenerator && tokens[keyIndex]?.value === "*") {
			keyIndex = nextSignificantIndex(keyIndex + 1);
		}
		if (tokens[keyIndex]?.value === "[") {
			keyIndex = findMatchingBracket(keyIndex, "[", "]");
			if (keyIndex === -1) return false;
			keyIndex = nextSignificantIndex(keyIndex + 1);
		} else {
			if (!["identifier", "private-identifier", "string", "number"].includes(tokens[keyIndex]?.type))
				return false;
			keyIndex = nextSignificantIndex(keyIndex + 1);
		}
		return keyIndex >= 0 && tokens[keyIndex]?.value === "(";
	}

	/** Find the matching closing parenthesis.
	 * @param {number} index
	 * @returns {number}
	 */
	function findClosingBracket(index) {
		let depth = 0;
		for (let cursor = index; cursor < tokens.length; cursor++) {
			if (tokens[cursor].type === "comment" || tokens[cursor].type === "block-comment") continue;
			if (tokens[cursor].value === "(") depth++;
			if (tokens[cursor].value === ")" && --depth === 0) return cursor;
		}
		return -1;
	}

	/** Find a matching bracket token.
	 * @param {number} index
	 * @param {string} opening
	 * @param {string} closing
	 * @returns {number}
	 */
	function findMatchingBracket(index, opening, closing) {
		let depth = 0;
		for (let cursor = index; cursor < tokens.length; cursor++) {
			if (["comment", "block-comment"].includes(tokens[cursor].type)) continue;
			if (tokens[cursor].value === opening) depth++;
			if (tokens[cursor].value === closing && --depth === 0) return cursor;
		}
		return -1;
	}

	/** Create a syntax node at the current token position.
	 * @param {SyntaxTreeNodeTypeValue} type
	 * @param {number|SyntaxToken|null} [start=index]
	 * @param {Record<string, unknown>} [properties={}]
	 * @returns {SyntaxTreeNode}
	 */
	function createNode(type, start = index, properties = {}) {
		const startToken = start instanceof SyntaxToken ? start : start === null ? null : tokens[start] ?? null;
		return new SyntaxTreeNode(type, startToken, { id: nextNodeId++, ...properties });
	}

	/** Set the final token reference for a node.
	 * @param {SyntaxTreeNode|null} node
	 * @param {number|SyntaxToken|null} [end=lastIndex]
	 * @returns {SyntaxTreeNode|null}
	 */
	function finish(node, end = lastIndex) {
		if (!node) return null;
		const endToken = end instanceof SyntaxToken ? end : end === null ? null : tokens[end] ?? null;
		node.endToken = endToken ?? node.startToken;
		return node;
	}

	/** Record a direct child and its parent reference.
	 * @param {SyntaxTreeNode|null} parent
	 * @param {SyntaxTreeNode|null} child
	 * @param {string} [role]
	 * @returns {void}
	 */
	function addChild(parent, child, role) {
		if (!parent || !child) return;
		parent.contains.push(child);
		child.container = parent;
		if (!role) return;
		if (Array.isArray(parent[role]) && !parent[role].includes(child)) parent[role].push(child);
	}

	/** Consume a semicolon if one is present.
	 * @returns {void}
	 */
	function consumeSemicolon() {
		match(";");
	}

	/** Consume the next token when its value matches.
	 * @param {string} value
	 * @returns {boolean}
	 */
	function match(value) {
		if (lookAhead()?.value !== value) return false;
		advance();
		return true;
	}

	/** Consume and return the next non-comment token.
	 * @returns {SyntaxToken|null}
	 */
	function advance() {
		skipComments();
		if (index >= tokens.length) return null;
		lastIndex = index;
		return tokens[index++];
	}

	/** Return a non-comment token without consuming it.
	 * @param {number} [byOffset=0]
	 * @returns {SyntaxToken|null}
	 */
	function lookAhead(byOffset = 0) {
		let cursor = index;
		while (cursor < tokens.length) {
			const token = tokens[cursor];
			if (token.type !== "comment" && token.type !== "block-comment") {
				if (byOffset === 0) return token;
				byOffset--;
			}
			cursor++;
		}
		return null;
	}

	/** Return the last consumed token.
	 * @returns {SyntaxToken|undefined}
	 */
	function previousToken() {
		return tokens[lastIndex];
	}

	/** Return the last consumed token.
	 * @returns {SyntaxToken|undefined}
	 */
	function lastToken() {
		return tokens[lastIndex];
	}

	/** Advance the cursor past comments.
	 * @returns {void}
	 */
	function skipComments() {
		while (index < tokens.length && ["comment", "block-comment"].includes(tokens[index].type)) {
			index++;
		}
	}

	/** Find the next non-comment token index.
	 * @param {number} start
	 * @returns {number}
	 */
	function nextSignificantIndex(start) {
		for (let index = start; index < tokens.length; index++) {
			if (!["comment", "block-comment"].includes(tokens[index].type)) return index;
		}
		return -1;
	}

	/** Check whether any non-comment tokens remain.
	 * @returns {boolean}
	 */
	function atEnd() {
		return lookAhead() === null;
	}
}
//#endregion Syntax tree builder

/**
 * Base shape shared by all nodes returned from {@link buildSyntaxTree}.
 * Syntax-specific fields (such as `body`, `params`, and `operator`) are added by the parser.
 *
 * @property {string} type Node kind, for example `FunctionDeclaration` or `BinaryExpression`.
 * @property {number} id Stable, tree-local node identifier.
 * @property {SyntaxToken|null} startToken First token belonging to this node.
 * @property {SyntaxToken|null} endToken Last token belonging to this node.
 * @property {SyntaxTreeNode[]} contains Direct child nodes.
 * @property {SyntaxTreeNode|null} container Parent node, if present.
 */
export class SyntaxTreeNode {
	/**
	 * @param {SyntaxTreeNodeTypeValue} type AST node kind.
	 * @param {SyntaxToken|null} [startToken] First token belonging to this node.
	 * @param {Record<string, any>} [properties] Node-specific fields.
	 * @returns {void}
	 */
	constructor(type, startToken = null, properties = {}) {
		this.type = type;
		this.startToken = startToken;
		this.endToken = startToken;
		this.contains = [];
		this.container = null;
		Object.assign(this, properties);
	}
}
