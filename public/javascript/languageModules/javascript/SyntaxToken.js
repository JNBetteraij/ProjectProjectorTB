/** @typedef {{type: string, value: string, line: number, [property: string]: unknown}} SyntaxTokenProperties */

/** A token emitted by the JavaScript tokenizer, including tokenizer-specific metadata. */
export class SyntaxToken {
	/** @type {string} */
	type;

	/** @type {string} */
	value;

	/** @type {number} */
	line;

	/**
	 * @param {SyntaxTokenProperties} properties Token fields and optional tokenizer metadata.
	 * @returns {void}
	 */
	constructor(properties) {
		Object.assign(this, properties);
	}
}
