import Component from "../../Component.js";
import DetailPanel from "./DetailPanel.js";

export default class ConnectionTypesPanel extends Component {
	constructor({ keys = null } = {}) {
		super({ summaryTitle: "Connection types", keys });
	}

	createDomFragment(data) {
		//create hmtl template from list
		const contents = [];
		if (data.keys) {
			for (const key of data.keys) {
				console.log("key!!!!!!!!11", key);
				contents.push(new ConnectionTypeKey({ connection: key }));
			}
		}
		const panel = new DetailPanel({ summaryTitle: data.summaryTitle, contents });

		//get dom fragment
		const fragment = document.createDocumentFragment();
		fragment.appendChild(panel.element);

		return fragment;
	}

	render() {
		return this.element.outerHTML;
	}
}

class ConnectionTypeKey extends Component {
	constructor({ connection } = {}) {
		super({ connection });
	}

	createDomFragment(data) {
		const connection = data.connection[1];
		//create hmtl template
		const fragment = this.html`
			<div class="graph-connection-key-item">
				<span
					class="graph-connection-key-swatch"
					style="--connection-color: ${connection.color};"
				></span
				><span>${connection.type}</span>
			</div>
		`;

		return fragment;
	}
}
