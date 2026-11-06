# Project Guidelines

## Code Organization

- Use regions to delineate meaningful sections of files by functionality. In JavaScript, use editor-recognized markers such as `//#region Section name` and `//#endregion Section name`.
- Follow the existing project structure and formatting conventions.

## Functions and Documentation

- Add a JSDoc comment for each function you write. Start the description on the same line as the opening `/**`, and always document every argument with `@param` and the return value with `@returns`, including `void` returns. Use specific, appropriate types rather than omitting types or defaulting to `any`; document nullable and optional values accurately.

## Naming

- Use `camelCase` for variables, functions, and constants, including values that are constant by convention. Use other casing only when required by an external API or an established project convention.

## Function Arguments

- When a function takes a primary element/value plus several optional configuration values, keep the primary argument positional and group the options in one destructured object parameter with defaults. Default the options object to `{}` so callers can omit it, and give each option a sensible default. For example: `constructor(element = null, { classes = [], onTrayReordered = null } = {})`. Document the primary argument and each destructured option individually in JSDoc, with appropriate types and nullability.

## Formatting

- After writing or changing code, check for a formatter configured by the project and run it on the changed file.
- If no project formatter is configured, preserve the surrounding style rather than introducing a formatter or new tooling.

## Command Permissions

- When asking permission to run a command, briefly explain what the command does and why it is needed in this context.

## Browser Development

- Prefer the VS Code Live Server extension to serve the static project when testing it in a browser, rather than starting a Node.js server just to serve files. Live Server does not execute Node.js scripts or replace a backend; use Node.js when the task specifically requires running Node code or server-side behavior.
