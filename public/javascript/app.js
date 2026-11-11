import { FileLoader } from "./core/FileLoader.js";
import { ClassesGraphBuilder } from "./core/graphBuilders/ClassesGraphBuilder.js";
import { ImportsGraphBuilder } from "./core/graphBuilders/ImportsGraphBuilder.js";
import { Scanner } from "./core/Scanner.js";
import { ClassSearch } from "./core/Searches/ClassSearch.js";
import { ExportSearch } from "./core/Searches/ExportSearch.js";
import { ImportSearch } from "./core/Searches/ImportSearch.js";
import { JavaScriptParser } from "./languageModules/javascript/JavaScriptParser.js";
import { GraphRenderer } from "./ui/GraphRenderer.js";
import { ClassGraphRenderer } from "./ui/ClassGraphRenderer.js";
import { ScopeListRenderer } from "./ui/ScopeListRenderer.js";

const controlsDialog = document.querySelector("#controlsDialog");
const scanForm = document.querySelector("#scanForm");
const folderInput = document.querySelector("#folderInput");
const excludedFoldersInput = document.querySelector("#excludedFoldersInput");
const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const copyButton = document.querySelector("#copyButton");
const openControlsButton = document.querySelector("#openControlsButton");
const closeControlsButton = document.querySelector("#closeControlsButton");
const fitGraphButton = document.querySelector("#fitGraphButton");
const showImportGraphButton = document.querySelector("#showImportGraphButton");
const showClassGraphButton = document.querySelector("#showClassGraphButton");
const importGraphViewport = document.querySelector("#graphViewport");
const classGraphViewport = document.querySelector("#classGraphViewport");
const graphInstructions = document.querySelector("#graphInstructions");
const statusElement = document.querySelector("#status");
const projectSummary = document.querySelector("#projectSummary");

const languageParser = new JavaScriptParser();
const fileLoader = new FileLoader(languageParser.fileExtensions, []);
const scanner = new Scanner([
	new ImportSearch(languageParser),
	new ExportSearch(languageParser),
	new ClassSearch(languageParser),
]);
const graphBuilder = new ImportsGraphBuilder();
const classGraphBuilder = new ClassesGraphBuilder();
const graphRenderer = new GraphRenderer({
	viewport: document.querySelector("#graphViewport"),
	world: document.querySelector("#graphWorld"),
	edgeSvg: document.querySelector("#graphEdges"),
	nodeLayer: document.querySelector("#graphNodes"),
	selectedEdgeSvg: document.querySelector("#selectedGraphEdges"),
	selectedNodeLayer: document.querySelector("#selectedGraphNodes"),
	emptyState: document.querySelector("#emptyGraph"),
	showLocalButton: document.querySelector("#showLocalButton"),
	showDependenciesButton: document.querySelector("#showDependenciesButton"),
	showDependantsButton: document.querySelector("#showDependantsButton"),
	showFullGraphButton: document.querySelector("#showFullGraphButton"),
});
const classGraphRenderer = new ClassGraphRenderer({
	viewport: classGraphViewport,
	edgeSvg: document.querySelector("#classGraphEdges"),
	nodeLayer: document.querySelector("#classGraphNodes"),
	emptyState: document.querySelector("#emptyClassGraph"),
});
const scopeListRenderer = new ScopeListRenderer(document.querySelector("#scopeList"), {
	onSelectFile: (fileId) => graphRenderer.selectFile(fileId),
	onFocusFile: (fileId) => graphRenderer.focusFile(fileId),
});

let scanResults = [];

controlsDialog.showModal();
openControlsButton.addEventListener("click", () => controlsDialog.showModal());
closeControlsButton.addEventListener("click", () => controlsDialog.close());
fitGraphButton.addEventListener("click", fitActiveGraph);
showImportGraphButton.addEventListener("click", () => showGraph("imports"));
showClassGraphButton.addEventListener("click", () => showGraph("classes"));
graphRenderer.showLocalButton.addEventListener("click", () => graphRenderer.showLocal());
graphRenderer.showFullGraphButton.addEventListener("click", () => graphRenderer.showFullGraph());
graphRenderer.showDependenciesButton.addEventListener("click", () => graphRenderer.showDependencies());
graphRenderer.showDependantsButton.addEventListener("click", () => graphRenderer.showDependants());
downloadButton.addEventListener("click", downloadJson);
copyButton.addEventListener("click", copyJson);
scanForm.addEventListener("submit", (event) => {
	event.preventDefault();
	void scanSelectedFiles();
});

