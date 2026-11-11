import { GraphDisplay } from "./GraphDisplay.js";

const connectionTypes = {
	extends: {
		className: "combined-edge--extends",
		markerId: "combinedArrowhead",
		title: (edge) => edge.title,
	},
	import: {
		className: "combined-edge--import",
		markerId: "combinedArrowhead",
		sourceDirection: "incoming",
		targetDirection: "outgoing",
		routeOffset: -16,
		title: (edge) => edge.title,
	},
	export: {
		className: "combined-edge--export",
		markerId: "combinedArrowhead",
		routeOffset: 16,
		title: (edge) => edge.title,
	},
};

/** Render file containers, nested class nodes, and their typed relationships. */
export class CombinedGraphRenderer extends GraphDisplay {
	/**
	 * Create a renderer for the combined file and class graph.
	 *
	 * @param {{ viewport: HTMLElement, world: HTMLElement, edgeSvg: SVGSVGElement, nodeLayer: HTMLElement, emptyState: HTMLElement }} elements Graph elements used by the renderer.
	 * @returns {void} No value is returned.
	 */
	constructor({ viewport, world, edgeSvg, nodeLayer, emptyState }) {
		super({ viewport, world, edgeSvg, nodeLayer, emptyState });
		this.fileNodes = [];
		this.classNodes = [];
	}

