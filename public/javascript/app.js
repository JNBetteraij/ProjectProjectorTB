import { FileLoader } from "./core/FileLoader.js";
import { GraphBuilder } from "./core/GraphBuilder.js";
import { Scanner } from "./core/Scanner.js";
import { ExportSearch } from "./core/Searches/ExportSearch.js";
import { ImportSearch } from "./core/Searches/ImportSearch.js";
import { JavaScriptAnalyzer } from "./languages/javascript/JavaScriptAnalyzer.js";
import { GraphRenderer } from "./ui/GraphRenderer.js";
import { ScopeListRenderer } from "./ui/ScopeListRenderer.js";

const controlsDialog = document.querySelector("#controlsDialog");
const scanForm = document.querySelector("#scanForm");
const folderInput = document.querySelector("#folderInput");
const extensionsInput = document.querySelector("#extensionsInput");
const excludedFoldersInput = document.querySelector("#excludedFoldersInput");
const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const copyButton = document.querySelector("#copyButton");
const openControlsButton = document.querySelector("#openControlsButton");
const closeControlsButton = document.querySelector("#closeControlsButton");
const fitGraphButton = document.querySelector("#fitGraphButton");
const statusElement = document.querySelector("#status");
const projectSummary = document.querySelector("#projectSummary");

const langaugeParser = new JavaScriptAnalyzer();
const fileLoader = new FileLoader(langaugeParser.fileExtensions, []);
const scanner = new Scanner([new ImportSearch(langaugeParser), new ExportSearch(langaugeParser)]);
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
	const extensions = extensionsInput.value
		.split(",")
		.map((extension) => extension.trim().toLowerCase())
		.filter(Boolean);
	if (extensions.length > 0) {
		options.extensions = extensions;
	}
	console.log();
	const files = fileLoader.getFiles(selectedFiles, options);
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
		const scannedFiles = await scanner.scan(fileLoader.retrieve(files));
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
		};
	});
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
