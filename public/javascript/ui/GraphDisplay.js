import { GraphNode } from "./GraphNode.js";

//#region Shared graph display

const nodeWidth = 300;
const nodeHeight = 132;
const columnGap = 620;
const rowGap = 290;

/** Provide the shared layout, viewport controls, focus, and connection drawing for graph types. */
export class GraphDisplay {
	/**
	 * Initialize a graph viewport and register shared pan, zoom, and drag interactions.
	 *
	 * @param {object} elements Viewport, world, node layer, and SVG elements for this graph.
	 * @returns {void} No value is returned.
	 */
	constructor({
		viewport,
		world,
		edgeSvg,
		nodeLayer,
		emptyState,
		selectedEdgeSvg = null,
		selectedNodeLayer = null,
	}) {
		this.viewport = viewport;
		this.world = world;
		this.edgeSvg = edgeSvg;
		this.selectedEdgeSvg = selectedEdgeSvg;
		this.selectedNodeLayer = selectedNodeLayer;
		this.nodeLayer = nodeLayer;
		this.emptyState = emptyState;
		this.graph = null;
		this.positions = new Map();
		this.graphNodes = new Map();
		this.nodeElements = new Map();
		this.edgeElements = new Map();
		this.pan = { x: 0, y: 0, scale: 1 };
		this.dragState = null;

		this.viewport.addEventListener("pointerdown", (event) => this.startPan(event));
		this.viewport.addEventListener("pointermove", (event) => this.movePointer(event));
		this.viewport.addEventListener("pointerup", (event) => this.endPointer(event));
		this.viewport.addEventListener("pointercancel", () => this.endPointer());
		this.viewport.addEventListener("wheel", (event) => this.zoom(event), { passive: false });
	}