async function scanSelectedFiles() {
	const selectedFiles = Array.from(folderInput.files || []);
	if (!selectedFiles.length) {
		statusElement.textContent = "Select a project folder first.";
		return;
	}

	const options = {};
	const excludedFolders = excludedFoldersInput.value
		.split(",")
		.map((folderPath) => folderPath.trim())
		.filter(Boolean);
	if (excludedFolders.length > 0) {
		options.excludedFolders = excludedFolders;
	}
	scanButton.disabled = true;
	downloadButton.disabled = true;
	copyButton.disabled = true;
	fitGraphButton.disabled = true;
	statusElement.textContent = "Loading project files…";

	try {
		const files = await fileLoader.loadFiles(selectedFiles, options);
		if (!files.length) {
			statusElement.textContent = "No files matched the configured extensions.";
			return;
		}

		statusElement.textContent = `Scanning ${files.length} file(s)…`;
		const scannedFiles = scanner.scan(files);
		const graph = graphBuilder.build(scannedFiles);
		const classGraph = classGraphBuilder.build(scannedFiles);
		scanResults = graph.files;
		graphRenderer.render(graph);
		classGraphRenderer.render(classGraph);
		scopeListRenderer.render(graph.groups);
		projectSummary.textContent = `${graph.files.length} files · ${graph.edges.length} import connections · ${classGraph.classes.length} classes`;
		statusElement.textContent = `Finished scanning ${graph.files.length} file(s).`;
		downloadButton.disabled = false;
		copyButton.disabled = false;
		fitGraphButton.disabled = graph.files.length === 0;
		controlsDialog.close();
	} catch (error) {
		console.error(error);
		statusElement.textContent = `Scan failed: ${error.message}`;
	} finally {
		scanButton.disabled = false;
	}
}

function createJsonExport() {
	return scanResults.map((file) => {
		return {
			id: file.id,
			path: file.path.full,
			name: file.name,
			sizeBytes: file.sizeBytes,
			linkedScopes: file.linkedScopes.map(({ id, path }) => ({ id, path: path.full })),
			exports: file.exports.map(({ importedBy, ...exported }) => ({
				...exported,
				importedBy: importedBy.map(({ file: importer, ...relationship }) => ({
					...relationship,
					file: { id: importer.id, path: importer.path.full },
				})),
			})),
			imports: file.imports.map(({ sourceFile, ...imported }) => imported),
			classes: file.classes.map(({ file: ownerFile, extends: baseClass, inheritedBy, ...classRecord }) => ({
				...classRecord,
				file: { id: ownerFile.id, path: ownerFile.path.full },
				extends: baseClass ? { id: baseClass.id, name: baseClass.name, file: baseClass.file.path.full } : null,
				inheritedBy: inheritedBy.map((derived) => ({
					id: derived.id,
					name: derived.name,
					file: derived.file.path.full,
				})),
			})),
		};
	});
}

/**
 * Switch between the existing file import graph and the class inheritance graph.
 *
 * @param {"imports" | "classes"} graphKind Graph view to display.
 * @returns {void} No value is returned.
 */
//#region Graph view controls

function showGraph(graphKind) {
	const showClasses = graphKind === "classes";
	importGraphViewport.hidden = showClasses;
	classGraphViewport.hidden = !showClasses;
	showImportGraphButton.setAttribute("aria-pressed", String(!showClasses));
	showClassGraphButton.setAttribute("aria-pressed", String(showClasses));
	graphInstructions.textContent = showClasses
		? "Drag canvas to pan · Wheel to zoom · Drag node handles to move classes"
		: "Drag canvas to pan · Wheel to zoom · Use a node handle to move it";
	if (showClasses) classGraphRenderer.fitIfPending();
}

//#endregion Graph view controls

/**
 * Fit whichever graph is currently visible to its viewport.
 *
 * @returns {void} No value is returned.
 */
function fitActiveGraph() {
	if (classGraphViewport.hidden) graphRenderer.fit();
	else classGraphRenderer.fit();
}

function downloadJson() {
	const blob = new Blob([JSON.stringify(createJsonExport(), null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "project-scopes.json";
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyJson() {
	try {
		await navigator.clipboard.writeText(JSON.stringify(createJsonExport(), null, 2));
		statusElement.textContent = "Project JSON copied to the clipboard.";
	} catch (error) {
		statusElement.textContent = `Could not copy JSON: ${error.message}`;
	}
}
