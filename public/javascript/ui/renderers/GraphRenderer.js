import { GraphDisplay, getConnectionType, getConnectionTypeColor } from "../GraphDisplay.js";
import { createGraphViewTemplate } from "./GraphViewTemplates.js";

/**
 * @typedef {import("./GraphViewTemplates.js").GraphViewTemplateOptions & {
 *   container: HTMLElement,
 *   markerPrefix: string
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
		this.markerId = elements.markerId;
		this.highlightOptions = this.getHighlightOptions();
		this.highlightSettings = new Map(
			this.highlightOptions.map((option) => [option.id, this.getDefaultHighlightOptions().includes(option.id)]),
		);
		this.connectionKeyList = this.viewport.querySelector("[data-connection-key-list]");
		this.connectionKeyDetails = this.viewport.querySelector("[data-graph-connection-key]");
		this.highlightOptionsList = this.viewport.querySelector("[data-highlight-options-list]");
		this.highlightOptionsDetails = this.viewport.querySelector("[data-highlight-options]");
		this.createHighlightOptions();
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
	 * Build the view's highlight checkboxes from its supported options.
	 *
	 * @returns {void}
	 */
	createHighlightOptions() {
		if (!this.highlightOptionsList || !this.highlightOptionsDetails) return;
		this.highlightOptionsDetails.hidden = this.highlightOptions.length === 0;
		this.highlightOptionsList.replaceChildren();
		for (const option of this.highlightOptions) {
			const label = document.createElement("label");
			label.className = "graph-overlay-option";
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = this.highlightSettings.get(option.id) || false;
			checkbox.addEventListener("change", () => {
				this.highlightSettings.set(option.id, checkbox.checked);
				this.updateSelection?.();
			});
			const text = document.createElement("span");
			text.textContent = option.label;
			label.append(checkbox, text);
			this.highlightOptionsList.append(label);
		}
	}

	/**
	 * Refresh the connection-type key and color mapping for the displayed edges.
	 *
	 * The key is hidden when the graph contains no edges.
	 *
	 * @param {object[]} edges Directed edges in the current graph.
	 * @returns {void}
	 */
	updateConnectionKey(edges) {
		if (!this.connectionKeyDetails || !this.connectionKeyList) return;
		const types = [...new Set(edges.map(getConnectionType))];
		this.connectionKeyDetails.hidden = types.length === 0;
		this.connectionKeyList.replaceChildren();
		if (types.length === 0) return;

		types.forEach((type, index) => {
			const color = types.length > 1 ? getConnectionTypeColor(index) : "#9aa8b7";
			this.connectionKeyList.append(this.createConnectionKeyItem(formatConnectionType(type), color));
		});
		this.connectionKeyList.append(
			this.createConnectionKeyItem("Incoming highlight", "var(--incoming)"),
			this.createConnectionKeyItem("Outgoing highlight", "var(--outgoing)"),
		);
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
