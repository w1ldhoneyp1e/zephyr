import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

interface ZephyrDiagnostic {
	severity: 'error' | 'warning',
	message: string,
	location: {
		filePath?: string,
		line: number,
		column: number,
	} | null,
}

interface ZephyrCheckResult {
	ok: boolean,
	diagnostics: ZephyrDiagnostic[],
}

interface DiagnosticsResponse extends ZephyrCheckResult {
	id: number | null,
}

interface DiagnosticsServerCommand {
	command: string,
	args: string[],
}

interface PendingRequest {
	uri: vscode.Uri,
}

interface DiagnosticsWorker {
	process: cp.ChildProcessWithoutNullStreams,
	pending: Map<number, PendingRequest>,
	stdoutBuffer: string,
}

const DEBOUNCE_MS = 750

const diagnostics = vscode.languages.createDiagnosticCollection('zephyr')
const timers = new Map<string, NodeJS.Timeout>()
const workers = new Map<string, DiagnosticsWorker>()
const latestRequestIds = new Map<string, number>()
let nextRequestId = 1

function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(diagnostics)
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(scheduleDocumentCheck))
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => scheduleDocumentCheck(event.document)))
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(scheduleDocumentCheck))
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
		clearScheduledCheck(document.uri)
		diagnostics.delete(document.uri)
	}))

	for (const document of vscode.workspace.textDocuments) {
		scheduleDocumentCheck(document)
	}
}

function deactivate(): void {
	for (const timer of timers.values()) {
		clearTimeout(timer)
	}
	for (const worker of workers.values()) {
		worker.process.kill()
	}
	diagnostics.clear()
}

function scheduleDocumentCheck(document: vscode.TextDocument): void {
	if (document.languageId !== 'zephyr' || document.uri.scheme !== 'file') {
		return
	}
	clearScheduledCheck(document.uri)
	const timer = setTimeout(() => checkDocument(document), DEBOUNCE_MS)
	timers.set(document.uri.toString(), timer)
}

function clearScheduledCheck(uri: vscode.Uri): void {
	const key = uri.toString()
	const timer = timers.get(key)
	if (timer !== undefined) {
		clearTimeout(timer)
		timers.delete(key)
	}
	latestRequestIds.delete(key)
}

function checkDocument(document: vscode.TextDocument): void {
	const workspaceRoot = findZephyrWorkspaceRoot(document.uri)
	if (workspaceRoot === null) {
		setDocumentError(document.uri, 'Не найден корень проекта Zephyr для запуска диагностики')
		return
	}

	const worker = getDiagnosticsWorker(workspaceRoot)
	if (worker === null) {
		setDocumentError(document.uri, 'Не удалось запустить diagnostics worker Zephyr')
		return
	}

	const id = nextRequestId++
	const key = document.uri.toString()
	latestRequestIds.set(key, id)
	worker.pending.set(id, {
		uri: document.uri,
	})
	worker.process.stdin.write(`${JSON.stringify({
		id,
		filePath: document.uri.fsPath,
		source: document.getText(),
	})}\n`)
}

function getDiagnosticsWorker(workspaceRoot: string): DiagnosticsWorker | null {
	const existing = workers.get(workspaceRoot)
	if (existing !== undefined) {
		return existing
	}

	const command = createDiagnosticsServerCommand(workspaceRoot)
	const process = cp.spawn(command.command, command.args, {
		cwd: workspaceRoot,
	})
	const worker: DiagnosticsWorker = {
		process,
		pending: new Map(),
		stdoutBuffer: '',
	}
	workers.set(workspaceRoot, worker)

	process.stdout.on('data', chunk => {
		worker.stdoutBuffer += String(chunk)
		consumeWorkerOutput(worker)
	})
	process.stderr.on('data', chunk => {
		const message = cleanProcessOutput(String(chunk))
		if (message.length === 0) {
			return
		}
		for (const pending of worker.pending.values()) {
			setDocumentError(pending.uri, message)
		}
	})
	process.on('error', error => {
		workers.delete(workspaceRoot)
		for (const pending of worker.pending.values()) {
			setDocumentError(pending.uri, error.message)
		}
		worker.pending.clear()
	})
	process.on('close', () => {
		workers.delete(workspaceRoot)
		for (const pending of worker.pending.values()) {
			setDocumentError(pending.uri, 'Diagnostics worker Zephyr завершился')
		}
		worker.pending.clear()
	})

	return worker
}

function consumeWorkerOutput(worker: DiagnosticsWorker): void {
	while (true) {
		const newlineIndex = worker.stdoutBuffer.indexOf('\n')
		if (newlineIndex === -1) {
			return
		}
		const line = worker.stdoutBuffer.slice(0, newlineIndex).trim()
		worker.stdoutBuffer = worker.stdoutBuffer.slice(newlineIndex + 1)
		if (line.length === 0) {
			continue
		}
		const response = parseDiagnosticsResponse(line)
		if (response === null || response.id === null) {
			continue
		}
		const pending = worker.pending.get(response.id)
		if (pending === undefined) {
			continue
		}
		worker.pending.delete(response.id)
		if (latestRequestIds.get(pending.uri.toString()) !== response.id) {
			continue
		}
		applyCheckResult(pending.uri, response)
	}
}