	/**
	 * Lay out nodes in shared left-to-right rank columns with stable row metadata.
	 *
	 * @param {object[]} nodes Domain records that will become graph nodes.
	 * @param {object[]} edges Directed edges between node IDs.
	 * @param {(node: object) => string} getLabel Stable display label for row ordering.
	 * @returns {Map<number, object>} Node positions indexed by node ID.
	 */
	layoutNodes(nodes, edges, getLabel = (node) => String(node.id)) {
		const positions = new Map();
		const connectedNodes = new Set(edges.flatMap((edge) => [edge.sourceId, edge.targetId]));
		const { groups, orphans } = this.getConnectedGroups(nodes, edges, connectedNodes);
		let componentTop = 120;
		let columnOffset = 0;

		for (const group of groups) {
			const groupIds = new Set(group.map((node) => node.id));
			const groupEdges = edges.filter((edge) => groupIds.has(edge.sourceId) && groupIds.has(edge.targetId));
			const columns = getColumnRanks(group, groupEdges);
			const maxColumn = Math.max(...columns.values());
			const rowsByColumn = new Map();
			for (const node of group) {
				const column = columns.get(node.id) || 0;
				if (!rowsByColumn.has(column)) rowsByColumn.set(column, []);
				rowsByColumn.get(column).push(node);
			}

			let groupHeight = 0;
			for (const [column, columnNodes] of rowsByColumn) {
				columnNodes.sort((first, second) => getLabel(first).localeCompare(getLabel(second)));
				groupHeight = Math.max(groupHeight, columnNodes.length * rowGap);
				columnNodes.forEach((node, row) => {
					const x = 120 + (columnOffset + column) * columnGap;
					positions.set(node.id, {
						nodeId: node.id,
						x,
						y: componentTop + 70 + row * rowGap,
						row,
						columnX: x,
						gridTop: componentTop + 70,
					});
				});
			}
			componentTop += groupHeight + 220;
			columnOffset += maxColumn + 1;
		}

		if (orphans.length) {
			const columnCount = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(orphans.length))));
			orphans.forEach((node, index) => {
				const row = Math.floor(index / columnCount);
				const column = index % columnCount;
				const x = 120 + column * columnGap;
				positions.set(node.id, {
					nodeId: node.id,
					x,
					y: componentTop + 70 + row * rowGap,
					row,
					columnX: x,
					gridTop: componentTop + 70,
				});
			});
		}
		return positions;
	}

	/**
	 * Group connected nodes and combine disconnected nodes into one orphan layout.
	 *
	 * @param {object[]} nodes All nodes in the current graph.
	 * @param {object[]} edges Directed edges between graph nodes.
	 * @param {Set<number>} connectedNodeIds Node IDs participating in an edge.
	 * @returns {{ groups: object[][], orphans: object[] }} Connected components and nodes with no edges.
	 */
	getConnectedGroups(nodes, edges, connectedNodeIds) {
		const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
		for (const edge of edges) {
			neighbors.get(edge.sourceId)?.add(edge.targetId);
			neighbors.get(edge.targetId)?.add(edge.sourceId);
		}
		const visited = new Set();
		const groups = [];
		for (const node of nodes) {
			if (!connectedNodeIds.has(node.id) || visited.has(node.id)) continue;
			const group = [];
			const queue = [node.id];
			visited.add(node.id);
			while (queue.length) {
				const currentId = queue.shift();
				group.push(nodes.find((candidate) => candidate.id === currentId));
				for (const neighborId of neighbors.get(currentId) || []) {
					if (visited.has(neighborId)) continue;
					visited.add(neighborId);
					queue.push(neighborId);
				}
			}
			groups.push(group);
		}
		return { groups, orphans: nodes.filter((node) => !connectedNodeIds.has(node.id)) };
	}

	/**
	 * Create and register node models for a graph data set.
	 *
	 * @param {object[]} nodes Domain records to wrap.
	 * @param {object[]} edges Directed connections between node IDs.
	 * @param {(node: object) => string} getLabel Stable display label used for node ordering.
	 * @param {Map<number, object> | null} [positions=null] Existing positions to preserve.
	 * @returns {void} No value is returned.
	 */
	setGraphNodes(nodes, edges, getLabel, positions = null) {
		this.graphNodes.clear();
		this.positions = positions || this.layoutNodes(nodes, edges, getLabel);
		for (const node of nodes) {
			const graphNode = new GraphNode(node, {
				incoming: this.getIncomingConnectionPoint(node),
				outgoing: this.getOutgoingConnectionPoint(node),
			});
			graphNode.position = this.positions.get(graphNode.id);
			this.graphNodes.set(graphNode.id, graphNode);
		}
	}

	/**
	 * Describe the default left-side anchor for an incoming edge.
	 *
	 * @param {object} node Domain record represented by a node.
	 * @returns {object} Incoming anchor settings.
	 */
	getIncomingConnectionPoint(node) {
		return { side: "left", anchor: 0.5 };
	}

	/**
	 * Describe the default right-side anchor for an outgoing edge.
	 *
	 * @param {object} node Domain record represented by a node.
	 * @returns {object} Outgoing anchor settings.
	 */
	getOutgoingConnectionPoint(node) {
		return { side: "right", anchor: 0.5 };
	}

	/**
	 * Draw graph connections using node-defined anchors and shared orthogonal routing.
	 *
	 * @param {object[]} edges Directed edge records.
	 * @param {{ markerId?: string, title?: (edge: object) => string, selectedLayer?: SVGSVGElement }} [options={}] Connection rendering options.
	 * @returns {void} No value is returned.
	 */
	drawConnections(edges, { markerId = "arrowhead", title = () => "", selectedLayer = null } = {}) {
		this.edgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		selectedLayer?.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		this.edgeElements.clear();
		const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
		layer.classList.add("edge-layer");
		const pathsByIncomingPoint = new Map();

		for (const edge of edges) {
			const source = this.graphNodes.get(edge.sourceId);
			const target = this.graphNodes.get(edge.targetId);
			if (!source || !target) continue;

			const start = source.getConnectionPoint("outgoing", this.pan.scale);
			const end = target.getConnectionPoint("incoming", this.pan.scale);
			const points = createConnectionRoute(start, end);
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", createOrthogonalPath(points));
			path.classList.add("graph-edge");
			path.dataset.sourceId = edge.sourceId;
			path.dataset.targetId = edge.targetId;
			path.dataset.edgeKey = `${edge.sourceId}:${edge.targetId}`;
			const pointKey = `${end.x}:${end.y}`;
			if (!pathsByIncomingPoint.has(pointKey)) pathsByIncomingPoint.set(pointKey, []);
			pathsByIncomingPoint.get(pointKey).push(path);
			const edgeTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
			edgeTitle.textContent = title(edge);
			path.append(edgeTitle);
			layer.append(path);
			this.edgeElements.set(path.dataset.edgeKey, path);
		}

		for (const paths of pathsByIncomingPoint.values()) {
			paths.at(-1)?.setAttribute("marker-end", `url(#${markerId})`);
		}
		this.edgeSvg.append(layer);
		if (selectedLayer) {
			const selectedEdges = document.createElementNS("http://www.w3.org/2000/svg", "g");
			selectedEdges.classList.add("edge-layer");
			selectedLayer.append(selectedEdges);
		}
		this.updateSelection?.();
	}

	/**
	 * Highlight a selected node, its connected nodes, and incoming and outgoing edges.
	 *
	 * @param {number | null} selectedId ID of the selected node, or null to clear highlighting.
	 * @returns {Set<number>} The selected node ID and its directly connected node IDs.
	 */
	highlightConnections(selectedId) {
		const highlightedIds = new Set();
		for (const node of this.nodeElements.values()) {
			node.classList.remove("selected", "incoming", "outgoing");
		}
		for (const edge of this.edgeElements.values()) {
			edge.classList.remove("incoming-edge", "outgoing-edge");
		}
		if (selectedId === null) return highlightedIds;

		highlightedIds.add(selectedId);
		this.nodeElements.get(selectedId)?.classList.add("selected");
		const highlightedEdges = [];
		for (const edge of this.graph?.edges || []) {
			const path = this.edgeElements.get(`${edge.sourceId}:${edge.targetId}`);
			if (edge.sourceId === selectedId) {
				highlightedIds.add(edge.targetId);
				this.nodeElements.get(edge.targetId)?.classList.add("outgoing");
				path?.classList.add("outgoing-edge");
				if (path) highlightedEdges.push(path);
			}
			if (edge.targetId === selectedId) {
				highlightedIds.add(edge.sourceId);
				this.nodeElements.get(edge.sourceId)?.classList.add("incoming");
				path?.classList.add("incoming-edge");
				if (path && !highlightedEdges.includes(path)) highlightedEdges.push(path);
			}
		}
		for (const path of highlightedEdges) {
			path.parentElement?.append(path);
		}
		return highlightedIds;
	}

	/**
	 * Resize the graph world and its SVG layers to contain all nodes and connections.
	 *
	 * @returns {void} No value is returned.
	 */
	resizeWorld() {
		const nodes = [...this.graphNodes.values()];
		const width = nodes.length
			? Math.max(...nodes.map((node) => node.position.x + this.getNodeWidth(node.id))) + 300
			: this.viewport.clientWidth;
		const height = nodes.length
			? Math.max(...nodes.map((node) => node.position.y + this.getNodeHeight(node.id))) + 300
			: this.viewport.clientHeight;
		this.world.style.width = `${width}px`;
		this.world.style.height = `${height}px`;
		this.edgeSvg.setAttribute("width", width);
		this.edgeSvg.setAttribute("height", height);
		this.nodeLayer.style.width = `${width}px`;
		this.nodeLayer.style.height = `${height}px`;
		this.selectedNodeLayer?.style.setProperty("width", `${width}px`);
		this.selectedNodeLayer?.style.setProperty("height", `${height}px`);
		if (this.selectedEdgeSvg) {
			this.selectedEdgeSvg.setAttribute("width", width);
			this.selectedEdgeSvg.setAttribute("height", height);
		}
	}

	/**
	 * Measure a node's rendered width for layout bounds and focus calculations.
	 *
	 * @param {number} nodeId Graph node identifier.
	 * @returns {number} Node width in graph coordinates.
	 */
	getNodeWidth(nodeId) {
		return this.nodeElements.get(nodeId)?.offsetWidth || nodeWidth;
	}

	/**
	 * Measure a node's rendered height for layout bounds and focus calculations.
	 *
	 * @param {number} nodeId Graph node identifier.
	 * @returns {number} Node height in graph coordinates.
	 */
	getNodeHeight(nodeId) {
		return this.nodeElements.get(nodeId)?.offsetHeight || nodeHeight;
	}

	/**
	 * Return the extent of all graph nodes.
	 *
	 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }} Graph-space bounds.
	 */
	getGraphBounds() {
		const nodes = [...this.graphNodes.values()];
		return {
			minX: Math.min(...nodes.map((node) => node.position.x)),
			minY: Math.min(...nodes.map((node) => node.position.y)),
			maxX: Math.max(...nodes.map((node) => node.position.x + this.getNodeWidth(node.id))),
			maxY: Math.max(...nodes.map((node) => node.position.y + this.getNodeHeight(node.id))),
		};
	}

	/**
	 * Calculate a scale that fits the graph bounds inside the current viewport.
	 *
	 * @returns {number} A scale between zero and the shared maximum zoom.
	 */
	getFitScale() {
		if (!this.graphNodes.size) return 1;
		const bounds = this.getGraphBounds();
		const width = Math.max(200, this.viewport.clientWidth - 80);
		const height = Math.max(200, this.viewport.clientHeight - 80);
		return Math.min(1.25, width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY));
	}

	/**
	 * Fit the current graph to its viewport.
	 *
	 * @returns {void} No value is returned.
	 */
	fit() {
		if (!this.graphNodes.size) {
			this.pan = { x: 0, y: 0, scale: 1 };
			this.applyTransform();
			return;
		}
		const bounds = this.getGraphBounds();
		this.pan.scale = this.getFitScale();
		this.pan.x = (this.viewport.clientWidth - (bounds.maxX + bounds.minX) * this.pan.scale) / 2;
		this.pan.y = (this.viewport.clientHeight - (bounds.maxY + bounds.minY) * this.pan.scale) / 2;
		this.applyTransform();
		this.drawEdges(this.graph.edges);
	}

	/**
	 * Focus and center a graph node in the viewport.
	 *
	 * @param {number} nodeId Identifier of the node to center.
	 * @returns {void} No value is returned.
	 */
	focusNode(nodeId) {
		const node = this.graphNodes.get(nodeId);
		if (!node) return;
		const position = node.position;
		this.pan.x = this.viewport.clientWidth / 2
			- (position.x + this.getNodeWidth(nodeId) / 2) * this.pan.scale;
		this.pan.y = this.viewport.clientHeight / 2
			- (position.y + this.getNodeHeight(nodeId) / 2) * this.pan.scale;
		this.applyTransform();
	}

	/**
	 * Apply the current translation and scale to the graph world.
	 *
	 * @returns {void} No value is returned.
	 */
	applyTransform() {
		this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.pan.scale})`;
	}

	/**
	 * Start panning when the user presses the primary pointer on the viewport.
	 *
	 * @param {PointerEvent} event Pointer event from the graph viewport.
	 * @returns {void} No value is returned.
	 */
	startPan(event) {
		if (event.button !== 0 || event.target.closest(".graph-node, .class-graph-node, .local-graph-controls")) return;
		this.dragState = {
			type: "pan",
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: this.pan.x,
			originY: this.pan.y,
		};
		this.viewport.setPointerCapture(event.pointerId);
	}

	/**
	 * Start dragging a graph node without starting a viewport pan.
	 *
	 * @param {PointerEvent} event Pointer event from a node drag handle.
	 * @param {number} nodeId Identifier of the node being moved.
	 * @returns {void} No value is returned.
	 */
	startNodeDrag(event, nodeId) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const position = this.positions.get(nodeId);
		this.dragState = {
			type: "node",
			pointerId: event.pointerId,
			nodeId,
			startX: event.clientX,
			startY: event.clientY,
			originX: position.x,
			originY: position.y,
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	/**
	 * Move the graph view or a graph node according to the active pointer drag.
	 *
	 * @param {PointerEvent} event Pointer movement event.
	 * @returns {void} No value is returned.
	 */
	movePointer(event) {
		if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
		if (this.dragState.type === "pan") {
			this.pan.x = this.dragState.originX + event.clientX - this.dragState.startX;
			this.pan.y = this.dragState.originY + event.clientY - this.dragState.startY;
			this.applyTransform();
			return;
		}

		const dx = (event.clientX - this.dragState.startX) / this.pan.scale;
		const dy = (event.clientY - this.dragState.startY) / this.pan.scale;
		if (Math.abs(dx) + Math.abs(dy) > 3) this.dragState.moved = true;
		const position = this.positions.get(this.dragState.nodeId);
		position.x = this.dragState.originX + dx;
		position.y = this.dragState.originY + dy;
		const node = this.graphNodes.get(this.dragState.nodeId);
		node.position = position;
		node.element.style.left = `${position.x}px`;
		node.element.style.top = `${position.y}px`;
		this.drawEdges(this.graph.edges);
	}

	/**
	 * Finalize a pointer drag and notify the renderer when a node moved.
	 *
	 * @param {PointerEvent} [event] Pointer event ending the drag.
	 * @returns {void} No value is returned.
	 */
	endPointer(event) {
		if (event && this.dragState?.pointerId !== event.pointerId) return;
		if (this.dragState?.type === "node" && this.dragState.moved) {
			const position = this.positions.get(this.dragState.nodeId);
			const columns = [...new Set([...this.positions.values()].map((point) => point.columnX))];
			const snappedX = columns.reduce(
				(closest, columnX) =>
					Math.abs(columnX - position.x) < Math.abs(closest - position.x) ? columnX : closest,
				columns[0],
			);
			const occupiedRows = new Set(
				[...this.positions.entries()]
					.filter(
						([id, point]) =>
							id !== this.dragState.nodeId
							&& point.columnX === snappedX
							&& point.gridTop === position.gridTop,
					)
					.map(([, point]) => Math.round((point.y - point.gridTop) / rowGap)),
			);
			let row = Math.max(0, Math.round((position.y - position.gridTop) / rowGap));
			while (occupiedRows.has(row)) {
				if (row > 0 && !occupiedRows.has(row - 1)) row--;
				else row++;
			}
			position.x = snappedX;
			position.columnX = snappedX;
			position.y = position.gridTop + row * rowGap;
			const node = this.graphNodes.get(this.dragState.nodeId);
			node.position = position;
			node.element.style.left = `${position.x}px`;
			node.element.style.top = `${position.y}px`;
			node.element.classList.add("dragged");
			requestAnimationFrame(() => node.element.classList.remove("dragged"));
			this.resizeWorld();
			this.drawEdges(this.graph.edges);
		}
		this.dragState = null;
	}

	/**
	 * Zoom around the pointer position while preserving its graph-space anchor.
	 *
	 * @param {WheelEvent} event Wheel event from the graph viewport.
	 * @returns {void} No value is returned.
	 */
	zoom(event) {
		if (!this.graphNodes.size) return;
		event.preventDefault();
		const bounds = this.viewport.getBoundingClientRect();
		const cursorX = event.clientX - bounds.left;
		const cursorY = event.clientY - bounds.top;
		const graphX = (cursorX - this.pan.x) / this.pan.scale;
		const graphY = (cursorY - this.pan.y) / this.pan.scale;
		const minimum = this.getFitScale() / 3;
		const scale = Math.max(minimum, Math.min(2.5, this.pan.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
		this.pan.scale = scale;
		this.pan.x = cursorX - graphX * scale;
		this.pan.y = cursorY - graphY * scale;
		this.applyTransform();
	}

	/**
	 * Draw all graph edges with the default marker and title.
	 *
	 * @param {object[]} edges Directed graph edges.
	 * @returns {void} No value is returned.
	 */
	drawEdges(edges) {
		this.drawConnections(edges);
	}
}

/**
 * Assign graph nodes to columns while collapsing cycles into strongly connected components.
 *
 * @param {object[]} nodes Nodes in the graph.
 * @param {object[]} edges Directed connections between nodes.
 * @returns {Map<number, number>} Column index for each node ID.
 */
function getColumnRanks(nodes, edges) {
	const ids = nodes.map((node) => node.id);
	const outgoing = new Map(ids.map((id) => [id, []]));
	const incoming = new Map(ids.map((id) => [id, []]));
	for (const edge of edges) {
		outgoing.get(edge.sourceId)?.push(edge.targetId);
		incoming.get(edge.targetId)?.push(edge.sourceId);
	}

	const visited = new Set();
	const finishOrder = [];
	for (const id of ids) {
		if (visited.has(id)) continue;
		visited.add(id);
		const stack = [{ id, next: 0 }];
		while (stack.length) {
			const frame = stack[stack.length - 1];
			const neighbors = outgoing.get(frame.id);
			if (frame.next < neighbors.length) {
				const neighbor = neighbors[frame.next++];
				if (visited.has(neighbor)) continue;
				visited.add(neighbor);
				stack.push({ id: neighbor, next: 0 });
			} else {
				finishOrder.push(frame.id);
				stack.pop();
			}
		}
	}

	const componentById = new Map();
	const components = [];
	for (let index = finishOrder.length - 1; index >= 0; index--) {
		const id = finishOrder[index];
		if (componentById.has(id)) continue;
		const component = components.length;
		const members = [];
		const stack = [id];
		componentById.set(id, component);
		while (stack.length) {
			const current = stack.pop();
			members.push(current);
			for (const neighbor of incoming.get(current)) {
				if (componentById.has(neighbor)) continue;
				componentById.set(neighbor, component);
				stack.push(neighbor);
			}
		}
		components.push(members);
	}

	const componentEdges = components.map(() => new Set());
	const indegree = components.map(() => 0);
	for (const edge of edges) {
		const source = componentById.get(edge.sourceId);
		const target = componentById.get(edge.targetId);
		if (source === target || componentEdges[source].has(target)) continue;
		componentEdges[source].add(target);
		indegree[target]++;
	}

	const queue = [];
	indegree.forEach((degree, index) => {
		if (degree === 0) queue.push(index);
	});
	const order = [];
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index];
		order.push(current);
		for (const target of componentEdges[current]) {
			indegree[target]--;
			if (indegree[target] === 0) queue.push(target);
		}
	}

	const ranks = components.map(() => 0);
	for (let index = order.length - 1; index >= 0; index--) {
		const current = order[index];
		if (componentEdges[current].size) {
			ranks[current] = Math.min(...[...componentEdges[current]].map((target) => ranks[target])) - 1;
		}
	}
	const leftmost = Math.min(...ranks);
	return new Map(ids.map((id) => [id, ranks[componentById.get(id)] - leftmost]));
}

/**
 * Create a shared orthogonal route between outgoing and incoming anchor coordinates.
 *
 * @param {{ x: number, y: number }} start Outgoing anchor coordinates.
 * @param {{ x: number, y: number }} end Incoming anchor coordinates.
 * @returns {{ x: number, y: number }[]} Bend points connecting the two anchors.
 */
function createConnectionRoute(start, end) {
	const middleX = (start.x + end.x) / 2;
	return [
		start,
		{ x: middleX, y: start.y },
		{ x: middleX, y: end.y },
		end,
	];
}

/**
 * Convert route points to a simple orthogonal SVG path.
 *
 * @param {{ x: number, y: number }[]} points Route bend points.
 * @returns {string} SVG path data.
 */
function createOrthogonalPath(points) {
	return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

//#endregion Shared graph display
