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
				path: file.webkitRelativePath || file.name,
				source: await file.text(),
			};
		}
	}
}
