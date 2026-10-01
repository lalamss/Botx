import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventFilter } from '../eventFilter/eventFilter';
import { EventType } from '../eventFilter/eventTypes';
import { parseGitConflictBlocks, GitConflictSensor } from '../sensors/gitConflictSensor';
import { ImportInspector } from '../sensors/importInspector';
import { EnvironmentSensor } from '../sensors/environmentSensor';

// Helper to create fake vscode.TextDocument for git conflict
function makeFakeDoc(lines: string[], filePath = '/tmp/file.ts'): any {
    return {
        uri: { fsPath: filePath, path: filePath },
        fileName: filePath,
        lineCount: lines.length,
        lineAt: (idx: number) => ({ text: lines[idx], range: { start: { line: idx, character: 0 }, end: { line: idx, character: lines[idx].length } } }),
        getText: () => lines.join('\n'),
        languageId: 'typescript'
    };
}

suite('GitConflictSensor', () => {
    test('parseGitConflictBlocks finds single block', () => {
        const doc = makeFakeDoc([
            'line1',
            '<<<<<<< HEAD',
            'const a = 1;',
            '=======',
            'const a = 2;',
            '>>>>>>> feature',
            'line2'
        ]);
        const blocks = parseGitConflictBlocks(doc);
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].currentBranchLabel, 'HEAD');
        assert.strictEqual(blocks[0].incomingBranchLabel, 'feature');
        assert.strictEqual(blocks[0].currentCode, 'const a = 1;');
        assert.strictEqual(blocks[0].incomingCode, 'const a = 2;');
        assert.strictEqual(blocks[0].startLine, 2);
        assert.strictEqual(blocks[0].endLine, 6);
    });

    test('parseGitConflictBlocks handles no conflict', () => {
        const doc = makeFakeDoc(['no conflict here', 'just code']);
        const blocks = parseGitConflictBlocks(doc);
        assert.strictEqual(blocks.length, 0);
    });

    test('parseGitConflictBlocks handles multiple blocks', () => {
        const doc = makeFakeDoc([
            '<<<<<<< HEAD',
            'a',
            '=======',
            'b',
            '>>>>>>> branch1',
            'middle',
            '<<<<<<< HEAD',
            'c',
            '=======',
            'd',
            '>>>>>>> branch2'
        ]);
        const blocks = parseGitConflictBlocks(doc);
        assert.strictEqual(blocks.length, 2);
    });

    test('GitConflictSensor publishes on scan', () => {
        const filter = new EventFilter();
        let published: any = null;
        filter.subscribe((e) => { if (e.type === EventType.GIT_CONFLICT_DETECTED) published = e; });
        const sensor = new GitConflictSensor(filter);
        // directly call scanDocument via any
        const doc = makeFakeDoc([
            '<<<<<<< HEAD',
            'x',
            '=======',
            'y',
            '>>>>>>> incoming'
        ], '/tmp/conflict.ts');
        (sensor as any).scanDocument(doc);
        assert.ok(published);
        assert.strictEqual(published.payload.ConflictCount, 1);
    });
});

