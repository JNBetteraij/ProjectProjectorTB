import Component from "../../Component.js";

const emptyString = "";

/** A collapsible panel for rendering and updating content. */
export default class DetailPanel extends Component {
	/**
	 * @param {unknown} [contents=[]] Initial content passed to {@link composeContents}.
	 * @param {{
	 *   summaryTitle?: string,
	 *   hideWhenEmpty?: boolean
	 * }} [properties] Panel display options.
	 */
	constructor(contents = [], { summaryTitle, hideWhenEmpty = true } = {}) {
		super({ contents, summaryTitle });

		this.hideWhenEmpty = hideWhenEmpty;
		this.hideIfEmpty();
	}

	/**
	 * Compose the collapsible panel markup and retain its content container.
	 *
	 * @param {{ contents: unknown, summaryTitle: string }} data Panel component data.
	 * @returns {DocumentFragment} The panel markup.
	 */
	composeComponent(data) {
		//HTML template
		const fragment = this.html`
			<details class="graph-overlay-window">
				<summary>${data.summaryTitle}</summary>
				<div class="content">${this.extractContents(data)}</div>
			</details>
		`;

		//subelement references
		this.content = fragment.querySelector(".content");

		return fragment;
	}

	/**
	 * Convert the panel content data into values for the content container.
	 *
	 * @param {{ contents: unknown }} data Panel component data.
	 * @returns {unknown} Normalized panel contents, or an empty string when contents is falsy.
	 */
	extractContents(data) {
		if (!data.contents) return emptyString;
		return this.composeContents(data.contents);
	}

	/**
	 * Normalize content into an array, using iterable values and object values when applicable.
	 *
	 * @param {unknown} contents Content to normalize.
	 * @returns {unknown[]} Normalized content values.
	 */
	composeContents(contents) {
		if (contents == null) return [];
		//handle Nodes and DocumentFragments.
		if (contents instanceof Node) return [contents];
		//handle prmitive values and strings
		if (typeof contents !== "object") return [String(contents)];
		//handle ordinary objects
		if (!(Symbol.iterator in contents)) return Object.values(contents);
		//handle maps by creating an array from their values
		if (contents instanceof Map) return Array.from(contents.values());
		//handle remaining collection types
		return Array.from(contents instanceof Map ? contents.values() : contents);
	}

	/**
	 * Hide the panel when configured to do so and its content container is empty.
	 *
	 * @param {HTMLElement} [element=this.element] Element whose visibility to update.
	 * @returns {void}
	 */
	hideIfEmpty(element = this.element) {
		element.hidden = this.hideWhenEmpty && this.content.innerHTML.trim() === "";
	}

	/** Replace the panel contents and update its visibility.
	 *
	 * @param {unknown} contents Content values to normalize and add to the panel.
	 * @returns {void}
	 */
	setContents(contents) {
		this.content.replaceChildren(this.html`${this.composeContents(contents)}`);
		this.hideIfEmpty();
	}

	/**
	 * Return the panel markup.
	 *
	 * @returns {string} Serialized panel HTML.
	 */
	render() {
		return this.element.outerHTML;
	}
}
