const EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];

export class GraphBuilder {
	build(files) {
		const filesByPath = new Map(files.map((file) => [file.path, file]));
		const edgesByPair = new Map();
		for (const file of files) {
			file.linkedScopes = [];
			for (const exported of file.exports) exported.importedBy = [];
		}

		for (const importer of files) {
			for (const imported of importer.imports) {
				const targetPath = resolveImportPath(importer.path, imported.source, filesByPath);
				imported.path = targetPath;
				const exporter = targetPath ? filesByPath.get(targetPath) : null;
				if (!exporter) continue;

				for (const item of imported.items) {
					const matchingExports =
						item.name === "*"
							? exporter.exports
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

function resolveImportPath(importerPath, source, filesByPath) {
	if (!source.startsWith(".")) return null;
	const directory = importerPath.split("/").slice(0, -1);
	const segments = [...directory, ...source.split("/")];
	const normalized = [];
	for (const segment of segments) {
		if (!segment || segment === ".") continue;
		if (segment === "..") normalized.pop();
		else normalized.push(segment);
	}

	const base = normalized.join("/");
	const candidates = [base];
	if (!/\.[^/]+$/.test(base)) {
		for (const extension of EXTENSIONS) candidates.push(`${base}${extension}`);
		for (const extension of EXTENSIONS) candidates.push(`${base}/index${extension}`);
	}
	return candidates.find((candidate) => filesByPath.has(candidate)) || null;
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
