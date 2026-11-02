export const operators = [
	// Arithmetic operators
	{ value: "**", assignable: true, category: "arithmetic", name: "exponentiation" },
	{ value: "*", assignable: true, category: "arithmetic", name: "multiplication" },
	{ value: "/", assignable: true, category: "arithmetic", name: "division" },
	{ value: "%", assignable: true, category: "arithmetic", name: "modulo" },
	{ value: "+", assignable: true, category: "arithmetic", name: "addition" },
	{ value: "-", assignable: true, category: "arithmetic", name: "subtraction" },

	// Comparison operators
	{ value: "===", assignable: false, category: "comparison", name: "strict-equal" },
	{ value: "!==", assignable: false, category: "comparison", name: "strict-not-equal" },
	{ value: "==", assignable: false, category: "comparison", name: "equal" },
	{ value: "!=", assignable: false, category: "comparison", name: "not-equal" },
	{ value: "<=", assignable: false, category: "comparison", name: "less-than-or-equal" },
	{ value: ">=", assignable: false, category: "comparison", name: "greater-than-or-equal" },
	{ value: "<", assignable: false, category: "comparison", name: "less-than" },
	{ value: ">", assignable: false, category: "comparison", name: "greater-than" },

	// Logical operators
	{ value: "&&", assignable: true, category: "logical", name: "logical-and" },
	{ value: "||", assignable: true, category: "logical", name: "logical-or" },
	{ value: "??", assignable: true, category: "logical", name: "nullish-coalescing" },
	{ value: "!", assignable: false, category: "logical", name: "logical-not" },

	// Bitwise operators
	{ value: ">>>", assignable: true, category: "bitwise", name: "unsigned-right-shift" },
	{ value: "<<", assignable: true, category: "bitwise", name: "left-shift" },
	{ value: ">>", assignable: true, category: "bitwise", name: "right-shift" },
	{ value: "&", assignable: true, category: "bitwise", name: "bitwise-and" },
	{ value: "|", assignable: true, category: "bitwise", name: "bitwise-or" },
	{ value: "^", assignable: true, category: "bitwise", name: "bitwise-xor" },
	{ value: "~", assignable: false, category: "bitwise", name: "bitwise-not" },

	// Assignment operators
	{ value: "=", assignable: false, category: "assignment", name: "assignment" },

	// Increment / decrement operators
	{ value: "++", assignable: false, category: "increment", name: "increment" },
	{ value: "--", assignable: false, category: "increment", name: "decrement" },

	// Conditional operators
	{ value: "?", assignable: false, category: "conditional", name: "conditional" },
	{ value: ":", assignable: false, category: "conditional", name: "conditional-separator" },

	// Arrow
	{ value: "=>", assignable: false, category: "other", name: "arrow" },

	// Spread / rest
	{ value: "...", assignable: false, category: "spread", name: "spread" },

	// Member access operators
	{
		value: "?.",
		assignable: false,
		category: "member-access",
		name: "optional-chaining",
		validate: (source, index) => !/[0-9]/.test(source[index + 2] || ""),
	},
	{ value: ".", assignable: false, category: "member-access", name: "property-access" },
]
	.map((operator) => ({
		...operator,
		length: operator.value.length,
	}))
	.sort((a, b) => b.length - a.length);

// Create a set containing every character that can start an operator.
export const operatorStarts = new Set(operators.map((operator) => operator.value[0]));

// Bracket characters
const bracketsChars = [
	["{", "}"],
	["[", "]"],
	["(", ")"],
];
export const openingBrackets = new Set(bracketsChars.map(([opening]) => opening));
export const closingBrackets = Object.fromEntries(bracketsChars.map(([opening, closing]) => [opening, closing]));
export const brackets = new Set(bracketsChars.flat());

export const separators = new Set([",", ";"]);
