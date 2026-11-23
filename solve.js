/*
MIT License

Copyright (c) 2026 make.fun

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

export { run };

// makefun-site's text rules: the HTML escape table, the slug rule and the long date (README-reference.md, "Text").

/** The HTML escape table, in this order: & < > " ' (README.md). */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** `text` with & < > " and ' escaped. */
const HTML_SPECIAL = /[&<>"']/g;

function escapeEntity(ch) {
  return ESCAPES[ch];
}

function escapeHtml(text) {
  return text.replace(HTML_SPECIAL, escapeEntity);
}

/** The most characters a slug keeps before a collision suffix. */
const SLUG_MAX = 64;

/**
 * The slug of `text`: NFKD, combining marks dropped, A-Z lowered, every run of characters other than a-z and 0-9 one
 * "-", none at either end, at most SLUG_MAX characters (a "-" left at the cut dropped), and "untitled" when nothing is
 * left.
 */
function slugify(text, memo) {
  const cached = memo.get(text);
  if (cached !== undefined) return cached;
  const key = text;
  if (/[^\x00-\x7F]/.test(text)) text = text.normalize('NFKD').replace(/\p{M}/gu, '');
  const slug = text.replace(/[^A-Za-z0-9]+/g, '-');
  const start = slug[0] === '-' ? 1 : 0;
  let end = Math.min(slug.length, start + SLUG_MAX);
  if (slug[end - 1] === '-') end--;
  const result = slug.slice(start, end).toLowerCase() || 'untitled';
  memo.set(key, result);
  return result;
}

/** `slug` made unique against `taken` (and added to it): the first of slug, slug-2, slug-3 ... not taken. */
function uniqueSlug(slug, taken) {
  let suffix = taken.get(slug);
  if (suffix === undefined) {
    taken.set(slug, 2);
    return slug;
  }
  let candidate;
  do candidate = slug + '-' + suffix++;
  while (taken.has(candidate));
  // Earlier suffixes are already occupied and slugs are never removed.
  taken.set(slug, suffix);
  taken.set(candidate, 2);
  return candidate;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function twoDigits(text, offset) {
  return (text.charCodeAt(offset) - 48) * 10 + text.charCodeAt(offset + 1) - 48;
}

/** A YYYY-MM-DD date in words, from the string alone: "2026-11-09" is "9 November 2026". */
function longDate(date) {
  return twoDigits(date, 8) + ' ' + MONTHS[twoDigits(date, 5) - 1] + ' ' + date.slice(0, 4);
}

// makefun-site's front matter (README-reference.md, "Front matter"): a strict subset of YAML's block mappings, its own. A source
// opens on a line "---" and its front matter runs to the next line "---"; every line between is blank, a comment
// ("#" first) or "key: value" with one space after the colon. Seven keys are known, each with its own value grammar,
// and anything else refuses the file with the first reason met, line by line.

const FRONT_KEY = /^[a-z_]+$/;
const FRONT_LINE_BREAK = /[\u2028\u2029]/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_ERROR = 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)';
const TAG = /^[^"[\]]+$/;

/** The days of month `m` (1-12) of year `y`, by the Gregorian rule. */
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** A string value: "..." with \" and \\ its only escapes, or bare, the rest of the line (never opening on " or [). */
function stringOf(raw) {
  if (raw.charCodeAt(0) === 34) {
    const end = raw.length - 1;
    if (end === 0 || raw.charCodeAt(end) !== 34) return { error: 'a quoted string is not closed' };
    if (raw.indexOf('"', 1) === end && !raw.includes('\\')) return raw.slice(1, end);
    let out = '';
    let start = 1;
    for (let i = 1; i < end; i++) {
      const ch = raw.charCodeAt(i);
      if (ch === 92) {
        const next = raw.charCodeAt(i + 1);
        if ((next !== 34 && next !== 92) || i + 1 === end) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += raw.slice(start, i) + raw[++i];
        start = i + 1;
      } else if (ch === 34) return { error: 'a quoted string holds a stray quote' };
    }
    return out + raw.slice(start, end);
  }
  if (raw.charCodeAt(0) === 91) return { error: 'a bare string opens on [' };
  return raw;
}

/** Store a parsed value, or return the reason it is refused. */
function storeValue(data, key, raw) {
  let value = raw;
  switch (key) {
    case 'title':
    case 'summary':
      value = stringOf(raw);
      if (typeof value !== 'string') return `key "${key}": ${value.error}`;
      break;
    case 'date': {
      if (!DATE.test(raw)) return DATE_ERROR;
      const y = twoDigits(raw, 0) * 100 + twoDigits(raw, 2);
      const m = twoDigits(raw, 5);
      const d = twoDigits(raw, 8);
      if (y < 1970 || y > 2099 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return DATE_ERROR;
      break;
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return 'key "tags": not a list [a, b]';
      const inner = raw.slice(1, -1);
      value = inner.trim() === '' ? [] : inner.split(',');
      for (let i = 0; i < value.length; i++) {
        const tag = value[i].trim();
        if (tag === '' || !TAG.test(tag)) return 'key "tags": an empty tag, or one holding " [ or ]';
        value[i] = tag;
      }
      break;
    }
    case 'draft':
      if (raw !== 'true' && raw !== 'false') return 'key "draft": true or false';
      value = raw === 'true';
      break;
    case 'layout':
      if (!NAME.test(raw)) return 'key "layout": not a template name';
      break;
    case 'slug':
      if (raw.length > 64 || !SLUG.test(raw)) return 'key "slug": not a slug';
      break;
  }
  data[key] = value;
}

/**
 * A source's front matter and body: { data, body }, or { error } with the first reason it is refused. `text` has "\n"
 * line ends.
 */
function parseFrontMatter(text) {
  if (text === '---') return { error: 'the front matter is not closed' };
  if (!text.startsWith('---\n')) return { error: 'no front matter' };
  let close = text.indexOf('\n---\n', 3);
  if (close === -1) {
    close = text.length - 4;
    if (close < 3 || !text.endsWith('\n---')) return { error: 'the front matter is not closed' };
  }
  const data = { title: undefined, date: undefined, tags: undefined, draft: undefined, layout: undefined, slug: undefined, summary: undefined };
  let next = 4;
  let line = 1;
  while (next < close) {
    const start = next;
    const end = text.indexOf('\n', start);
    next = end + 1;
    line++;
    const first = text.charCodeAt(start);
    if (first === 35 || start === end || ((first === 32 || first === 9) && trimStart(text, start + 1, end) === end)) continue;
    const colon = text.indexOf(':', start);
    if (colon <= start || colon >= end || (colon + 1 < end && text.charCodeAt(colon + 1) !== 32)) {
      return { error: `line ${line} is not "key: value"` };
    }
    const key = text.slice(start, colon);
    const valueStart = colon + 2;
    const raw = valueStart >= end ? '' : text.slice(valueStart, trimEnd(text, valueStart, end));
    if (FRONT_LINE_BREAK.test(raw)) return { error: `line ${line} is not "key: value"` };
    if (!Object.hasOwn(data, key)) {
      if (!FRONT_KEY.test(key)) return { error: `line ${line} is not "key: value"` };
      return { error: `unknown key "${key}"` };
    }
    if (data[key] !== undefined) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const error = storeValue(data, key, raw);
    if (error !== undefined) return { error };
  }
  if (data.title === undefined) return { error: 'no title' };
  return { data, body: text.slice(close + 5) };
}

// makefun-site's template dialect (README-reference.md, "Templates"): its own, not Liquid, Nunjucks, Mustache or EJS.
//
//   {{ path }}               the value at path, HTML-escaped
//   {{{ path }}}             the value at path, raw
//   {% for x in path %} ... {% endfor %}      each element of an array, x bound to it and loop to
//                                             { index (from 1), first, last, length }
//   {% if path %} ... {% else %} ... {% endif %}   and {% if not path %}; the else is optional
//   {% include "name" %}     the template `name` rendered in the same scope, at most INCLUDE_DEPTH deep
//
// A path is names joined by dots (a-z, A-Z, 0-9 and _, from a letter or _). A {% %} tag alone on its line (only spaces
// or tabs beside it) takes its whole line with it, its newline included. A template is parsed once into a tree of
// nodes, and rendering walks the tree in a chain of scopes.

/** The deepest an include nests: one past it renders nothing. */
const INCLUDE_DEPTH = 8;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

/** A template that does not parse: its name and why. */
class TemplateError extends Error {}

/** The path `text` names, split at its dots, or a TemplateError. */
function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

/** `src`'s tokens: text, {{ }}, {{{ }}} and {% %}, a standalone tag's line taken with it. */
function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

/** `src` parsed into its tree of nodes (a TemplateError when it does not parse). */
function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

const DYNAMIC = Symbol();
const COMPILE_LIMIT = Symbol();
const SOURCE_READING = Symbol();

function own(value, key) {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
}

function readingOf(value) {
  const source = own(value, 'reading_minutes');
  if (source?.[SOURCE_READING] === undefined) return source;
  return source[SOURCE_READING] ||= readingMinutes(source.body);
}

function templateField(value, key) {
  return key === 'reading_minutes' ? readingOf(value) : own(value, key);
}

function lookup(scope, path) {
  const first = path[0];
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, first)) s = s.parent;
  if (s === null) return undefined;
  let value = s.vars[first];
  for (let i = 1; i < path.length && value !== DYNAMIC; i++) value = templateField(value, path[i]);
  return value;
}

function loopInfo(index, length) {
  return { index: index + 1, first: index === 0, last: index === length - 1, length };
}

/** A value as text: a string itself, a number in JavaScript's digits, true or false, an array's items joined by ", ", else "". */
function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

/** Whether a value counts as true in an if: not undefined, null, false, "", 0 or an empty array. */
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

function escapedText(value) {
  switch (typeof value) {
    case 'string': return escapeHtml(value);
    case 'number':
    case 'boolean': return String(value);
    default: return Array.isArray(value) ? escapeHtml(textOf(value)) : '';
  }
}

// Used for constant subtrees during compilation and for templates that exceed
// the compiler's size limit. An unresolved binding stops constant evaluation.
function renderNodes(nodes, scope, templates, depth, limit) {
  let out = '';
  for (const node of nodes) {
    if (limit !== null && --limit.remaining < 0) throw COMPILE_LIMIT;
    switch (node.kind) {
      case 'text':
        out += node.text;
        break;
      case 'var':
      case 'raw': {
        const value = lookup(scope, node.path);
        if (value === DYNAMIC) return DYNAMIC;
        out += node.kind === 'var' ? escapedText(value) : textOf(value);
        break;
      }
      case 'if': {
        const value = lookup(scope, node.path);
        if (value === DYNAMIC) return DYNAMIC;
        const branch = truthy(value) !== node.not ? node.then : node.else;
        if (branch !== null) {
          const text = renderNodes(branch, scope, templates, depth, limit);
          if (text === DYNAMIC) return DYNAMIC;
          out += text;
        }
        break;
      }
      case 'for': {
        const values = lookup(scope, node.path);
        if (values === DYNAMIC) return DYNAMIC;
        if (!Array.isArray(values) || node.body.length === 0) break;
        const length = values.length;
        const inner = { vars: { [node.name]: undefined, loop: null }, parent: scope };
        for (let i = 0; i < length; i++) {
          if (!(i in values)) continue;
          inner.vars[node.name] = values[i];
          inner.vars.loop = loopInfo(i, length);
          const text = renderNodes(node.body, inner, templates, depth, limit);
          if (text === DYNAMIC) return DYNAMIC;
          out += text;
        }
        break;
      }
      case 'include': {
        const included = templates.get(node.name);
        if (depth < INCLUDE_DEPTH && included !== undefined) {
          const text = renderNodes(included, scope, templates, depth + 1, limit);
          if (text === DYNAMIC) return DYNAMIC;
          out += text;
        }
        break;
      }
    }
  }
  return out;
}

// Resolve lexical bindings and visible roots once per layout. Includes share
// those bindings and are expanded up to the dialect's include-depth limit.
const PAGE_FIELDS = new Set([
  'title', 'url', 'date', 'date_long', 'summary', 'excerpt', 'tags',
  'slug', 'content', 'toc', 'newer', 'older', 'is_post',
]);
const SAFE_PAGE_TEXT = new Set(['slug', 'date', 'date_long']);

function compileTemplate(nodes, templates, globals, fields, escaped, fragments, startDepth = 0) {
  const limit = { remaining: 12000 };
  let nextVar = 0;
  const fixed = [];
  const source = [];
  const pending = [];
  const usedBindings = new Set();
  const roots = new Map(fields.map((key, index) => [key, 'root' + index]));

  const pageBinding = startDepth === 0 && fields[0] === 'page' ? roots.get('page') : null;

  function expression(path, bindings) {
    let expr = bindings.get(path[0]);
    if (expr === undefined) {
      let value = own(globals, path[0]);
      for (let i = 1; i < path.length; i++) value = templateField(value, path[i]);
      if (value === undefined) return 'undefined';
      const index = fixed.push(value) - 1;
      return 'fixed[' + index + ']';
    }
    if (expr[0] === 'l' && path.length >= 2) {
      const key = path[1];
      if (path.length > 2) return 'undefined';
      const suffix = expr.slice(1);
      if (key === 'index') return '(i' + suffix + '+1)';
      if (key === 'first') return '(i' + suffix + '===0)';
      if (key === 'last') return '(i' + suffix + '===n' + suffix + '-1)';
      if (key === 'length') return 'n' + suffix;
      return 'undefined';
    }
    usedBindings.add(expr);
    for (let i = 1; i < path.length; i++) {
      const key = path[i];
      if (key === 'reading_minutes') expr = 'readingOf(' + expr + ')';
      else if (i === 1 && expr === pageBinding && PAGE_FIELDS.has(key)) expr += '.' + key;
      else expr = 'own(' + expr + ',' + JSON.stringify(key) + ')';
    }
    return expr;
  }

  let literal = '';
  function flushLiteral() {
    if (literal !== '') {
      if (literal.length > 256) pending.push('fixed[' + (fixed.push(literal) - 1) + ']');
      else pending.push(JSON.stringify(literal));
      literal = '';
    }
  }

  function flush() {
    flushLiteral();
    if (pending.length !== 0) {
      source.push('out+=' + pending.join('+') + ';');
      pending.length = 0;
    }
  }

  function emit(nodes, bindings, scope, depth) {
    for (const node of nodes) {
      if (--limit.remaining < 0) throw COMPILE_LIMIT;
      switch (node.kind) {
        case 'text':
          literal += node.text;
          break;
        case 'include': {
          const included = templates.get(node.name);
          if (depth < INCLUDE_DEPTH && included !== undefined) {
            const text = renderNodes(included, scope, templates, depth + 1, limit);
            if (text !== DYNAMIC) {
              literal += text;
              break;
            }
            const fragment = fragments?.get(included, depth + 1, bindings);
            if (fragment === undefined) emit(included, bindings, scope, depth + 1);
            else {
              flushLiteral();
              usedBindings.add(fragment.argument);
              pending.push('fixed[' + (fixed.push(fragment.render) - 1) + '](' + fragment.argument + ')');
            }
          }
          break;
        }
        case 'var':
        case 'raw': {
          const value = lookup(scope, node.path);
          const convert = node.kind === 'var' ? 'escaped' : 'textOf';
          if (value === DYNAMIC) {
            flushLiteral();
            const expr = expression(node.path, bindings);
            const isPage = bindings.get(node.path[0]) === pageBinding;
            const safe = isPage && node.path.length === 2 && (SAFE_PAGE_TEXT.has(node.path[1]) || (node.kind === 'raw' && node.path[1] === 'content'));
            pending.push(safe ? expr : convert + '(' + expr + ')');
          } else {
            literal += node.kind === 'var' ? escaped(value) : textOf(value);
          }
          break;
        }
        case 'if': {
          const value = lookup(scope, node.path);
          if (value !== DYNAMIC) {
            const branch = truthy(value) !== node.not ? node.then : node.else;
            if (branch !== null) emit(branch, bindings, scope, depth);
            break;
          }
          flush();
          source.push('if(' + (node.not ? '!' : '') + 'truthy(' + expression(node.path, bindings) + ')){');
          emit(node.then, bindings, scope, depth);
          flush();
          if (node.else !== null) {
            source.push('}else{');
            emit(node.else, bindings, scope, depth);
            flush();
          }
          source.push('}');
          break;
        }
        case 'for': {
          const value = lookup(scope, node.path);
          if (node.body.length === 0) break;
          if (value !== DYNAMIC) {
            const text = renderNodes([node], scope, templates, depth, limit);
            if (text !== DYNAMIC) {
              literal += text;
              break;
            }
          }
          flush();
          const suffix = nextVar++;
          const array = 'a' + suffix;
          const index = 'i' + suffix;
          const length = 'n' + suffix;
          const valueVar = 'v' + suffix;
          const loopVar = 'l' + suffix;
          source.push('const ' + array + '=' + expression(node.path, bindings) + ';');
          source.push('if(Array.isArray(' + array + ')){');
          source.push('for(let ' + index + '=0,' + length + '=' + array + '.length;' + index + '<' + length + ';' + index + '++){');
          source.push('if(!(' + index + ' in ' + array + '))continue;');
          const declaration = source.push('') - 1;
          const innerBindings = new Map(bindings);
          innerBindings.set(node.name, valueVar);
          innerBindings.set('loop', loopVar);
          const innerScope = { vars: { [node.name]: DYNAMIC, loop: DYNAMIC }, parent: scope };
          emit(node.body, innerBindings, innerScope, depth);
          flush();
          if (usedBindings.has(valueVar)) source[declaration] += 'const ' + valueVar + '=' + array + '[' + index + '];';
          if (usedBindings.has(loopVar)) source[declaration] += 'const ' + loopVar + '=loopInfo(' + index + ',' + length + ');';
          source.push('}}');
          break;
        }
      }
    }
  }

  try {
    const scope = {
      vars: Object.fromEntries(fields.map((key) => [key, DYNAMIC])),
      parent: { vars: globals, parent: null },
    };
    emit(nodes, roots, scope, startDepth);
    if (source.length === 0 && pending.length === 0) return () => literal;
    flush();
    const factory = new Function('own', 'readingOf', 'textOf', 'escaped', 'truthy', 'loopInfo', 'fixed',
      '"use strict";return function render(' + [...roots.values()].join(',') + '){let out="";\n' + source.join('\n') + '\nreturn out;}');
    return factory(own, readingOf, textOf, escaped, truthy, loopInfo, fixed);
  } catch (err) {
    if (err !== COMPILE_LIMIT && !(err instanceof RangeError) && !(err instanceof SyntaxError)) throw err;
    const parent = { vars: globals, parent: null };
    return (...values) => {
      const vars = Object.fromEntries(fields.map((key, index) => [key, values[index]]));
      return renderNodes(nodes, { vars, parent }, templates, startDepth, null);
    };
  }
}

// A partial that reads one loop element and shared globals can reuse its
// result when that same element appears in other lists in this build.
function fragmentCache(templates, globals, escaped) {
  const dependencies = new Map();
  const renderers = new Map();

  function rootsOf(nodes, depth) {
    let byDepth = dependencies.get(nodes);
    if (byDepth === undefined) dependencies.set(nodes, byDepth = []);
    if (byDepth[depth] !== undefined) return byDepth[depth];

    const roots = new Set();
    for (const node of nodes) {
      if (node.path !== undefined) roots.add(node.path[0]);
      if (node.kind === 'for') {
        for (const root of rootsOf(node.body, depth)) {
          if (root !== node.name && root !== 'loop') roots.add(root);
        }
      } else if (node.kind === 'if') {
        for (const root of rootsOf(node.then, depth)) roots.add(root);
        if (node.else !== null) {
          for (const root of rootsOf(node.else, depth)) roots.add(root);
        }
      } else if (node.kind === 'include' && depth < INCLUDE_DEPTH) {
        const included = templates.get(node.name);
        if (included !== undefined) {
          for (const root of rootsOf(included, depth + 1)) roots.add(root);
        }
      }
    }
    byDepth[depth] = roots;
    return roots;
  }

  return {
    get(nodes, depth, bindings) {
      let field, argument;
      for (const root of rootsOf(nodes, depth)) {
        const binding = bindings.get(root);
        if (binding === undefined) continue;
        if (argument !== undefined || binding[0] !== 'v') return undefined;
        field = root;
        argument = binding;
      }
      if (argument === undefined) return undefined;

      let byScope = renderers.get(nodes);
      if (byScope === undefined) renderers.set(nodes, byScope = new Map());
      const key = depth + ':' + field;
      let render = byScope.get(key);
      if (render === undefined) {
        const evaluate = compileTemplate(nodes, templates, globals, [field], escaped, undefined, depth);
        const rendered = new WeakMap();
        render = (value) => {
          if (value === null || typeof value !== 'object') return evaluate(value);
          let html = rendered.get(value);
          if (html === undefined) {
            html = evaluate(value);
            rendered.set(value, html);
          }
          return html;
        };
        byScope.set(key, render);
      }
      return { render, argument };
    },
  };
}

function buildRenderers(templates, globals) {
  const escapedStrings = new Map();
  function escaped(value) {
    if (typeof value !== 'string' || value.length > 512) return escapedText(value);
    let html = escapedStrings.get(value);
    if (html === undefined) {
      html = escapeHtml(value);
      if (escapedStrings.size < 8192) escapedStrings.set(value, html);
    }
    return html;
  }
  const fragments = fragmentCache(templates, globals, escaped);
  return (name, fields) => {
    const nodes = templates.get(name);
    return nodes === undefined ? null : compileTemplate(nodes, templates, globals, fields, escaped, fragments);
  };
}

// Build the output tree from the supplied site, templates and source files.
/** The report file every build writes. */
const REPORT_FILE = 'build-report.txt';

/** The top-level directories the generator writes itself, which no page's slug at the root may take. */
const RESERVED = Object.freeze(['posts', 'tags', 'page']);

/** Code-unit order (never the locale's). */
const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const FIRST_WORD = /\S/;
// Each match consumes up to 200 whole words and their trailing whitespace.
const WORD_BATCH = /(?:\S+\s*){1,200}/y;

function readingMinutes(text) {
  // Even alternating one-character words and separators fit in one minute.
  if (text.length <= 399) return 1;
  const first = text.search(FIRST_WORD);
  if (first === -1) return 1;
  WORD_BATCH.lastIndex = first;
  let minutes = 0;
  while (WORD_BATCH.test(text)) minutes++;
  return minutes;
}

const PATH_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)|\/$|\/\//;

