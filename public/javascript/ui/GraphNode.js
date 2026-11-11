//#region Generic graph node

/** Represent a graph item and the named connection points available on its node. */
export class GraphNode {
	/**
	 * Create a graph node with configurable incoming and outgoing anchor points.
	 *
	 * @param {object} data Domain record represented by the node.
	 * @param {object} options Node ID and connection-point configuration.
	 * @returns {void} No value is returned.
	 */
	constructor(data, { id = data.id, incoming = { side: "left" }, outgoing = { side: "right" } } = {}) {
		this.id = id;
		this.data = data;
		this.incoming = incoming;
		this.outgoing = outgoing;
		this.position = { x: 0, y: 0, columnX: 0, gridTop: 0, row: 0 };
		this.element = null;
	}

	/**
	 * Measure the selected incoming or outgoing connection point in graph coordinates.
	 *
	 * @param {"incoming" | "outgoing"} direction Connection direction for this point.
	 * @param {number} scale Current world transform scale.
	 * @returns {{ x: number, y: number }} Connection-point coordinates.
	 */
	getConnectionPoint(direction, scale = 1) {
		const configuration = this[direction];
		const position = this.position;
		const element = this.element;
		const width = element?.offsetWidth || configuration.width || 300;
		const height = element?.offsetHeight || configuration.height || 132;
		let y = position.y + height * (configuration.anchor ?? 0.5);

		if (configuration.section && element) {
			const section = element.querySelector(
				`.node-detail-box[data-section="${configuration.section}"] > summary`,
			);
			if (section) {
				const nodeBounds = element.getBoundingClientRect();
				const sectionBounds = section.getBoundingClientRect();
				y = position.y + (sectionBounds.top - nodeBounds.top + sectionBounds.height / 2) / scale;
			}
		}

		if (configuration.side === "top") return { x: position.x + width * (configuration.anchor ?? 0.5), y: position.y };
		if (configuration.side === "bottom") {
			return { x: position.x + width * (configuration.anchor ?? 0.5), y: position.y + height };
		}
		if (configuration.side === "left") return { x: position.x, y };
		return { x: position.x + width, y };
	}
}

//#endregion Generic graph node
