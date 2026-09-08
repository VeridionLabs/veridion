import { type LowLevelCall, Source, type Span, type Statement } from './source';

type BooleanExpression =
  | { kind: 'constant'; value: boolean }
  | { kind: 'atom'; id: string }
  | { kind: 'unknown' }
  | { kind: 'not'; argument: BooleanExpression }
  | { kind: 'and' | 'or' | 'eq' | 'neq'; left: BooleanExpression; right: BooleanExpression };

type Facts = Map<string, boolean>;
type Bindings = Map<string, BooleanExpression>;

interface State {
  pending: Set<string>;
  bindings: Bindings;
  facts: Facts;
  failureExit: Set<string>;
  scopes: Array<Map<string, BooleanExpression | undefined>>;
  exit: 'normal' | 'return' | 'break' | 'continue' | 'revert';
}

const UNKNOWN: BooleanExpression = { kind: 'unknown' };
const MAX_PATHS = 64;
const MAX_LOOP_STATES = 32;

function clone(state: State): State {
  return {
    ...state,
    pending: new Set(state.pending),
    bindings: new Map(state.bindings),
    facts: new Map(state.facts),
    failureExit: new Set(state.failureExit),
    scopes: state.scopes.map((scope) => new Map(scope)),
  };
}

/** Facts needed by both conditions; contradictory conjunctions cannot pass. */
function both(left: Facts | null, right: Facts | null): Facts | null {
  if (!left || !right) return null;
  const result = new Map(left);
  for (const [id, value] of right) {
    if (result.has(id) && result.get(id) !== value) return null;
    result.set(id, value);
  }
  return result;
}

/** Only facts shared by every alternative can certify a successful call. */
function either(left: Facts | null, right: Facts | null): Facts | null {
  if (!left) return right;
  if (!right) return left;
  return new Map([...left].filter(([id, value]) => right.has(id) && right.get(id) === value));
}

function constraints(expression: BooleanExpression, expected: boolean, known: Facts): Facts | null {
  switch (expression.kind) {
    case 'constant':
      return expression.value === expected ? new Map() : null;
    case 'unknown':
      return new Map();
    case 'atom':
      if (known.has(expression.id) && known.get(expression.id) !== expected) return null;
      return new Map([[expression.id, expected]]);
    case 'not':
      return constraints(expression.argument, !expected, known);
    case 'and':
      return expected
        ? both(
            constraints(expression.left, true, known),
            constraints(expression.right, true, known),
          )
        : either(
            constraints(expression.left, false, known),
            constraints(expression.right, false, known),
          );
    case 'or':
      return expected
        ? either(
            constraints(expression.left, true, known),
            constraints(expression.right, true, known),
          )
        : both(
            constraints(expression.left, false, known),
            constraints(expression.right, false, known),
          );
    case 'eq':
    case 'neq': {
      const equal = expression.kind === 'eq' ? expected : !expected;
      return either(
        both(
          constraints(expression.left, true, known),
          constraints(expression.right, equal, known),
        ),
        both(
          constraints(expression.left, false, known),
          constraints(expression.right, !equal, known),
        ),
      );
    }
  }
}

/**
 * Intraprocedural, bounded path analysis. Calls remain pending until a condition
 * proves success, or an explicit failure branch terminates. Unknown syntax never
 * becomes a successful check merely because it mentions a captured variable.
 */
export class ReturnAnalysis {
  readonly source: Source;
  private readonly calls = new Map<string, LowLevelCall>();
  private readonly unchecked = new Set<string>();

  constructor(text: string) {
    this.source = new Source(text);
  }

  run(): LowLevelCall[] {
    for (const body of this.source.bodies()) {
      const initial: State = {
        pending: new Set(),
        bindings: new Map(),
        facts: new Map(),
        failureExit: new Set(),
        scopes: [],
        exit: 'normal',
      };
      for (const state of this.execute(body, [initial])) {
        if (state.exit !== 'revert') this.reportPending(state);
      }
    }
    return [...this.calls.values()]
      .filter((call) => this.unchecked.has(call.id))
      .sort((a, b) => a.index - b.index);
  }

