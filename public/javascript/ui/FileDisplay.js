import { Path } from "../core/Path.js";

export function getFileDisplayParts(path) {
	const filePath = path instanceof Path ? path : new Path(path);
	return {
		name: filePath.file || filePath.full,
		folder: filePath.folders,
	};
}

export function createFileLabel(path, className = "file-label") {
	const { name, folder } = getFileDisplayParts(path);

	const label = document.createElement("span");
	label.className = className;

	const fileName = document.createElement("span");
	fileName.className = "file-label-name";
	fileName.textContent = name;
	label.append(fileName);

	if (folder) {
		const fileFolder = document.createElement("span");
		fileFolder.className = "file-label-folder";
		fileFolder.textContent = folder;
		label.append(fileFolder);
	}

	return label;
}

export function createImportStatusTag(status, source) {
	if (status !== "unresolved" && status !== "ambiguous") return null;

	const tag = document.createElement("span");
	tag.className = `import-status-tag import-status-${status}`;
	tag.textContent = status === "ambiguous" ? "Ambiguous absolute import" : "Unresolved import";
	tag.setAttribute("aria-label", tag.textContent);
	tag.title =
		status === "ambiguous" ? `Multiple scanned files could match ${source}` : `No scanned file matches ${source}`;
	return tag;
}
