import { createFileLabel, createImportStatusTag } from "./FileDisplay.js";

export class ScopeListRenderer {
	constructor(container, { onSelectFile, onFocusFile }) {
		this.container = container;
		this.onSelectFile = onSelectFile;
		this.onFocusFile = onFocusFile;
	}

	render(groups) {
		this.container.replaceChildren();
		for (const group of groups) {
			const details = document.createElement("details");
			details.className = "scope-group";
			details.open = true;

			const summary = document.createElement("summary");
			summary.textContent = `${group.title} (${group.files.length} files)`;
			details.append(summary);

			for (const file of group.files) {
				details.append(this.renderFile(file));
			}
			this.container.append(details);
		}
	}

	renderFile(file) {
		const item = document.createElement("article");
		item.className = "scope-file";

		const header = document.createElement("div");
		header.className = "scope-file-header";
		const selectButton = document.createElement("button");
		selectButton.className = "scope-file-name";
		selectButton.type = "button";
		selectButton.setAttribute("aria-label", `Select ${file.path.full} in graph`);
		selectButton.append(createFileLabel(file.path.full));
		selectButton.addEventListener("click", () => this.onSelectFile(file.id));
		header.append(selectButton);
		const focusButton = document.createElement("button");
		focusButton.className = "scope-file-focus";
		focusButton.type = "button";
		focusButton.setAttribute("aria-label", `Go to ${file.path.full} in graph`);
		focusButton.title = "Go to file in graph";
		focusButton.textContent = "↗";
		focusButton.addEventListener("click", () => this.onFocusFile(file.id));
		header.append(focusButton);

		const counts = document.createElement("p");
		counts.className = "scope-file-counts muted";
		counts.textContent = `${file.imports.length} imports · ${file.exports.length} exports`;
		const details = document.createElement("details");
		details.className = "scope-file-details";
		const summary = document.createElement("summary");
		summary.textContent = "File details";
		details.append(summary);
		details.append(
			this.renderItemList(
				"Exports",
				file.exports.map((item) => `${item.name} (${item.type})`),
			),
		);
		details.append(
			this.renderItemList(
				"Imports",
				file.imports.map((item) => ({
					path: item.path || item.source,
					source: item.source,
					status: item.status,
					detail: item.items.map((entry) => entry.name).join(", ") || "side-effect import",
				})),
			),
		);
		const linkedScopes = file.linkedScopes.map((scope) => ({ path: scope.path.full }));
		details.append(this.renderItemList("Imported by", linkedScopes));

		item.append(header, counts, details);
		return item;
	}

	renderItemList(title, values) {
		const section = document.createElement("section");
		section.className = "scope-detail-section";
		const heading = document.createElement("h3");
		heading.textContent = title;
		section.append(heading);
		if (!values.length) {
			const empty = document.createElement("p");
			empty.className = "muted";
			empty.textContent = "None";
			section.append(empty);
		} else {
			const list = document.createElement("ul");
			for (const value of values) {
				const entry = document.createElement("li");
				if (typeof value === "string") {
					entry.textContent = value;
				} else {
					entry.append(createFileLabel(value.path, "file-label file-list-label"));
					const statusTag = createImportStatusTag(value.status, value.source);
					if (statusTag) entry.append(statusTag);
					if (value.detail) {
						const detail = document.createElement("span");
						detail.className = "file-list-detail";
						detail.textContent = value.detail;
						entry.append(detail);
					}
				}
				list.append(entry);
			}
			section.append(list);
		}
		return section;
	}
}