	/**
	 * Render files with nested classes and typed import, export, and inheritance edges.
	 *
	 * @param {{ files: object[], fileEdges: object[], classEdges: object[] }} graph Resolved project relationships.
	 * @returns {void} No value is returned.
	 */
	render({ files, fileEdges, classEdges }) {
		const fileNodes = files.map((file) => ({
			id: `file:${file.id}`,
			kind: "file",
			file,
		}));
		const classNodes = files.flatMap((file) =>
			file.classes.map((classRecord) => ({
				id: `class:${classRecord.id}`,
				kind: "class",
				classRecord,
				fileNodeId: `file:${file.id}`,
			})),
		);
		const fileNodeById = new Map(fileNodes.map((node) => [node.file.id, node]));
		const classNodeById = new Map(classNodes.map((node) => [node.classRecord.id, node]));
		const edges = [
			...fileEdges.flatMap((edge) => {
				const exporter = fileNodeById.get(edge.sourceId);
				const importer = fileNodeById.get(edge.targetId);
				if (!exporter || !importer) return [];
				const importedNames = edge.importedItems.join(", ") || "side-effect import";
				return [
					{
						id: `import:${edge.sourceId}:${edge.targetId}`,
						type: "import",
						sourceId: importer.id,
						targetId: exporter.id,
						title: `${importer.file.path.full} imports ${importedNames} from ${exporter.file.path.full}`,
					},
					{
						id: `export:${edge.sourceId}:${edge.targetId}`,
						type: "export",
						sourceId: exporter.id,
						targetId: importer.id,
						title: `${exporter.file.path.full} exports ${importedNames} to ${importer.file.path.full}`,
					},
				];
			}),
			...classEdges.flatMap((edge) => {
				const base = classNodeById.get(edge.sourceId);
				const derived = classNodeById.get(edge.targetId);
				if (!base || !derived) return [];
				return [{
					id: `extends:${edge.sourceId}:${edge.targetId}`,
					type: "extends",
					sourceId: base.id,
					targetId: derived.id,
					title: `${derived.classRecord.name} extends ${base.classRecord.name}`,
				}];
			}),
		];
		const nodes = [...fileNodes, ...classNodes];
		const nodeById = new Map(nodes.map((node) => [node.id, node]));
		const layoutEdgeKeys = new Set();
		const layoutEdges = [];
		for (const edge of edges) {
			if (edge.type === "import") continue;
			const source = nodeById.get(edge.sourceId);
			const target = nodeById.get(edge.targetId);
			const sourceFileId = source.kind === "file" ? source.id : source.fileNodeId;
			const targetFileId = target.kind === "file" ? target.id : target.fileNodeId;
			if (sourceFileId === targetFileId) continue;
			const key = `${sourceFileId}:${targetFileId}`;
			if (layoutEdgeKeys.has(key)) continue;
			layoutEdgeKeys.add(key);
			layoutEdges.push({ sourceId: sourceFileId, targetId: targetFileId });
		}

		const filePositions = this.layoutNodes(
			fileNodes,
			layoutEdges,
			(node) => node.file.path.full,
			(node) => this.getFileHeight(node.file),
		);
		const positions = new Map(filePositions);
		for (const node of classNodes) {
			const filePosition = filePositions.get(node.fileNodeId);
			const classIndex = node.classRecord.file.classes.indexOf(node.classRecord);
			positions.set(node.id, {
				nodeId: node.id,
				x: filePosition.x + 14,
				y: filePosition.y + 64 + classIndex * 68,
				row: filePosition.row,
				columnX: filePosition.columnX,
				gridTop: filePosition.gridTop,
			});
		}

		this.fileNodes = fileNodes;
		this.classNodes = classNodes;
		this.graph = { files, edges };
		this.nodeLayer.replaceChildren();
		this.nodeElements.clear();
		this.edgeElements.clear();
		this.edgeSvg.querySelectorAll(".edge-layer").forEach((layer) => layer.remove());
		this.emptyState.hidden = files.length > 0;
		this.edgeSvg.hidden = files.length === 0;
		this.setGraphNodes(nodes, edges, (node) => node.kind === "file"
			? node.file.path.full
			: `${node.classRecord.file.path.full}:${node.classRecord.name}`, positions);

		for (const fileNode of fileNodes) {
			const fileElement = document.createElement("article");
			fileElement.className = "combined-file-node";
			fileElement.style.left = `${positions.get(fileNode.id).x}px`;
			fileElement.style.top = `${positions.get(fileNode.id).y}px`;
			const heading = document.createElement("h2");
			heading.textContent = fileNode.file.path.full;
			fileElement.append(heading);
			const classList = document.createElement("div");
			classList.className = "combined-class-list";
			for (const classRecord of fileNode.file.classes) {
				const classNode = classNodeById.get(classRecord.id);
				const classElement = document.createElement("article");
				classElement.className = "combined-class-node";
				classElement.dataset.nodeId = classNode.id;
				const classHeading = document.createElement("h3");
				classHeading.textContent = classRecord.name;
				classElement.append(classHeading);
				const base = document.createElement("p");
				base.textContent = classRecord.extends
					? `extends ${classRecord.extends.name}`
					: classRecord.extendsName
						? `extends ${classRecord.extendsName} (not in project)`
						: "No base class";
				classElement.append(base);
				classList.append(classElement);
				this.graphNodes.get(classNode.id).element = classElement;
				this.nodeElements.set(classNode.id, classElement);
			}
			fileElement.append(classList);
			this.nodeLayer.append(fileElement);
			this.graphNodes.get(fileNode.id).element = fileElement;
			this.nodeElements.set(fileNode.id, fileElement);
		}

		this.runWhenVisible(() => {
			this.refreshClassPositions();
			this.resizeWorld();
			this.fit();
		});
	}

	/**
	 * Refresh nested class coordinates after hidden file containers become measurable.
	 *
	 * @returns {void} No value is returned.
	 */
	refreshClassPositions() {
		for (const node of this.classNodes) {
			const filePosition = this.positions.get(node.fileNodeId);
			const element = this.nodeElements.get(node.id);
			const position = this.positions.get(node.id);
			position.x = filePosition.x + element.offsetLeft;
			position.y = filePosition.y + element.offsetTop;
			this.graphNodes.get(node.id).position = position;
		}
	}

	/**
	 * Estimate a file card's height for collision-free graph layout.
	 *
	 * @param {object} file Scanned file represented by a container.
	 * @returns {number} Estimated rendered height in graph coordinates.
	 */
	getFileHeight(file) {
		return 78 + file.classes.length * 68;
	}

	/**
	 * Draw each relationship with its own direction, marker, offset, and visual type.
	 *
	 * @param {object[]} edges Typed graph relationships.
	 * @returns {void} No value is returned.
	 */
	drawEdges(edges) {
		this.drawConnections(edges, { connectionTypes });
	}
}
