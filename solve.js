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
// makefun-site's text rules: the HTML escape table, the slug rule and the long date (README-reference.md, "Text").

/** The HTML escape table, in this order: & < > " ' (README.md). */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** `text` with & < > " and ' escaped. */
const HTML_SPECIAL = /[&<>"']/g;

function escapeHtml(text) {
  HTML_SPECIAL.lastIndex = 0;
  if (!HTML_SPECIAL.test(text)) return text;
  let out = '';
  let start = 0;
  do {
    const end = HTML_SPECIAL.lastIndex;
    out += text.slice(start, end - 1) + ESCAPES[text[end - 1]];
    start = end;
  } while (HTML_SPECIAL.test(text));
  return out + text.slice(start);
}

/** The most characters a slug keeps before a collision suffix. */
const SLUG_MAX = 64;

/**
 * The slug of `text`: NFKD, combining marks dropped, A-Z lowered, every run of characters other than a-z and 0-9 one
 * "-", none at either end, at most SLUG_MAX characters (a "-" left at the cut dropped), and "untitled" when nothing is
 * left.
 */
function slugify(text) {
  if (/[^\x00-\x7F]/.test(text)) text = text.normalize('NFKD').replace(/\p{M}/gu, '');
  const slug = text.replace(/[^A-Za-z0-9]+/g, '-');
  const start = slug[0] === '-' ? 1 : 0;
  let end = Math.min(slug.length, start + SLUG_MAX);
  if (slug[end - 1] === '-') end--;
  return slug.slice(start, end).toLowerCase() || 'untitled';
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

/** A YYYY-MM-DD date in words, from the string alone: "2026-11-09" is "9 November 2026". */
function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// makefun-site's front matter (README-reference.md, "Front matter"): a strict subset of YAML's block mappings, its own. A source
// opens on a line "---" and its front matter runs to the next line "---"; every line between is blank, a comment
// ("#" first) or "key: value" with one space after the colon. Seven keys are known, each with its own value grammar,
// and anything else refuses the file with the first reason met, line by line.

/** The keys a source's front matter may give. */
const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

const LINE = /^([a-z_]+):(?: (.*))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME = /^[a-z0-9-]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[^"[\]]+$/;

/** The days of month `m` (1-12) of year `y`, by the Gregorian rule. */
function daysIn(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** A string value: "..." with \" and \\ its only escapes, or bare, the rest of the line (never opening on " or [). */
function stringOf(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: 'a quoted string is not closed' };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: 'a quoted string holds an escape other than \\" or \\\\' };
        out += n;
        i++;
      } else if (c === '"') return { error: 'a quoted string holds a stray quote' };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: 'a bare string opens on [' };
  return { value: raw };
}

