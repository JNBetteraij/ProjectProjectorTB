import { createDetailsSection } from "../Details.js";
import { createFileLabel, createImportStatusTag } from "../FileDisplay.js";
import {
	ConnectionType,
	DEFAULT_CONNECTION_COLOR,
	DEFAULT_CONNECTION_HIGHLIGHT_COLORS,
} from "../ConnectionType.js";
import { GraphRenderer } from "./GraphRenderer.js";
import { importGraphControlsTemplate } from "./GraphViewTemplates.js";

const NODE_HEIGHT = 132;
const connectionTypes = new Map([
	[
		"imports",
		new ConnectionType({
			type: "imports",
			color: DEFAULT_CONNECTION_COLOR,
			highlightColors: DEFAULT_CONNECTION_HIGHLIGHT_COLORS,
		}),
	],
]);

/** Render the import graph and its local dependency views. */
export class ImportGraphRenderer extends GraphRenderer {
	/**
	 * Create an import graph view and connect its local traversal controls.
	 *
	 * @param {{ container: HTMLElement }} options Element that contains the graph view.
	 * @returns {void}
	 */
	constructor({ container }) {
		super({
			container: container,
			viewportClass: "graph-viewport",
			worldClass: "graph-world",
			edgeClass: "graph-edges",
			nodeClass: "graph-nodes",
			ariaLabel: "Pannable project graph",
			emptyMessage: "Choose a project folder and scan it to see its file relationships.",
			markerPrefix: "arrowhead",
			selectionLayers: true,
			controlsTemplate: importGraphControlsTemplate,
			connectionTypes,
		});
		this.showLocalButton = this.getViewElement("[data-show-local]");
		this.showDependenciesButton = this.getViewElement("[data-show-dependencies]");
		this.showDependantsButton = this.getViewElement("[data-show-dependants]");
		this.showFullGraphButton = this.getViewElement("[data-show-full-graph]");
		this.mainGraph = null;
		this.mainViewState = null;
		this.localMode = false;
		this.selectedId = null;
		this.frontNodeId = null;
		this.showLocalButton.addEventListener("click", () => this.showLocal());
		this.showDependenciesButton.addEventListener("click", () => this.showDependencies());
		this.showDependantsButton.addEventListener("click", () => this.showDependants());
		this.showFullGraphButton.addEventListener("click", () => this.showFullGraph());
	}

	/**
	 * Store and display the complete import graph.
	 *
	 * @param {object} graph Resolved import graph to display.
	 * @returns {void}
	 */
	render(graph) {
		this.mainGraph = graph;
		this.mainViewState = null;
		this.localMode = false;
		this.renderGraph(graph);
	}

	/**
	 * Render an import subgraph while optionally preserving node positions.
	 *
	 * @param {object} graph Import graph data containing files and edges.
	 * @param {Map<number, object> | null} [positions=null] Existing positions to preserve.
	 * @returns {void}
	 */
	renderGraph(graph, positions = null) {
		this.graph = graph;
		this.selectedId = null;
		this.frontNodeId = null;
		this.emptyState.hidden = graph.files.length > 0;
		this.edgeSvg.hidden = graph.files.length === 0;
		this.selectedEdgeSvg.hidden = graph.files.length === 0;
		this.nodeLayer.replaceChildren();
		this.selectedNodeLayer.replaceChildren();
		this.nodeElements.clear();
		this.edgeElements.clear();
		this.setGraphNodes(graph.files, graph.edges, (file) => file.path.full, positions || this.layout(graph));
		this.drawNodes(graph.files);
		this.drawEdges(graph.edges);
		this.resizeWorld();
		this.runWhenVisible(() => {
			this.resizeWorld();
			this.fit();
		});
		this.updateLocalControls();
	}

	/**
	 * Show the selected file and its immediate import relationships.
	 *
	 * @returns {void}
	 */
	showLocal() {
		if (this.localMode || !this.mainGraph || this.selectedId === null) return;
		this.mainViewState = {
			positions: new Map([...this.positions].map(([id, position]) => [id, { ...position }])),
			pan: { ...this.pan },
			selectedId: this.selectedId,
			frontNodeId: this.frontNodeId,
		};

		this.localMode = true;
		this.renderLocalGraph();
	}

	/**
	 * Show the selected file's transitive dependencies.
	 *
	 * @returns {void}
	 */
	showDependencies() {
		this.showTraversal("dependencies");
	}

