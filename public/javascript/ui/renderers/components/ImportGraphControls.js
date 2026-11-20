import Component from "../../Component.js";

/**
 * Local traversal controls available in the import graph view.
 *
 * @property {HTMLButtonElement} showLocalButton Button that switches to local files.
 * @property {HTMLButtonElement} showDependenciesButton Button that shows dependencies.
 * @property {HTMLButtonElement} showDependantsButton Button that shows dependants.
 * @property {HTMLButtonElement} showFullGraphButton Button that restores the full graph.
 */
export default class ImportGraphControls extends Component {
	constructor() {
		super();
	}

	/**
	 * Build the local traversal controls and retain direct references to their buttons.
	 *
	 * @returns {DocumentFragment} The controls fragment.
	 */
	composeComponent() {
		//HTML template
		const fragment = this.html`
			<div class="local-graph-controls">
				<button type="button" disabled>Show local</button>
				<button type="button" hidden>Show dependencies</button>
				<button type="button" hidden>Show dependants</button>
				<button type="button" hidden>Show full graph</button>
			</div>
		`;
		const controls = fragment.firstElementChild;
		if (!(controls instanceof HTMLElement) || controls.children.length !== 4) {
			throw new Error("Import graph controls are missing their required buttons.");
		}

		//assign sub elements
		[this.showLocalButton, this.showDependenciesButton, this.showDependantsButton, this.showFullGraphButton] =
			controls.children;

		//Todo: implement eventslisteners

		return fragment;
	}
}
