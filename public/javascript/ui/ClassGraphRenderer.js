import { GraphDisplay } from "./GraphDisplay.js";

//#region Class graph renderer

/** Render classes as nodes connected from base classes to their subclasses. */
export class ClassGraphRenderer extends GraphDisplay {
	/**
	 * Create a renderer for the class graph viewport.
	 *
	 * @param {{ viewport: HTMLElement, edgeSvg: SVGSVGElement, nodeLayer: HTMLElement, emptyState: HTMLElement }} elements Graph elements used by the renderer.
	 * @returns {void} No value is returned.
	 */
	constructor({ viewport, edgeSvg, nodeLayer, emptyState }) {
		super({ viewport, world: nodeLayer.parentElement, edgeSvg, nodeLayer, emptyState });
		this.classes = [];
		this.edges = [];
		this.fitPending = false;
		this.selectedId = null;
	}

	/**
	 * Lay out class inheritance levels and draw the class nodes and arrows.
	 *
	 * @param {{ classes: object[], edges: object[] }} graph Resolved class graph to display.
	 * @returns {void} No value is returned.
	 */
	render(graph) {
		this.classes = graph.classes;
		this.edges = graph.edges;
		this.selectedId = null;
		this.nodeLayer.replaceChildren();
		this.nodeElements.clear();
		this.edgeSvg.querySelectorAll(".class-edge-layer").forEach((layer) => layer.remove());
		this.edgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		this.emptyState.hidden = graph.classes.length > 0;
		this.edgeSvg.hidden = graph.classes.length === 0;
		this.fitPending = true;
		this.graph = graph;
		this.setGraphNodes(
			graph.classes,
			graph.edges,
			(classRecord) => `${classRecord.file.path.full}:${classRecord.name}`,
		);
		for (const classRecord of graph.classes) {
			const graphNode = this.graphNodes.get(classRecord.id);
			const element = this.createNode(classRecord);
			graphNode.element = element;
			this.nodeElements.set(classRecord.id, element);
			this.nodeLayer.append(element);
			element.style.left = `${graphNode.position.x}px`;
			element.style.top = `${graphNode.position.y}px`;
		}
		this.resizeWorld();
		this.drawEdges(graph.edges);
		if (!this.viewport.hidden) this.fitIfPending();
	}

	/**
	 * Fit the graph once it is visible, without resetting the view on later switches.
	 *
	 * @returns {void} No value is returned.
	 */
	fitIfPending() {
		if (!this.fitPending) return;
		this.fit();
		this.fitPending = false;
	}

	/**
	 * Create the graph's shared incoming connection point at the left node edge.
	 *
	 * @param {object} classRecord Class represented by the node.
	 * @returns {{ side: string, anchor: number }} Incoming connection point configuration.
	 */
	getIncomingConnectionPoint(classRecord) {
		return { side: "left", anchor: 0.5 };
	}

	/**
	 * Create the graph's shared outgoing connection point at the right node edge.
	 *
	 * @param {object} classRecord Class represented by the node.
	 * @returns {{ side: string, anchor: number }} Outgoing connection point configuration.
	 */
	getOutgoingConnectionPoint(classRecord) {
		return { side: "right", anchor: 0.5 };
	}

	/**
	 * Draw inheritance connections using the shared graph connection router.
	 *
	 * @param {object[]} edges Directed base-to-derived edges.
	 * @returns {void} No value is returned.
	 */
	drawEdges(edges) {
		this.drawConnections(edges, {
			markerId: "classArrowhead",
			title: (edge) => {
				const source = this.graphNodes.get(edge.sourceId)?.data;
				const target = this.graphNodes.get(edge.targetId)?.data;
				return `${source?.name} is the base class of ${target?.name}`;
			},
		});
	}

	/**
	 * Create a class node with its file, base, and declared-member details.
	 *
	 * @param {object} classRecord Class declaration represented by this node.
	 * @returns {HTMLElement} Rendered class node element.
	 */
	createNode(classRecord) {
		const node = document.createElement("article");
		node.className = "class-graph-node";
		node.dataset.nodeId = classRecord.id;
		node.addEventListener("click", () => this.selectClass(classRecord.id));

		const header = document.createElement("div");
		header.className = "class-graph-node-header";
		const heading = document.createElement("h2");
		heading.textContent = classRecord.name;
		header.append(heading);
		const dragHandle = document.createElement("button");
		dragHandle.className = "node-drag-handle";
		dragHandle.type = "button";
		dragHandle.setAttribute("aria-label", `Drag class ${classRecord.name}`);
		dragHandle.title = "Drag to move; position snaps to a column";
		dragHandle.textContent = "⠿";
		dragHandle.addEventListener("pointerdown", (event) => this.startNodeDrag(event, classRecord.id));
		header.append(dragHandle);
		node.append(header);
		const fileName = document.createElement("p");
		fileName.className = "class-graph-file";
		fileName.textContent = classRecord.file.path.full;
		node.append(fileName);
		const base = document.createElement("p");
		base.className = "class-graph-base";
		base.textContent = classRecord.extends
			? `extends ${classRecord.extends.name}`
			: classRecord.extension
				? `extends ${classRecord.extendsName} (not in project)`
				: "No base class";
		node.append(base);

		const members = document.createElement("ul");
		const memberNames = [];
		if (classRecord.constructor) memberNames.push("constructor");
		memberNames.push(
			...classRecord.methods.map((method) => `${method.static ? "static " : ""}${method.name}()`),
			...classRecord.properties.map((property) => `${property.static ? "static " : ""}${property.name}`),
			...classRecord.accessors.map((accessor) =>
				`${accessor.static ? "static " : ""}${accessor.name} (accessor)`,
			),
		);
		for (const memberName of memberNames.slice(0, 5)) {
			const item = document.createElement("li");
			item.textContent = memberName;
			members.append(item);
		}
		if (memberNames.length > 5) {
			const remaining = document.createElement("li");
			remaining.className = "muted";
			remaining.textContent = `…and ${memberNames.length - 5} more`;
			members.append(remaining);
		}
		if (members.childElementCount) node.append(members);

		const derived = document.createElement("p");
		derived.className = "class-graph-derived";
		derived.textContent = classRecord.inheritedBy.length
			? `Inherited by: ${classRecord.inheritedBy.map((child) => child.name).join(", ")}`
			: "No project subclasses";
		node.append(derived);
		return node;
	}

	/**
	 * Focus a class node in the graph viewport.
	 *
	 * @param {number} classId Identifier of the class to focus.
	 * @returns {void} No value is returned.
	 */
	focusClass(classId) {
		this.selectClass(classId);
		this.focusNode(classId);
	}

	/**
	 * Select a class node and highlight its direct inheritance relationships.
	 *
	 * @param {number} classId ID of the class to select.
	 * @returns {void} No value is returned.
	 */
	selectClass(classId) {
		this.selectedId = classId;
		this.highlightConnections(classId);
	}

}

//#endregion Class graph renderer
