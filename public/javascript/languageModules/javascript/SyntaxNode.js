/** A node in the higher-level JavaScript syntax tree. */
export class SyntaxNode {
	/** @type {string|undefined} */
	name;

	/** @type {SyntaxNode[]|undefined} */
	exports;

	/** @type {import("../../core/FileLoader.js").File|null} */
	file;

	/**
	 * @param {string} type Broad category for the node.
	 * @param {string} structure Specific declaration, statement, or expression kind.
	 * @param {import("./SyntaxToken.js").SyntaxToken|null} [startToken] First token belonging to the node.
	 * @param {import("./SyntaxToken.js").SyntaxToken|null} [endToken] Last token belonging to the node.
	 * @param {Record<string, unknown>} [properties] Node-specific values and child nodes.
	 * @returns {void}
	 */
	constructor(type, structure, startToken = null, endToken = startToken, properties = {}) {
		this.type = type;
		this.structure = structure;
		this.name = undefined;
		this.file = null;
		this.startToken = startToken;
		this.endToken = endToken;
		this.children = [];
		this.parent = null;
		Object.assign(this, properties);
	}

	/**
	 * Return the body through the consistent statement alias used by loop nodes.
	 * @returns {SyntaxNode[]|undefined}
	 */
	get statement() {
		return ["for", "for-in", "for-of"].includes(this.structure) ? this.body : undefined;
	}
}