/** Resolve a source-relative link, returning null for a climb above the root. */
function resolvePath(dir, rel) {
  if (rel.indexOf('/') === -1) {
    if (rel === '.') return dir;
    if (rel === '..') return dir === '' ? null : dirOf(dir);
    return dir === '' ? rel : dir + '/' + rel;
  }
  let start = 0;
  if (!dir.startsWith('/')) {
    while (start < rel.length && rel.charCodeAt(start) === 46) {
      if (rel.startsWith('./', start)) start += 2;
      else if (rel.startsWith('../', start)) {
        if (dir === '') return null;
        dir = dirOf(dir);
        start += 3;
      } else break;
    }
  }
  if (start !== 0) rel = rel.slice(start);
  if (rel === '') return dir;
  if (rel.charCodeAt(0) !== 47 && !PATH_SEGMENT.test(rel)) return dir === '' ? rel : dir + '/' + rel;
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

function dirOf(path) {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

// ---------------------------------------------------------------- the plugins, in order

// Reserve permalinks in source order. Markdown links are resolved once all
// surviving sources and static files have been recorded.
function readSources(b) {
  const taken = new Map([['', new Map(RESERVED.map((slug) => [slug, 2]))]]);
  const files = [...b.input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const file of files) {
    const { path, content } = file;
    if (!path.endsWith('.md')) {
      b.statics.push(file);
      continue;
    }

    const fm = parseFrontMatter(content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content);
    if (fm.error !== undefined) {
      b.report.push(`refused ${path}: ${fm.error}`);
      continue;
    }
    const post = path.startsWith('posts/');
    const own = path.startsWith('tags/') ? 'tags' : path.startsWith('page/') ? 'page' : '';
    if (own !== '') {
      b.report.push(`refused ${path}: ${own}/ is the generator's own`);
      continue;
    }
    const { data, body } = fm;
    if (post && data.date === undefined) {
      b.report.push(`refused ${path}: a post needs a date`);
      continue;
    }
    const layout = data.layout ?? (post ? 'post' : 'page');
    if (!b.templates.has(layout)) {
      b.report.push(`refused ${path}: layout "${layout}" is no template that parses`);
      continue;
    }
    if (data.draft === true) {
      b.report.push(`draft ${path}`);
      continue;
    }

    const dir = dirOf(path);
    const outputParent = post ? 'posts' : dir;
    let names = taken.get(outputParent);
    if (names === undefined) {
      names = new Map();
      taken.set(outputParent, names);
    }
    const slug = uniqueSlug(data.slug ?? slugify(data.title, b.slugs), names);
    const outDir = outputParent === '' ? slug : outputParent + '/' + slug;
    const source = {
      path, dir, data, body, post, layout, slug, outDir, url: b.base + '/' + outDir + '/',
      html: '', toc: null, excerpt: '', newer: null, older: null, tagRefs: null, card: null,
      [SOURCE_READING]: 0,
    };
    b.sources.push(source);
    if (post) b.posts.push(source);
    b.bySource.set(path, source);
  }
}

/** Each body's Markdown, with links to built pages and static files resolved. */
const LINK_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function link(target, state) {
  const { b, dir, staticPaths, targets } = state;
  let opening = targets.get(target);
  if (opening === undefined) {
    let url = target;
    let broken = false;
    const first = target.charCodeAt(0);
    if (first !== 35 && first !== 47 && (target.indexOf(':') === -1 || !LINK_SCHEME.test(target))) {
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const path = resolvePath(dir, rel);
      const page = path === null ? undefined : b.bySource.get(path);
      if (page !== undefined) url = page.url;
      else if (path !== null && staticPaths.has(path)) url = b.base + '/' + path;
      else broken = true;
      if (!broken && hash !== -1) url += target.slice(hash);
    }
    const tag = '<a href="' + escapeHtml(url) + '">';
    // A cached unresolved target still contributes a diagnostic for each source.
    opening = broken ? [tag] : tag;
    targets.set(target, opening);
  }
  if (typeof opening === 'string') return opening;
  b.broken.add(state.brokenPrefix + target);
  return opening[0];
}

function markdown(b) {
  const staticPaths = new Set(b.statics.map((f) => f.path));
  const byDirectory = new Map();
  const state = { b, staticPaths, dir: null, targets: null, brokenPrefix: '' };

  const writer = { html: '', ids: null, toc: null, excerpt: null, inline: inlineRenderer(state), slugs: b.slugs };
  for (const source of b.sources) {
    const dir = source.dir;
    if (dir !== state.dir) {
      state.dir = dir;
      let targets = byDirectory.get(dir);
      if (targets === undefined) {
        targets = new Map();
        byDirectory.set(dir, targets);
      }
      state.targets = targets;
    }
    state.brokenPrefix = 'broken-link ' + source.path + ' -> ';
    renderMarkdown(source, writer);
  }
}

/** Sort posts, assign their neighbors, and collect tags in post order. */
function collections(b) {
  const posts = b.posts;
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  const bySlug = new Map();
  let newer = null;
  for (const post of posts) {
    post.newer = newer;
    if (newer !== null) newer.older = post;
    newer = post;
    const refs = post.tagRefs = [];
    post.card = cardOf(post);
    const names = post.data.tags;
    if (names === undefined) continue;
    for (const name of names) {
      const slug = slugify(name, b.slugs);
      let tag = bySlug.get(slug);
      if (tag === undefined) {
        tag = { ref: { name, slug, url: b.base + '/tags/' + slug + '/' }, posts: [], last: null };
        bySlug.set(slug, tag);
      }
      if (tag.last === post) continue;
      tag.last = post;
      tag.posts.push(post.card);
      refs.push(tag.ref);
    }
  }
  for (const page of b.sources) {
    if (page.post) continue;
    const refs = page.tagRefs = [];
    const names = page.data.tags;
    if (names !== undefined) {
      const seen = new Set();
      for (const name of names) {
        const slug = slugify(name, b.slugs);
        if (seen.has(slug)) continue;
        seen.add(slug);
        refs.push(bySlug.get(slug)?.ref ?? { name, slug, url: '' });
      }
    }
    page.card = cardOf(page);
  }
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.ref.slug, y.ref.slug));
}