  private reportPending(state: State, within?: Span): void {
    for (const id of state.pending) {
      const call = this.calls.get(id);
      if (call && (!within || (call.index >= within[0] && call.index < within[1])))
        this.unchecked.add(id);
    }
  }

  private registerCalls(start: number, end: number, state: State): LowLevelCall[] {
    const calls = this.source.calls(start, end);
    for (const call of calls) {
      this.calls.set(call.id, call);
      state.pending.add(call.id);
      state.facts.delete(call.id);
      state.failureExit.delete(call.id);
    }
    return calls;
  }

  private expression(span: Span, state: State, includeSkippedOperands = false): BooleanExpression {
    const [start, end] = this.source.unwrap(...span);
    if (start >= end) return UNKNOWN;

    const assignment = this.source.topLevel(start, end, ['=', '+=', '-=', '|=', '&='])[0];
    if (assignment !== undefined) {
      const value = this.expression([assignment + 1, end], state, includeSkippedOperands);
      if (assignment === start + 1 && /^[A-Za-z_$][\w$]*$/.test(this.source.value(start))) {
        const result = this.source.value(assignment) === '=' ? value : UNKNOWN;
        this.assign(this.source.value(start), result, false, state);
        return result;
      }
      this.invalidateWrittenBindings(start, assignment, state);
      return UNKNOWN;
    }

    for (const [operators, kind] of [
      [['||'], 'or'],
      [['&&'], 'and'],
      [['==', '!='], 'eq'],
    ] as const) {
      const operator = this.source.topLevel(start, end, operators).at(-1);
      if (operator === undefined) continue;
      const left = this.expression([start, operator], state, includeSkippedOperands);
      // Avoid finding calls in a demonstrably unevaluated right operand.
      if (
        !includeSkippedOperands &&
        kind === 'or' &&
        constraints(left, false, state.facts) === null
      )
        return left;
      if (
        !includeSkippedOperands &&
        kind === 'and' &&
        constraints(left, true, state.facts) === null
      )
        return left;
      const right = this.expression([operator + 1, end], state, includeSkippedOperands);
      return { kind: this.source.value(operator) === '!=' ? 'neq' : kind, left, right };
    }
    if (this.source.value(start) === '!')
      return {
        kind: 'not',
        argument: this.expression([start + 1, end], state, includeSkippedOperands),
      };
    if (end === start + 1 && !this.source.tokens[start]?.literal) {
      const value = this.source.value(start);
      if (value === 'true' || value === 'false')
        return { kind: 'constant', value: value === 'true' };
      if (/^[A-Za-z_$][\w$]*$/.test(value))
        return state.bindings.get(value) ?? { kind: 'atom', id: `input:${value}` };
    }

    const calls = this.registerCalls(start, end, state);
    this.invalidateWrittenBindings(start, end, state);
    if (
      this.source.tokens
        .slice(start, end)
        .some(
          (token, offset) =>
            !token.literal &&
            /^[A-Za-z_$][\w$]*$/.test(token.value) &&
            this.source.value(start + offset + 1) === '(',
        )
    ) {
      // Unknown helpers and external calls can change storage. Primitive locals
      // and parameters retain their values, but unscoped identifiers must not
      // prune a later branch using a stale storage value.
      for (const name of state.bindings.keys()) {
        const firstDeclaration = state.scopes.find((scope) => scope.has(name));
        if (!firstDeclaration) state.bindings.set(name, UNKNOWN);
        // The earliest declaration can hide a storage value that will become
        // visible again on scope exit. Do not restore it after a helper call.
        else if (firstDeclaration.get(name) !== undefined) {
          firstDeclaration.set(name, UNKNOWN);
          state.facts.delete(`input:${name}`);
        }
      }
      for (const id of state.facts.keys()) {
        if (id.startsWith('input:') && !state.scopes.some((scope) => scope.has(id.slice(6))))
          state.facts.delete(id);
      }
    }
    const outer = calls.find((call) => call.end === end);
    // A member call whose final argument closes at the end of this expression
    // produces the success atom. Calls passed to arbitrary helpers stay unknown.
    if (outer && this.isMemberCallExpression(start, outer.index))
      return { kind: 'atom', id: outer.id };
    return UNKNOWN;
  }