/** One key's value, or why it is refused. */
function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary': {
      const s = stringOf(raw);
      return 'error' in s ? { error: `key "${key}": ${s.error}` } : s;
    }
    case 'date': {
      const m = DATE.exec(raw);
      const y = m ? Number(m[1]) : 0;
      const mo = m ? Number(m[2]) : 0;
      const d = m ? Number(m[3]) : 0;
      if (!m || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      if (tags.some((t) => t === '' || !TAG.test(t))) return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return NAME.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return SLUG.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
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
  const lines = text.slice(0, close).split('\n');
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*$/.test(line) || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) return { error: `line ${i + 1} is not "key: value"` };
    const key = m[1];
    let raw = m[2] ?? '';
    const last = raw.charCodeAt(raw.length - 1);
    if (last === 32 || last === 9) raw = raw.replace(TRAILING_SPACE, '');
    if (!KEYS.includes(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
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

function own(value, key) {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
}

function lookup(scope, path) {
  const first = path[0];
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, first)) s = s.parent;
  if (s === null) return undefined;
  let value = s.vars[first];
  for (let i = 1; i < path.length && value !== DYNAMIC; i++) value = own(value, path[i]);
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
function compileTemplate(nodes, templates, globals, fields, escaped, fragments, startDepth = 0) {
  const limit = { remaining: 12000 };
  let nextVar = 0;
  const fixed = [];
  const source = [];
  const pending = [];
  const usedBindings = new Set();
  const roots = new Map(fields.map((key) => [key, 'root.' + key]));

  function expression(path, bindings) {
    let expr = bindings.get(path[0]);
    if (expr === undefined) {
      let value = own(globals, path[0]);
      for (let i = 1; i < path.length; i++) value = own(value, path[i]);
      if (value === undefined) return 'undefined';
      const index = fixed.push(value) - 1;
      return 'fixed[' + index + ']';
    }
    usedBindings.add(expr);
    for (let i = 1; i < path.length; i++) expr = 'own(' + expr + ',' + JSON.stringify(path[i]) + ')';
    return expr;
  }

  let literal = '';
  function flushLiteral() {
    if (literal !== '') {
      pending.push(JSON.stringify(literal));
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
            pending.push(convert + '(' + expression(node.path, bindings) + ')');
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
    const factory = new Function('own', 'textOf', 'escaped', 'truthy', 'loopInfo', 'fixed',
      '"use strict";return function render(root){let out="";\n' + source.join('\n') + '\nreturn out;}');
    return factory(own, textOf, escaped, truthy, loopInfo, fixed);
  } catch (err) {
    if (err !== COMPILE_LIMIT && !(err instanceof RangeError) && !(err instanceof SyntaxError)) throw err;
    const parent = { vars: globals, parent: null };
    return (vars) => renderNodes(nodes, { vars, parent }, templates, startDepth, null);
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
          if (value === null || typeof value !== 'object') return evaluate({ [field]: value });
          let html = rendered.get(value);
          if (html === undefined) {
            html = evaluate({ [field]: value });
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

// Every ECMAScript whitespace or line-terminator code unit.
const WORD_SPACE = new Uint8Array(65536);
for (const ch of ' \t\n\r\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff') {
  WORD_SPACE[ch.charCodeAt(0)] = 1;
}

function readingMinutes(text) {
  let words = 0;
  let separated = 1;
  for (let i = 0; i < text.length; i++) {
    const space = WORD_SPACE[text.charCodeAt(i)];
    words += separated & (space ^ 1);
    separated = space;
  }
  return Math.max(1, Math.ceil(words / 200));
}

/** `rel` (a link's path, "/"-separated) from the directory `dir` of a source, or null when it climbs out of the root. */
function resolvePath(dir, rel) {
  if (!/(?:^|\/)\.{1,2}(?:\/|$)|\/$|\/\//.test(rel)) return dir === '' ? rel : dir + '/' + rel;
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
    const slug = uniqueSlug(data.slug ?? slugify(data.title), names);
    const outDir = outputParent === '' ? slug : outputParent + '/' + slug;
    const source = { path, dir, data, body, post, layout, slug, outDir, url: b.base + '/' + outDir + '/' };
    b.sources.push(source);
    if (post) b.posts.push(source);
    b.bySource.set(path, source);
  }
}

/** Each body's Markdown, with links to built pages and static files resolved. */
function markdown(b) {
  const staticPaths = new Set(b.statics.map((f) => f.path));
  const byDirectory = new Map();
  for (const source of b.sources) {
    const dir = source.dir;
    let targets = byDirectory.get(dir);
    if (targets === undefined) {
      targets = new Map();
      byDirectory.set(dir, targets);
    }
    const link = (target) => {
      if (target[0] === '/' || target[0] === '#') return target;
      let url = targets.get(target);
      if (url === undefined) {
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) {
          url = target;
        } else {
          const hash = target.indexOf('#');
          const rel = hash === -1 ? target : target.slice(0, hash);
          const fragment = hash === -1 ? '' : target.slice(hash);
          const path = resolvePath(dir, rel);
          if (path === null) url = null;
          else {
            const page = b.bySource.get(path);
            if (page !== undefined) url = page.url + fragment;
            else url = staticPaths.has(path) ? b.base + '/' + path + fragment : null;
          }
        }
        targets.set(target, url);
      }
      if (url !== null) return url;
      b.broken.add(`broken-link ${source.path} -> ${target}`);
      return target;
    };
    const md = renderMarkdown(source.body, link);
    source.html = md.html;
    source.toc = md.toc;
    source.excerpt = md.excerpt;
  }
}

/** Sort posts by date and slug, and assign their neighbors. */
function collections(b) {
  const posts = b.posts;
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  posts.forEach((p, k) => {
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === posts.length - 1 ? null : posts[k + 1];
  });
}

/** Group tags by slug, then sort them by post count and slug. */
function tags(b) {
  const bySlug = new Map();
  const slugs = new Map();

  function refsOf(source) {
    const refs = [];
    const seen = new Set();
    for (const name of source.data.tags ?? []) {
      let slug = slugs.get(name);
      if (slug === undefined) {
        slug = slugify(name);
        slugs.set(name, slug);
      }
      if (seen.has(slug)) continue;
      seen.add(slug);
      let tag = bySlug.get(slug);
      if (source.post) {
        if (tag === undefined) {
          tag = { name, slug, url: `${b.base}/tags/${slug}/`, posts: [] };
          bySlug.set(slug, tag);
        }
        tag.posts.push(source);
      }
      refs.push(tag ?? { name, slug, url: '' });
    }
    return refs;
  }

  for (const p of b.posts) p.tagRefs = refsOf(p);
  for (const s of b.sources) if (!s.post) s.tagRefs = refsOf(s);
  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));
}

/** A page's link record as templates read it. */
const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.card.date_long });

/** A tag as templates read it (its posts as cards). */
const tagOf = (t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => p.card) });

