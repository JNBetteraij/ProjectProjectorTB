export class FileRetriever {
	getFiles(files, extensions) {
		return files.filter((file) => {
			const name = file.name.toLowerCase();
			return extensions.some((extension) => name.endsWith(extension));
		});
	}

	async *retrieve(files) {
		for (const file of files) {
			yield {
				file,
				path: this.getProjectPath(file),
				source: await file.text(),
			};
		}
	}

	getProjectPath(file) {
		const path = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
		const firstSeparator = path.indexOf("/");
		return firstSeparator === -1 ? path : path.slice(firstSeparator + 1);
	}
}