	/**
	 * Show the selected file's transitive dependants.
	 *
	 * @returns {void}
	 */
	showDependants() {
		this.showTraversal("dependants");
	}

	/**
	 * Display the selected file's complete traversal in one direction.
	 *
	 * @param {"dependencies" | "dependants"} direction Traversal direction.
	 * @returns {void}
	 */
	showTraversal(direction) {
		if (!this.localMode || !this.mainGraph || this.selectedId === null) return;
		const { files, edges } = getTraversalGraph(this.mainGraph, this.selectedId, direction);
		this.renderLocalGraph(files, edges, direction === "dependencies" ? "Dependencies" : "Dependants");
	}

	/**
	 * Render a local view of the current selection and preserve its selection state.
	 *
	 * @param {object[] | null} [files=null] Files to include, or null for direct neighbors.
	 * @param {object[] | null} [edges=null] Edges to include, or null for direct relationships.
	 * @param {string} [title="Local graph"] Local graph group title.
	 * @returns {void}
	 */
	renderLocalGraph(files = null, edges = null, title = "Local graph") {
		const selectedId = this.selectedId;
		const frontNodeId = this.frontNodeId;
		if (!files || !edges) {
			const fileIds = new Set([selectedId]);
			for (const edge of this.mainGraph.edges) {
				if (edge.sourceId === selectedId) fileIds.add(edge.targetId);
				if (edge.targetId === selectedId) fileIds.add(edge.sourceId);
			}
			files = this.mainGraph.files.filter((file) => fileIds.has(file.id));
			edges = this.mainGraph.edges.filter((edge) => fileIds.has(edge.sourceId) && fileIds.has(edge.targetId));
		}

		this.renderGraph({
			files,
			edges,
			groups: [{ title, files, connected: edges.length > 0 }],
		});
		this.selectedId = selectedId;
		this.frontNodeId = frontNodeId;
		this.updateSelection();
		this.fit();
		this.updateLocalControls();
	}

	/**
	 * Restore the full import graph and its saved view state.
	 *
	 * @returns {void}
	 */
	showFullGraph() {
		if (!this.localMode || !this.mainGraph || !this.mainViewState) return;
		const { positions, pan, selectedId, frontNodeId } = this.mainViewState;
		this.localMode = false;
		this.renderGraph(this.mainGraph, positions);
		this.pan = pan;
		this.selectedId = selectedId;
		this.frontNodeId = frontNodeId;
		this.applyTransform();
		this.updateSelection();
		this.mainViewState = null;
		this.updateLocalControls();
	}

	/**
	 * Synchronize local graph buttons with the current view and selection.
	 *
	 * @returns {void}
	 */
	updateLocalControls() {
		if (this.showLocalButton) {
			this.showLocalButton.hidden = this.localMode;
			this.showLocalButton.disabled = this.selectedId === null || !this.graph?.files.length;
		}
		if (this.showDependenciesButton) this.showDependenciesButton.hidden = !this.localMode;
		if (this.showDependantsButton) this.showDependantsButton.hidden = !this.localMode;
		if (this.showFullGraphButton) this.showFullGraphButton.hidden = !this.localMode;
	}

	/**
	 * Lay out files using the shared graph layout.
	 *
	 * @param {object} graph Import graph data.
	 * @returns {Map<number, object>} File positions by ID.
	 */
	layout(graph) {
		return this.layoutNodes(graph.files, graph.edges, (file) => file.path.full);
	}

	/**
	 * Create file nodes and register their interactive graph elements.
	 *
	 * @param {object[]} files Files to render as nodes.
	 * @returns {void}
	 */
	drawNodes(files) {
		for (const file of files) {
			const node = document.createElement("article");
			node.className = "graph-node";
			node.dataset.fileId = file.id;
			const position = this.positions.get(file.id);
			node.style.left = `${position.x}px`;
			node.style.top = `${position.y}px`;
			node.draggable = false;
			node.addEventListener("dragstart", (event) => event.preventDefault());
			node.addEventListener("click", () => {
				setTimeout(() => this.bringNodeToFront(file.id), 0);
			});
			node.addEventListener("focusin", () => {
				setTimeout(() => this.bringNodeToFront(file.id), 0);
			});

			const header = document.createElement("div");
			header.className = "node-header";
			const title = document.createElement("button");
			title.className = "node-title";
			title.type = "button";
			title.append(createFileLabel(file.path.full, "file-label node-file-label"));
			title.addEventListener("click", () => this.selectFile(file.id));

			const dragHandle = document.createElement("button");
			dragHandle.className = "node-drag-handle";
			dragHandle.type = "button";
			dragHandle.draggable = false;
			dragHandle.setAttribute("aria-label", `Drag ${file.path.full}`);
			dragHandle.title = "Drag to move; position snaps to a column";
			dragHandle.textContent = "⠿";
			dragHandle.addEventListener("pointerdown", (event) => this.startNodeDrag(event, file.id));
			dragHandle.addEventListener("dragstart", (event) => event.preventDefault());
			header.append(title, dragHandle);

			node.append(header, ...this.createNodeDetails(file));
			this.nodeLayer.append(node);
			this.graphNodes.get(file.id).element = node;
			this.nodeElements.set(file.id, node);
		}
	}

