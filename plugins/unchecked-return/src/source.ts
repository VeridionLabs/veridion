/** Small lexical/statement reader; deliberately not a Solidity type checker. */
export interface Token {
  value: string;
  literal: boolean;
  start: number;
  end: number;
  line: number;
  endLine: number;
}

export type Span = readonly [start: number, end: number];

export interface Statement {
  kind: 'block' | 'if' | 'while' | 'for' | 'do' | 'simple' | 'opaque';
  start: number;
  end: number;
  children?: Statement[];
  condition?: Span;
  initializer?: Span;
  update?: Span;
  body?: Statement;
  otherwise?: Statement;
  parameters?: string[];
}

export interface LowLevelCall {
  id: string;
  method: 'call' | 'send' | 'delegatecall';
  index: number;
  end: number;
}

export class Source {
  readonly tokens: Token[] = [];
  readonly pairs = new Map<number, number>();

  constructor(readonly text: string) {
    // Comments and quoted literals are single tokens so neither can manufacture
    // delimiters, variable names, checks, or calls in the executable stream.
    const pattern =
      /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|[A-Za-z_$][\w$]*|\d[\w.]*|==|!=|&&|\|\||\+=|-=|\*=|\/=|\|=|&=|\^=|\+\+|--|:=|=>|<=|>=|[^\s]/g;
    let line = 1;
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      const endLine = line + (value.match(/\n/g)?.length ?? 0);
      if (!/^\s|^\/\/|^\/\*/.test(value)) {
        this.tokens.push({
          value,
          literal: /^["'\d]/.test(value),
          start: match.index,
          end: match.index + value.length,
          line,
          endLine,
        });
      }
      line = endLine;
    }

    const stack: number[] = [];
    const closing: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    this.tokens.forEach((token, index) => {
      if (token.literal) return;
      if (['(', '[', '{'].includes(token.value)) {
        stack.push(index);
      } else if (closing[token.value]) {
        const open = stack.at(-1);
        if (open !== undefined && this.value(open) === closing[token.value]) {
          stack.pop();
          this.pairs.set(open, index);
          this.pairs.set(index, open);
        }
      }
    });
  }

  value(index: number): string {
    return this.tokens[index]?.value ?? '';
  }

  /** Operators at this level only; nested arguments/options remain intact. */
  topLevel(start: number, end: number, values: readonly string[]): number[] {
    const result: number[] = [];
    for (let index = start; index < end; index++) {
      const token = this.tokens[index];
      if (!token || token.literal) continue;
      if (values.includes(token.value)) result.push(index);
      const close = this.pairs.get(index);
      if (close !== undefined && close > index && close < end) index = close;
    }
    return result;
  }

  unwrap(start: number, end: number): Span {
    while (this.value(start) === '(' && this.pairs.get(start) === end - 1) {
      start++;
      end--;
    }
    return [start, end];
  }

  calls(start: number, end: number): LowLevelCall[] {
    const result: LowLevelCall[] = [];
    for (let index = start; index < end; index++) {
      const method = this.value(index);
      if (
        this.value(index - 1) !== '.' ||
        (method !== 'call' && method !== 'send' && method !== 'delegatecall')
      )
        continue;

      let next = index + 1;
      if (this.value(next) === '{') next = (this.pairs.get(next) ?? next) + 1;
      // Solidity before 0.7 used .call.value(x).gas(y)(data).
      while (
        this.value(next) === '.' &&
        ['value', 'gas'].includes(this.value(next + 1)) &&
        this.value(next + 2) === '(' &&
        this.pairs.has(next + 2)
      )
        next = (this.pairs.get(next + 2) ?? next + 2) + 1;
      if (this.value(next) !== '(') continue;
      const close = this.pairs.get(next);
      result.push({
        id: `call:${index}`,
        method,
        index,
        end: Math.min((close ?? end - 1) + 1, end),
      });
    }
    return result;
  }

