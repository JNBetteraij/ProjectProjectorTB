//#region Class graph

/** Resolve project class bases and build inheritance edges between declarations. */
export class ClassGraphBuilder {
	/**
	 * Link each class to its resolved base and collect the classes derived from it.
	 *
	 * @param {object[]} files Scanned project files containing imports, exports, and classes.
	 * @returns {{ classes: object[], edges: object[] }} Class records and directed inheritance edges.
	 */
	build(files) {
		const classes = files.flatMap((file) => file.classes);
		const edges = [];
		for (const classRecord of classes) {
			classRecord.extends = null;
			classRecord.inheritedBy = [];
			if (!classRecord.extendsName) continue;

			const [rootName, ...memberNames] = classRecord.extendsName.split(".");
			let base = classRecord.file.classes.find((candidate) => candidate.name === rootName);
			if (!base) {
				for (const imported of classRecord.file.imports) {
					const item = imported.items.find((candidate) => candidate.localName === rootName);
					if (!item || !imported.sourceFile) continue;
					const exportName = item.name === "*" ? memberNames[0] : item.name;
					base = resolveExportedClass(imported.sourceFile, exportName, new Set());
					if (base) break;
				}
			}
			for (const memberName of memberNames) {
				base = base?.file.classes.find((candidate) => candidate.name === memberName) || null;
			}
			if (!base) continue;

			classRecord.extends = base;
			if (!base.inheritedBy.includes(classRecord)) base.inheritedBy.push(classRecord);
			edges.push({
				sourceId: base.id,
				targetId: classRecord.id,
				label: "extends",
			});
		}

		return { classes, edges };
	}
}

/**
 * Find the class exported under a name, following imported aliases and re-exports.
 *
 * @param {object} file File whose exports are being inspected.
 * @param {string | null} exportName Name imported from the file.
 * @param {Set<string>} visitedExports Re-export keys already traversed.
 * @returns {object | null} Matching class declaration or null when it cannot be resolved.
 */
function resolveExportedClass(file, exportName, visitedExports) {
	if (!exportName) return null;
	const visitKey = `${file.id}:${exportName}`;
	if (visitedExports.has(visitKey)) return null;
	visitedExports.add(visitKey);

	const exported = file.exports.find((candidate) => candidate.name === exportName);
	if (!exported) return null;
	const localName = exported.localName || (exported.name === "default" ? "default" : exported.name);
	const localClass = file.classes.find((candidate) => candidate.name === localName);
	if (localClass) return localClass;

	for (const imported of file.imports) {
		if (!imported.sourceFile) continue;
		const item = imported.items.find(
			(candidate) =>
				candidate.localName === localName
				|| (imported.reExport && candidate.name === localName),
		);
		if (!item) continue;
		const sourceName = item.name === "*" ? exportName : item.name;
		const result = resolveExportedClass(imported.sourceFile, sourceName, visitedExports);
		if (result) return result;
	}

	for (const imported of file.imports) {
		if (!imported.reExport || !imported.sourceFile) continue;
		if (imported.items.some((item) => item.name === "*" && !item.localName)) {
			const result = resolveExportedClass(imported.sourceFile, exportName, visitedExports);
			if (result) return result;
		}
	}
	return null;
}

//#endregion Class graph