/** A page's link record as templates read it. */
function linkOf(s) {
  if (s === null) return null;
  const { title, url, date, date_long } = s.card;
  return { title, url, date, date_long };
}

/** A tag as templates read it (its posts as cards). */
const tagOf = (t) => ({ ...t.ref, count: t.posts.length, posts: t.posts });

/** A post's card, as lists show it. */
function cardOf(s) {
  const { title, date, summary } = s.data;
  return {
    title,
    url: s.url,
    date: date ?? '',
    date_long: date === undefined ? '' : longDate(date),
    summary: summary ?? '',
    excerpt: s.excerpt,
    // Template lookups compute and share this value when a page or card uses it.
    reading_minutes: s,
    tags: s.tagRefs,
  };
}

/** A page as its layout reads it. */
function pageOf(s) {
  const { title, url, date, date_long, summary, excerpt, reading_minutes, tags } = s.card;
  return {
    title, url, date, date_long, summary, excerpt, reading_minutes, tags,
    slug: s.slug,
    content: s.html,
    toc: s.toc,
    newer: linkOf(s.newer),
    older: linkOf(s.older),
    is_post: s.post,
  };
}

/** Render the layouts and add any static files they leave unshadowed. */
function layouts(b) {
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ ...t.ref, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => p.card);
  const compile = buildRenderers(b.templates, { site, tags: allTags, recent });
  const pageRenderers = new Map();
  for (const source of b.sources) {
    let render = pageRenderers.get(source.layout);
    if (render === undefined) {
      render = compile(source.layout, ['page']);
      pageRenderers.set(source.layout, render);
    }
    b.output[source.outDir + '/index.html'] = render(pageOf(source));
  }
  const index = compile('index', ['posts', 'pager']);
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  for (let k = 1; index !== null && k <= pages; k++) {
    const posts = b.posts.slice((k - 1) * per, k * per);
    for (let i = 0; i < posts.length; i++) posts[i] = posts[i].card;
    const pager = { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) };
    const html = index(posts, pager);
    b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  const tag = b.tags.length === 0 ? null : compile('tag', ['tag']);
  if (tag !== null) {
    for (const t of b.tags) b.output[`tags/${t.ref.slug}/index.html`] = tag(tagOf(t));
  }
  const all = compile('tags', []);
  if (all !== null) b.output['tags/index.html'] = all();
  for (const f of b.statics) {
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }
}

