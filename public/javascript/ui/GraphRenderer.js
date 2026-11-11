import { createDetailsSection } from "./Details.js";
import { createFileLabel, createImportStatusTag } from "./FileDisplay.js";
import { GraphDisplay } from "./GraphDisplay.js";

const NODE_HEIGHT = 132;

export class GraphRenderer extends GraphDisplay {
	constructor({
		viewport,
		world,
		edgeSvg,
		nodeLayer,
		selectedEdgeSvg,
		selectedNodeLayer,
		emptyState,
		showLocalButton,
		showDependenciesButton,
		showDependantsButton,
		showFullGraphButton,
	}) {
		super({ viewport, world, edgeSvg, nodeLayer, selectedEdgeSvg, selectedNodeLayer, emptyState });
		this.viewport = viewport;
		this.world = world;
		this.edgeSvg = edgeSvg;
		this.nodeLayer = nodeLayer;
		this.selectedEdgeSvg = selectedEdgeSvg;
		this.selectedNodeLayer = selectedNodeLayer;
		this.emptyState = emptyState;
		this.showLocalButton = showLocalButton;
		this.showDependenciesButton = showDependenciesButton;
		this.showDependantsButton = showDependantsButton;
		this.showFullGraphButton = showFullGraphButton;
		this.mainGraph = null;
		this.mainViewState = null;
		this.localMode = false;
		this.selectedId = null;
		this.frontNodeId = null;
	}

	render(graph) {
		this.mainGraph = graph;
		this.mainViewState = null;
		this.localMode = false;
		this.renderGraph(graph);
	}

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
		this.setGraphNodes(
			graph.files,
			graph.edges,
			(file) => file.path.full,
			positions || this.layout(graph),
		);
		this.drawNodes(graph.files);
		this.drawEdges(graph.edges);
		this.resizeWorld();
		this.fit();
		this.updateLocalControls();
	}

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

	showDependencies() {
		this.showTraversal("dependencies");
	}

	showDependants() {
		this.showTraversal("dependants");
	}

	showTraversal(direction) {
		if (!this.localMode || !this.mainGraph || this.selectedId === null) return;
		const { files, edges } = getTraversalGraph(this.mainGraph, this.selectedId, direction);
		this.renderLocalGraph(files, edges, direction === "dependencies" ? "Dependencies" : "Dependants");
	}

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

	updateLocalControls() {
		if (this.showLocalButton) {
			this.showLocalButton.hidden = this.localMode;
			this.showLocalButton.disabled = this.selectedId === null || !this.graph?.files.length;
		}
		if (this.showDependenciesButton) this.showDependenciesButton.hidden = !this.localMode;
		if (this.showDependantsButton) this.showDependantsButton.hidden = !this.localMode;
		if (this.showFullGraphButton) this.showFullGraphButton.hidden = !this.localMode;
	}

	layout(graph) {
		return this.layoutNodes(graph.files, graph.edges, (file) => file.path.full);
	}

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
	getNodeHeight(fileId) {
		return this.nodeElements.get(fileId)?.offsetHeight || NODE_HEIGHT;
	}

	getIncomingConnectionPoint(file) {
		return { side: "left", section: "imports" };
	}

	getOutgoingConnectionPoint(file) {
		return { side: "right", section: "exports" };
	}

	drawEdges(edges) {
		this.drawConnections(edges, {
			selectedLayer: this.selectedEdgeSvg,
			title: (edge) =>
				`Exporting file ${edge.sourceId} to importing file ${edge.targetId}: ${edge.importedItems.join(", ") || "side-effect import"}`,
		});
	}

	startNodeDrag(event, fileId) {
		setTimeout(() => this.bringNodeToFront(fileId), 0);
		super.startNodeDrag(event, fileId);
	}

	selectFile(fileId) {
		this.selectedId = fileId;
		this.updateSelection();
	}

	bringNodeToFront(fileId) {
		if (!this.nodeElements.has(fileId)) return;
		this.frontNodeId = fileId;
		this.updateSelection();
	}

	focusFile(fileId) {
		if (!this.graphNodes.has(fileId)) return;
		this.selectedId = fileId;
		super.focusNode(fileId);
		this.updateSelection();
	}

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
			const touchesSelection = sourceId === this.selectedId || targetId === this.selectedId;
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
