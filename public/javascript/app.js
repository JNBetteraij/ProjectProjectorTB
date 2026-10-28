import { FileRetriever } from "./core/FileRetriever.js";
import { GraphBuilder } from "./core/GraphBuilder.js";
import { ProjectScanner } from "./core/ProjectScanner.js";
import { GraphRenderer } from "./ui/GraphRenderer.js";
import { ScopeListRenderer } from "./ui/ScopeListRenderer.js";

const controlsDialog = document.querySelector("#controlsDialog");
const scanForm = document.querySelector("#scanForm");
const folderInput = document.querySelector("#folderInput");
const extensionsInput = document.querySelector("#extensionsInput");
const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const copyButton = document.querySelector("#copyButton");
const openControlsButton = document.querySelector("#openControlsButton");
const closeControlsButton = document.querySelector("#closeControlsButton");
const fitGraphButton = document.querySelector("#fitGraphButton");
const statusElement = document.querySelector("#status");
const projectSummary = document.querySelector("#projectSummary");
const fileRetriever = new FileRetriever();
const projectScanner = new ProjectScanner();
const graphBuilder = new GraphBuilder();
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
const scopeListRenderer = new ScopeListRenderer(document.querySelector("#scopeList"), {
	onSelectFile: (fileId) => graphRenderer.selectFile(fileId),
	onFocusFile: (fileId) => graphRenderer.focusFile(fileId),
});

let scanResults = [];

controlsDialog.showModal();
openControlsButton.addEventListener("click", () => controlsDialog.showModal());
closeControlsButton.addEventListener("click", () => controlsDialog.close());
fitGraphButton.addEventListener("click", () => graphRenderer.fit());
document.querySelector("#showLocalButton").addEventListener("click", () => graphRenderer.showLocal());
document
	.querySelector("#showFullGraphButton")
	.addEventListener("click", () => graphRenderer.showFullGraph());
document
	.querySelector("#showDependenciesButton")
	.addEventListener("click", () => graphRenderer.showDependencies());
document
	.querySelector("#showDependantsButton")
	.addEventListener("click", () => graphRenderer.showDependants());
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

	const extensions = extensionsInput.value
		.split(",")
		.map((extension) => extension.trim().toLowerCase())
		.filter(Boolean);
	const files = fileRetriever.getFiles(selectedFiles, extensions);
	if (!files.length) {
		statusElement.textContent = "No files matched the configured extensions.";
		return;
	}

	scanButton.disabled = true;
	downloadButton.disabled = true;
	copyButton.disabled = true;
	fitGraphButton.disabled = true;
	statusElement.textContent = `Scanning ${files.length} file(s)…`;

	try {
		const scannedFiles = await projectScanner.scan(fileRetriever.retrieve(files));
		const graph = graphBuilder.build(scannedFiles);
		scanResults = graph.files;
		graphRenderer.render(graph);
		scopeListRenderer.render(graph.groups);
		projectSummary.textContent = `${graph.files.length} files · ${graph.edges.length} import connections`;
		statusElement.textContent = `Finished scanning ${graph.files.length} file(s).`;
		downloadButton.disabled = false;
		copyButton.disabled = false;
		fitGraphButton.disabled = graph.files.length === 0;
		controlsDialog.close();
	} catch (error) {
		statusElement.textContent = `Scan failed: ${error.message}`;
	} finally {
		scanButton.disabled = false;
	}
}

function createJsonExport() {
	return scanResults.map((file) => ({
		id: file.id,
		path: file.path,
		name: file.name,
		sizeBytes: file.sizeBytes,
		linkedScopes: file.linkedScopes.map(({ id, path }) => ({ id, path })),
		exports: file.exports.map(({ importedBy, ...exported }) => ({
			...exported,
			importedBy: importedBy.map(({ file: importer, ...relationship }) => ({
				...relationship,
				file: { id: importer.id, path: importer.path },
			})),
		})),
		imports: file.imports,
	}));
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
