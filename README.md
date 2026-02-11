# AI Video Editing - Desktop App

An Electron + React desktop application for AI-powered interview selects.

## Getting Started

### Prerequisites

- **Node.js** (version 18 or higher). Check: `node --version`
- **Transcription (optional):** To transcribe clips on the Timeline, you need **FFmpeg** and **Whisper**. See [docs/SETUP_TRANSCRIPTION.md](docs/SETUP_TRANSCRIPTION.md) for step-by-step setup.

Check if you have Node.js:

```bash
node --version
```

If you don't have Node.js, download it from [nodejs.org](https://nodejs.org/).

### Installation

1. Install all the dependencies (this downloads all the tools and libraries we need):

```bash
npm install
```

This will create a `node_modules` folder with all the dependencies. It might take a minute or two.

### Running the App

**Development mode** (with hot reload - changes appear instantly):

```bash
npm run electron:dev
```

This starts two things:
- Vite dev server (serves your React app)
- Electron window (the desktop app)

**Just the web preview** (without Electron window):

```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

### Building for Production

```bash
npm run build:electron
```

This creates a distributable app in the `dist` folder.

## Project Structure

```
├── electron/          # Desktop app wrapper (Electron)
│   ├── main.js       # Controls the window
│   └── preload.js    # Bridge between Electron and React
├── src/              # Your React app code
│   ├── components/   # Reusable UI components
│   ├── styles/       # CSS files
│   ├── utils/        # Helper functions
│   ├── App.jsx       # Main app component
│   └── index.jsx     # Entry point
├── public/           # Static files (HTML, icons)
├── design-system.json # Your design tokens
└── package.json      # Project config and dependencies
```

## Design System

Your design tokens are in `design-system.json`. They're automatically converted to CSS variables in `src/styles/tokens.css`.

To use a color in your components:

```css
.my-component {
  background-color: var(--color-blue-500);
  padding: var(--spacing-md);
  font-family: var(--font-family-body);
}
```

## Next Steps

1. Share your mockups
2. We'll build components screen by screen
3. Each component will use your design system automatically
