export const DEFAULT_CONNECTION_COLOR = "rgb(154, 168, 183)";

export const DEFAULT_CONNECTION_HIGHLIGHT_COLORS = Object.freeze({
	incoming: "rgb(229, 139, 57)",
	upstream: "rgb(243, 203, 166)",
	outgoing: "rgb(52, 136, 245)",
	downstream: "rgb(164, 201, 251)",
});

/** Store the predefined colors used to render one graph connection type. */
export class ConnectionType {
	/**
	 * @param {{
	 *   type: string,
	 *   color: string,
	 *   highlightColors: { incoming: string, upstream: string, outgoing: string, downstream: string }
	 * }} properties Connection type identifier and its base/highlight colors.
	 */
	constructor({ type, color, highlightColors }) {
		this.type = type;
		this.color = color;
		this.highlightColors = highlightColors;
	}
}