  private isMemberCallExpression(start: number, method: number): boolean {
    // Receiver expressions may contain casts, array indexes and other member
    // access, but a surrounding helper's opening '(' must not swallow the call.
    for (let index = start; index < method; index++) {
      const close = this.source.pairs.get(index);
      if (close !== undefined && close > method) return false;
    }
    return true;
  }

  private assume(state: State, expression: BooleanExpression, expected: boolean): State | null {
    const facts = constraints(expression, expected, state.facts);
    if (!facts) return null;
    const next = clone(state);
    for (const [id, value] of facts) {
      next.facts.set(id, value);
      if (value) next.pending.delete(id);
      else if (next.pending.has(id)) next.failureExit.add(id);
    }
    return next;
  }

  /** Preserve alternatives rather than intersecting away sequential guard facts. */
  private assumptionPaths(state: State, expression: BooleanExpression, expected: boolean): State[] {
    if (expression.kind === 'not')
      return this.assumptionPaths(state, expression.argument, !expected);
    if (expression.kind === 'and' || expression.kind === 'or') {
      const requiredLeft = expression.kind === 'and';
      const continuePaths = this.assumptionPaths(state, expression.left, requiredLeft).flatMap(
        (next) => this.assumptionPaths(next, expression.right, expected),
      );
      return this.limit(
        expected === requiredLeft
          ? continuePaths
          : [...this.assumptionPaths(state, expression.left, !requiredLeft), ...continuePaths],
      );
    }
    if (expression.kind === 'eq' || expression.kind === 'neq') {
      const equal = expression.kind === 'eq' ? expected : !expected;
      return this.limit(
        [true, false].flatMap((left) =>
          this.assumptionPaths(state, expression.left, left).flatMap((next) =>
            this.assumptionPaths(next, expression.right, equal ? left : !left),
          ),
        ),
      );
    }
    const next = this.assume(state, expression, expected);
    return next ? [next] : [];
  }

  /** Evaluate guard operands on the paths where Solidity actually evaluates them. */
  private conditionPaths(span: Span, state: State, expected: boolean): State[] {
    const [start, end] = this.source.unwrap(...span);
    for (const operator of ['||', '&&'] as const) {
      const split = this.source.topLevel(start, end, [operator]).at(-1);
      if (split === undefined) continue;
      const requiredLeft = operator === '&&';
      const continuePaths = this.conditionPaths([start, split], state, requiredLeft).flatMap(
        (next) => this.conditionPaths([split + 1, end], next, expected),
      );
      return this.limit(
        expected === requiredLeft
          ? continuePaths
          : [...this.conditionPaths([start, split], state, !requiredLeft), ...continuePaths],
      );
    }
    const comparison = this.source.topLevel(start, end, ['==', '!=']).at(-1);
    if (comparison !== undefined) {
      const left = this.source.unwrap(start, comparison);
      const right = this.source.unwrap(comparison + 1, end);
      for (const [literal, operand] of [
        [right, left],
        [left, right],
      ] as const) {
        const value = this.source.value(literal[0]);
        if (literal[1] === literal[0] + 1 && ['true', 'false'].includes(value)) {
          const equal = this.source.value(comparison) === '==' ? expected : !expected;
          return this.conditionPaths(operand, state, equal === (value === 'true'));
        }
      }
    }
    if (this.source.value(start) === '!')
      return this.conditionPaths([start + 1, end], state, !expected);
    const next = clone(state);
    return this.assumptionPaths(next, this.expression([start, end], next), expected);
  }