	/**
	 * Build the collapsible import/export sections for one file node.
	 *
	 * @param {object} file File represented by the node.
	 * @returns {HTMLElement[]} Rendered detail sections.
	 */
	createNodeDetails(file) {
		const details = [];
		if (file.imports.length) {
			const importedItemCount = file.imports.reduce((count, imported) => count + imported.items.length, 0);
			details.push(this.createImportsDetails(file.imports, importedItemCount));
		}
		if (file.exports.length) {
			details.push(this.createExportsDetails(file.exports));
		}
		return details;
	}

	/**
	 * Create a counted collapsible details section.
	 *
	 * @param {string} title Section title.
	 * @param {number} count Number displayed in the section badge.
	 * @returns {{ details: HTMLDetailsElement, content: HTMLDivElement }} Details element and content.
	 */
	createCountedDetails(title, count) {
		const { details, summary, content } = createDetailsSection(title, {
			details: "node-detail-box",
			summary: "node-detail-summary",
			content: "node-detail-content",
		});
		details.dataset.section = title.toLowerCase();
		const label = document.createElement("span");
		label.textContent = title;
		const badge = document.createElement("span");
		badge.className = "node-detail-count";
		badge.textContent = count;
		summary.replaceChildren(label, badge);
		details.addEventListener("toggle", () => {
			this.drawEdges(this.graph.edges);
			this.resizeWorld();
		});
		return { details, content };
	}

	/**
	 * Render imported file and symbol information.
	 *
	 * @param {object[]} imports Imports belonging to the file.
	 * @param {number} importedItemCount Number of imported items.
	 * @returns {HTMLDetailsElement} Import details element.
	 */
	createImportsDetails(imports, importedItemCount) {
		const { details, content } = this.createCountedDetails("Imports", importedItemCount);
		const list = document.createElement("ul");
		for (const imported of imports) {
			const sourcePath = imported.path || imported.source;
			const sourceFile = imported.sourceFile;
			const item = document.createElement("li");
			item.className = "node-import-item";
			if (sourceFile) {
				item.append(this.createFileLink(sourceFile, sourcePath));
			} else {
				item.append(createFileLabel(sourcePath, "file-label file-list-label"));
			}
			const statusTag = createImportStatusTag(imported.status, imported.source);
			if (statusTag) item.append(statusTag);

			if (imported.items.length) {
				const names = document.createElement("ul");
				names.className = "node-imported-names";
				for (const importedItem of imported.items) {
					const name = document.createElement("li");
					name.textContent =
						importedItem.name === "*" && importedItem.localName
							? `* as ${importedItem.localName}`
							: importedItem.localName && importedItem.localName !== importedItem.name
								? `${importedItem.name} as ${importedItem.localName}`
								: importedItem.name;
					if (imported.reExport) name.append(" (re-export)");
					names.append(name);
				}
				item.append(names);
			}
			list.append(item);
		}
		content.append(list);
		return details;
	}

