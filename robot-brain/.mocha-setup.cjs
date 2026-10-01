// .mocha-setup.cjs — minimal `vscode` module stub for plain-mocha unit tests.
//
// `npm run test:unit` runs mocha directly on compiled output (out/test/*.js).
// Outside the VS Code Extension Host there is no `vscode` module, so any
// `require('vscode')` (logger, sensors, engines, ...) would throw
// MODULE_NOT_FOUND and the whole suite fails to load.
//
// This file is loaded via `mocha --require ./.mocha-setup.cjs` and intercepts
// `require('vscode')`, returning a safe in-memory stub. It is test-only and is
// never bundled into the extension (esbuild marks `vscode` external).
//
// The stub mirrors just enough of the VS Code API for unit tests:
// - all event subscriptions return a `{ dispose() {} }` disposable
// - workspace has no open folders/documents by default (tests can mutate the
//   exported stub via `require('vscode')` if a test needs folders)
// - languages.getDiagnostics returns []
// - window/commands/env promises resolve to neutral defaults

const Module = require('module');

function makeDisposable() {
    return { dispose() { /* no-op */ } };
}

function makeOutputChannel() {
    return {
        appendLine() { /* swallowed in unit tests */ },
        append() { /* swallowed */ },
        show() { /* swallowed */ },
        hide() { /* swallowed */ },
        dispose() { /* no-op */ },
        clear() { /* no-op */ },
    };
}

class FakeUri {
    constructor(fsPath, scheme = 'file') {
        this.fsPath = fsPath;
        this.scheme = scheme;
        this.path = fsPath;
    }
    static file(fsPath) {
        return new FakeUri(fsPath, 'file');
    }
    static parse(value) {
        return new FakeUri(String(value), 'unknown');
    }
    toString() {
        return this.fsPath;
    }
}

class FakeRange {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
}

class FakePosition {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}

class FakeWorkspaceEdit {
    constructor() {
        this.entries = [];
    }
    replace(uri, range, newText) {
        this.entries.push({ uri, range, newText });
    }
    insert(uri, position, newText) {
        this.entries.push({ uri, position, newText });
    }
    delete(uri, range) {
        this.entries.push({ uri, range });
    }
}

class FakeEventEmitter {
    constructor() {
        this.listeners = [];
        this.event = (listener) => {
            this.listeners.push(listener);
            return makeDisposable();
        };
    }
    fire(data) {
        for (const listener of this.listeners) {
            listener(data);
        }
    }
    dispose() {
        this.listeners = [];
    }
}

const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
};

const ViewColumn = { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 };
const StatusBarAlignment = { Left: 1, Right: 2 };
const ExtensionMode = { Production: 1, Development: 2, Test: 3 };

const vscodeStub = {
    window: {
        activeTextEditor: undefined,
        visibleTextEditors: [],
        // VS Code window focus state (tests may flip `focused` to simulate
        // the user switching to/from VS Code).
        state: { focused: true },
        createOutputChannel(_name) {
            return makeOutputChannel();
        },
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showInputBox: async () => undefined,
        showQuickPick: async () => undefined,
        showTextDocument: async () => undefined,
        onDidChangeActiveTextEditor: () => makeDisposable(),
        onDidChangeVisibleTextEditors: () => makeDisposable(),
        onDidChangeTextEditorSelection: () => makeDisposable(),
        onDidChangeTextEditorVisibleRanges: () => makeDisposable(),
        onDidOpenTerminal: () => makeDisposable(),
        onDidCloseTerminal: () => makeDisposable(),
        onDidChangeActiveTerminal: () => makeDisposable(),
        onDidEndTerminalShellExecution: () => makeDisposable(),
        onDidChangeWindowState: () => makeDisposable(),
        createStatusBarItem: () => ({
            show() {},
            hide() {},
            dispose() {},
            text: '',
            tooltip: '',
            command: undefined,
        }),
        createTreeView: () => ({ dispose() {}, reveal: async () => undefined }),
        registerTreeDataProvider: () => makeDisposable(),
        registerWebviewViewProvider: () => makeDisposable(),
        withProgress: async (_opts, task) => task({ report: () => {} }, { isCancellationRequested: false }),
    },
    workspace: {
        workspaceFolders: undefined,
        textDocuments: [],
        onDidChangeWorkspaceFolders: () => makeDisposable(),
        onDidOpenTextDocument: () => makeDisposable(),
        onDidCloseTextDocument: () => makeDisposable(),
        onDidChangeTextDocument: () => makeDisposable(),
        onDidSaveTextDocument: () => makeDisposable(),
        onDidCreateFiles: () => makeDisposable(),
        onDidDeleteFiles: () => makeDisposable(),
        onDidRenameFiles: () => makeDisposable(),
        openTextDocument: async () => {
            throw new Error('vscode stub: no documents available in unit tests');
        },
        applyEdit: async () => false,
        findFiles: async () => [],
        getConfiguration: (_section) => ({
            get: (_key, defaultValue) => defaultValue,
            has: () => false,
            update: async () => {},
        }),
        createFileSystemWatcher: () => ({
            onDidCreate: () => makeDisposable(),
            onDidChange: () => makeDisposable(),
            onDidDelete: () => makeDisposable(),
            dispose() {},
        }),
        fs: {
            readFile: async () => { throw new Error('vscode stub: fs unavailable'); },
            writeFile: async () => { throw new Error('vscode stub: fs unavailable'); },
            stat: async () => { throw new Error('vscode stub: fs unavailable'); },
        },
    },
    languages: {
        getDiagnostics: () => [],
        onDidChangeDiagnostics: () => makeDisposable(),
        registerCodeActionsProvider: () => makeDisposable(),
        registerHoverProvider: () => makeDisposable(),
        registerCompletionItemProvider: () => makeDisposable(),
    },
    commands: {
        registerCommand: () => makeDisposable(),
        executeCommand: async () => undefined,
        getCommands: async () => [],
    },
    env: {
        openExternal: async () => true,
        clipboard: { readText: async () => '', writeText: async () => {} },
        machineId: 'stub-machine-id',
        sessionId: 'stub-session-id',
    },
    debug: {
        onDidStartDebugSession: () => makeDisposable(),
        onDidTerminateDebugSession: () => makeDisposable(),
        onDidReceiveDebugSessionCustomEvent: () => makeDisposable(),
        onDidChangeBreakpoints: () => makeDisposable(),
        activeDebugSession: undefined,
        startDebugging: async () => false,
    },
    extensions: {
        all: [],
        onDidChange: () => makeDisposable(),
        getExtension: () => undefined,
    },
    extensionsOnDidChange: () => makeDisposable(),
    Uri: FakeUri,
    Range: FakeRange,
    Position: FakePosition,
    Selection: FakeRange,
    WorkspaceEdit: FakeWorkspaceEdit,
    EventEmitter: FakeEventEmitter,
    Disposable: class Disposable {
        constructor(callOnDispose) {
            this.callOnDispose = callOnDispose;
        }
        dispose() {
            if (this.callOnDispose) { this.callOnDispose(); }
        }
        static from(...disposables) {
            return new Disposable(() => { disposables.forEach((d) => d.dispose()); });
        }
    },
    DiagnosticSeverity,
    ViewColumn,
    StatusBarAlignment,
    ExtensionMode,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
    CodeActionKind: { QuickFix: { value: 'quickfix' }, Empty: { value: '' } },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return vscodeStub;
    }
    return originalLoad.call(this, request, parent, isMain);
};

// Also expose the stub on globalThis for tests that reach for it directly.
globalThis.vscode = vscodeStub;
