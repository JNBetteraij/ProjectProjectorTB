# Project Projector TB

This is a browser-based JavaScript project graph. It uses native ES modules and can be run with the VS Code Live Server extension.

## Setting up local dependencies

After cloning the repository, install the dependencies recorded in the lockfile:

```sh
npm ci
```

# Running the project

Open `public/html/index.html` with Live Server to run the app. Its import map points the browser's `"acorn"` and `"acorn-walk"` imports at the local npm-installed files.

# Updating dependencies

To update the dependencies to newer versions, run:

```sh
npm update acorn acorn-walk
```

To update to latest versions, run:

```sh
npm install acorn@latest acorn-walk@latest
```

Commit the resulting `package.json` and `package-lock.json`.
