/** Define the interface for tokenizers used by language parser modules. */
export class Tokenizer {
	/** Create a tokenizer that delegates to a language-specific implementation.
	 *
	 * @param {(source: string) => import("./Token.js").Token[]} tokenizeSource Language-specific tokenization function.
	 */
	constructor(tokenizeSource) {
		if (typeof tokenizeSource !== "function") {
			throw new TypeError("Tokenizer requires a tokenize function.");
		}

		this.tokenizeSource = tokenizeSource;
	}

	/** Convert source text into language-specific tokens.
	 *
	 * The implementation must return tokens in source order.
	 *
	 * @param {string} source Source text to tokenize.
	 * @returns {import("./Token.js").Token[]} Tokens generated from the source.
	 */
	tokenize(source) {
		if (typeof source !== "string") throw new TypeError("Tokenizer requires source text.");
		return this.tokenizeSource(source);
	}
}
