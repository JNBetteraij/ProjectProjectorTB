export function getFileDisplayParts(path) {
	const parts = path.replaceAll("\\", "/").split("/");
	return {
		name: parts.pop() || path,
		folder: parts.join("/"),
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