  /** A tautology mentioning a result is not a meaningful failure branch. */
  private isSensitive(expression: BooleanExpression, id: string, known: Facts): boolean {
    const atoms = new Set<string>();
    const collect = (node: BooleanExpression): void => {
      if (node.kind === 'atom') atoms.add(node.id);
      else if (node.kind === 'not') collect(node.argument);
      else if ('left' in node) {
        collect(node.left);
        collect(node.right);
      }
    };
    collect(expression);
    if (!atoms.has(id)) return false;
    const free = [...atoms].filter((atom) => atom !== id && !known.has(atom));
    if (free.length > 8) return false;
    const value = (node: BooleanExpression, values: Facts): boolean | null => {
      if (node.kind === 'constant') return node.value;
      if (node.kind === 'unknown') return null;
      if (node.kind === 'atom') return values.get(node.id) ?? null;
      if (node.kind === 'not') {
        const result = value(node.argument, values);
        return result === null ? null : !result;
      }
      const left = value(node.left, values);
      const right = value(node.right, values);
      if (node.kind === 'and' && (left === false || right === false)) return false;
      if (node.kind === 'or' && (left === true || right === true)) return true;
      if (left === null || right === null) return null;
      if (node.kind === 'and') return left && right;
      if (node.kind === 'or') return left || right;
      return node.kind === 'eq' ? left === right : left !== right;
    };
    for (let bits = 0; bits < 2 ** free.length; bits++) {
      const values = new Map(known);
      free.forEach((atom, index) => values.set(atom, Boolean(bits & (1 << index))));
      values.set(id, false);
      const failed = value(expression, values);
      values.set(id, true);
      const succeeded = value(expression, values);
      if (failed !== null && succeeded !== null && failed !== succeeded) return true;
    }
    return false;
  }

  private assign(name: string, value: BooleanExpression, declaration: boolean, state: State): void {
    const scope = state.scopes.at(-1);
    if (declaration && scope && !scope.has(name)) scope.set(name, state.bindings.get(name));
    state.bindings.set(name, value);
    state.facts.delete(`input:${name}`);
  }

  private invalidateWrittenBindings(start: number, end: number, state: State): void {
    for (let index = start; index < end; index++) {
      if (!['=', '+=', '-=', '|=', '&=', '^='].includes(this.source.value(index))) continue;
      const name = this.source.value(index - 1);
      if (state.bindings.has(name)) this.assign(name, UNKNOWN, false, state);
    }
  }

