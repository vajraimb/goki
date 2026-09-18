import { substText } from "./parse";

/** Tiny expr for `if`. Numbers compare numerically; `eq`/`ne` are string. */
export function evalExpr(src: string, vars: Map<string, string>): boolean {
  const expanded = substText(src.trim(), vars);
  const tokens = tokenize(expanded);
  let i = 0;

  const peek = () => tokens[i];
  const eat = () => tokens[i++];

  function parseOr(): Value {
    let left = parseAnd();
    while (peek() === "||") {
      eat();
      const right = parseAnd();
      left = { kind: "num", n: truth(left) || truth(right) ? 1 : 0 };
    }
    return left;
  }

  function parseAnd(): Value {
    let left = parseCmp();
    while (peek() === "&&") {
      eat();
      const right = parseCmp();
      left = { kind: "num", n: truth(left) && truth(right) ? 1 : 0 };
    }
    return left;
  }

  function parseCmp(): Value {
    const left = parseUnary();
    const op = peek();
    if (!op || !CMP.has(op)) return left;
    eat();
    const right = parseUnary();
    if (op === "eq" || op === "ne") {
      const ok = str(left) === str(right);
      return { kind: "num", n: (op === "eq" ? ok : !ok) ? 1 : 0 };
    }
    const a = num(left);
    const b = num(right);
    let ok = false;
    if (op === "<") ok = a < b;
    else if (op === ">") ok = a > b;
    else if (op === "<=") ok = a <= b;
    else if (op === ">=") ok = a >= b;
    else if (op === "==" || op === "=") ok = a === b;
    else if (op === "!=") ok = a !== b;
    return { kind: "num", n: ok ? 1 : 0 };
  }

  function parseUnary(): Value {
    if (peek() === "!") {
      eat();
      return { kind: "num", n: truth(parseUnary()) ? 0 : 1 };
    }
    if (peek() === "(") {
      eat();
      const v = parseOr();
      if (eat() !== ")") throw new Error(`bad expr: ${src}`);
      return v;
    }
    const t = eat();
    if (t === undefined) throw new Error(`empty expr: ${src}`);
    if (t === "true") return { kind: "num", n: 1 };
    if (t === "false") return { kind: "num", n: 0 };
    if (/^-?\d+(\.\d+)?$/.test(t)) return { kind: "num", n: Number(t) };
    return { kind: "str", s: t };
  }

  const value = parseOr();
  if (i !== tokens.length) throw new Error(`trailing expr: ${src}`);
  return truth(value);
}

type Value = { kind: "num"; n: number } | { kind: "str"; s: string };

const CMP = new Set(["<", ">", "<=", ">=", "==", "=", "!=", "eq", "ne"]);

function truth(v: Value): boolean {
  if (v.kind === "num") return v.n !== 0;
  return v.s !== "" && v.s !== "0" && v.s !== "false";
}

function num(v: Value): number {
  if (v.kind === "num") return v.n;
  const n = Number(v.s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function str(v: Value): string {
  return v.kind === "str" ? v.s : String(v.n);
}

function tokenize(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "&" && s[i + 1] === "&") {
      out.push("&&");
      i += 2;
      continue;
    }
    if (c === "|" && s[i + 1] === "|") {
      out.push("||");
      i += 2;
      continue;
    }
    if (c === "<" || c === ">" || c === "=" || c === "!") {
      if (s[i + 1] === "=") {
        out.push(c + "=");
        i += 2;
        continue;
      }
      out.push(c);
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      out.push(c);
      i++;
      continue;
    }
    let w = "";
    while (i < s.length && !" \t()<>=!&|".includes(s[i]!)) {
      w += s[i];
      i++;
    }
    if (w) out.push(w);
    else throw new Error(`bad token in expr: ${s}`);
  }
  return out;
}
