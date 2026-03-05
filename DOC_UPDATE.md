# Documentation Update Plan

## Update Count: 3

## Purpose
This file defines the documentation strategy for the matrix-hello project. It is referenced whenever documentation needs to be created or updated. Each time the documentation update process runs, the **Update Count** above is incremented and a dated entry is added to `docs/CHANGELOG.md`.

## Documentation Structure

All documentation lives in the `docs/` folder for version tracking.

### Files

| File | Audience | Description |
|------|----------|-------------|
| `docs/TABLE_OF_CONTENTS.md` | All | Master index linking to all documentation |
| `docs/TECHNICAL.md` | Developers | Architecture, codebase walkthrough, rendering pipeline, security model |
| `docs/USER_GUIDE.md` | End Users | Interactions, controls, browser requirements |
| `docs/EXECUTIVE_SUMMARY.md` | Leadership | High-level overview, tech stack, deployment status |
| `docs/CHANGELOG.md` | All | Dated log of documentation and project changes |

### Size Strategy
- Individual doc files are kept under 300 lines each
- If any file exceeds 300 lines, split into sub-files (e.g., `TECHNICAL_RENDERING.md`, `TECHNICAL_SECURITY.md`) and update the table of contents
- `TABLE_OF_CONTENTS.md` serves as the entry point and summary document

## Update Process
1. Scan the codebase for changes since last documentation run
2. Update affected documentation files
3. Increment the **Update Count** in this file
4. Add a dated entry to `docs/CHANGELOG.md`
5. Update `CLAUDE.md` and memory files if project structure changed

## Context Loading Strategy
At conversation start, Claude should:
1. Read `DOC_UPDATE.md` (this file) for documentation plan context
2. Read `docs/TABLE_OF_CONTENTS.md` for project structure overview
3. Read specific doc files only as needed for the current task
4. For large files, read the table of contents first, then targeted sections
