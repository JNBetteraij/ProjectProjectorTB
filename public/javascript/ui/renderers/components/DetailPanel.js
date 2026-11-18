import Component from "../../Component.js";

const emptyString = "";

export default class DetailPanel extends Component {
	constructor(contents = [], { summaryTitle, hideWhenEmpty = true } = {}) {
		super({ contents, summaryTitle });

		this.hideWhenEmpty = hideWhenEmpty;
		this.hideIfEmpty();
	}

	constructComponent(data) {
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
	extractContents(data) {
		if (!data.contents) return emptyString;
		return this.constructContents(data.contents);
	}

	constructContents(contents) {
		if (contents == null) return [];
		//handle Nodes and DocumentFragments.
		if (contents instanceof Node) return [contents];
		//handle prmitive values and strings
		if (typeof contents !== "object") return [String(contents)];
		//handle ordinary objects
		if (!(Symbol.iterator in contents)) return Object.values(contents);
		//handle remaining collection types (Maps return their values, not keys)
		return Array.from(contents instanceof Map ? contents.values() : contents);
	}

	hideIfEmpty(element = this.element) {
		element.hidden = this.hideWhenEmpty && this.content.innerHTML === "";
	}

	/**
	 * @param {Component[]} contents Components to add to the detail panel.
	 * @returns {void}
	 */
	setContents(contents) {
		this.content.replaceChildren(...this.constructContents(contents));
		this.hideIfEmpty();
	}

	render() {
		return this.element.outerHTML;
	}
}
