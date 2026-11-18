import { parse } from '@solidity-parser/parser';
import type {
  AnalysisContext,
  FindingResult,
  IRulePlugin,
  PluginMetadata,
} from '@veridion/scanner-types';
import { FindingSeverity } from '@veridion/shared';

/**
 * Structural view of parser nodes. Keeping values unknown avoids coupling the
 * traversal to individual parser AST interfaces or using unsafe `any` casts.
 */
interface Node {
  type: string;
  [key: string]: unknown;
}

interface Visit {
  node: Node;
  ancestors: Node[];
}

type Method = 'call' | 'send' | 'delegatecall';
type MatchesValue = (node: Node) => boolean;

const FIXES: Record<Method, string> = {
  call: [
    '(bool success, ) = target.call(data);',
    'require(success, "Call failed");',
  ].join('\n'),
  send: [
    'bool success = payable(recipient).send(amount);',
    'require(success, "Send failed");',
  ].join('\n'),
  delegatecall: [
    '(bool success, ) = target.delegatecall(data);',
    'require(success, "Delegatecall failed");',
  ].join('\n'),
};

const metadata: PluginMetadata = {
  id: 'unchecked-return',
  name: 'Unchecked Return Value Detector',
  version: '1.0.0',
  description:
    'Detects unchecked results from .call(), .send(), and .delegatecall().',
  severity: FindingSeverity.HIGH,
  category: 'UNCHECKED_RETURN',
  chains: [
    'ethereum',
    'polygon',
    'bsc',
    'avalanche',
    'arbitrum',
    'optimism',
  ],
  languages: ['solidity'],
  tags: ['unchecked-return', 'send', 'call', 'delegatecall', 'error-handling'],
  author: 'Veridion',
  references: ['https://swcregistry.io/docs/SWC-104/'],
};

