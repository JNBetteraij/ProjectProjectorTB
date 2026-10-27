import { FileRetriever } from "./scanner/FileRetriever.js";
import { ResultsRenderer } from "./scanner/ResultsRenderer.js";
import {
	DEFAULT_INCLUDE_COMMENTED_LINES,
	MATCHER_FACTORIES_BY_OPTION,
} from "./scanner/SearchConfiguration.js";
import { Scanner } from "./scanner/Scanner.js";

const folderInput = document.querySelector("#folderInput");
const searchType = document.querySelector("#searchType");
const patternField = document.querySelector("#patternField");
const patternInput = document.querySelector("#patternInput");
const includeCommentedLines = document.querySelector("#includeCommentedLines");
const extensionsInput = document.querySelector("#extensionsInput");
const scanButton = document.querySelector("#scanButton");
const downloadButton = document.querySelector("#downloadButton");
const statusEl = document.querySelector("#status");

const fileRetriever = new FileRetriever();
const scanner = new Scanner();
const resultsRenderer = new ResultsRenderer({
	summaryEl: document.querySelector("#summary"),
	resultsEl: document.querySelector("#results"),
	jsonOutput: document.querySelector("#jsonOutput"),
});

let scanResults = [];

includeCommentedLines.checked = DEFAULT_INCLUDE_COMMENTED_LINES;
searchType.addEventListener("change", () => {
	patternField.hidden = searchType.value !== "custom-regex";
});
scanButton.addEventListener("click", scanSelectedFiles);
downloadButton.addEventListener("click", () => resultsRenderer.download(scanResults));

async function scanSelectedFiles() {
	const selectedFiles = Array.from(folderInput.files || []);
	if (!selectedFiles.length) {
		statusEl.textContent = "Select a project folder first.";
		return;
	}

	const createMatchers = MATCHER_FACTORIES_BY_OPTION[searchType.value];
	if (!createMatchers) {
		statusEl.textContent = "Select a valid search type.";
		return;
	}

	let matchers;
	try {
		matchers = createMatchers(patternInput.value);
	} catch (error) {
		statusEl.textContent = `Invalid regular expression: ${error.message}`;
		return;
	}

	const extensions = extensionsInput.value
		.split(",")
		.map((extension) => extension.trim().toLowerCase())
		.filter(Boolean);
	const files = fileRetriever.getFiles(selectedFiles, extensions);

	if (!files.length) {
		statusEl.textContent = "No files matched the configured extensions.";
		return;
	}

	scanButton.disabled = true;
	downloadButton.disabled = true;
	scanResults = [];
	resultsRenderer.clear();
	statusEl.textContent = `Scanning ${files.length} file(s)…`;

	try {
		scanResults = await scanner.scan(fileRetriever.retrieve(files), matchers, {
			includeCommentedLines: includeCommentedLines.checked,
		});
		resultsRenderer.render(scanResults);

		const findingCount = scanResults.reduce((sum, file) => sum + file.findingCount, 0);
		statusEl.textContent = `Finished. Scanned ${scanResults.length} file(s), found ${findingCount} match(es).`;
	} catch (error) {
		statusEl.textContent = `Scan failed: ${error.message}`;
	} finally {
		scanButton.disabled = false;
		downloadButton.disabled = scanResults.length === 0;
	}
}
