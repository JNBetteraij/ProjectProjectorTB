import { Path } from "./Path.js";

/**
 * Lightweight project file model used by the scanner and graph builder.
 *
 * @class File
 * @typedef {File}
 */
export class File {
	static nextId = 0;

	/**
	 * Create a normalized project file.
	 *
	 * @param {{ path: string | Path, name: string, sizeBytes?: number, source?: string }} [details={}] File metadata and source content.
	 */
	constructor({ path, name, sizeBytes = 0, source = "" } = {}) {
		if (!name || typeof name !== "string") {
			throw new TypeError("File name must be provided as a non-empty string.");
		}
		if (!(path instanceof Path) && !(typeof path === "string" && path.length > 0)) {
			throw new TypeError("File path must be provided as a Path instance or string.");
		} else {
			this.path = path instanceof Path ? path : new Path(path);
		}

		this.id = File.nextId++;
		this.name = name;
		this.sizeBytes = Number.isFinite(sizeBytes) ? Number(sizeBytes) : 0;
		this.source = typeof source === "string" ? source : "";
		this.analysis = null;
		this.declarations = [];
	}

	/**
	 * Create a File instance from a browser file entry.
	 *
	 * @param {{ name: string, size?: number, text: () => Promise<string>, webkitRelativePath?: string }} file Browser file object to wrap.
	 * @returns {File} The normalized project file.
	 */
	static fromBrowserFile(file) {
		if (!file || typeof file !== "object") {
			throw new TypeError("A browser File-like object is required.");
		}
		if (typeof file.name !== "string" || !file.name) {
			throw new TypeError("Browser file objects must provide a file name.");
		}
		if (typeof file.text !== "function") {
			throw new TypeError("Browser file objects must provide a text() method.");
		}

		return new File({
			path: file.webkitRelativePath || file.name,
			name: file.name,
			sizeBytes: typeof file.size === "number" ? file.size : 0,
		});
	}
}
