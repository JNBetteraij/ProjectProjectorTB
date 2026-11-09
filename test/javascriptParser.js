import assert from "node:assert/strict";
import { ExportSearch } from "../public/javascript/core/Searches/ExportSearch.js";
import { ImportSearch } from "../public/javascript/core/Searches/ImportSearch.js";
import { JavaScriptParser, SyntaxTreeNode } from "../public/javascript/languageModules/javascript/JavaScriptParser.js";
import { buildSyntaxTree } from "../public/javascript/languageModules/javascript/syntaxTreeBuilder.js";

const parser = new JavaScriptParser();
const file = {
	source: `// comments are intentionally omitted from the tree
import Default, { value as importedValue } from "./dependency.js";
export default async function build({ value = 1 }, ...rest) {
	const result = value + 2 * 3;
	if (result > 0) return importedValue(result);
	else return 0;
}
class Example extends Base {
	#value = 0;
	static count = 0;
	static { this.count++; }
	async method(items) {
		for (const item of items) {
			if (item) continue;
			this.#value += item;
		}
		return this.#value;
	}
}
const calculate = (a, b) => a + b * 2;`,
};
const syntax = parser.parseSyntax(file);

function descendants(node, result = []) {
	if (!node) return result;
	result.push(node);
	for (const child of node.children) descendants(child, result);
	return result;
}

const nodes = descendants(syntax);
const find = (type, predicate = () => true) => nodes.find((node) => node.type === type && predicate(node));

assert.ok(syntax instanceof SyntaxTreeNode);
assert.ok(buildSyntaxTree(parser.getTokens(file)) instanceof SyntaxTreeNode);
assert.deepEqual(
	syntax.body.map((node) => node.type),
	["ImportDeclaration", "ExportDeclaration", "ClassDeclaration", "VariableDeclaration"],
);
assert.ok(!nodes.some((node) => node.type === "Comment"));

const exportedFunction = find("FunctionDeclaration", (node) => node.id?.name === "build");
assert.equal(exportedFunction.async, true);
assert.equal(exportedFunction.exported, true);
assert.equal(exportedFunction.defaultExport, true);

const resultDeclaration = find("VariableDeclarator", (node) => node.id?.name === "result");
assert.equal(resultDeclaration.init.type, "BinaryExpression");
assert.equal(resultDeclaration.init.operator, "+");
assert.equal(resultDeclaration.init.right.operator, "*");

assert.ok(find("ForOfStatement", (node) => node.loopKind === "for-of"));
assert.ok(find("StaticBlock"));
assert.ok(find("PrivateIdentifier", (node) => node.name === "value"));
assert.ok(nodes.some((node) => node.type === "MemberExpression" && node.property?.type === "PrivateIdentifier"));
assert.ok(nodes.some((node) => node.relationships.some((relationship) => relationship.type === "extends")));
assert.ok(nodes.some((node) => node.relationships.some((relationship) => relationship.type === "calls")));
assert.ok(nodes.some((node) => node.relationships.some((relationship) => relationship.type === "writes")));
assert.ok(nodes.some((node) => node.relationships.some((relationship) => relationship.type === "returns")));

const imports = parser.parse(file, new ImportSearch(parser));
assert.deepEqual(imports.map(({ source }) => source), ["./dependency.js"]);
const exports = parser.parse(file, new ExportSearch(parser));
assert.deepEqual(exports.map(({ name, type }) => ({ name, type })), [{ name: "default", type: "function" }]);
assert.equal(parser.parseSyntax(file), syntax);

const expressionTree = parser.buildSyntaxTree(
	parser.tokenize({
		source: `const details = {
	get value() { return this.source; },
	async *iterate(item) { yield await item; yield* item; yield; },
	};
	const result = new Thing(details).value?.(1 + 2 * 3);
	const template = \`result: \${result}\`;
	const tagged = tag\`value: \${result}\`;
	const sequence = (a, b, c) => (a, b, c);
	const values = [.5, 1_000, 0xff, 10n, true, null];`,
	}),
);
const expressionNodes = descendants(expressionTree);
assert.ok(expressionNodes.some((node) => node.type === "Property" && node.kind === "get"));
assert.ok(expressionNodes.some((node) => node.type === "Property" && node.async && node.generator));
assert.ok(expressionNodes.some((node) => node.type === "NewExpression"));
assert.ok(expressionNodes.some((node) => node.type === "OptionalCallExpression"));
assert.ok(expressionNodes.some((node) => node.type === "TemplateLiteral"));
assert.ok(expressionNodes.some((node) => node.type === "TaggedTemplateExpression"));
assert.ok(expressionNodes.some((node) => node.type === "SequenceExpression" && node.expressions.length === 3));
assert.ok(expressionNodes.some((node) => node.type === "YieldExpression" && node.delegate));
assert.ok(expressionNodes.some((node) => node.type === "YieldExpression" && node.argument === null));
assert.deepEqual(
	expressionNodes.filter((node) => node.type === "Literal").slice(-6).map(({ value, literalType }) => [value, literalType]),
	[[0.5, "number"], [1000, "number"], [255, "number"], ["10", "bigint"], [true, "boolean"], [null, "null"]],
);

const controlTree = parser.buildSyntaxTree(
	parser.tokenize({
		source: `function control(value) {
			for (const key in value) {}
			while (false) {}
			do {} while (false);
			try { switch (value) { case 1: break; default: throw value; } }
			catch (error) { return error; }
			finally { debugger; }
		}`,
	}),
);
const controlNodes = descendants(controlTree);
assert.ok(controlNodes.some((node) => node.type === "ForInStatement"));
assert.ok(controlNodes.some((node) => node.type === "WhileStatement"));
assert.ok(controlNodes.some((node) => node.type === "DoWhileStatement"));
assert.ok(controlNodes.some((node) => node.type === "TryStatement"));
assert.ok(controlNodes.some((node) => node.type === "SwitchStatement"));
assert.ok(controlNodes.some((node) => node.type === "ThrowStatement"));
assert.ok(controlNodes.some((node) => node.type === "DebuggerStatement"));

const moduleTree = parser.buildSyntaxTree(
	parser.tokenize({ source: `const moduleValue = await import("./dynamic.js"); import.meta.url; new.target;` }),
);
const moduleNodes = descendants(moduleTree);
assert.ok(moduleNodes.some((node) => node.type === "ImportExpression"));
assert.ok(moduleNodes.some((node) => node.type === "MetaProperty" && node.property?.name === "meta"));
assert.ok(moduleNodes.some((node) => node.type === "MetaProperty" && node.property?.name === "target"));

console.log("JavaScript parser tests passed.");
