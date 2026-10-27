import { CommentMatcher } from "./CommentMatcher.js";
import { ConsoleMatcher } from "./ConsoleMatcher.js";
import { ExportMatcher } from "./ExportMatcher.js";
import { ImportMatcher } from "./ImportMatcher.js";

export const DEFAULT_INCLUDE_COMMENTED_LINES = false;

export const MATCHER_FACTORIES_BY_OPTION = {
	"imports-exports": () => [new ImportMatcher(), new ExportMatcher()],
	"console-statements": () => [new ConsoleMatcher()],
	"custom-regex": (pattern) => [new CommentMatcher(pattern)],
};