  private simple(span: Span, state: State): State[] {
    const [start, limit] = span;
    const end = this.source.value(limit - 1) === ';' ? limit - 1 : limit;
    const first = this.source.value(start);
    if (start >= end) return [state];

    if (['require', 'assert'].includes(first) && this.source.value(start + 1) === '(') {
      const close = this.source.pairs.get(start + 1);
      if (close === end - 1) {
        const comma = this.source.topLevel(start + 2, close, [','])[0];
        const paths = this.conditionPaths([start + 2, comma ?? close], state, true);
        for (const next of paths) {
          if (comma !== undefined) this.registerCalls(comma + 1, close, next);
          next.failureExit = new Set(state.failureExit);
        }
        return paths;
      }
    }

    if (['return', 'revert', 'throw', 'break', 'continue'].includes(first)) {
      this.expression([start + 1, end], state);
      if (first === 'revert' || first === 'throw') {
        state.pending.clear();
        state.exit = 'revert';
      } else {
        // An explicit exit from a proven failure branch is handling that
        // failure. An unrelated return/break/continue is not a success check.
        for (const id of state.failureExit) state.pending.delete(id);
        state.exit = first as 'return' | 'break' | 'continue';
      }
      return [state];
    }

    const assignments = this.source.topLevel(start, end, [
      '=',
      '+=',
      '-=',
      '*=',
      '/=',
      '|=',
      '&=',
      '^=',
    ]);
    const assignment = assignments[0];
    if (assignment !== undefined) {
      const rhs = this.expression([assignment + 1, end], state);
      const [leftStart, unwrappedEnd] = this.source.unwrap(start, assignment);
      let leftEnd = unwrappedEnd;
      const comma = this.source.topLevel(leftStart, leftEnd, [','])[0];
      if (comma !== undefined) leftEnd = comma;
      const name = this.source.value(leftEnd - 1);
      const declaration = this.source.value(leftStart) === 'bool';
      const plainName = leftEnd === leftStart + 1;
      if (/^[A-Za-z_$][\w$]*$/.test(name) && (declaration || plainName)) {
        this.assign(
          name,
          this.source.value(assignment) === '=' ? rhs : UNKNOWN,
          declaration,
          state,
        );
      } else {
        // Member/index writes do not overwrite a similarly named local bool.
        this.registerCalls(start, assignment, state);
      }
      return [state];
    }

    if (first === 'bool' && /^[A-Za-z_$][\w$]*$/.test(this.source.value(start + 1))) {
      this.assign(this.source.value(start + 1), { kind: 'constant', value: false }, true, state);
    } else if (first === 'delete') {
      this.assign(this.source.value(start + 1), { kind: 'constant', value: false }, false, state);
    } else {
      this.expression([start, end], state);
    }
    return [state];
  }

  private execute(statement: Statement, input: State[]): State[] {
    const finished = input.filter((state) => state.exit !== 'normal');
    const active = input.filter((state) => state.exit === 'normal');
    const result: State[] = [...finished];
    for (const state of active) {
      switch (statement.kind) {
        case 'block': {
          state.scopes.push(new Map());
          for (const name of statement.parameters ?? [])
            this.assign(name, { kind: 'atom', id: `input:${name}` }, true, state);
          let states = [state];
          for (const child of statement.children ?? [])
            states = this.limit(this.execute(child, states));
          for (const output of states) {
            for (const [name, previous] of output.scopes.pop() ?? []) {
              if (previous) output.bindings.set(name, previous);
              else output.bindings.delete(name);
            }
          }
          result.push(...states);
          break;
        }
        case 'if': {
          const span = statement.condition ?? [statement.start, statement.start];
          const condition = this.expression(span, clone(state), true);
          const previousFailureExit = new Set(state.failureExit);
          for (const [expected, branch] of [
            [true, statement.body],
            [false, statement.otherwise],
          ] as const) {
            const paths = this.conditionPaths(span, state, expected);
            for (const next of paths) {
              for (const id of next.failureExit) {
                if (!previousFailureExit.has(id) && !this.isSensitive(condition, id, state.facts))
                  next.failureExit.delete(id);
              }
            }
            const outputs = branch ? this.execute(branch, paths) : paths;
            for (const output of outputs) {
              // Seeing a failure without handling it is not enough. A guard
              // only licenses explicit exits inside its own branch.
              if (output.exit === 'normal') output.failureExit = new Set(previousFailureExit);
              result.push(output);
            }
          }
          break;
        }
        case 'for':
        case 'while':
        case 'do':
          result.push(...this.loop(statement, state));
          break;
        case 'opaque':
          this.registerCalls(statement.start, statement.end, state);
          state.bindings.clear();
          state.facts.clear();
          result.push(state);
          break;
        case 'simple':
          result.push(...this.simple([statement.start, statement.end], state));
          break;
      }
    }
    return result;
  }

