import Component from "../../Component.js";
import DetailPanel from "./DetailPanel.js";

export default class ConnectionTypesPanel extends DetailPanel {
	constructor({ keys = null, hideWhenEmpty = true } = {}) {
		super(keys, { summaryTitle: "Connection types", hideWhenEmpty });
	}

	constructComponent(data) {
		const component = super.constructComponent(data);
		return component;
	}

	/**
	 * @param {[string, import("../../ConnectionType.js").ConnectionType][]} connections Connection types to render.
	 * @returns {ConnectionTypeKey[]} Components for the detail panel.
	 */
	constructContents(connections) {
		connections = Array.from(connections.values());
		return connections.map((connection) => new ConnectionTypeKey({ connection }).element);
	}

	render() {
		return this.element.outerHTML;
	}
}

class ConnectionTypeKey extends Component {
	constructor({ connection } = {}) {
		super({ connection });
	}

	constructComponent(data) {
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
