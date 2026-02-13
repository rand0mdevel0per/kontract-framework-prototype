# Installation

## Prerequisites

- Node.js 20+
- npm 9+

## Clone and Install

```bash
git clone https://github.com/rand0mdevel0per/kontract.git
cd kontract
npm install
```

## Verify

```bash
npm run lint       # ESLint checks
npm run typecheck  # TypeScript type verification
npm run test       # Vitest with coverage
```

All tests should pass with coverage thresholds:

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Statements | 90% |
| Branches | 85% |
| Functions | 90% |