	/**
	 * Render exported symbols and the files that import them.
	 *
	 * @param {object[]} exports Exports belonging to the file.
	 * @returns {HTMLDetailsElement} Export details element.
	 */
	createExportsDetails(exports) {
		const { details, content } = this.createCountedDetails("Exports", exports.length);
		const list = document.createElement("div");
		list.className = "node-export-list";
		for (const exported of exports) {
			const {
				details: item,
				summary: nameHeader,
				content: itemContent,
			} = createDetailsSection("", {
				details: "node-export-item",
				summary: "node-detail-summary",
				content: "node-export-content",
			});
			const exportItem = document.createElement("div");
			exportItem.style.display = "flex";
			exportItem.style.flexDirection = "column";
			const name = document.createElement("span");
			name.className = "node-export-name";
			name.textContent = `${exported.name}`;
			const type = document.createElement("span");
			type.className = "export-type";
			type.textContent = exported.type;

			exportItem.append(name, type);
			const count = document.createElement("span");
			count.textContent = exported.importedBy.length;
			count.className = "node-detail-count";
			nameHeader.append(exportItem, count);

			const importedBy = document.createElement("div");
			importedBy.className = "node-export-imported-by";
			importedBy.textContent = "Imported by";
			itemContent.append(importedBy);

			if (exported.importedBy.length) {
				const importers = document.createElement("ul");
				for (const relationship of exported.importedBy) {
					const importer = document.createElement("li");
					importer.append(this.createFileLink(relationship.file, relationship.file.path.full));

					const importedAs = document.createElement("span");
					importedAs.className = "node-export-imported-as";
					//TODO handle import { * } as 'namespace' import
					if (relationship.importedAs[0] !== exported.name) {
						// console.log(exported.name);
						// console.log(relationship.importedAs[0]);
						// console.log(relationship.reExport);
						importedAs.textContent = `as ${relationship.importedAs.join(", ")}`;
						importer.append(importedAs);
					}
					if (relationship.reExport) {
						const reExport = document.createElement("span");
						reExport.className = "node-export-reexport";
						reExport.textContent = "re-export";
						importer.append(reExport);
					}

					const folderPath = document.createElement("span");
					folderPath.className = "file-label-folder";
					folderPath.textContent = relationship.file.path.folders;
					importer.append(folderPath);

					importers.append(importer);
				}
				itemContent.append(importers);
			} else {
				const empty = document.createElement("p");
				empty.className = "muted";
				empty.textContent = "None";
				itemContent.append(empty);
			}
			list.append(item);
		}
		content.append(list);
		return details;
	}

	/**
	 * Create controls to select or focus a file from a node detail.
	 *
	 * @param {object} file File to target.
	 * @param {string} path Display path for the file.
	 * @returns {HTMLDivElement} File selection and focus controls.
	 */
	createFileLink(file, path) {
		const element = document.createElement("div");
		element.className = "node-file-link";
		const selectButton = document.createElement("button");
		selectButton.className = "node-file-select";
		selectButton.type = "button";
		selectButton.setAttribute("aria-label", `Select ${path} in graph`);

		const label = document.createElement("span");
		label.className = "file-label file-list-label";
		const fileName = document.createElement("span");
		fileName.className = "file-label-name";
		fileName.textContent = file.name;
		label.append(fileName);
		selectButton.append(label);

		selectButton.addEventListener("click", () => this.selectFile(file.id));
		element.append(selectButton);

		const focusButton = document.createElement("button");
		focusButton.className = "node-file-focus";
		focusButton.type = "button";
		focusButton.setAttribute("aria-label", `Go to ${path} in graph`);
		focusButton.title = "Go to file in graph";
		focusButton.textContent = "↗";
		focusButton.addEventListener("click", () => this.focusFile(file.id));
		element.append(focusButton);

		return element;
	}
	/**
	 * Measure a rendered file node, falling back to the default node height.
	 *
	 * @param {number} fileId File node identifier.
	 * @returns {number} Node height in graph coordinates.
	 */
	getNodeHeight(fileId) {
		return this.nodeElements.get(fileId)?.offsetHeight || NODE_HEIGHT;
	}

	/**
	 * Describe the imports section as the incoming edge anchor.
	 *
	 * @param {object} file File represented by the node.
	 * @returns {{ side: string, section: string }} Incoming connection anchor.
	 */
	getIncomingConnectionPoint(file) {
		return { side: "left", section: "imports" };
	}

	/**
	 * Describe the exports section as the outgoing edge anchor.
	 *
	 * @param {object} file File represented by the node.
	 * @returns {{ side: string, section: string }} Outgoing connection anchor.
	 */
	getOutgoingConnectionPoint(file) {
		return { side: "right", section: "exports" };
	}

	/**
	 * Draw import edges with tooltips and selected-edge layering.
	 *
	 * @param {object[]} edges Directed import edges.
	 * @returns {void}
	 */
	drawEdges(edges) {
		this.drawConnections(edges, {
			selectedLayer: this.selectedEdgeSvg,
			title: (edge) =>
				`Exporting file ${edge.sourceId} to importing file ${edge.targetId}: ${edge.importedItems.join(", ") || "side-effect import"}`,
		});
	}

