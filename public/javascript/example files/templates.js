export async function importNodeFromTemplate(url, templateId = "template") {
	const res = await fetch(url);
	const text = await res.text();

	const doc = new DOMParser().parseFromString(text, "text/html");
	const template = doc.getElementById(templateId);

	const node = document.importNode(template.content, true);

	return node;
}

export async function insertNodeFromTemplate(target, url, templateId = "template", append = true) {
	const res = await fetch(url);
	const text = await res.text();

	const doc = new DOMParser().parseFromString(text, "text/html");
	const template = doc.getElementById(templateId);

	const node = document.importNode(template.content, true);

	const parent = typeof target == "string" ? document.querySelector(target) : target;
	if (append) {
		parent.append(node);
	} else {
		parent.prepend(node);
	}
}