function asNode(value: unknown): Node | undefined {
  if (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string'
  ) {
    return value as Node;
  }

return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function children(node: Node): Node[] {
  const result: Node[] = [];

for (const value of Object.values(node)) {
    const values = Array.isArray(value) ? (value as unknown[]) : [value];

for (const item of values) {
      const child = asNode(item);
      if (child) result.push(child);
    }
  }

return result;
}

function* walk(node: Node, ancestors: Node[] = []): Generator<Visit> {
  yield { node, ancestors };

for (const child of children(node)) {
    yield* walk(child, [...ancestors, node]);
  }
}

function methodOf(node: Node): Method | undefined {
  if (node.type !== 'FunctionCall') return undefined;

let expression = asNode(node.expression);

// Solidity call options: target.call{value: amount, gas: gasLimit}(data).
  if (expression?.type === 'NameValueExpression') {
    expression = asNode(expression.expression);
  }

if (expression?.type !== 'MemberAccess') return undefined;

const method = expression.memberName;
  if (method === 'call' || method === 'send' || method === 'delegatecall') {
    return method;
  }

return undefined;
}

function identifierName(value: unknown): string | undefined {
  const node = asNode(value);
  if (
    node?.type === 'Identifier' &&
    typeof node.name === 'string'
  ) {
    return node.name;
  }

return undefined;
}

/**
 * Recognizes a direct boolean test, negation, or comparison with a boolean.
 * Arbitrary uses, logging, and expressions such as `success || true` do not
 * count as checking the result.
 */
function testsValue(
  value: unknown,
  matches: MatchesValue,
): boolean {
  const node = asNode(value);
  if (!node) return false;

if (matches(node)) return true;

if (node.type === 'UnaryOperation' && node.operator === '!') {
    return testsValue(node.subExpression, matches);
  }

if (
    node.type === 'BinaryOperation' &&
    (node.operator === '==' || node.operator === '!=')
  ) {
    const left = asNode(node.left);
    const right = asNode(node.right);

return (
      (left?.type === 'BooleanLiteral' &&
        testsValue(right, matches)) ||
      (right?.type === 'BooleanLiteral' &&
        testsValue(left, matches))
    );
  }

return false;
}

function handlesValue(node: Node, matches: MatchesValue): boolean {
  if (node.type === 'ExpressionStatement') {
    const expression = asNode(node.expression);

if (expression?.type !== 'FunctionCall') return false;

const callee = identifierName(expression.expression);
    return (
      (callee === 'require' || callee === 'assert') &&
      testsValue(asArray(expression.arguments)[0], matches)
    );
  }

if (node.type === 'IfStatement') {
    return testsValue(node.condition, matches);
  }

// Propagating a result lets the caller decide how to handle failure.
  if (node.type === 'ReturnStatement') {
    const expression = asNode(node.expression);
    return expression !== undefined && matches(expression);
  }

return false;
}

/** Extracts only the success binding, not the returned bytes binding. */
function capturedName(statement: Node, call: Node): string | undefined {
  if (
    statement.type === 'VariableDeclarationStatement' &&
    statement.initialValue === call
  ) {
    const first = asNode(asArray(statement.variables)[0]);
    return typeof first?.name === 'string' ? first.name : undefined;
  }

if (statement.type !== 'ExpressionStatement') return undefined;

const expression = asNode(statement.expression);
  if (
    expression?.type !== 'BinaryOperation' ||
    expression.operator !== '=' ||
    expression.right !== call
  ) {
    return undefined;
  }

const left = asNode(expression.left);
  if (left?.type === 'TupleExpression') {
    return identifierName(asArray(left.components)[0]);
  }

return identifierName(left);
}

function containsIdentifier(node: Node, name: string): boolean {
  return [...walk(node)].some(
    ({ node: current }) => identifierName(current) === name,
  );
}

/**
 * Do not allow a later check of a replacement/shadowed value to suppress a
 * finding. Stop at possible exits instead of assuming a later guard executes.
 */
function invalidatesTracking(statement: Node, name: string): boolean {
  return [...walk(statement)].some(({ node }) => {
    if (
      node.type === 'ReturnStatement' ||
      node.type === 'RevertStatement' ||
      node.type === 'ThrowStatement' ||
      node.type === 'BreakStatement' ||
      node.type === 'ContinueStatement'
    ) {
      return true;
    }

if (
      node.type === 'VariableDeclaration' &&
      node.name === name
    ) {
      return true;
    }

if (
      node.type === 'FunctionCall' &&
      identifierName(node.expression) === 'revert'
    ) {
      return true;
    }

if (
      node.type === 'BinaryOperation' &&
      ['=', '+=', '-=', '*=', '/=', '%=', '|=', '&=', '^=', '<<=', '>>=']
        .includes(String(node.operator))
    ) {
      const left = asNode(node.left);
      return left !== undefined && containsIdentifier(left, name);
    }

if (
      node.type === 'UnaryOperation' &&
      ['++', '--', 'delete'].includes(String(node.operator))
    ) {
      const operand = asNode(node.subExpression);
      return operand !== undefined && containsIdentifier(operand, name);
    }

return false;
  });
}

function isHandled(call: Node, ancestors: Node[]): boolean {
  // Direct handling, e.g. require(recipient.send(amount)), or return the call.
  if (ancestors.some((node) => handlesValue(node, (value) => value === call))) {
    return true;
  }

// Locate the immediate statement in the nearest enclosing block.
  let blockIndex = ancestors.length - 1;
  while (blockIndex >= 0 && ancestors[blockIndex]?.type !== 'Block') {
    blockIndex -= 1;
  }

const block = ancestors[blockIndex];
  const statement = ancestors[blockIndex + 1];
  if (!block || !statement) return false;

const name = capturedName(statement, call);
  if (!name) return false;

const statements = asArray(block.statements);
  const statementIndex = statements.indexOf(statement);
  const matches: MatchesValue = (node) => identifierName(node) === name;

for (const value of statements.slice(statementIndex + 1)) {
    const next = asNode(value);
    if (!next) continue;

if (handlesValue(next, matches)) return true;
    if (invalidatesTracking(next, name)) return false;
  }

return false;
}

export class UncheckedReturnPlugin implements IRulePlugin {
  readonly metadata = metadata;

initialize(_config?: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }

supportsContext(context: AnalysisContext): boolean {
    return (
      this.metadata.chains.includes(context.chain) &&
      this.metadata.languages.includes(context.language)
    );
  }

// eslint-disable-next-line @typescript-eslint/require-await
  async analyze(context: AnalysisContext): Promise<FindingResult[]> {
    if (!this.supportsContext(context) || !context.sourceCode.trim()) return [];

// Strict parsing: malformed Solidity must not silently look like a clean scan.
    const root = parse(context.sourceCode, {
      loc: true,
      range: true,
      tolerant: false,
    }) as unknown as Node;

const findings: FindingResult[] = [];

for (const { node, ancestors } of walk(root)) {
      const method = methodOf(node);
      if (!method || isHandled(node, ancestors)) continue;

// Requested parser options guarantee locations/ranges for call nodes.
      const location = node.loc as {
        start: { line: number };
        end: { line: number };
      };
      const range = node.range as [number, number];

findings.push({
        pluginId: this.metadata.id,
        title: `Unchecked Return Value from address.${method}()`,
        description:
          `The success result from .${method}() is discarded or no supported ` +
          'check is found. Failure returns false rather than automatically ' +
          'reverting the calling contract.',
        severity:
          method === 'delegatecall'
            ? FindingSeverity.CRITICAL
            : FindingSeverity.HIGH,
        filePath: `${context.contractName}.sol`,
        lineStart: location.start.line,
        lineEnd: location.end.line,
        codeSnippet: context.sourceCode
          .slice(range[0], range[1] + 1)
          .slice(0, 200),
        recommendation:
          'Capture and check the success value. Preserve the original ' +
          `receiver, arguments, and any valid call options:\n\n${FIXES[method]}`,
        confidence: 0.85,
        references: [...(this.metadata.references ?? [])],
      });
    }

return findings;
  }

getFixRecommendation(finding: FindingResult): string {
    return [
      `At ${finding.filePath}:${finding.lineStart}:`,
      finding.recommendation,
      'Alternatively, explicitly handle failure according to the contract’s policy.',
      'Checking success does not itself prevent reentrancy.',
    ].join('\n\n');
  }
}
