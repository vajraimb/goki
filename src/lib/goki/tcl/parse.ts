/** Tiny Tcl subset: words, quotes, nested braces, comments. No [command] subst. */

export type WordKind = "bare" | "quote" | "brace";

export interface TclWord {
  raw: string;
  kind: WordKind;
  line: number;
}

export interface TclCommand {
  words: TclWord[];
  line: number;
}

export class TclParseError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(`line ${line}: ${message}`);
    this.line = line;
    this.name = "TclParseError";
  }
}

export function parseTcl(src: string, startLine = 1): TclCommand[] {
  const n = src.length;
  let i = 0;
  let line = startLine;
  const commands: TclCommand[] = [];
  let words: TclWord[] = [];
  let cmdLine = startLine;

  const pushCmd = () => {
    if (words.length === 0) return;
    commands.push({ words, line: cmdLine });
    words = [];
  };

  const skipSpace = () => {
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\r") i++;
      else break;
    }
  };

  while (i < n) {
    skipSpace();
    if (i >= n) break;
    const c = src[i]!;
    if (c === "\n") {
      pushCmd();
      i++;
      line++;
      cmdLine = line;
      continue;
    }
    if (c === ";") {
      pushCmd();
      i++;
      cmdLine = line;
      continue;
    }
    if (c === "#" && words.length === 0) {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (words.length === 0) cmdLine = line;
    const startLineOfWord = line;
    const word = readWord();
    words.push({ ...word, line: startLineOfWord });
  }
  pushCmd();
  return commands;

  function readWord(): Omit<TclWord, "line"> {
    const c = src[i];
    if (c === "{") return readBrace();
    if (c === '"') return readQuote();
    if (c === "[") throw new TclParseError(line, "command substitution is not in this subset");
    return readBare();
  }

  function readBrace(): Omit<TclWord, "line"> {
    i++; // {
    let depth = 1;
    let raw = "";
    while (i < n) {
      const c = src[i]!;
      if (c === "\n") line++;
      if (c === "\\" && i + 1 < n) {
        raw += c + src[i + 1];
        if (src[i + 1] === "\n") line++;
        i += 2;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return { raw, kind: "brace" };
        }
      }
      raw += c;
      i++;
    }
    throw new TclParseError(line, "unclosed {");
  }

  function readQuote(): Omit<TclWord, "line"> {
    i++; // "
    let raw = "";
    while (i < n) {
      const c = src[i]!;
      if (c === "\n") throw new TclParseError(line, "newline in quotes");
      if (c === "\\") {
        if (i + 1 >= n) throw new TclParseError(line, "dangling backslash");
        const nch = src[i + 1]!;
        if (nch === "n") raw += "\n";
        else if (nch === "t") raw += "\t";
        else raw += nch;
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        return { raw, kind: "quote" };
      }
      raw += c;
      i++;
    }
    throw new TclParseError(line, "unclosed \"");
  }

  function readBare(): Omit<TclWord, "line"> {
    let raw = "";
    while (i < n) {
      const c = src[i]!;
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === ";") break;
      if (c === "{") throw new TclParseError(line, "unexpected { in bare word");
      if (c === "[") throw new TclParseError(line, "command substitution is not in this subset");
      raw += c;
      i++;
    }
    if (!raw) throw new TclParseError(line, "empty word");
    return { raw, kind: "bare" };
  }
}

const VAR = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

export function substWord(word: TclWord, vars: Map<string, string>): string {
  if (word.kind === "brace") return word.raw;
  return word.raw.replace(VAR, (_, braced: string, bare: string) => {
    const key = braced ?? bare;
    return vars.get(key) ?? "";
  });
}

export function substText(text: string, vars: Map<string, string>): string {
  return text.replace(VAR, (_, braced: string, bare: string) => {
    const key = braced ?? bare;
    return vars.get(key) ?? "";
  });
}
