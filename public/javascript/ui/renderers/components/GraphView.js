import Component from "../../Component.js";

/**
 * @typedef {object} GraphViewConfiguration
 * @property {string} viewportClass CSS classes for the viewport.
 * @property {string} worldClass CSS class for the transformed graph world.
 * @property {string} edgeClass CSS classes for the graph edge SVG.
 * @property {string} nodeClass CSS classes for the graph node layer.
 * @property {string} ariaLabel Accessible name for the viewport.
 * @property {string} emptyMessage Message shown when the graph is empty.
 * @property {string} markerId Unique SVG marker identifier.
 * @property {boolean} [selectionLayers] Whether to include selected edge and node layers.
 * @property {boolean} [initiallyHidden] Whether the viewport starts hidden.
 * @property {import("../../Component.js").default | null} [controls] Optional graph-specific controls component.
 *
 * @typedef {GraphViewConfiguration & {
 *   optionsPanel: import("../../Component.js").default,
 *   connectionTypesPanel: import("../../Component.js").default
 * }} GraphViewOptions
 */

/**
 * Compose the shared graph viewport and expose its parts as component properties.
 *
 * @property {HTMLElement} viewport Graph viewport root element.
 * @property {HTMLElement} world Transformed graph world element.
 * @property {SVGSVGElement} edgeSvg Main graph edge layer.
 * @property {HTMLElement} nodeLayer Main graph node layer.
 * @property {HTMLElement} emptyState Empty graph message element.
 * @property {SVGSVGElement | null} selectedEdgeSvg Optional selected edge layer.
 * @property {HTMLElement | null} selectedNodeLayer Optional selected node layer.
 * @property {string} markerId Unique marker ID used by this graph view.
 * @property {boolean} selectionLayers Whether selected edge and node layers are enabled.
 * @property {import("../../Component.js").default} optionsPanel Options panel component.
 * @property {import("../../Component.js").default} connectionTypesPanel Connection-types panel component.
 * @property {import("../../Component.js").default | null} controls Optional graph-specific controls component.
 */
export default class GraphView extends Component {
	/**
	 * @param {GraphViewOptions} options View configuration and child components.
	 */
	constructor(options) {
		super(options);
	}

	/**
	 * Build the viewport markup and retain direct references to its child elements.
	 *
	 * @param {GraphViewOptions} data View configuration and child components.
	 * @returns {DocumentFragment} The viewport fragment.
	 */
	composeComponent(data) {
		const selectionLayers = data.selectionLayers ?? false;
		const fragment = this.html`
			<div class="${data.viewportClass}" tabindex="0" aria-label="${data.ariaLabel}" ${data.initiallyHidden ? "hidden" : ""}>
				<div class="graph-overlay" aria-label="Graph key and options">
					${data.optionsPanel}
					${data.connectionTypesPanel}
				</div>
				<div class="${data.worldClass}">
					<svg class="${data.edgeClass}" aria-hidden="true">
						<defs>
							<marker id="${data.markerId}" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
								<path d="M 0 0 L 9 4 L 0 8 z"></path>
							</marker>
						</defs>
					</svg>
					${selectionLayers ? '<svg class="selected-graph-edges" aria-hidden="true"></svg>' : ""}
					<div class="${data.nodeClass}"></div>
					${selectionLayers ? '<div class="selected-graph-nodes"></div>' : ""}
				</div>
				<div class="empty-graph">${data.emptyMessage}</div>
				${data.controls || ""}
			</div>
		`;

		const viewport = fragment.firstElementChild;
		const world = viewport?.children[1];
		if (!(viewport instanceof HTMLElement) || !(world instanceof HTMLElement)) {
			throw new Error("Could not create the graph viewport.");
		}

		const edgeSvg = world.children[0];
		const nodeLayer = world.children[selectionLayers ? 2 : 1];
		const emptyState = viewport.children[2];
		const selectedEdgeSvg = selectionLayers ? world.children[1] : null;
		const selectedNodeLayer = selectionLayers ? world.children[3] : null;
		if (
			!(edgeSvg instanceof SVGSVGElement) ||
			!(nodeLayer instanceof HTMLElement) ||
			!(emptyState instanceof HTMLElement) ||
			(selectionLayers &&
				(!(selectedEdgeSvg instanceof SVGSVGElement) || !(selectedNodeLayer instanceof HTMLElement)))
		) {
			throw new Error("Graph view markup does not contain its required elements.");
		}

		this.viewport = viewport;
		this.world = world;
		this.edgeSvg = edgeSvg;
		this.nodeLayer = nodeLayer;
		this.emptyState = emptyState;
		this.selectedEdgeSvg = selectedEdgeSvg;
		this.selectedNodeLayer = selectedNodeLayer;
		this.markerId = data.markerId;
		this.selectionLayers = selectionLayers;
		this.optionsPanel = data.optionsPanel;
		this.connectionTypesPanel = data.connectionTypesPanel;
		this.controls = data.controls ?? null;

		return fragment;
	}
}