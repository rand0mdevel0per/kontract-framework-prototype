export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface CookbookEntry {
  name: string;
  description: string;
  params: ParamInfo[];
  returnType: string;
  meta: Record<string, unknown>;
  sourcePath: string;
}

export interface CookbookOutput {
  entries: CookbookEntry[];
  generatedAt: string;
}

const TRIPLE_SLASH_RE = /^\/\/\/\s?(.*)$/;
const JSDOC_RE = /\/\*\*\s*([\s\S]*?)\s*\*\//;

export function extractDocComment(source: string, fnName: string): string {
  const lines = source.split('\n');
  const fnIndex = lines.findIndex((l) =>
    new RegExp(`\\bfunction\\s+${fnName}\\b`).test(l) ||
    new RegExp(`\\basync\\s+function\\s+${fnName}\\b`).test(l)
  );
  if (fnIndex < 0) return '';

  // Walk backwards from function line to find comments
  const commentLines: string[] = [];
  let i = fnIndex - 1;

  // Skip decorator lines
  while (i >= 0 && /^\s*@/.test(lines[i])) {
    i--;
  }

  // Try triple-slash comments first
  while (i >= 0) {
    const match = lines[i].trim().match(TRIPLE_SLASH_RE);
    if (match) {
      commentLines.unshift(match[1]);
      i--;
    } else {
      break;
    }
  }
  if (commentLines.length > 0) {
    return commentLines.join('\n');
  }

  // Try JSDoc block — only if the line immediately above (after skipping whitespace) ends with */
  const blockEnd = i;
  // Skip blank lines
  while (i >= 0 && lines[i].trim() === '') {
    i--;
  }
  if (i >= 0 && lines[i].trim().endsWith('*/')) {
    // Walk back to find /**
    while (i >= 0 && !lines[i].includes('/**')) {
      i--;
    }
    if (i >= 0 && lines[i].includes('/**')) {
      const block = lines.slice(i, blockEnd + 1).join('\n');
      const match = block.match(JSDOC_RE);
      if (match) {
        return match[1]
          .split('\n')
          .map((l) => l.replace(/^\s*\*\s?/, ''))
          .join('\n')
          .trim();
      }
    }
  }

  return '';
}

const PARAM_RE = /(\w+)(\??):\s*([^,)]+)/g;
const RETURN_RE = /\):\s*(.+?)\s*\{/;

export function extractParamTypes(source: string, fnName: string): ParamInfo[] {
  const lines = source.split('\n');
  const fnLine = lines.find((l) =>
    new RegExp(`\\bfunction\\s+${fnName}\\b`).test(l) ||
    new RegExp(`\\basync\\s+function\\s+${fnName}\\b`).test(l)
  );
  if (!fnLine) return [];

  // Get everything between parentheses
  const openParen = fnLine.indexOf('(');
  const closeParen = fnLine.lastIndexOf(')');
  if (openParen < 0 || closeParen < 0) return [];
  const paramStr = fnLine.slice(openParen + 1, closeParen);
  if (!paramStr.trim()) return [];

  const params: ParamInfo[] = [];
  let m;
  while ((m = PARAM_RE.exec(paramStr)) !== null) {
    params.push({
      name: m[1],
      optional: m[2] === '?',
      type: m[3].trim(),
    });
  }
  return params;
}

export function extractReturnType(source: string, fnName: string): string {
  const lines = source.split('\n');
  const fnLine = lines.find((l) =>
    new RegExp(`\\bfunction\\s+${fnName}\\b`).test(l) ||
    new RegExp(`\\basync\\s+function\\s+${fnName}\\b`).test(l)
  );
  if (!fnLine) return 'void';
  const match = fnLine.match(RETURN_RE);
  return match ? match[1].trim() : 'void';
}

export function generateCookbook(
  sources: { path: string; content: string; routes: Array<{ name: string; meta: Record<string, unknown> }> }[]
): CookbookOutput {
  const entries: CookbookEntry[] = [];
  for (const src of sources) {
    for (const route of src.routes) {
      entries.push({
        name: route.name,
        description: extractDocComment(src.content, route.name),
        params: extractParamTypes(src.content, route.name),
        returnType: extractReturnType(src.content, route.name),
        meta: route.meta,
        sourcePath: src.path,
      });
    }
  }
  return { entries, generatedAt: new Date().toISOString() };
}

function permToString(perm: unknown): string {
  if (typeof perm !== 'number') return String(perm ?? 'none');
  const parts: string[] = [];
  if (perm & 0b100) parts.push('R');
  if (perm & 0b010) parts.push('W');
  if (perm & 0b001) parts.push('X');
  return parts.length ? `${parts.join('')} (0b${perm.toString(2).padStart(3, '0')})` : 'none';
}

export function cookbookToVitepress(cookbook: CookbookOutput): Map<string, string> {
  const pages = new Map<string, string>();

  // Index page
  const indexLines = ['# API Reference', '', `> Auto-generated from source code.`, ''];
  for (const entry of cookbook.entries) {
    const desc = entry.description.split('\n')[0] || '';
    indexLines.push(`- [${entry.name}](./${entry.name}.md) — ${desc}`);
  }
  pages.set('index.md', indexLines.join('\n'));

  // Individual pages
  for (const entry of cookbook.entries) {
    const lines: string[] = [`# ${entry.name}`, ''];
    if (entry.description) {
      lines.push(entry.description, '');
    }
    if (entry.params.length > 0) {
      lines.push('## Parameters', '');
      lines.push('| Name | Type | Required |');
      lines.push('|------|------|----------|');
      for (const p of entry.params) {
        lines.push(`| ${p.name} | \`${p.type}\` | ${p.optional ? 'No' : 'Yes'} |`);
      }
      lines.push('');
    }
    lines.push('## Returns', '', `\`${entry.returnType}\``, '');
    if (Object.keys(entry.meta).length > 0) {
      lines.push('## Metadata', '');
      if (entry.meta.egroup) lines.push(`- **Group**: \`${entry.meta.egroup}\``);
      if (entry.meta.perm != null) lines.push(`- **Permission**: \`${permToString(entry.meta.perm)}\``);
      if (entry.meta.ugroup) lines.push(`- **User Group**: \`${entry.meta.ugroup}\``);
      lines.push('');
    }
    lines.push(`*Source: \`${entry.sourcePath}\`*`);
    pages.set(`${entry.name}.md`, lines.join('\n'));
  }

  return pages;
}