function parseDiagnosticsResponse(line: string): DiagnosticsResponse | null {
	try {
		const result = JSON.parse(line) as DiagnosticsResponse
		return Array.isArray(result.diagnostics)
			? result
			: null
	}
	catch {
		return null
	}
}

function createDiagnosticsServerCommand(workspaceRoot: string): DiagnosticsServerCommand {
	const compiledServer = path.join(workspaceRoot, 'dist', 'zephyr', 'diagnosticsServer.js')
	if (fs.existsSync(compiledServer)) {
		return {
			command: process.execPath,
			args: [
				compiledServer,
			],
		}
	}

	const tsNodeCli = path.join(workspaceRoot, 'node_modules', 'ts-node', 'dist', 'bin.js')
	return {
		command: process.execPath,
		args: [
			tsNodeCli,
			'--project',
			'tsconfig.json',
			'zephyr/diagnosticsServer.ts',
		],
	}
}

function findZephyrWorkspaceRoot(uri: vscode.Uri): string | null {
	const folder = vscode.workspace.getWorkspaceFolder(uri)
	const candidates = [
		folder?.uri.fsPath,
		...(vscode.workspace.workspaceFolders?.map(item => item.uri.fsPath) ?? []),
	].filter((item): item is string => item !== undefined)

	for (const candidate of candidates) {
		if (isZephyrWorkspaceRoot(candidate)) {
			return candidate
		}
	}

	return null
}

function isZephyrWorkspaceRoot(candidate: string): boolean {
	return fs.existsSync(path.join(candidate, 'zephyr', 'main.ts'))
		&& fs.existsSync(path.join(candidate, 'tsconfig.json'))
		&& fs.existsSync(path.join(candidate, 'package.json'))
}

function applyCheckResult(documentUri: vscode.Uri, parsed: ZephyrCheckResult): void {
	const diagnosticsByUri = new Map<string, vscode.Diagnostic[]>()
	for (const diagnostic of parsed.diagnostics) {
		const uri = diagnostic.location?.filePath === undefined
			? documentUri
			: vscode.Uri.file(diagnostic.location.filePath)
		const key = uri.toString()
		const items = diagnosticsByUri.get(key) ?? []
		items.push(toVsCodeDiagnostic(diagnostic, findOpenDocument(uri)))
		diagnosticsByUri.set(key, items)
	}

	diagnostics.clear()
	for (const [key, items] of diagnosticsByUri.entries()) {
		diagnostics.set(vscode.Uri.parse(key), items)
	}
}

function toVsCodeDiagnostic(diagnostic: ZephyrDiagnostic, document: vscode.TextDocument | null): vscode.Diagnostic {
	const range = createDiagnosticRange(diagnostic, document)
	const result = new vscode.Diagnostic(range, diagnostic.message, toVsCodeSeverity(diagnostic.severity))
	result.source = 'zephyr'

	return result
}

function createDiagnosticRange(diagnostic: ZephyrDiagnostic, document: vscode.TextDocument | null): vscode.Range {
	const location = diagnostic.location
	const line = Math.max((location?.line ?? 1) - 1, 0)
	const column = Math.max((location?.column ?? 1) - 1, 0)
	if (document === null || line >= document.lineCount) {
		return new vscode.Range(line, column, line, column + 1)
	}
	const text = document.lineAt(line).text
	const start = Math.min(column, Math.max(text.length - 1, 0))
	const end = findWordEnd(text, start)

	return new vscode.Range(line, start, line, end)
}

function findWordEnd(text: string, start: number): number {
	let end = start
	while (end < text.length && /[A-Za-z0-9_]/.test(text[end] ?? '')) {
		end++
	}

	return end > start
		? end
		: Math.min(start + 1, text.length + 1)
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | null {
	return vscode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString()) ?? null
}

function toVsCodeSeverity(severity: ZephyrDiagnostic['severity']): vscode.DiagnosticSeverity {
	return severity === 'warning'
		? vscode.DiagnosticSeverity.Warning
		: vscode.DiagnosticSeverity.Error
}

function setDocumentError(uri: vscode.Uri, message: string): void {
	const diagnostic = new vscode.Diagnostic(
		new vscode.Range(0, 0, 0, 1),
		message,
		vscode.DiagnosticSeverity.Error,
	)
	diagnostic.source = 'zephyr'
	diagnostics.set(uri, [diagnostic])
}

function cleanProcessOutput(output: string): string {
	return output
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line =>
			line.length > 0
				&& !line.startsWith('yarn run ')
				&& !line.startsWith('$ ')
				&& !line.startsWith('Done in '),
		)
		.join('\n')
}

export {
	activate,
	deactivate,
}
