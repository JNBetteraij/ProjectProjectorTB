import { File } from "./File.js";
import { Path } from "./Path.js";

/** Load and normalize project files before they are scanned.
 *
 * @class FileLoader
 * @typedef {FileLoader}
 */
export class FileLoader {
	/** Creates a file loader with the allowed extensions and ignored folders.
	 *
	 * @param {string[]} extensions Accepted file extensions such as ".js".
	 * @param {string[]} [excludedFolders=[]] Folder prefixes that should be skipped during scanning.
	 */
	constructor(extensions, excludedFolders = []) {
		if (!Array.isArray(extensions)) {
			throw new TypeError("File extensions must be provided as an array.");
		}
		this.extensions = [...extensions];
		this.excludedFolders = excludedFolders;
	}

	/** Filter and read selected browser files into project File instances.
	 *
	 * @param {Array<{ name: string, size?: number, webkitRelativePath?: string, text: () => Promise<string> }>} files Browser file objects to inspect and read.
	 * @param {{ excludedFolders?: string[] }} [options={}] Optional folder exclusions.
	 * @returns {Promise<File[]>} Matching project files with their source text loaded.
	 */
	async loadFiles(files, { excludedFolders = this.excludedFolders } = {}) {
		const matchingFiles = files
			.filter((file) => {
				const name = file.name.toLowerCase();
				if (excludedFolders.some((folder) => (file.webkitRelativePath || "").startsWith(folder))) return false;
				return this.extensions.some((extension) => name.endsWith(extension));
			});

		return Promise.all(
			matchingFiles.map(async (file) => {
				return new File({
					path: this.getProjectPath(file),
					name: file.name,
					sizeBytes: file.size ?? 0,
					source: await file.text(),
				});
			}),
		);
	}

	/** Convert a browser file path into the project Path representation.
	 *
	 * @param {{ webkitRelativePath?: string, name: string }} file Browser file entry.
	 * @returns {Path} Normalized project path.
	 */
	getProjectPath(file) {
		return new Path(file.webkitRelativePath || file.name);
	}
}
