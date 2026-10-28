export function createDetailsSection(title, classes = { details: [], summary: [], content: [] }) {
	const details = document.createElement("details");

	const summary = document.createElement("summary");
	summary.textContent = title;

	const content = document.createElement("div");

	applyClasses();

	details.append(summary, content);
	return { details, summary, content };

	function applyClasses() {
		setClasses(details, classes?.details);
		setClasses(summary, classes?.summary);
		setClasses(content, classes?.content);
		function setClasses(element, classList) {
			if (!classList || classList.length === 0) return;
			element.classList.add(...(Array.isArray(classList) ? classList : [classList]));
		}
	}
}
