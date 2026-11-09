import { Path } from "./Path.js";

/** @typedef {{name?: string, path?: Path, source?: string, sizeBytes?: number, id?: number, [property: string]: unknown}} FileProperties */

export class File {
	/** @type {string|undefined} */
	name;

	/** @type {Path|undefined} */
	path;

	/** @type {string|undefined} */
	source;

	/** @type {number|undefined} */
	sizeBytes;

	/** @type {number|undefined} */
	id;

	/**
	 * @param {FileProperties} [properties={}] File metadata.
	 * @returns {void}
	 */
	constructor(properties = {}) {
		Object.assign(this, properties);
	}
}

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
			yield new File({
				path: this.getProjectPath(file),
				name: file.name,
				sizeBytes: file.size,
				source: await file.text(),
			});
		}
	}

	getProjectPath(file) {
		return new Path(file.webkitRelativePath || file.name);
	}
}
