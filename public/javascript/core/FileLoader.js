import { Path } from "./Path.js";

export class FileLoader {
	constructor(extensions, excludedFolders = []) {
		if (!Array.isArray(extensions)) {
			throw new TypeError("File extensions must be provided as an array.");
		}
		this.extensions = [...extensions];
		this.excludedFolders = excludedFolders;
	}

	getFiles(files, { extensions = this.extensions, excludedFolders = this.excludedFolders } = {}) {
		return files.filter((file) => {
			const name = file.name.toLowerCase();
			if (excludedFolders.some((folder) => file.webkitRelativePath.startsWith(folder))) return false;
			return extensions.some((extension) => name.endsWith(extension));
		});
	}

	async *retrieve(files) {
		for (const file of files) {
			yield {
				path: this.getProjectPath(file),
				name: file.name,
				sizeBytes: file.size,
				source: await file.text(),
			};
		}
	}

	getProjectPath(file) {
		return new Path(file.webkitRelativePath || file.name);
	}
}

export class File {}
