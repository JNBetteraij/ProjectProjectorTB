import { GraphDisplay } from "../GraphDisplay.js";
import { createGraphViewTemplate } from "./GraphViewTemplates.js";
import OptionsPanel from "./components/OptionsPanel.js";

/**
 * @typedef {import("./GraphViewTemplates.js").GraphViewTemplateOptions & {
 *   container: HTMLElement,
 *   markerPrefix: string,
 *   connectionTypes: Map<string, import("../ConnectionType.js").ConnectionType>
 * }} GraphViewOptions
 *
 * @typedef {object} GraphViewElements
 * @property {HTMLElement} viewport Graph viewport root element.
 * @property {HTMLElement} world Transformed graph world element.
 * @property {SVGSVGElement} edgeSvg Main graph edge layer.
 * @property {HTMLElement} nodeLayer Main graph node layer.
 * @property {HTMLElement} emptyState Empty graph message element.
 * @property {SVGSVGElement | null} selectedEdgeSvg Selected edge layer, when enabled.
 * @property {HTMLElement | null} selectedNodeLayer Selected node layer, when enabled.
 * @property {string} markerId Unique marker ID used by this graph view.
 */
const highlightOptions = [
	{ id: "upstream", label: "Highlight upstream" },
	{ id: "downstream", label: "Highlight downstream" },
];
let graphViewInstanceCount = 0;

/** Provide shared graph-view controls, connection keys, and configurable highlighting. */
export class GraphRenderer extends GraphDisplay {
	/**
	 * Create a graph viewport from a reusable template and initialize shared controls.
	 *
	 * @param {GraphViewOptions} options Graph container, view-specific classes, labels, and optional layers.
	 * @returns {void}
	 */
	constructor(options) {
		const elements = createGraphView(options);
		super(elements);
		this.connectionTypes = new Map(options.connectionTypes);
		this.markerId = elements.markerId;
		this.highlightOptions = this.getHighlightOptions();
		this.highlightSettings = new Map(
			this.highlightOptions.map((option) => [option.id, this.getDefaultHighlightOptions().includes(option.id)]),
		);
		this.connectionKeyList = this.viewport.querySelector("[data-connection-key-list]");
		this.connectionKeyDetails = this.viewport.querySelector("[data-graph-connection-key]");
		const optionsPanelPlaceholder = this.viewport.querySelector("[data-options-panel]");
		if (!(optionsPanelPlaceholder instanceof HTMLTemplateElement)) {
			throw new Error("Graph view template is missing [data-options-panel].");
		}
		this.optionsPanel = new OptionsPanel();
		optionsPanelPlaceholder.replaceWith(this.optionsPanel.element);
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
	 * Find a required element inside this graph view.
	 *
	 * @param {string} selector Scoped CSS selector for an element in the view.
	 * @returns {HTMLElement} Matching graph-view element.
	 * @throws {Error} If the view does not contain a matching element.
	 */
	getViewElement(selector) {
		const element = requireGraphElement(this.viewport, selector);
		if (!(element instanceof HTMLElement)) {
			throw new Error(`Graph view element ${selector} must be an HTML element.`);
		}
		return element;
	}

	/**
	 * @returns {void}
	 */
	createGraphDisplayOptions() {
		this.optionsPanel.setOptions(
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
		if (!this.connectionKeyDetails || !this.connectionKeyList) return;

		const connectionTypes = this.connectionTypes;
		console.log(connectionTypes);

		this.connectionKeyDetails.hidden = false;
		this.connectionKeyList.replaceChildren();
		for (const [key, type] of connectionTypes) {
			console.log(type);
			this.connectionKeyList.append(this.createConnectionKeyItem(formatConnectionType(type.type), type.color));
		}

		// const edges = this.graph?.edges || [];
		// const presentTypes = new Set(edges.map(getConnectionType));
		// const types = [...this.connectionTypes.values()].filter((type) => presentTypes.has(type.type));
		// const hasEdges = edges.length > 0;
		// this.connectionKeyDetails.hidden = !hasEdges || types.length === 0;
		// this.connectionKeyList.replaceChildren();
		// if (!hasEdges || types.length === 0) return;

		// for (const type of types) {
		// 	this.connectionKeyList.append(this.createConnectionKeyItem(formatConnectionType(type.type), type.color));
		// }
		// const highlightColors = types[0].highlightColors;
		// this.connectionKeyList.append(
		// 	this.createConnectionKeyItem("Incoming highlight", highlightColors.incoming),
		// 	this.createConnectionKeyItem("Outgoing highlight", highlightColors.outgoing),
		// );
	}

	/**
	 * Create one labeled color swatch in the connection key.
	 *
	 * @param {string} label Key entry label.
	 * @param {string} color CSS color or variable for the swatch.
	 * @returns {HTMLLIElement} Rendered connection key entry.
	 */
	createConnectionKeyItem(label, color) {
		const item = document.createElement("li");
		item.className = "graph-connection-key-item";
		const swatch = document.createElement("span");
		swatch.className = "graph-connection-key-swatch";
		swatch.style.setProperty("--connection-color", color);
		swatch.setAttribute("aria-hidden", "true");
		const text = document.createElement("span");
		text.textContent = label;
		item.append(swatch, text);
		return item;
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
 * Create a graph view from a template and resolve its internal graph elements.
 *
 * @param {GraphViewOptions} options Graph container and view configuration.
 * @returns {GraphViewElements} Graph display elements and the unique SVG marker ID.
 * @throws {Error} If the container or any required graph-view element is missing.
 */
function createGraphView(options) {
	const { container, markerPrefix, ...viewOptions } = options;
	if (!container) throw new Error("A container element is required to create a graph view.");
	const markerId = `${markerPrefix}-${++graphViewInstanceCount}`;
	const template = document.createElement("template");
	template.innerHTML = createGraphViewTemplate({ ...viewOptions, markerId });
	const viewport = template.content.firstElementChild;
	if (!viewport) throw new Error("Could not create the graph viewport.");
	const elements = {
		viewport,
		world: requireGraphElement(viewport, "[data-graph-world]"),
		edgeSvg: requireGraphElement(viewport, "[data-graph-edges]"),
		nodeLayer: requireGraphElement(viewport, "[data-graph-nodes]"),
		emptyState: requireGraphElement(viewport, "[data-graph-empty]"),
		selectedEdgeSvg: viewport.querySelector("[data-selected-graph-edges]"),
		selectedNodeLayer: viewport.querySelector("[data-selected-graph-nodes]"),
		markerId,
	};
	container.append(viewport);
	return elements;
}

/**
 * Find an element required by the graph view implementation.
 *
 * @param {ParentNode} root View or template root to search.
 * @param {string} selector Scoped CSS selector for the required element.
 * @returns {Element} Matching element.
 * @throws {Error} If the required graph-view element is missing.
 */
function requireGraphElement(root, selector) {
	const element = root.querySelector(selector);
	if (!element) throw new Error(`Graph view template is missing ${selector}.`);
	return element;
}

/**
 * Format a connection type identifier for its user-facing key label.
 *
 * @param {string} type Connection type identifier.
 * @returns {string} Readable connection type label.
 */
function formatConnectionType(type) {
	return type.charAt(0).toUpperCase() + type.slice(1);
}
