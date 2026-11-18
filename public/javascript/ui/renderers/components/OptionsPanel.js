import Component from "../../Component.js";
import DetailPanel from "./DetailPanel.js";
/**
 * @typedef {object} GraphDisplayOptions
 * @property {string} id Option identifier.
 * @property {string} label Option label.
 * @property {boolean} [checked] Whether the option is initially checked.
 * @property {(checked: boolean) => void} [onChange] Called when the checkbox changes.
 */

/** A collapsible graph-overlay panel containing configurable options. */
export default class OptionsPanel extends Component {
	/**
	 * @param {{
	 *   options?: GraphDisplayOptions[],
	 *   hideWhenEmpty?: boolean
	 * }} [properties] Panel options.
	 */
	constructor({ options = [], hideWhenEmpty = true } = {}) {
		super({ summaryTitle: "Options", options, hideWhenEmpty });
	}

	/** Build the options panel and preserve its graph-overlay references.
	 *
	 * @param {{
	 *   summaryTitle: string,
	 *   options: GraphDisplayOptions[],
	 *   hideWhenEmpty: boolean
	 * }} data Component data.
	 * @returns {DetailPanel} The constructed detail panel.
	 */
	constructComponent(data) {
		const detailPanel = new DetailPanel({
			summaryTitle: data.summaryTitle,
			contents: [],
		});

		detailPanel.contents.className = "graph-overlay-options";
		// detailPanel.element.setAttribute("data-highlight-options", "");
		// detailPanel.contents.setAttribute("data-highlight-options-list", "");

		this.details = detailPanel.element;
		this.optionsList = detailPanel.contents;
		this.hideWhenEmpty = data.hideWhenEmpty;
		this.setOptions(data.options);

		return detailPanel;
	}

	/**
	 * @param {GraphDisplayOptions[]} options Option records to render.
	 * @returns {void}
	 */
	setOptions(options) {
		this.optionsList.replaceChildren(...options.map((option) => new GraphOptionComponent(option).element));
		this.details.hidden = this.hideWhenEmpty && options.length === 0;
	}

	/** Return the panel markup.
	 *
	 * @returns {string} Serialized panel HTML.
	 */
	render() {
		return this.element.outerHTML;
	}
}

/** A checkbox row displayed inside an options panel. */
class GraphOptionComponent extends Component {
	/**
	 * @param {GraphDisplayOptions} properties Option row properties.
	 */
	constructor({ id, label, checked = false, onChange = null } = {}) {
		super({ id, label, checked, onChange });
	}

	/** Build the checkbox row markup.
	 *
	 * @param {GraphDisplayOptions & { id: string }} data Option row data.
	 * @returns {DocumentFragment} The checkbox row fragment.
	 */
	constructComponent(data) {
		const fragment = this.html`
			<label class="graph-overlay-option">
				<input type="checkbox" />
				<span>${data.label}</span>
			</label>
		`;
		const checkbox = fragment.querySelector("input");
		checkbox.checked = data.checked;
		checkbox.addEventListener("change", () => {
			data.onChange?.(checkbox.checked);
		});

		return fragment;
	}
}