  bodies(): Statement[] {
    const bodies: Statement[] = [];
    const covered: Span[] = [];
    for (let index = 0; index < this.tokens.length; index++) {
      if (
        !['function', 'constructor', 'fallback', 'receive', 'modifier'].includes(this.value(index))
      )
        continue;
      for (let next = index + 1; next < this.tokens.length; next++) {
        if (this.value(next) === ';') break;
        if (this.value(next) === '{') {
          const body = this.statement(next, this.tokens.length);
          const parameterOpen = this.tokens.findIndex(
            (token, position) => position > index && position < next && token.value === '(',
          );
          const parameterClose = this.pairs.get(parameterOpen);
          const parameters: string[] = [];
          const parameterLists: Span[] =
            parameterClose === undefined ? [] : [[parameterOpen, parameterClose]];
          for (const returns of this.topLevel(index + 1, next, ['returns'])) {
            const open = returns + 1;
            const close = this.pairs.get(open);
            if (this.value(open) === '(' && close !== undefined) parameterLists.push([open, close]);
          }
          for (const [open, close] of parameterLists) {
            const separators = [open, ...this.topLevel(open + 1, close, [',']), close];
            for (let part = 1; part < separators.length; part++) {
              const left = separators[part - 1] ?? open;
              const right = separators[part] ?? close;
              const name = this.value(right - 1);
              if (
                right - left > 2 &&
                /^[A-Za-z_$][\w$]*$/.test(name) &&
                !['memory', 'calldata', 'storage', 'payable'].includes(name)
              )
                parameters.push(name);
            }
          }
          bodies.push({
            kind: 'block',
            start: index,
            end: body.end,
            parameters,
            children: [{ kind: 'opaque', start: index, end: next }, body],
          });
          covered.push([index, body.end]);
          index = body.end - 1;
          break;
        }
        const close = this.pairs.get(next);
        if (close !== undefined && close > next) next = close;
      }
    }
    // Snippets are useful in the plugin API too. Valid contracts normally take
    // the function-body path above; incomplete input still receives a heuristic.
    if (bodies.length) {
      // Initializers and inheritance arguments execute outside function bodies.
      // Their return values cannot be certified by an unrelated function check.
      for (const call of this.calls(0, this.tokens.length)) {
        if (!covered.some(([start, end]) => call.index >= start && call.index < end)) {
          bodies.push({ kind: 'opaque', start: call.index, end: call.end });
        }
      }
    }
    return bodies.length
      ? bodies
      : [
          {
            kind: 'block',
            start: 0,
            end: this.tokens.length,
            children: this.sequence(0, this.tokens.length),
          },
        ];
  }

  private sequence(start: number, end: number): Statement[] {
    const result: Statement[] = [];
    while (start < end) {
      const statement = this.statement(start, end);
      result.push(statement);
      start = Math.max(start + 1, statement.end);
    }
    return result;
  }

  private statement(start: number, limit: number): Statement {
    const word = this.value(start);
    if (word === '{') {
      const close = this.pairs.get(start);
      const end = close !== undefined ? Math.min(close + 1, limit) : limit;
      return { kind: 'block', start, end, children: this.sequence(start + 1, close ?? limit) };
    }
    if (word === 'unchecked' && this.value(start + 1) === '{') {
      return { ...this.statement(start + 1, limit), start };
    }
    if (['if', 'while', 'for'].includes(word) && this.value(start + 1) === '(') {
      const close = this.pairs.get(start + 1);
      if (close !== undefined && close + 1 < limit) {
        const body = this.statement(close + 1, limit);
        if (word === 'if') {
          const otherwise =
            this.value(body.end) === 'else' ? this.statement(body.end + 1, limit) : undefined;
          return {
            kind: 'if',
            start,
            end: otherwise?.end ?? body.end,
            condition: [start + 2, close],
            body,
            otherwise,
          };
        }
        if (word === 'for') {
          const separators = this.topLevel(start + 2, close, [';']);
          const first = separators[0] ?? close;
          const second = separators[1] ?? close;
          return {
            kind: 'for',
            start,
            end: body.end,
            initializer: [start + 2, first],
            condition: [first + 1, second],
            update: [second + 1, close],
            body,
          };
        }
        return { kind: 'while', start, end: body.end, condition: [start + 2, close], body };
      }
    }
    if (word === 'do') {
      const body = this.statement(start + 1, limit);
      const open = body.end + 1;
      const close = this.pairs.get(open);
      if (this.value(body.end) === 'while' && this.value(open) === '(' && close !== undefined) {
        return {
          kind: 'do',
          start,
          end: close + (this.value(close + 1) === ';' ? 2 : 1),
          condition: [open + 1, close],
          body,
        };
      }
    }
    if (word === 'assembly') {
      let brace = start + 1;
      while (brace < limit && this.value(brace) !== '{') brace++;
      return {
        kind: 'opaque',
        start,
        end: Math.min((this.pairs.get(brace) ?? limit - 1) + 1, limit),
      };
    }
    if (word === 'try') {
      // Catch handlers are conditional. Do not let a require in one catch
      // certify the try path; unsupported constructs stay conservative.
      let cursor = start + 1;
      while (cursor < limit && this.value(cursor) !== '{') {
        const close = this.pairs.get(cursor);
        cursor = close !== undefined && close > cursor ? close + 1 : cursor + 1;
      }
      cursor = Math.min((this.pairs.get(cursor) ?? limit - 1) + 1, limit);
      while (this.value(cursor) === 'catch') {
        cursor++;
        while (cursor < limit && this.value(cursor) !== '{') cursor++;
        cursor = Math.min((this.pairs.get(cursor) ?? limit - 1) + 1, limit);
      }
      return { kind: 'opaque', start, end: cursor };
    }

    let end = start;
    for (; end < limit; end++) {
      if (this.value(end) === ';') return { kind: 'simple', start, end: end + 1 };
      const close = this.pairs.get(end);
      if (close !== undefined && close > end && close < limit) end = close;
    }
    return { kind: 'simple', start, end };
  }
}
