import { createDetailsSection } from "./Details.js";
import { createFileLabel, createImportStatusTag } from "./FileDisplay.js";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 132;
const COLUMN_GAP = 620;
const ROW_GAP = 210;
const COMPONENT_GAP = 220;

export class GraphRenderer {
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
		this.graph = null;
		this.mainGraph = null;
		this.mainViewState = null;
		this.localMode = false;
		this.positions = new Map();
		this.nodeElements = new Map();
		this.edgeElements = new Map();
		this.routeYByPair = new Map();
		this.pan = { x: 0, y: 0, scale: 1 };
		this.selectedId = null;
		this.frontNodeId = null;
		this.dragState = null;

		this.viewport.addEventListener("pointerdown", (event) => this.startPan(event));
		this.viewport.addEventListener("pointermove", (event) => this.movePointer(event));
		this.viewport.addEventListener("pointerup", (event) => this.endPointer(event));
		this.viewport.addEventListener("pointercancel", () => this.endPointer());
		this.viewport.addEventListener("wheel", (event) => this.zoom(event), {
			passive: false,
		});
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
		this.routeYByPair.clear();
		this.positions = positions || this.layout(graph);
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
		const positions = new Map();
		this.routeYByPair.clear();
		let top = 120;

		for (const group of graph.groups) {
			const groupIds = new Set(group.files.map((file) => file.id));
			const groupEdges = graph.edges.filter((edge) => groupIds.has(edge.sourceId) && groupIds.has(edge.targetId));
			const componentTop = top;
			let componentHeight;

			if (group.connected) {
				const columns = getColumnRanks(group.files, groupEdges);
				const maxColumn = Math.max(...columns.values());
				const filesByColumn = new Map();
				for (const file of group.files) {
					const column = columns.get(file.id);
					if (!filesByColumn.has(column)) filesByColumn.set(column, []);
					filesByColumn.get(column).push(file);
				}

				const rowById = new Map();
				for (let column = 0; column <= maxColumn; column++) {
					const files = filesByColumn.get(column) || [];
					files.sort((first, second) => {
						const firstParents = groupEdges
							.filter((edge) => edge.targetId === first.id)
							.map((edge) => rowById.get(edge.sourceId))
							.filter(Number.isFinite);
						const secondParents = groupEdges
							.filter((edge) => edge.targetId === second.id)
							.map((edge) => rowById.get(edge.sourceId))
							.filter(Number.isFinite);
						const firstMean = mean(firstParents);
						const secondMean = mean(secondParents);
						if (firstMean !== secondMean) return firstMean - secondMean;
						return first.path.full.localeCompare(second.path.full);
					});
					files.forEach((file, row) => {
						rowById.set(file.id, row);
					});
				}

				for (const file of group.files) {
					const column = columns.get(file.id);
					const row = rowById.get(file.id);
					const x = 120 + column * COLUMN_GAP;
					const y = componentTop + 70 + row * ROW_GAP;
					positions.set(file.id, {
						fileId: file.id,
						x,
						y,
						row,
						columnX: x,
						gridTop: componentTop + 70,
					});
				}
				componentHeight = Math.max(...[...filesByColumn.values()].map((files) => files.length)) * ROW_GAP;
			} else {
				const columnCount = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(group.files.length))));
				const rowCount = Math.ceil(group.files.length / columnCount);
				group.files.forEach((file, index) => {
					const row = Math.floor(index / columnCount);
					const column = index % columnCount;
					const x = 120 + column * COLUMN_GAP;
					const y = componentTop + 70 + row * ROW_GAP;
					positions.set(file.id, {
						fileId: file.id,
						x,
						y,
						columnX: x,
						gridTop: componentTop + 70,
					});
				});
				componentHeight = rowCount * ROW_GAP;
			}

			top += componentHeight + COMPONENT_GAP;
		}

		for (const edge of graph.edges) {
			const source = positions.get(edge.sourceId);
			const target = positions.get(edge.targetId);
			if (!source || !target) continue;
			if (Math.abs(target.x - source.x) === COLUMN_GAP) continue;
			const horizontalDirection = target.x > source.x ? "right" : "left";
			const laneFraction = horizontalDirection === "right" ? 2 / 3 : 1 / 3;
			const maxRow = Math.max(
				...[...positions.values()]
					.filter((position) => position.gridTop === source.gridTop)
					.map((position) => position.row ?? 0),
			);
			const sourceY = source.y + NODE_HEIGHT / 2;
			const targetY = target.y + NODE_HEIGHT / 2;
			const route = Array.from({ length: maxRow + 1 }, (_, row) => {
				const rowGapTop = source.gridTop + row * ROW_GAP + NODE_HEIGHT;
				return rowGapTop + (ROW_GAP - NODE_HEIGHT) * laneFraction;
			}).reduce((closest, candidate) =>
				Math.abs(candidate - sourceY) + Math.abs(candidate - targetY)
				< Math.abs(closest - sourceY) + Math.abs(closest - targetY)
					? candidate
					: closest,
			);
			this.routeYByPair.set(edgeKey(edge), { y: route });
		}

		return positions;
	}

	resizeWorld() {
		const coordinates = [...this.positions.values()];
		const routeXs =
			this.graph?.edges.flatMap((edge) => {
				const source = this.positions.get(edge.sourceId);
				const target = this.positions.get(edge.targetId);
				return source && target ? getEdgeLaneXs(source, target) : [];
			}) || [];
		const width = coordinates.length
			? Math.max(...coordinates.map((point) => point.x + NODE_WIDTH), ...routeXs) + 300
			: this.viewport.clientWidth;
		const height = coordinates.length
			? Math.max(
					...coordinates.map((point) => point.y + this.getNodeHeight(point.fileId)),
					...[...this.routeYByPair.values()].map((route) => route.y),
				) + 300
			: this.viewport.clientHeight;
		this.world.style.width = `${width}px`;
		this.world.style.height = `${height}px`;
		this.edgeSvg.setAttribute("width", width);
		this.edgeSvg.setAttribute("height", height);
		this.selectedEdgeSvg.setAttribute("width", width);
		this.selectedEdgeSvg.setAttribute("height", height);
		this.nodeLayer.style.width = `${width}px`;
		this.nodeLayer.style.height = `${height}px`;
		this.selectedNodeLayer.style.width = `${width}px`;
		this.selectedNodeLayer.style.height = `${height}px`;
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

	getNodeSectionY(fileId, section) {
		const node = this.nodeElements.get(fileId);
		const summary = node?.querySelector(`.node-detail-box[data-section="${section}"] > summary`);
		const position = this.positions.get(fileId);
		if (!node || !summary || !position) return position.y + this.getNodeHeight(fileId) / 2;
		const nodeBounds = node.getBoundingClientRect();
		const summaryBounds = summary.getBoundingClientRect();
		return position.y + (summaryBounds.top - nodeBounds.top + summaryBounds.height / 2) / this.pan.scale;
	}

	drawEdges(edges) {
		this.edgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		this.selectedEdgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
		layer.classList.add("edge-layer");
		this.edgeElements.clear();

		for (const edge of edges) {
			const source = this.positions.get(edge.sourceId);
			const target = this.positions.get(edge.targetId);
			if (!source || !target) continue;

			const [sourceX, targetX] = getEdgeLaneXs(source, target);
			const sourceY = this.getNodeSectionY(edge.sourceId, "exports");
			const targetY = this.getNodeSectionY(edge.targetId, "imports");
			const columnDistance = Math.abs(target.x - source.x);
			let edgePoints;
			if (columnDistance === COLUMN_GAP) {
				const laneX = getVerticalGutterLaneX(source, true, targetY < sourceY ? "up" : "down");
				edgePoints = [
					{ x: sourceX, y: sourceY },
					{ x: laneX, y: sourceY },
					{ x: laneX, y: targetY },
					{ x: targetX, y: targetY },
				];
			} else {
				const horizontalDirection = target.x > source.x ? "right" : "left";
				const routeY = this.getHorizontalGutterY(source, sourceY, targetY, horizontalDirection);
				this.routeYByPair.set(edgeKey(edge), { y: routeY });
				const sourceVerticalDirection = routeY < sourceY ? "up" : "down";
				const targetVerticalDirection = targetY < routeY ? "up" : "down";
				const sourceLaneX = getVerticalGutterLaneX(source, true, sourceVerticalDirection);
				const targetLaneX = getVerticalGutterLaneX(target, false, targetVerticalDirection);
				edgePoints = [
					{ x: sourceX, y: sourceY },
					{ x: sourceLaneX, y: sourceY },
					{ x: sourceLaneX, y: routeY },
					{ x: targetLaneX, y: routeY },
					{ x: targetLaneX, y: targetY },
					{ x: targetX, y: targetY },
				];
			}
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			path.setAttribute("d", createRoundedOrthogonalPath(edgePoints));
			path.classList.add("graph-edge");
			path.dataset.sourceId = edge.sourceId;
			path.dataset.targetId = edge.targetId;
			path.dataset.edgeKey = edgeKey(edge);
			path.setAttribute("marker-end", "url(#arrowhead)");
			const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
			title.textContent = `Exporting file ${edge.sourceId} to importing file ${edge.targetId}: ${edge.importedItems.join(", ") || "side-effect import"}`;
			path.append(title);
			layer.append(path);
			this.edgeElements.set(edgeKey(edge), path);
		}

		this.edgeSvg.append(layer);
		const selectedLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
		selectedLayer.classList.add("edge-layer");
		this.selectedEdgeSvg.append(selectedLayer);
		this.updateSelection();
	}

	getHorizontalGutterY(source, sourceY, targetY, horizontalDirection) {
		const laneFraction = horizontalDirection === "right" ? 2 / 3 : 1 / 3;
		const maxRow = Math.max(
			...[...this.positions.values()]
				.filter((position) => position.gridTop === source.gridTop)
				.map((position) => position.row ?? 0),
		);
		let closest = source.gridTop + NODE_HEIGHT + (ROW_GAP - NODE_HEIGHT) * laneFraction;
		for (let row = 1; row <= maxRow; row++) {
			const rowGapTop = source.gridTop + row * ROW_GAP + NODE_HEIGHT;
			const candidate = rowGapTop + (ROW_GAP - NODE_HEIGHT) * laneFraction;
			if (
				Math.abs(candidate - sourceY) + Math.abs(candidate - targetY)
				< Math.abs(closest - sourceY) + Math.abs(closest - targetY)
			) {
				closest = candidate;
			}
		}
		return closest;
	}

	startPan(event) {
		if (event.button !== 0 || event.target.closest(".graph-node, .local-graph-controls")) {
			return;
		}
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

	startNodeDrag(event, fileId) {
		if (event.button !== 0) return;
		setTimeout(() => this.bringNodeToFront(fileId), 0);
		event.preventDefault();
		event.stopPropagation();
		const position = this.positions.get(fileId);
		this.dragState = {
			type: "node",
			pointerId: event.pointerId,
			fileId,
			startX: event.clientX,
			startY: event.clientY,
			originX: position.x,
			originY: position.y,
			moved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	movePointer(event) {
		if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
		const deltaX = (event.clientX - this.dragState.startX) / this.pan.scale;
		const deltaY = (event.clientY - this.dragState.startY) / this.pan.scale;
		if (this.dragState.type === "pan") {
			this.pan.x = this.dragState.originX + event.clientX - this.dragState.startX;
			this.pan.y = this.dragState.originY + event.clientY - this.dragState.startY;
			this.applyTransform();
			return;
		}

		if (Math.abs(deltaX) + Math.abs(deltaY) > 3) this.dragState.moved = true;
		const position = this.positions.get(this.dragState.fileId);
		position.x = this.dragState.originX + deltaX;
		position.y = this.dragState.originY + deltaY;
		const node = this.nodeElements.get(this.dragState.fileId);
		node.style.left = `${position.x}px`;
		node.style.top = `${position.y}px`;
		this.drawEdges(this.graph.edges);
	}

	endPointer(event) {
		if (event && this.dragState?.pointerId !== event.pointerId) return;
		if (this.dragState?.type === "node" && this.dragState.moved) {
			const position = this.positions.get(this.dragState.fileId);
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
							id !== this.dragState.fileId
							&& point.columnX === snappedX
							&& point.gridTop === position.gridTop,
					)
					.map(([, point]) => Math.round((point.y - point.gridTop) / ROW_GAP)),
			);
			let row = Math.max(0, Math.round((position.y - position.gridTop) / ROW_GAP));
			while (occupiedRows.has(row)) {
				if (row > 0 && !occupiedRows.has(row - 1)) row--;
				else row++;
			}
			position.x = snappedX;
			position.columnX = snappedX;
			position.y = position.gridTop + row * ROW_GAP;
			const node = this.nodeElements.get(this.dragState.fileId);
			node.style.left = `${position.x}px`;
			node.style.top = `${position.y}px`;
			this.drawEdges(this.graph.edges);
			node.classList.add("dragged");
			requestAnimationFrame(() => node.classList.remove("dragged"));
		}
		this.dragState = null;
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
		const position = this.positions.get(fileId);
		if (!position) return;
		this.selectedId = fileId;
		this.pan.x = this.viewport.clientWidth / 2 - (position.x + NODE_WIDTH / 2) * this.pan.scale;
		this.pan.y = this.viewport.clientHeight / 2 - (position.y + NODE_HEIGHT / 2) * this.pan.scale;
		this.applyTransform();
		this.updateSelection();
	}

	updateSelection() {
		this.updateLocalControls();
		for (const node of this.nodeElements.values()) {
			node.classList.remove("selected", "incoming", "outgoing", "interacted");
			if (node.parentElement !== this.nodeLayer) this.nodeLayer.append(node);
		}
		this.selectedEdgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.replaceChildren());
		const selectedLayer = this.selectedEdgeSvg.querySelector(".edge-layer");
		for (const edge of this.edgeElements.values()) {
			edge.classList.remove("incoming-edge", "outgoing-edge");
			const sourceId = Number(edge.dataset.sourceId);
			const targetId = Number(edge.dataset.targetId);
			const touchesSelection = sourceId === this.selectedId || targetId === this.selectedId;
			if (touchesSelection) {
				if (sourceId === this.selectedId) edge.classList.add("outgoing-edge");
				if (targetId === this.selectedId) edge.classList.add("incoming-edge");
				selectedLayer?.append(edge);
			} else {
				this.edgeSvg.querySelector(".edge-layer")?.append(edge);
			}
		}
		const raisedIds = new Set();
		if (this.selectedId !== null) {
			raisedIds.add(this.selectedId);
			for (const edge of this.graph.edges) {
				if (edge.sourceId === this.selectedId) {
					raisedIds.add(edge.targetId);
					this.nodeElements.get(edge.targetId)?.classList.add("outgoing");
				}
				if (edge.targetId === this.selectedId) {
					raisedIds.add(edge.sourceId);
					this.nodeElements.get(edge.sourceId)?.classList.add("incoming");
				}
			}
			this.nodeElements.get(this.selectedId)?.classList.add("selected");
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

	zoom(event) {
		if (!this.graph?.files.length) return;
		event.preventDefault();
		const bounds = this.viewport.getBoundingClientRect();
		const cursorX = event.clientX - bounds.left;
		const cursorY = event.clientY - bounds.top;
		const worldX = (cursorX - this.pan.x) / this.pan.scale;
		const worldY = (cursorY - this.pan.y) / this.pan.scale;
		const minScale = this.getFitScale() / 3;
		const nextScale = Math.max(minScale, Math.min(2.5, this.pan.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
		this.pan.scale = nextScale;
		this.pan.x = cursorX - worldX * nextScale;
		this.pan.y = cursorY - worldY * nextScale;
		this.applyTransform();
	}

	getFitScale() {
		if (!this.graph?.files.length) return 1;
		const bounds = this.getGraphBounds();
		const availableWidth = Math.max(200, this.viewport.clientWidth - 80);
		const availableHeight = Math.max(200, this.viewport.clientHeight - 80);
		return Math.min(
			1.25,
			availableWidth / (bounds.maxX - bounds.minX),
			availableHeight / (bounds.maxY - bounds.minY),
		);
	}

	getGraphBounds() {
		const coordinates = [...this.positions.values()];
		const routeXs = this.graph.edges.flatMap((edge) => {
			const source = this.positions.get(edge.sourceId);
			const target = this.positions.get(edge.targetId);
			return source && target ? getEdgeLaneXs(source, target) : [];
		});
		const horizontalCoordinates = [...coordinates.flatMap((point) => [point.x, point.x + NODE_WIDTH]), ...routeXs];
		return {
			minX: Math.min(...horizontalCoordinates),
			minY: Math.min(...coordinates.map((point) => point.y)),
			maxX: Math.max(...horizontalCoordinates),
			maxY: Math.max(
				...coordinates.map((point) => point.y + this.getNodeHeight(point.fileId)),
				...[...this.routeYByPair.values()].map((route) => route.y),
			),
		};
	}

	fit() {
		if (!this.graph?.files.length) {
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

	applyTransform() {
		this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.pan.scale})`;
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

function getColumnRanks(files, edges) {
	const ids = files.map((file) => file.id);
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
				continue;
			}
			finishOrder.push(frame.id);
			stack.pop();
		}
	}

	const componentById = new Map();
	const components = [];
	for (let index = finishOrder.length - 1; index >= 0; index--) {
		const id = finishOrder[index];
		if (componentById.has(id)) continue;
		const componentIndex = components.length;
		const members = [];
		const stack = [id];
		componentById.set(id, componentIndex);
		while (stack.length) {
			const current = stack.pop();
			members.push(current);
			for (const neighbor of incoming.get(current)) {
				if (componentById.has(neighbor)) continue;
				componentById.set(neighbor, componentIndex);
				stack.push(neighbor);
			}
		}
		components.push(members);
	}

	const componentOutgoing = components.map(() => new Set());
	const indegree = components.map(() => 0);
	for (const edge of edges) {
		const source = componentById.get(edge.sourceId);
		const target = componentById.get(edge.targetId);
		if (source === target || componentOutgoing[source].has(target)) continue;
		componentOutgoing[source].add(target);
		indegree[target]++;
	}

	const queue = [];
	indegree.forEach((degree, index) => {
		if (degree === 0) queue.push(index);
	});
	const topologicalOrder = [];
	while (queue.length) {
		const current = queue.shift();
		topologicalOrder.push(current);
		for (const target of componentOutgoing[current]) {
			indegree[target]--;
			if (indegree[target] === 0) queue.push(target);
		}
	}

	const componentColumns = components.map(() => 0);
	for (let index = topologicalOrder.length - 1; index >= 0; index--) {
		const component = topologicalOrder[index];
		if (componentOutgoing[component].size) {
			componentColumns[component] =
				Math.min(...[...componentOutgoing[component]].map((target) => componentColumns[target])) - 1;
		}
	}
	const leftmostColumn = Math.min(...componentColumns);
	return new Map(ids.map((id) => [id, componentColumns[componentById.get(id)] - leftmostColumn]));
}

function createRoundedOrthogonalPath(points) {
	const radius = 4;
	const simplified = simplifyOrthogonalPoints(points);
	let path = `M ${simplified[0].x} ${simplified[0].y}`;
	for (let index = 1; index < simplified.length - 1; index++) {
		const previous = simplified[index - 1];
		const corner = simplified[index];
		const next = simplified[index + 1];
		const incomingLength = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
		const outgoingLength = Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y);
		const rounding = Math.min(radius, incomingLength / 2, outgoingLength / 2);
		const before = {
			x: corner.x + Math.sign(previous.x - corner.x) * rounding,
			y: corner.y + Math.sign(previous.y - corner.y) * rounding,
		};
		const after = {
			x: corner.x + Math.sign(next.x - corner.x) * rounding,
			y: corner.y + Math.sign(next.y - corner.y) * rounding,
		};
		path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
	}
	const last = simplified[simplified.length - 1];
	return `${path} L ${last.x} ${last.y}`;
}

function simplifyOrthogonalPoints(points) {
	const unique = points.filter(
		(point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
	);
	return unique.filter((point, index) => {
		if (index === 0 || index === unique.length - 1) return true;
		const previous = unique[index - 1];
		const next = unique[index + 1];
		if (previous.x === point.x && point.x === next.x) {
			return (point.y - previous.y) * (next.y - point.y) < 0;
		}
		if (previous.y === point.y && point.y === next.y) {
			return (point.x - previous.x) * (next.x - point.x) < 0;
		}
		return true;
	});
}

function edgeKey(edge) {
	return `${edge.sourceId}:${edge.targetId}`;
}

function getVerticalGutterLaneX(position, isRightOfNode, direction) {
	const gutterWidth = COLUMN_GAP - NODE_WIDTH;
	const laneOffset = direction === "up" ? gutterWidth / 3 : (gutterWidth * 2) / 3;
	const gutterStart = isRightOfNode ? position.x + NODE_WIDTH : position.x - gutterWidth;
	return gutterStart + laneOffset;
}

function getEdgeLaneXs(source, target) {
	return [
		source.x + NODE_WIDTH,
		target.x,
		getVerticalGutterLaneX(source, true, "left"),
		getVerticalGutterLaneX(target, false, "right"),
		(source.x + target.x + NODE_WIDTH) / 2,
	];
}

function mean(values) {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.POSITIVE_INFINITY;
}