suite('ImportInspector', () => {
    test('parseImportsTypeScript extracts imports', () => {
        const inspector = new ImportInspector(new EventFilter());
        const lines = [
            "import { foo } from 'react-dom';",
            "import * as url from 'url';",
            "const x = 1;"
        ];
        const imports = (inspector as any).parseImportsTypeScript(lines, 'file.ts') as any[];
        assert.ok(imports.some((i) => i.package === 'react-dom'));
        assert.ok(imports.some((i) => i.package === 'url'));
    });

    test('parseImportsPython extracts imports', () => {
        const inspector = new ImportInspector(new EventFilter());
        const lines = ['import imp', 'from cgi import foo', 'x = 1'];
        const imports = (inspector as any).parseImportsPython(lines) as any[];
        assert.ok(imports.some((i) => i.package === 'imp'));
        assert.ok(imports.some((i) => i.package === 'cgi'));
    });

    test('parseImportsGo extracts imports', () => {
        const inspector = new ImportInspector(new EventFilter());
        const lines = ['import "io/ioutil"', 'package main'];
        const imports = (inspector as any).parseImportsGo(lines) as any[];
        assert.ok(imports.some((i) => i.package === 'io/ioutil'));
    });

    test('parseImportsJava extracts imports', () => {
        const inspector = new ImportInspector(new EventFilter());
        const lines = ['import javax.xml.bind.JAXBContext;', 'class Foo {}'];
        const imports = (inspector as any).parseImportsJava(lines) as any[];
        assert.ok(imports.some((i) => i.package.includes('javax.xml.bind')));
    });

    test('inspectDocument detects deprecated ReactDOM.render', async () => {
        const inspector = new ImportInspector(new EventFilter());
        const fakeDoc: any = {
            uri: { fsPath: '/tmp/test.ts', path: '/tmp/test.ts', scheme: 'file' },
            fileName: '/tmp/test.ts',
            languageId: 'typescript',
            getText: () => "import ReactDOM from 'react-dom';\nReactDOM.render(<App />, container);",
            lineCount: 2
        };
        // mock workspace
        const originalWorkspace: any = (global as any).vscode;
        // Use direct call to inspectDocument
        const usages = await (inspector as any).inspectDocument(fakeDoc) as any[];
        // Should detect ReactDOM.render
        const found = usages.some((u) => u.symbol === 'ReactDOM.render');
        assert.ok(found, 'should detect deprecated ReactDOM.render');
    });

    test('getDeprecations returns cached empty for unknown file', () => {
        const inspector = new ImportInspector(new EventFilter());
        const fakeUri: any = { fsPath: '/tmp/unknown.ts' };
        const deps = inspector.getDeprecations(fakeUri);
        assert.strictEqual(deps.length, 0);
    });
});

suite('EnvironmentSensor', () => {
    test('inspectWorkspace with no folders returns clean', () => {
        const filter = new EventFilter();
        const sensor = new EnvironmentSensor(filter);
        // vscode mock has no workspaceFolders, so inspect should return clean
        const status = (sensor as any).inspectWorkspace() as any;
        assert.strictEqual(status.clean, true);
        assert.strictEqual(status.dependencyState, 'no-package-json');
    });

    test('parseEnvKeys handles comments and values', () => {
        const filter = new EventFilter();
        const sensor = new EnvironmentSensor(filter);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'botx-env-test-'));
        const envPath = path.join(tmpDir, '.env.test');
        fs.writeFileSync(envPath, '# comment\nKEY1=value1\nKEY2= value2 \n\nINVALIDLINE\nKEY3=""\n');
        const keys = (sensor as any).parseEnvKeys(envPath) as Set<string>;
        assert.ok(keys.has('KEY1'));
        assert.ok(keys.has('KEY2'));
        assert.ok(keys.has('KEY3'));
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('findMissingDependencies handles missing package.json', () => {
        const filter = new EventFilter();
        const sensor = new EnvironmentSensor(filter);
        const missing = (sensor as any).findMissingDependencies('/tmp', '/tmp/nonexistent/package.json') as string[];
        assert.strictEqual(missing.length, 0);
    });

    test('dispose clears watchers', () => {
        const filter = new EventFilter();
        const sensor = new EnvironmentSensor(filter);
        // no watchers yet, should not throw
        sensor.dispose();
        assert.strictEqual((sensor as any).watchers.length, 0);
    });

    test('publishes ENVIRONMENT_CHECK event', () => {
        const filter = new EventFilter();
        let published: any = null;
        filter.subscribe((e) => { if (e.type === EventType.ENVIRONMENT_CHECK) published = e; });
        const sensor = new EnvironmentSensor(filter);
        (sensor as any).publish({
            workspaceRoot: '/tmp',
            envFileMissing: false,
            missingEnvKeys: ['FOO'],
            hasPackageJson: true,
            dependenciesInstalled: false,
            missingDependencies: ['express'],
            dependencyState: 'missing',
            issues: ['1 missing'],
            clean: false
        });
        assert.ok(published);
        assert.strictEqual(published.payload.missingEnvKeys[0], 'FOO');
    });
});