  private loop(statement: Statement, state: State): State[] {
    state.scopes.push(new Map());
    const initialized = statement.initializer ? this.simple(statement.initializer, state) : [state];
    const conditionSpan = statement.condition ?? [statement.start, statement.start];
    const readCondition = (current: State, expected: boolean): State[] =>
      conditionSpan[0] >= conditionSpan[1]
        ? expected
          ? [clone(current)]
          : []
        : this.conditionPaths(conditionSpan, current, expected);
    const outputs: State[] = [];
    const repeatStart =
      statement.kind === 'do' ? (statement.body?.start ?? statement.start) : conditionSpan[0];
    for (const initial of initialized) {
      if (statement.kind !== 'do') {
        for (const skipped of readCondition(initial, false)) {
          skipped.failureExit = new Set(initial.failureExit);
          outputs.push(skipped);
        }
      }
      const queue = statement.kind === 'do' ? [clone(initial)] : readCondition(initial, true);
      const seen = new Set<string>();
      const widened = new Set<string>();
      let iterations = 0;
      while (queue.length && iterations < MAX_LOOP_STATES && statement.body) {
        const entering = queue.shift();
        if (!entering) break;
        entering.failureExit = new Set(initial.failureExit);
        const signature = JSON.stringify([
          [...entering.bindings].sort(([a], [b]) => a.localeCompare(b)),
          [...entering.facts].sort(([a], [b]) => a.localeCompare(b)),
          [...entering.pending].sort(),
        ]);
        if (seen.has(signature)) continue;
        seen.add(signature);
        iterations++;
        const before = new Map(entering.bindings);
        for (const after of this.execute(statement.body, [entering])) {
          if (after.exit === 'return' || after.exit === 'revert') {
            outputs.push(after);
            continue;
          }
          if (after.exit === 'break') {
            after.exit = 'normal';
            outputs.push(after);
            continue;
          }
          after.exit = 'normal';
          const updatedStates = statement.update ? this.simple(statement.update, after) : [after];
          for (const updated of updatedStates) {
            for (const exiting of readCondition(updated, false)) {
              exiting.failureExit = new Set(initial.failureExit);
              outputs.push(exiting);
            }
            for (const repeating of readCondition(updated, true)) {
              this.reportPending(repeating, [repeatStart, statement.end]);
              // Widen changed loop-carried bindings before revisiting the body.
              // Scope restoration keeps shadowed locals from widening an outer
              // variable that was never actually changed.
              for (const [name, value] of repeating.bindings) {
                if (JSON.stringify(value) !== JSON.stringify(before.get(name))) widened.add(name);
                if (widened.has(name)) {
                  repeating.bindings.set(name, UNKNOWN);
                  repeating.facts.delete(`input:${name}`);
                }
              }
              queue.push(repeating);
            }
          }
        }
      }
      if (queue.length) {
        // Exhaustion must not hide a call that first executes in a later
        // iteration. Report the repeated region conservatively at the cap.
        for (const call of this.source.calls(repeatStart, statement.end)) {
          this.calls.set(call.id, call);
          this.unchecked.add(call.id);
        }
        const continuation = queue[0];
        if (continuation) outputs.push(continuation);
      }
    }
    return this.leaveScope(this.limit(outputs));
  }

  private leaveScope(states: State[]): State[] {
    for (const state of states) {
      for (const [name, previous] of state.scopes.pop() ?? []) {
        if (previous) state.bindings.set(name, previous);
        else state.bindings.delete(name);
      }
    }
    return states;
  }

  private limit(states: State[]): State[] {
    if (states.length <= MAX_PATHS) return states;
    // Keep analysis bounded on branch-heavy inputs. Losing path detail must
    // produce warnings, not allow a call to be certified by an unrelated path.
    const active = states.filter((state) => state.exit === 'normal');
    const finished = states.filter((state) => state.exit !== 'normal');
    for (const state of states) if (state.exit !== 'revert') this.reportPending(state);
    const first = active[0];
    if (!first) return finished.slice(0, MAX_PATHS);
    const merged = clone(first);
    merged.pending = new Set(active.flatMap((state) => [...state.pending]));
    merged.bindings.clear();
    merged.facts.clear();
    merged.failureExit.clear();
    return [...finished.slice(0, MAX_PATHS - 1), merged];
  }
}
