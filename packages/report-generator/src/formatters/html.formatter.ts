import { ReportFormat } from '@veridion/shared';
import type { ReportData, ReportFormatter } from '../report-generator';
import { MarkdownFormatter } from './markdown.formatter';

export class HtmlFormatter implements ReportFormatter {
  readonly format = ReportFormat.HTML;
  private markdown = new MarkdownFormatter();

  generate(data: ReportData): string {
    const markdownContent = this.markdown.generate(data);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Veridion Audit Report - ${this.escape(data.projectName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.6; }
    h1 { color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 0.5rem; }
    h2 { color: #4c1d95; margin-top: 2rem; }
    h3 { color: #5b21b6; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 1rem; border-radius: 8px; overflow-x: auto; }
    code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f3f4f6; }
    .severity-critical { color: #dc2626; font-weight: bold; }
    .severity-high { color: #ea580c; font-weight: bold; }
    .severity-medium { color: #ca8a04; font-weight: bold; }
    .severity-low { color: #16a34a; }
    .severity-gas { color: #2563eb; }
    .finding { border-left: 4px solid #7c3aed; padding-left: 1rem; margin: 1.5rem 0; }
  </style>
</head>
<body>
  <pre style="background:transparent;color:#6b7280;padding:0;">
${this.escape(markdownContent)}
  </pre>
</body>
</html>`;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
