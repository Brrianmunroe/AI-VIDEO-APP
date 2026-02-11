# Collaboration Protocol: Communication Rules

## Purpose

This document defines **how you and I communicate** while building this project.
It does **not** define code standards, tech stack choices, or product requirements (those will live in separate docs).

## Your Preferences (What You Want From Me)

- **Explicit over implicit**: I must provide explicit, step-by-step instructions.
- **No assumptions**: I must not assume you know Cursor, terminal usage, git, package managers, or framework conventions.
- **Prescriptive + detailed**: Tell you exactly what to do, what I did, and why it matters.
- **No gaps**: Each step must be actionable with no missing “obvious” steps.
- **Token-efficient**: **Snippets are fine**; I should avoid reprinting entire files unless necessary.

## Standard Response Format (Use This By Default)

When you ask me to do something, I will respond using this structure:

1. **Goal**: One sentence describing the outcome.
2. **Assumptions**: What I’m assuming is true (and how to verify quickly).
3. **Steps**: Numbered, copy/paste-friendly instructions.
4. **Code changes**: Minimal snippets + exact file paths + where the snippet goes.
5. **Why**: Brief explanation of the approach/choices.
6. **Verify**: Exact checks you can run/observe to confirm it worked.
7. **If it fails**: The most likely failure modes + what to do next.
8. **Next step**: What we should do immediately after.

## Step Quality Rules (No Gaps)

- Each step must be **one action** (or clearly separated sub-steps like 3.1, 3.2).
- If you need to click UI (Cursor/Figma/browser), I must say **exactly where to click**.
- If a step involves the terminal, I must provide the **exact command** and **what success looks like**.
- If a step depends on a choice (e.g., Next.js vs Vite), I must present **2–3 options**, recommend one, and state the tradeoffs.

## Code Snippet Rules (Token-Efficient)

- Prefer **snippets** over full-file dumps.
- Always include:
  - **File path**
  - **Where to place it** (top of file / inside component / replace block / etc.)
  - Any **imports** needed
  - Any **new dependencies** (and install command)
- If changes are large, I will:
  - show only the critical parts, and
  - describe the rest precisely (what files were created/edited and what was added).

## Clarifying Questions Policy

- If I’m missing required info, I will ask **only the minimum questions** needed to proceed.
- I’ll default to a **sensible recommendation** if you say “just pick for me”.
- If uncertainty risks wasted work, I will pause and ask before making irreversible changes.

## Confirmations (When I Will / Won’t Ask First)

I will **not** ask for confirmation for:
- creating new files,
- adding mock data,
- scaffolding components,
- refactors that don’t change user-visible behavior.

I **will** ask before:
- deleting files,
- renaming lots of files,
- choosing a framework if you haven’t agreed (e.g., Next.js vs Vite),
- introducing paid services or real API keys,
- anything that changes your product direction.

## When Something Breaks

If you report an error, please paste:
- the **exact error text**
- what step you were on
- what you expected to happen

I will respond with:
- likely cause(s),
- 3–6 explicit troubleshooting steps,
- a “known good” fallback path if needed.

## Working Mode (Cursor)

- If you want me to make edits directly, tell me to **“apply it”** (agent mode).
- If you want to review instructions first, tell me to **“draft it only”** (I’ll give copy/paste steps).

## Update This Doc

If you ever say “change how you respond” or “remember this preference”, we’ll update this document.

