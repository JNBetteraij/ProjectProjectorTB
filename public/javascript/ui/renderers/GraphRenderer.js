import { GraphDisplay, getConnectionType, getConnectionTypeColor } from "../GraphDisplay.js";

const highlightOptions = [
	{ id: "upstream", label: "Highlight upstream" },
	{ id: "downstream", label: "Highlight downstream" },
];

/** Provide shared graph-view controls, connection keys, and configurable highlighting. */
export class GraphRenderer extends GraphDisplay {
	/**
	 * Initialize the shared graph renderer and its overlay controls.
	 *
	 * @param {object} elements Viewport, graph layers, and empty-state elements.
	 * @returns {void} No value is returned.
	 */
	constructor(elements) {
		super(elements);
		this.highlightOptions = this.getHighlightOptions();
		this.highlightSettings = new Map(
			this.highlightOptions.map((option) => [
				option.id,
				this.getDefaultHighlightOptions().includes(option.id),
			]),
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
	 * Build the view's highlight checkboxes from its supported options.
	 *
	 * @returns {void} No value is returned.
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
	 * @returns {void} No value is returned.
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
	 * @returns {void} No value is returned.
	 */
	updateSelection() {
		this.highlightConnections(this.selectedId);
	}
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
