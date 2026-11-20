import Component from "../../Component.js";
import DetailPanel from "./DetailPanel.js";

/** A detail panel that explains the graph's connection types. */
export default class ConnectionTypesPanel extends DetailPanel {
	/**
	 * @param {{
	 *   keys?: Map<string, import("../../ConnectionType.js").ConnectionType> | null,
	 *   hideWhenEmpty?: boolean
	 * }} [properties] Connection-key panel options.
	 */
	constructor({ keys = null, hideWhenEmpty = true } = {}) {
		super(keys, { summaryTitle: "Connection types", hideWhenEmpty });
	}

	/**
	 * Compose the connection-types panel using the base panel markup.
	 *
	 * @param {{ contents: unknown, summaryTitle: string }} data Panel component data.
	 * @returns {DocumentFragment} The panel markup.
	 */
	composeComponent(data) {
		const component = super.composeComponent(data);
		return component;
	}

	/**
	 * Create a display row for each connection type.
	 *
	 * @param {Map<string, import("../../ConnectionType.js").ConnectionType>} connections Connection types to render.
	 * @returns {HTMLElement[]} Connection-type key elements.
	 */
	composeContents(connections) {
		connections = Array.from(connections.values());
		const contents = connections.map((connection) => new ConnectionTypeKey({ connection }));
		return contents;
	}

	/**
	 * Return the panel markup.
	 *
	 * @returns {string} Serialized panel HTML.
	 */
	render() {
		return this.element.outerHTML;
	}
}

/** A legend entry for one graph connection type and its highlight colors. */
class ConnectionTypeKey extends Component {
	/**
	 * @param {{ connection: import("../../ConnectionType.js").ConnectionType }} properties Connection type to display.
	 */
	constructor({ connection } = {}) {
		super({ connection });
	}

	/**
	 * Build the connection-type legend entry.
	 *
	 * @param {{ connection: import("../../ConnectionType.js").ConnectionType }} data Legend entry data.
	 * @returns {DocumentFragment} The legend entry markup.
	 */
	composeComponent(data) {
		const connection = data.connection;
		//create hmtl template
		const fragment = this.html`
			<div class="graph-connection-key-entry">
				<div class="graph-connection-key-item">
					<span
						class="graph-connection-key-swatch"
						style="--connection-color: ${connection.color};"
					></span
					><span>${connection.type}</span>
				</div>
				<div class="graph-connection-key-subitems">
					<div class="graph-connection-key-item">
						<span
							class="graph-connection-key-swatch"
							style="--connection-color: ${connection.highlightColors.incoming};"
						></span
						><span>Incoming</span>
					</div>
					<div class="graph-connection-key-item">
						<span
							class="graph-connection-key-swatch"
							style="--connection-color: ${connection.highlightColors.outgoing};"
						></span
						><span>Outgoing</span>
					</div>
				</div>
			</div>
		`;

		return fragment;
	}
}
