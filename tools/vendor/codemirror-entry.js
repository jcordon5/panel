// CodeMirror 6 pieces used by Panel's editor, bundled into app/vendor/codemirror.js
export { EditorState, EditorSelection, StateField, StateEffect, RangeSetBuilder, Prec, Compartment, Transaction, Annotation } from "@codemirror/state";
export { EditorView, Decoration, WidgetType, keymap, ViewPlugin, placeholder, drawSelection, dropCursor } from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentMore, indentLess, undo, redo } from "@codemirror/commands";
export { syntaxTree, LanguageSupport, syntaxHighlighting, HighlightStyle, indentUnit, ensureSyntaxTree } from "@codemirror/language";
export { markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward } from "@codemirror/lang-markdown";
export { autocompletion, completionKeymap, startCompletion, closeCompletion, completionStatus } from "@codemirror/autocomplete";
export { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
export { tags } from "@lezer/highlight";