	/**
	 * Raise a file node and start the shared node drag interaction.
	 *
	 * @param {PointerEvent} event Pointer event from the node drag handle.
	 * @param {number} fileId File node identifier.
	 * @returns {void}
	 */
	startNodeDrag(event, fileId) {
		setTimeout(() => this.bringNodeToFront(fileId), 0);
		super.startNodeDrag(event, fileId);
	}

	/**
	 * Select a file and update graph highlighting.
	 *
	 * @param {number} fileId File node identifier.
	 * @returns {void}
	 */
	selectFile(fileId) {
		this.selectedId = fileId;
		this.updateSelection();
	}

	/**
	 * Bring a file node above adjacent nodes after interaction.
	 *
	 * @param {number} fileId File node identifier.
	 * @returns {void}
	 */
	bringNodeToFront(fileId) {
		if (!this.nodeElements.has(fileId)) return;
		this.frontNodeId = fileId;
		this.updateSelection();
	}

	/**
	 * Select and center a file node in the graph viewport.
	 *
	 * @param {number} fileId File node identifier.
	 * @returns {void}
	 */
	focusFile(fileId) {
		if (!this.graphNodes.has(fileId)) return;
		this.selectedId = fileId;
		super.focusNode(fileId);
		this.updateSelection();
	}

	/**
	 * Apply selection and extended highlighting and layer active edges and nodes.
	 *
	 * @returns {void}
	 */
	updateSelection() {
		this.updateLocalControls();
		for (const node of this.nodeElements.values()) {
			node.classList.remove("interacted");
			if (node.parentElement !== this.nodeLayer) this.nodeLayer.append(node);
		}
		this.selectedEdgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.replaceChildren());
		const selectedLayer = this.selectedEdgeSvg.querySelector(".edge-layer");
		const raisedIds = this.highlightConnections(this.selectedId);
		for (const edge of this.edgeElements.values()) {
			const sourceId = Number(edge.dataset.sourceId);
			const targetId = Number(edge.dataset.targetId);
			const touchesSelection =
				sourceId === this.selectedId
				|| targetId === this.selectedId
				|| edge.classList.contains("upstream-edge")
				|| edge.classList.contains("downstream-edge");
			if (touchesSelection) {
				selectedLayer?.append(edge);
			} else {
				this.edgeSvg.querySelector(".edge-layer")?.append(edge);
			}
		}
		if (this.frontNodeId !== null) {
			raisedIds.delete(this.frontNodeId);
			raisedIds.add(this.frontNodeId);
			this.nodeElements.get(this.frontNodeId)?.classList.add("interacted");
		}
		for (const id of raisedIds) {
			const node = this.nodeElements.get(id);
			if (node) this.selectedNodeLayer.append(node);
		}
	}
}

/**
 * Collect the nodes and edges reachable from a selected file in one direction.
 *
 * @param {object} graph Graph containing file and edge arrays.
 * @param {number} selectedId Starting file identifier.
 * @param {"dependencies" | "dependants"} direction Traversal direction.
 * @returns {{ files: object[], edges: object[] }} Traversal subgraph.
 */
function getTraversalGraph(graph, selectedId, direction) {
	const edgesBySource = new Map(graph.files.map((file) => [file.id, []]));
	const edgesByTarget = new Map(graph.files.map((file) => [file.id, []]));
	for (const edge of graph.edges) {
		edgesBySource.get(edge.sourceId)?.push(edge);
		edgesByTarget.get(edge.targetId)?.push(edge);
	}

	const visited = new Set([selectedId]);
	const includedEdges = new Set();
	const queue = [selectedId];
	for (let index = 0; index < queue.length; index++) {
		const currentId = queue[index];
		const edges =
			direction === "dependencies" ? edgesByTarget.get(currentId) || [] : edgesBySource.get(currentId) || [];
		for (const edge of edges) {
			includedEdges.add(edge);
			const neighborId = direction === "dependencies" ? edge.sourceId : edge.targetId;
			if (visited.has(neighborId)) continue;
			visited.add(neighborId);
			queue.push(neighborId);
		}
	}

	return {
		files: graph.files.filter((file) => visited.has(file.id)),
		edges: graph.edges.filter((edge) => includedEdges.has(edge)),
	};
}
