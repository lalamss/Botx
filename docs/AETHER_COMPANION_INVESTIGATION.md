# aether-companion vs robot-body Investigation

## Finding
- `robot-body/` is the **active** Electron companion. It is the only workspace listed in root `package.json` workspaces (`robot-brain`, `robot-body`) and the only target of `npm run start --workspace=robot-body` and `npm run dev`.
- `aether-companion/` is a **duplicate/legacy** copy of `robot-body`. Both contain `main.js`, `preload.js`, `index.html`, `package.json` with near-identical secure code (nodeIntegration:false, contextIsolation:true, sandbox:true, contextBridge narrow API).
- Evidence of duplication: `robot-body/package-lock.json` even has `"name": "aether-companion"`, showing copy origin. `grep -R aether` shows no runtime references to `aether-companion` outside its own folder and node_modules copies. Root `package.json` workspaces do not include it. No import, no require, no script references it.
- Both have same security posture (verified same main.js/preload.js contents).

## Decision
- **Preserve** `robot-body` as canonical.
- **Document** `aether-companion` as legacy duplicate to be removed in next cleanup. Do NOT delete immediately to avoid accidental breakage if any dev has local script referencing it, but it is safe to `rm -rf aether-companion` after confirming no CI references.
- Recommendation: `git rm -rf aether-companion` and add entry to CHANGELOG after manual verification that `robot-body` launches correctly.

## Verification
- Ran `grep -R aether --include=*.json --include=*.js --include=*.ts` on canonical repo — only hits are inside `aether-companion/` itself and compiled artifacts.
- `ls -la` shows both folders exist but `robot-body` has `styles.css` and `assets/` that `aether-companion` lacks, confirming `robot-body` is the maintained one.
