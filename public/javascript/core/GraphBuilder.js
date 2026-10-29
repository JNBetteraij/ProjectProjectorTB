export class GraphBuilder {
	build(files) {
		const edgesByPair = new Map();
		for (const file of files) {
			file.linkedScopes = [];
			for (const exported of file.exports) exported.importedBy = [];
		}
		resolveReExports(files);

		for (const importer of files) {
			for (const imported of importer.imports) {
				const exporter = imported.sourceFile;
				if (!exporter) continue;

				for (const item of imported.items) {
					const matchingExports =
						item.name === "*"
							? exporter.exports.filter(
									(candidate) =>
										!imported.reExport || item.localName || candidate.name !== "default",
								)
							: exporter.exports.filter((candidate) => candidate.name === item.name);
					for (const exportedItem of matchingExports) {
						item.type = item.name === "*" ? item.type : exportedItem.type;
						const importedBy = exportedItem.importedBy.find((entry) => entry.file === importer);
						if (importedBy) {
							const importedAs = item.localName || item.name;
							if (!importedBy.importedAs.includes(importedAs)) importedBy.importedAs.push(importedAs);
							importedBy.reExport ||= Boolean(imported.reExport);
						} else {
							exportedItem.importedBy.push({
								file: importer,
								importedAs: [item.localName || item.name],
								reExport: Boolean(imported.reExport),
							});
						}
					}
				}

				if (!exporter.linkedScopes.includes(importer)) exporter.linkedScopes.push(importer);
				if (exporter === importer) continue;
				const pairKey = `${exporter.id}:${importer.id}`;
				if (!edgesByPair.has(pairKey)) {
					edgesByPair.set(pairKey, {
						sourceId: exporter.id,
						targetId: importer.id,
						importedItems: [],
					});
				}
				const edge = edgesByPair.get(pairKey);
				for (const item of imported.items) {
					const label = item.name;
					if (!edge.importedItems.includes(label)) edge.importedItems.push(label);
				}
			}
		}

		const edges = [...edgesByPair.values()];
		return { files, edges, groups: groupFiles(files, edges) };
	}
}

function resolveReExports(files) {
	let changed = true;
	while (changed) {
		changed = false;
		for (const importer of files) {
			for (const imported of importer.imports) {
				if (!imported.reExport || !imported.sourceFile) continue;
				const exporter = imported.sourceFile;

				for (const item of imported.items) {
					if (item.name === "*" && !item.localName) {
						const remainingExports = importer.exports.filter((candidate) => candidate.name !== "*");
						if (remainingExports.length !== importer.exports.length) {
							importer.exports = remainingExports;
							changed = true;
						}
						for (const exportedItem of exporter.exports) {
							if (exportedItem.name === "default" || exportedItem.name === "*") continue;
							const existingExport = importer.exports.find(
								(candidate) => candidate.name === exportedItem.name,
							);
							if (existingExport) {
								if (existingExport.type === "unknown" && exportedItem.type !== "unknown") {
									existingExport.type = exportedItem.type;
									changed = true;
								}
								continue;
							}
							importer.exports.push({
								name: exportedItem.name,
								type: exportedItem.type,
								importedBy: [],
							});
							changed = true;
						}
						continue;
					}
					if (item.name === "*") continue;

					const sourceExport = exporter.exports.find((candidate) => candidate.name === item.name);
					const reExported = importer.exports.find(
						(candidate) => candidate.name === (item.localName || item.name),
					);
					if (sourceExport && reExported && reExported.type !== sourceExport.type) {
						reExported.type = sourceExport.type;
						changed = true;
					}
				}
			}
		}
	}
}

function groupFiles(files, edges) {
	const neighbors = new Map(files.map((file) => [file.id, new Set()]));
	for (const edge of edges) {
		neighbors.get(edge.sourceId)?.add(edge.targetId);
		neighbors.get(edge.targetId)?.add(edge.sourceId);
	}

	const visited = new Set();
	const connectedGroups = [];
	const orphans = [];
	for (const file of files) {
		if (visited.has(file.id)) continue;
		const component = [];
		const queue = [file];
		visited.add(file.id);
		while (queue.length) {
			const current = queue.shift();
			component.push(current);
			for (const neighborId of neighbors.get(current.id) || []) {
				if (visited.has(neighborId)) continue;
				visited.add(neighborId);
				queue.push(files.find((candidate) => candidate.id === neighborId));
			}
		}
		if (component.length > 1) connectedGroups.push(component);
		else orphans.push(file);
	}

	const groups = connectedGroups.map((scopes, index) => ({
		title: `Shared scope ${index + 1}`,
		files: scopes,
		connected: true,
	}));
	if (orphans.length) groups.push({ title: "Files with no connections", files: orphans, connected: false });
	return groups;
}
