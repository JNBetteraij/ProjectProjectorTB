/** Represents a token produced by a language tokenizer.
 *
 * A token stores its type, source value, and line number, along with any
 * additional metadata supplied by the tokenizer.
 */
export class Token {
	/** Create a token with its core source details and optional properties.
	 *
	 * @param {string} type The token's type.
	 * @param {string} value The token's source value.
	 * @param {number} line The source line where the token begins.
	 * @param {Record<string, unknown>} [properties={}] Additional token properties.
	 */
	constructor(type, value, line, properties = {}) {
		this.type = type;
		this.value = value;
		this.line = line;
		Object.assign(this, properties);
	}
}