/** Write sorted diagnostics followed by the build counts. */
function report(b) {
  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pages = b.sources.length - b.posts.length;
  lines.push(`built ${pages} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = `${lines.join('\n')}\n`;
}

/** Build stages in dependency order. */
const PIPELINE = [readSources, markdown, collections, layouts, report];

/** One site's output tree: path -> text. */
function run(input) {
  const templates = new Map();
  const report = [];
  for (const name of Object.keys(input.templates).sort(byCodeUnits)) {
    try {
      templates.set(name, parseTemplate(name, input.templates[name]));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      report.push(err.message);
    }
  }
  const b = {
    input,
    base: input.site.base_url.replace(/\/+$/, ''),
    templates,
    sources: [],
    statics: [],
    bySource: new Map(),
    slugs: new Map(),
    broken: new Set(),
    report,
    posts: [],
    tags: [],
    output: {},
  };
  for (const plugin of PIPELINE) plugin(b);
  return b.output;
}

const FENCE_OPEN = /```([A-Za-z0-9_+-]*)[ \t]*(?=\n|$)/y;
const HEADING = /(#{1,6})[ \t]+([^ \t\r\n\u2028\u2029][^\r\n\u2028\u2029]*)(?=\n|$)/y;
const HR = /(?:---|\*\*\*)[ \t]*(?=\n|$)/y;
const BULLET = /[-*] [^\r\n\u2028\u2029]*(?=\n|$)/y;
const ORDERED = /\d{1,9}\. [^\r\n\u2028\u2029]*(?=\n|$)/y;
const CONTINUED = / {2,}\S/y;

function escapedAt(s, i, from) {
  let j = i;
  while (j > from && s.charCodeAt(j - 1) === 92) j--;
  return ((i - j) & 1) !== 0;
}

function findUnescaped(s, what, from, limit) {
  const last = limit - what.length;
  let i = s.indexOf(what, from);
  while (i !== -1 && i <= last) {
    if (i === from || s.charCodeAt(i - 1) !== 92 || !escapedAt(s, i, from)) return i;
    i = s.indexOf(what, i + 1);
  }
  return -1;
}

// Each token ends at the first eligible closer, as in the reference grammar.
const INLINE_TOKEN = new RegExp([
  /\\[\\`*_\[\]()#+\-.!>]/.source,
  /`[^`]+`/.source,
  /\*\*(?!\*\*)[^*\\]*(?:(?:\\[\s\S]|\*(?!\*))[^*\\]*)*\*\*/.source,
  /\*\*/.source, // Consume an unmatched pair together.
  /\*(?!\*)[^*\\]*(?:(?:\\[\s\S]|\*\*)[^*\\]*)*\*(?!\*)/.source,
  /\[[^\]\\]*(?:\\[\s\S][^\]\\]*)*\]\([^\s)]+\)/.source,
  /[&<>"']/.source,
].join('|'), 'g');

function inlineRenderer(state) {
  function inline(text) {
    return text.replace(INLINE_TOKEN, token);
  }

  function token(match) {
    // Only the HTML entity branch of INLINE_TOKEN matches one character.
    if (match.length === 1) return ESCAPES[match];
    switch (match.charCodeAt(0)) {
      case 92: return match.charCodeAt(1) === 62 ? '&gt;' : match[1];
      case 96: return '<code>' + escapeHtml(match.slice(1, -1)) + '</code>';
      case 42: {
        if (match.charCodeAt(1) !== 42) return '<em>' + inline(match.slice(1, -1)) + '</em>';
        if (match.length === 2) return match;
        return '<strong>' + inline(match.slice(2, -2)) + '</strong>';
      }
      case 91: {
        const close = findUnescaped(match, ']', 1, match.length);
        return link(match.slice(close + 2, -1), state) + inline(match.slice(1, close)) + '</a>';
      }
      default: return match;
    }
  }
  return inline;
}

function lineEnd(src, start) {
  const end = src.indexOf('\n', start);
  return end === -1 ? src.length : end;
}

function trimStart(src, start, end) {
  while (start < end) {
    const at = start++;
    const ch = src.charCodeAt(at);
    if (ch !== 32 && ch !== 9) return at;
  }
  return end;
}

function trimEnd(src, start, end) {
  while (end > start) {
    const ch = src.charCodeAt(--end);
    if (ch !== 32 && ch !== 9) return end + 1;
  }
  return start;
}

function trimLine(src, start, end) {
  start = trimStart(src, start, end);
  return src.slice(start, trimEnd(src, start, end));
}

function isRule(src, start, end, mark) {
  if (start + 3 > end || src.charCodeAt(start + 1) !== mark || src.charCodeAt(start + 2) !== mark) return false;
  HR.lastIndex = start;
  return HR.test(src);
}

function endsParagraph(src, start, end, marker) {
  switch (marker) {
    case 96:
      if (!src.startsWith('```', start)) return false;
      FENCE_OPEN.lastIndex = start;
      return FENCE_OPEN.test(src);
    case 35:
      HEADING.lastIndex = start;
      return HEADING.test(src);
    case 45:
      return isRule(src, start, end, 45);
    case 42:
      return isRule(src, start, end, 42);
    default:
      return false;
  }
}

function writeFence(src, end, next, lang, writer) {
  const open = lang === '' ? '<pre><code>' : '<pre><code class="language-' + lang + '">';
  writer.html += open;
  if (next <= src.length) {
    let close = end;
    do {
      close = src.indexOf('\n```', close);
      if (close === -1) break;
      const after = lineEnd(src, close + 1);
      if (trimStart(src, close + 4, after) === after) {
        next = after + 1;
        break;
      }
      close = after;
    } while (true);
    if (close === -1) {
      writer.html += escapeHtml(src.slice(next));
      writer.html += '\n';
      next = src.length;
    } else if (close !== end) {
      writer.html += escapeHtml(src.slice(end + 1, close + 1));
    }
  }
  writer.html += '</code></pre>\n';
  return next;
}

function writeList(src, start, end, next, pattern, writer) {
  const length = src.length;
  const ordered = pattern === ORDERED;
  const separator = ordered ? src.indexOf('.', start) : start;
  const number = ordered ? Number(src.slice(start, separator)) : 1;
  writer.html += ordered ? (number === 1 ? '<ol>\n' : '<ol start="' + number + '">\n') : '<ul>\n';
  let item = trimLine(src, separator + 2, end);
  while (next < length) {
    const ch = src.charCodeAt(next);
    const followedBySpace = next + 1 < src.length && src.charCodeAt(next + 1) === 32;
    const otherItem = ordered ? ch >= 48 && ch <= 57 : (ch === 45 || ch === 42) && followedBySpace;
    if (!otherItem && (ch !== 32 || !followedBySpace)) break;
    if (otherItem) {
      pattern.lastIndex = next;
      if (!pattern.test(src)) break;
      writer.html += '<li>' + writer.inline(item) + '</li>\n';
      const separator = ordered ? src.indexOf('.', next) : next;
      item = trimLine(src, separator + 2, pattern.lastIndex);
      next = pattern.lastIndex + 1;
    } else {
      CONTINUED.lastIndex = next;
      if (!CONTINUED.test(src)) break;
      const stop = lineEnd(src, next);
      item += '\n' + trimLine(src, next, stop);
      next = stop + 1;
    }
  }
  writer.html += '<li>' + writer.inline(item) + (ordered ? '</li>\n</ol>\n' : '</li>\n</ul>\n');
  return next;
}

function writeHeading(heading, writer) {
  const raw = heading[2];
  const title = raw.slice(0, trimEnd(raw, 0, raw.length));
  const level = heading[1].length;
  const id = uniqueSlug(slugify(title, writer.slugs), writer.ids ??= new Map());
  const html = writer.inline(title);
  if (level === 2 || level === 3) writer.toc.push({ level, id, html });
  writer.html += '<h' + level + ' id="' + id + '">' + html + '</h' + level + '>\n';
}

function writeQuote(src, start, end, next, writer) {
  let body = trimLine(src, start + 1, end);
  while (next < src.length && src.charCodeAt(next) === 62) {
    const stop = lineEnd(src, next);
    const part = trimLine(src, next + 1, stop);
    if (part !== '') body += body === '' ? part : '\n' + part;
    next = stop + 1;
  }
  if (body === '') writer.html += '<blockquote>\n</blockquote>\n';
  else {
    writer.html += '<blockquote>\n<p>' + writer.inline(body) + '</p>\n</blockquote>\n';
  }
  return next;
}

function writeParagraph(src, leftTrimmed, end, next, writer) {
  const length = src.length;
  // Keep untrimmed paragraph lines together as a single slice.
  let left = leftTrimmed;
  let right = trimEnd(src, left, end);
  let body = '';
  while (next < length) {
    const mark = src.charCodeAt(next);
    if (mark === 10) {
      next++;
      break;
    }
    const stop = lineEnd(src, next);
    let head = next;
    if (mark === 32 || mark === 9) {
      head = trimStart(src, next + 1, stop);
      if (head === stop) {
        next = stop + 1;
        break;
      }
    } else if (endsParagraph(src, next, stop, mark)) break;
    if (right + 1 !== next || head !== next) {
      body += src.slice(left, right) + '\n';
      left = head;
    }
    right = trimEnd(src, head, stop);
    next = stop + 1;
  }
  const html = writer.inline(body + src.slice(left, right));
  if (writer.excerpt === null) writer.excerpt = html;
  writer.html += '<p>' + html + '</p>\n';
  return next;
}

function renderMarkdown(source, writer) {
  const src = source.body;
  const length = src.length;
  writer.html = '';
  writer.toc = [];
  writer.ids = null;
  writer.excerpt = null;
  let next = 0;

  while (next < length) {
    const start = next;
    const marker = src.charCodeAt(start);
    if (marker === 10) {
      next++;
      continue;
    }
    const end = lineEnd(src, start);
    next = end + 1;
    const leftTrimmed = marker === 32 || marker === 9 ? trimStart(src, start + 1, end) : start;
    if (leftTrimmed === end) continue;

    if (marker === 96 && src.startsWith('```', start)) {
      FENCE_OPEN.lastIndex = start;
      const fence = FENCE_OPEN.exec(src);
      if (fence !== null) {
        next = writeFence(src, end, next, fence[1], writer);
        continue;
      }
    }

    if (marker === 35) {
      HEADING.lastIndex = start;
      const heading = HEADING.exec(src);
      if (heading !== null) {
        writeHeading(heading, writer);
        continue;
      }
    }

    if ((marker === 45 || marker === 42) && isRule(src, start, end, marker)) {
      writer.html += '<hr>\n';
      continue;
    }

    if (marker === 62) {
      next = writeQuote(src, start, end, next, writer);
      continue;
    }

    let pattern;
    if ((marker === 45 || marker === 42) && start + 1 < end && src.charCodeAt(start + 1) === 32) pattern = BULLET;
    else if (marker >= 48 && marker <= 57) pattern = ORDERED;
    if (pattern !== undefined) pattern.lastIndex = start;
    if (pattern !== undefined && pattern.test(src)) {
      next = writeList(src, start, end, next, pattern, writer);
      continue;
    }

    next = writeParagraph(src, leftTrimmed, end, next, writer);
  }

  source.html = writer.html;
  source.toc = writer.toc;
  source.excerpt = writer.excerpt ?? '';
}
