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
export default class OptionsPanel extends DetailPanel {
	/**
	 * @param {{
	 *   options?: GraphDisplayOptions[],
	 *   hideWhenEmpty?: boolean
	 * }} [properties] Panel options.
	 */
	constructor(options = [], { hideWhenEmpty = true } = {}) {
		super(options, { summaryTitle: "Options", hideWhenEmpty });
	}

	/** Compose the options panel using the base detail panel markup.
	 *
	 * @param {{
	 *   summaryTitle: string,
	 *   contents: GraphDisplayOptions[],
	 * }} data Component data.
	 * @returns {DocumentFragment} The panel markup.
	 */
	composeComponent(data) {
		const component = super.composeComponent(data);

		return component;
	}

	/** Create a checkbox row for each graph display option.
	 *
	 * @param {GraphDisplayOptions[]} options Option items to render.
	 * @returns {HTMLElement[]} Option row elements.
	 */
	composeContents(options) {
		const contents = options.map((option) => new CheckboxGraphDisplayOption(option));
		return contents;
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
class CheckboxGraphDisplayOption extends Component {
	/**
	 * @param {GraphDisplayOptions & { id: string, label: string }} properties Option row properties.
	 */
	constructor({ id, label, checked = false, onChange = null } = {}) {
		super({ id, label, checked, onChange });
	}

	/** Build the checkbox row markup.
	 *
	 * @param {GraphDisplayOptions & { id: string }} data Option row data.
	 * @returns {DocumentFragment} The checkbox row fragment.
	 */
	composeComponent(data) {
		const checkedState = data.checked ? "checked" : "";

		const fragment = this.html`
			<label class="graph-overlay-option">
				<input type="checkbox" ${checkedState}/>
				<span>${data.label}</span>
			</label>
		`;

		if (typeof data.onChange === "function") {
			const checkbox = fragment.querySelector("input");
			checkbox.addEventListener("change", (event) => {
				data.onChange(event.target.checked, event);
			});
		}

		return fragment;
	}
}
