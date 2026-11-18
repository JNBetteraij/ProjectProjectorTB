export default class Component {
	constructor(data) {
		const fragment = this.#createDomFragment(data);

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

	constructComponent() {
		throw new TypeError(`Missing implementation of constructComponent function in ${this.constructor.name}.`);
	}

	#createDomFragment(data) {
		const component = this.constructComponent(data);
		const fragment = this.normalizeToDocumentFragment(component);

		return fragment;
	}

	/** Normalizes a component or DOM node into a DocumentFragment.
	 *
	 * @param {Node|Component} node - The DOM node or component to normalize.
	 * @returns {DocumentFragment} The normalized document fragment.
	 * @throws {TypeError} If the provided value cannot be normalized into a DocumentFragment.
	 */
	normalizeToDocumentFragment(node) {
		if (node instanceof DocumentFragment) {
			return node;
		}

		if (node instanceof Component) {
			node = node.element;
		}
		if (node instanceof Node) {
			const fragment = document.createDocumentFragment();
			fragment.appendChild(node);
			return fragment;
		}

		throw new TypeError(`Cannot parse ${node} as DocumentFragment`);
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
			if (value instanceof Component) {
				return componentPlaceholder(value);
			}

			return value;
		}
	}
}
