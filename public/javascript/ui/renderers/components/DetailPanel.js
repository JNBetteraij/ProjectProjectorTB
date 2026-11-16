import Component from "../../Component.js";

export default class DetailPanel extends Component {
	constructor({ summaryTitle, contents = null } = {}) {
		super({ summaryTitle, contents });
	}

	createDomFragment(data) {
		//hmtl template
		const fragment = this.html`
			<details class="graph-overlay-window">
				<summary>${data.summaryTitle}</summary>
				<div class="content">${data.contents ?? ""}</div>
			</details>
		`;

		//subelement references
		this.contents = fragment.querySelector(".content");

		return fragment;
	}

	render() {
		return this.element.outerHTML;
	}
}
