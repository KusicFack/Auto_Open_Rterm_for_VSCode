const vscode = require("vscode");

let isStarting = false;
let debounceTimer = null;
let restartTimer = null;
let lastStartTime = 0;

function isRFile(editor) {
    if (!editor) return false;

    const fileName = editor.document.fileName.toLowerCase();

    return (
        fileName.endsWith(".r") ||
        fileName.endsWith(".qmd")
    );
}

function isRTerminal(terminal) {
    if (!terminal) return false;

    return (
        terminal.name === "R" ||
        terminal.name === "R Interactive"
    );
}

function getRTerminal() {
    const rTerminals = vscode.window.terminals.filter(isRTerminal);

    if (rTerminals.length === 0) {
        return undefined;
    }

    return rTerminals[rTerminals.length - 1];
}

function hasRTerminal() {
    return getRTerminal() !== undefined;
}

function hideRTerminal() {
    const terminal = getRTerminal();

    if (terminal) {
        terminal.hide();
    }
}

async function ensureRTerminal(editor) {
    if (!isRFile(editor)) return;
    if (hasRTerminal()) return;
    if (isStarting) return;

    isStarting = true;
    lastStartTime = Date.now();

    try {
        await vscode.commands.executeCommand("r.createRTerm");

        // VSCode-R 会主动显示新建的 R terminal。
        // 创建完成后立即隐藏，使其保持后台运行。
        hideRTerminal();

        // 再延迟隐藏一次，避免 VSCode-R / Terminal UI
        // 的异步刷新重新把面板显示出来。
        setTimeout(() => {
            hideRTerminal();
        }, 100);

    } catch (error) {
        console.error("Failed to create R terminal:", error);

        vscode.window.showErrorMessage(
            `Failed to create R terminal: ${error.message ?? error}`
        );
    } finally {
        isStarting = false;
    }
}

function scheduleEnsureRTerminal(editor, delay = 100) {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        ensureRTerminal(editor);
    }, delay);
}

function activate(context) {

    // 打开或切换到 .R / .qmd 时：
    // 如果没有 R terminal，则在后台自动创建。
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            scheduleEnsureRTerminal(editor);
        })
    );

    // R terminal 被关闭时：
    // 如果当前仍然处于 .R / .qmd，则后台重新启动。
    context.subscriptions.push(
        vscode.window.onDidCloseTerminal(terminal => {

            if (!isRTerminal(terminal)) return;

            const editor = vscode.window.activeTextEditor;

            if (!isRFile(editor)) return;

            // 防止 R 本身启动失败并立即退出时形成无限重启循环。
            if (Date.now() - lastStartTime < 2000) {
                return;
            }

            if (restartTimer) {
                clearTimeout(restartTimer);
            }

            restartTimer = setTimeout(() => {
                ensureRTerminal(vscode.window.activeTextEditor);
            }, 250);
        })
    );

    // VS Code 启动时，如果当前就是 .R / .qmd，
    // 自动在后台启动 R。
    scheduleEnsureRTerminal(vscode.window.activeTextEditor);
}

function deactivate() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    if (restartTimer) {
        clearTimeout(restartTimer);
    }
}

module.exports = {
    activate,
    deactivate
};