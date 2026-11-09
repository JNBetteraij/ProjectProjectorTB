let world = "world";
const testStrings = [
	`A string with an escaped \` backtick`,
	`hello
world`,
	`hello\
world`,
	`hello \n world`,
	`hello ${world}`,
	`hello ${world}. hello Fred`,
	`hello \${world}. hello Fred`,
	`hello ${(world) => {
		return `${world}${[...world].reverse().join("")}`;
	}}. hello Fred`,
];
