export default class Component {
	constructor(data) {
		const fragment = this.createDomFragment(data);

		if (!(fragment instanceof DocumentFragment)) {
			throw new TypeError("Component template must return a DocumentFragment.");
		}

		if (fragment.children.length === 0) {
			throw new TypeError("Component template does not contain any root elements.");
		}

		this.elements = [...fragment.children];
		this.element = this.elements[0];

		this.element.script = this;
	}

	createDomFragment() {
		throw new TypeError("Does not implement createDomFragment function.");
	}

	html(strings, ...values) {
		const template = document.createElement("template");
		const placeholderTag = "component-placeholder";

		let htmlString = "";
		const components = new Map();
		let id = 0;

		for (const [index, string] of strings.entries()) {
			htmlString += string;

			if (!(index < values.length)) break;

			htmlString += normalize(values[index]);
		}

		template.innerHTML = htmlString;
		const fragment = template.content;

		for (const [id, component] of components) {
			const placeholder = fragment.querySelector(`${placeholderTag}[data-id="${id}"]`);

			placeholder.replaceWith(component.element);
		}

		return fragment;

		function componentPlaceholder(value) {
			components.set(id, value);
			return `<${placeholderTag} data-id="${id++}"></${placeholderTag}>`;
		}

		function normalize(value) {
			if (Array.isArray(value)) {
				return value.map((val) => normalize(val)).join("");
			}
			if (value instanceof Component) return componentPlaceholder(value);
			//some kind of check/conversion to stringable value

			return value;
		}
	}
}