/** A post's card, as lists show it. */
function cardOf(s) {
  return {
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: readingMinutes(s.body),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  };
}

/** A page as its layout reads it. */
function pageOf(s) {
  return {
    ...s.card,
    slug: s.slug,
    content: s.html,
    toc: s.toc,
    newer: linkOf(s.newer ?? null),
    older: linkOf(s.older ?? null),
    is_post: s.post,
  };
}

/** Render the layouts and add any static files they leave unshadowed. */
function layouts(b) {
  for (const s of b.sources) s.card = cardOf(s);
  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => p.card);
  const compile = buildRenderers(b.templates, { site, tags: allTags, recent });
  const pageRenderers = new Map();
  for (const source of b.sources) {
    let render = pageRenderers.get(source.layout);
    if (render === undefined) {
      render = compile(source.layout, ['page']);
      pageRenderers.set(source.layout, render);
    }
    b.output[source.outDir + '/index.html'] = render({ page: pageOf(source) });
  }
  const index = compile('index', ['posts', 'pager']);
  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  for (let k = 1; index !== null && k <= pages; k++) {
    const html = index({
      posts: b.posts.slice((k - 1) * per, k * per).map((p) => p.card),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  const tag = b.tags.length === 0 ? null : compile('tag', ['tag']);
  if (tag !== null) {
    for (const t of b.tags) b.output[`tags/${t.slug}/index.html`] = tag({ tag: tagOf(t) });
  }
  const all = compile('tags', []);
  if (all !== null) b.output['tags/index.html'] = all({});
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
const PIPELINE = [readSources, markdown, collections, tags, layouts, report];

/** One site's output tree: path -> text. */
export function run(input) {
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
    broken: new Set(),
    report,
    posts: [],
    tags: [],
    output: {},
  };
  for (const plugin of PIPELINE) plugin(b);
  return b.output;
}

const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;
const TRAILING_SPACE = /[ \t]+$/;
const INLINE_SPECIAL = /[\\`*\[&<>"']/g;
const ESCAPABLE = "\\`*_[]()#+-.!>";

function trimLine(line) {
  const first = line.charCodeAt(0);
  const last = line.charCodeAt(line.length - 1);
  if (first === 32 || first === 9) line = line.replace(/^[ \t]+/, '');
  return last === 32 || last === 9 ? line.replace(TRAILING_SPACE, '') : line;
}

function escapedAt(s, i, from) {
  let j = i;
  while (j > from && s.charCodeAt(j - 1) === 92) j--;
  return ((i - j) & 1) !== 0;
}

function findUnescaped(s, what, from, limit) {
  const last = limit - what.length;
  let i = s.indexOf(what, from);
  while (i !== -1 && i <= last) {
    if (!escapedAt(s, i, from)) return i;
    i = s.indexOf(what, i + 1);
  }
  return -1;
}

function findSingleStar(s, from, limit) {
  let i = s.indexOf('*', from);
  while (i !== -1 && i < limit) {
    if (escapedAt(s, i, from)) i = s.indexOf('*', i + 1);
    else if (i + 1 < limit && s.charCodeAt(i + 1) === 42) i = s.indexOf('*', i + 2);
    else return i;
  }
  return -1;
}

function inline(s, link, start = 0, limit = s.length) {
  let out = '';
  let literal = start;
  let next = start;
  while (next < limit) {
    INLINE_SPECIAL.lastIndex = next;
    if (!INLINE_SPECIAL.test(s)) break;
    const i = INLINE_SPECIAL.lastIndex - 1;
    if (i >= limit) break;
    const mark = s.charCodeAt(i);
    let text;
    let end = i + 1;
    switch (mark) {
      case 92: { // Backslash escape
        const next = s[end];
        if (end < limit && ESCAPABLE.includes(next)) {
          text = next === '>' ? '&gt;' : next;
          end++;
        }
        break;
      }
      case 96: { // Code span
        const close = s.indexOf('`', end);
        if (close > end && close < limit) {
          text = '<code>' + escapeHtml(s.slice(end, close)) + '</code>';
          end = close + 1;
        }
        break;
      }
      case 42: { // Strong or emphasis
        if (end < limit && s.charCodeAt(end) === 42) {
          end++;
          const close = findUnescaped(s, '**', end, limit);
          if (close > end) {
            text = '<strong>' + inline(s, link, end, close) + '</strong>';
            end = close + 2;
          }
        } else {
          const close = findSingleStar(s, end, limit);
          if (close > end) {
            text = '<em>' + inline(s, link, end, close) + '</em>';
            end = close + 1;
          }
        }
        break;
      }
      case 91: { // Link
        const close = findUnescaped(s, ']', end, limit);
        if (close !== -1 && close + 2 < limit && s.charCodeAt(close + 1) === 40) {
          const targetEnd = s.indexOf(')', close + 2);
          if (targetEnd > close + 2 && targetEnd < limit) {
            const target = s.slice(close + 2, targetEnd);
            if (!/\s/.test(target)) {
              text = '<a href="' + escapeHtml(link(target)) + '">' + inline(s, link, end, close) + '</a>';
              end = targetEnd + 1;
            }
          }
        }
        break;
      }
      default:
        text = ESCAPES[s[i]];
    }
    if (text !== undefined) {
      out += s.slice(literal, i) + text;
      literal = end;
    }
    next = end;
  }
  return out + s.slice(literal, limit);
}

function endsParagraph(line) {
  switch (line.charCodeAt(0)) {
    case 32:
    case 9:
      return BLANK.test(line);
    case 96:
      return FENCE_OPEN.test(line);
    case 35: {
      const heading = HEADING.exec(line);
      return heading !== null && heading[2] !== '';
    }
    case 45:
    case 42:
      return HR.test(line);
    default:
      return line === '';
  }
}

function renderMarkdown(src, link) {
  const lines = src.split('\n');
  const ids = new Map();
  const toc = [];
  let html = '';
  let excerpt = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i++];
    const marker = line.charCodeAt(0);
    if (line === '' || ((marker === 32 || marker === 9) && BLANK.test(line))) continue;

    if (marker === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        const start = i;
        while (i < lines.length && !FENCE_CLOSE.test(lines[i])) i++;
        const code = i === start ? '' : escapeHtml(lines.slice(start, i).join('\n')) + '\n';
        const cls = fence[1] === '' ? '' : ' class="language-' + fence[1] + '"';
        html += '<pre><code' + cls + '>' + code + '</code></pre>\n';
        i++;
        continue;
      }
    }

    if (marker === 35) {
      const heading = HEADING.exec(line);
      if (heading !== null && heading[2] !== '') {
        const level = heading[1].length;
        const id = uniqueSlug(slugify(heading[2]), ids);
        const text = inline(heading[2], link);
        html += '<h' + level + ' id="' + id + '">' + text + '</h' + level + '>\n';
        if (level === 2 || level === 3) toc.push({ level, id, html: text });
        continue;
      }
    }

    if ((marker === 45 || marker === 42) && HR.test(line)) {
      html += '<hr>\n';
      continue;
    }

    if (marker === 62) {
      let body = trimLine(line.slice(1));
      while (i < lines.length && lines[i].charCodeAt(0) === 62) {
        const part = trimLine(lines[i++].slice(1));
        if (part !== '') body += body === '' ? part : '\n' + part;
      }
      html += body === '' ? '<blockquote>\n</blockquote>\n' : '<blockquote>\n<p>' + inline(body, link) + '</p>\n</blockquote>\n';
      continue;
    }

    const bullet = (marker === 45 || marker === 42) && BULLET.exec(line);
    const ordered = marker >= 48 && marker <= 57 && ORDERED.exec(line);
    if (bullet || ordered) {
      const start = ordered ? Number(ordered[1]) : 1;
      const pattern = ordered ? ORDERED : BULLET;
      const group = ordered ? 2 : 1;
      html += ordered ? (start === 1 ? '<ol>\n' : '<ol start="' + start + '">\n') : '<ul>\n';
      let item = trimLine((ordered || bullet)[group]);
      while (i < lines.length) {
        const next = pattern.exec(lines[i]);
        if (next !== null) {
          html += '<li>' + inline(item, link) + '</li>\n';
          item = trimLine(next[group]);
        } else if (CONTINUED.test(lines[i])) item += '\n' + trimLine(lines[i]);
        else break;
        i++;
      }
      html += '<li>' + inline(item, link) + '</li>\n' + (ordered ? '</ol>\n' : '</ul>\n');
      continue;
    }

    let body = trimLine(line);
    while (i < lines.length && !endsParagraph(lines[i])) body += '\n' + trimLine(lines[i++]);
    const paragraph = inline(body, link);
    if (excerpt === null) excerpt = paragraph;
    html += '<p>' + paragraph + '</p>\n';
  }

  return { html, toc, excerpt: excerpt ?? '' };
}
