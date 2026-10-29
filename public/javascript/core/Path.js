export class Path {
	constructor(path) {
		if (typeof path !== "string") throw new TypeError("Path must be a string.");
		this.full = path.replaceAll("\\", "/");

		const array = this.full.split("/").filter(Boolean);
		if (array.length === 0) throw new TypeError("Path must not be empty.");

		this.array = [...array];
		this.file = array.pop();
		this.folders = array.join("/") + "/";
	}
}
