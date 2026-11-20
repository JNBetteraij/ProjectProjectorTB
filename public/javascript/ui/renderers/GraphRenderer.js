import { GraphDisplay } from "../GraphDisplay.js";
import GraphView from "./components/GraphView.js";
import ConnectionTypesPanel from "./components/ConnectionTypesPanel.js";
import OptionsPanel from "./components/OptionsPanel.js";

/**
 * @typedef {import("./components/GraphView.js").GraphViewConfiguration & {
 *   container: HTMLElement,
 *   markerPrefix: string,
 *   connectionTypes: Map<string, import("../ConnectionType.js").ConnectionType>
 * }} GraphViewOptions
 */
const highlightOptions = [
	{ id: "upstream", label: "Highlight upstream" },
	{ id: "downstream", label: "Highlight downstream" },
];
let graphViewInstanceCount = 0;

/** Provide shared graph-view controls, connection keys, and configurable highlighting. */
export class GraphRenderer extends GraphDisplay {
	/**
	 * Create a graph viewport component and initialize shared controls.
	 *
	 * @param {GraphViewOptions} options Graph container, view-specific classes, labels, and optional layers.
	 * @returns {void}
	 */
	constructor(options) {
		const graphView = createGraphView(options);
		super(graphView);
		this.graphView = graphView;
		this.connectionTypes = new Map(options.connectionTypes);
		this.markerId = graphView.markerId;
		this.connectionTypesPanel = graphView.connectionTypesPanel;
		this.optionsPanel = graphView.optionsPanel;
		this.highlightOptions = this.getHighlightOptions();
		this.highlightSettings = new Map(
			this.highlightOptions.map((option) => [option.id, this.getDefaultHighlightOptions().includes(option.id)]),
		);
		this.createGraphDisplayOptions();
	}

	/**
	 * Return the extended highlighting options supported by this graph view.
	 *
	 * Subclasses may override this method to omit or add option records.
	 *
	 * @returns {{ id: string, label: string }[]} Highlight options available in this view.
	 */
	getHighlightOptions() {
		return highlightOptions;
	}

	/**
	 * Return option IDs that should be enabled when this view is created.
	 *
	 * Subclasses may override this method to select different defaults.
	 *
	 * @returns {string[]} IDs of enabled-by-default highlighting options.
	 */
	getDefaultHighlightOptions() {
		return [];
	}

	/**
	 * @returns {void}
	 */
	createGraphDisplayOptions() {
		this.optionsPanel.setContents(
			this.highlightOptions.map((option) => ({
				...option,
				checked: this.highlightSettings.get(option.id) || false,
				onChange: (checked) => {
					this.highlightSettings.set(option.id, checked);
					this.updateSelection?.();
				},
			})),
		);
	}

	/**
	 * Refresh the connection-type key from the renderer's predefined connection types.
	 *
	 * The key is hidden when the graph contains no edges.
	 *
	 * @returns {void}
	 */
	updateConnectionKey() {
		this.connectionTypesPanel.setContents(this.connectionTypes);
	}

	/**
	 * Update shared node and edge highlighting for the current selection.
	 *
	 * @returns {void}
	 */
	updateSelection() {
		this.highlightConnections(this.selectedId);
	}
}

/**
 * Create and append a graph view component.
 *
 * @param {GraphViewOptions} options Graph container and view configuration.
 * @returns {GraphView} The initialized graph view component.
 * @throws {Error} If the container is missing.
 */
function createGraphView(options) {
	const { container, markerPrefix } = options;
	if (!container) throw new Error("A container element is required to create a graph view.");
	const markerId = `${markerPrefix}-${++graphViewInstanceCount}`;
	const graphView = new GraphView({
		...options,
		markerId,
		controls: options.controls ?? null,
		optionsPanel: new OptionsPanel(),
		connectionTypesPanel: new ConnectionTypesPanel(),
	});
	container.append(graphView.element);
	return graphView;
}
