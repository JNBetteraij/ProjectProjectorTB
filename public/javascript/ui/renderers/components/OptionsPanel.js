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
	 * @param {options?}: GraphDisplayOptions[],
	 * @param {{
	 *   hideWhenEmpty?: boolean
	 * }} [properties] Panel options.
	 */
	constructor({ options = [], hideWhenEmpty = true } = {}) {
		super(options, { summaryTitle: "Options", hideWhenEmpty });
	}

	/** Build the options panel and preserve its graph-overlay references.
	 *
	 * @param {{
	 *   summaryTitle: string,
	 *   options: GraphDisplayOptions[],
	 * }} data Component data.
	 * @returns {DetailPanel} The constructed detail panel.
	 */
	constructComponent(data) {
		const component = super.constructComponent(data);

		return component;
	}

	/**
	 * @param {GraphDisplayOptions[]} options Option items to render.
	 * @returns {GraphOptionComponent[]} Components for the detail panel.
	 */
	constructContents(options) {
		return options.map((option) => new GraphOptionComponent(option).element);
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
