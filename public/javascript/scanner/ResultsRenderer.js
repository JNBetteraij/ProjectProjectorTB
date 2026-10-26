export class ResultsRenderer {
	constructor({ summaryEl, resultsEl, jsonOutput }) {
		this.summaryEl = summaryEl;
		this.resultsEl = resultsEl;
		this.jsonOutput = jsonOutput;
	}

	clear() {
		this.resultsEl.replaceChildren();
		this.summaryEl.replaceChildren();
		this.jsonOutput.value = "";
	}

	render(fileObjects) {
		this.resultsEl.replaceChildren();

		const totalFindings = fileObjects.reduce((sum, file) => sum + file.findingCount, 0);
		this.addStat("Files scanned", fileObjects.length);
		this.addStat("Files with matches", fileObjects.filter((file) => file.findingCount > 0).length);
		this.addStat("Matches", totalFindings);

		for (const file of fileObjects) {
			if (file.findingCount === 0) continue;

			const details = document.createElement("details");
			details.className = "file";
			details.open = false;

			const summary = document.createElement("summary");
			const fileName = document.createElement("div");
			fileName.textContent = file.path;
			const matchCount = document.createElement("div");
			matchCount.textContent = `${file.findingCount} match(es)`;
			summary.append(fileName, matchCount);
			summary.style.display = "flex";
			summary.style.justifyContent = "space-between";
			details.append(summary);

			const content = document.createElement("div");
			content.className = "file-content";

			for (const finding of file.findings) {
				content.append(this.renderFinding(finding));
			}

			details.append(content);
			this.resultsEl.append(details);
		}

		this.jsonOutput.value = JSON.stringify(fileObjects, null, 2);
	}

	download(results) {
		const blob = new Blob([JSON.stringify(results, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "scan-results.json";
		anchor.click();
		URL.revokeObjectURL(url);
	}

	addStat(label, value) {
		const stat = document.createElement("div");
		stat.className = "stat";
		const strong = document.createElement("strong");
		strong.textContent = value;
		const text = document.createElement("div");
		text.textContent = label;
		stat.append(strong, text);
		this.summaryEl.append(stat);
	}

	renderFinding(finding) {
		const item = document.createElement("div");
		item.className = "finding";

		const meta = document.createElement("div");
		const lineTag = document.createElement("span");
		lineTag.className = "tag";
		lineTag.textContent = `Line ${finding.line}, col ${finding.column}`;
		meta.append(lineTag);

		const matcherTag = document.createElement("span");
		matcherTag.className = "tag";
		matcherTag.textContent = finding.matcher;
		meta.append(matcherTag);

		const commentTag = document.createElement("span");
		commentTag.className = "tag";
		commentTag.textContent = finding.commentedOut
			? `Commented (${finding.commentType})`
			: "Not commented";
		meta.append(commentTag);

		const code = document.createElement("pre");
		code.textContent = finding.context;

		item.append(meta, code);

		if (Object.keys(finding.details).length > 0) {
			const parsedDetails = document.createElement("pre");
			parsedDetails.textContent = JSON.stringify(finding.details, null, 2);
			item.append(parsedDetails);
		}

		return item;
	}
}
