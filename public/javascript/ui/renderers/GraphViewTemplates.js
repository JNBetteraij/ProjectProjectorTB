/** Reusable options panel markup for graph view templates. */
export const optionsPanelTemplate = `
	<details class="graph-overlay-window" data-highlight-options>
		<summary>Options</summary>
		<div class="graph-overlay-options" data-highlight-options-list></div>
	</details>
`;

/** Reusable connection-type key markup for graph view templates. */
export const connectionTypesPanelTemplate = `
	<details class="graph-overlay-window" data-graph-connection-key hidden>
		<summary>Connection types</summary>
		<ul class="graph-connection-key" data-connection-key-list></ul>
	</details>
`;

/** Local traversal controls available in the import graph view. */
export const importGraphControlsTemplate = `
	<div class="local-graph-controls">
		<button data-show-local type="button" disabled>Show local</button>
		<button data-show-dependencies type="button" hidden>Show dependencies</button>
		<button data-show-dependants type="button" hidden>Show dependants</button>
		<button data-show-full-graph type="button" hidden>Show full graph</button>
	</div>
`;

/**
 * @typedef {object} GraphViewTemplateOptions
 * @property {string} viewportClass CSS classes for the viewport.
 * @property {string} worldClass CSS class for the transformed graph world.
 * @property {string} edgeClass CSS classes for the graph edge SVG.
 * @property {string} nodeClass CSS classes for the graph node layer.
 * @property {string} ariaLabel Accessible name for the viewport.
 * @property {string} emptyMessage Message shown when the graph is empty.
 * @property {string} markerId Unique SVG marker identifier.
 * @property {boolean} [selectionLayers] Whether to include selected edge and node layers.
 * @property {string} [controlsTemplate] Additional graph-specific control markup.
 * @property {boolean} [initiallyHidden] Whether the viewport starts hidden.
 */

/**
 * Create the shared graph viewport markup, with the supplied graph-specific layers.
 *
 * @param {GraphViewTemplateOptions} options View-specific classes, labels, marker ID, and optional layers.
 * @returns {string} HTML markup for one graph viewport.
 */
export function createGraphViewTemplate({
	viewportClass,
	worldClass,
	edgeClass,
	nodeClass,
	ariaLabel,
	emptyMessage,
	markerId,
	selectionLayers = false,
	controlsTemplate = "",
	initiallyHidden = false,
}) {
	return /* html */ `
		<div class="${viewportClass}" data-graph-viewport tabindex="0" aria-label="${ariaLabel}"${initiallyHidden ? " hidden" : ""}>
			<div class="graph-overlay" aria-label="Graph key and options">
				${optionsPanelTemplate}
				${connectionTypesPanelTemplate}
			</div>
			<div class="${worldClass}" data-graph-world>
				<svg class="${edgeClass}" data-graph-edges aria-hidden="true">
					<defs>
						<marker id="${markerId}" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
							<path d="M 0 0 L 9 4 L 0 8 z"></path>
						</marker>
					</defs>
				</svg>
				${selectionLayers ? '<svg class="selected-graph-edges" data-selected-graph-edges aria-hidden="true"></svg>' : ""}
				<div class="${nodeClass}" data-graph-nodes></div>
				${selectionLayers ? '<div class="selected-graph-nodes" data-selected-graph-nodes></div>' : ""}
			</div>
			<div class="empty-graph" data-graph-empty>${emptyMessage}</div>
			${controlsTemplate}
		</div>
	`;
}
