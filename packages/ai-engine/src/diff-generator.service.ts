import { exec } from 'child_process';
import { logger } from '@veridion/logger';
import type { AiDiffRequest, AiDiffResponse } from '@veridion/shared';
import type { AiProviderExtended } from './ai.service';

export interface CompileCheckResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  output: string;
}

export class DiffGeneratorService {
  constructor(private readonly aiProvider: AiProviderExtended) {}

  async generateVerifiedDiff(request: AiDiffRequest): Promise<AiDiffResponse> {
    logger.info(
      { filePath: request.filePath, language: request.language },
      'Generating verified diff',
    );

    // Generate initial diff using AI
    const diffResponse = await this.generateAiDiff(request);

    // If compilation check is required for this language, run sandbox check
    if (diffResponse.compilationCheckRequired) {
      logger.info(
        { filePath: request.filePath, language: request.language },
        'Running sandbox compilation check',
      );

      const compileResult = await this.runSandboxCompileCheck(
        request.fixedCode,
        request.language,
      );

      if (!compileResult.success) {
        logger.warn(
          {
            filePath: request.filePath,
            errors: compileResult.errors,
          },
          'Compilation check failed, requesting revised diff',
        );

        // Request revised diff from AI with compilation errors
        return this.generateRevisedDiff(request, compileResult.errors);
      }

      logger.info(
        { filePath: request.filePath },
        'Compilation check passed',
      );
    }

    return diffResponse;
  }

  private async generateAiDiff(request: AiDiffRequest): Promise<AiDiffResponse> {
    const prompt = `Generate a valid git diff patch for the following code change in ${request.language}:

**File Path:** ${request.filePath}

**Original Code:**
\`\`\`${request.language}
${request.originalCode}
\`\`\`

**Fixed Code:**
\`\`\`${request.language}
${request.fixedCode}
\`\`\`

Generate a proper unified diff format that can be applied with \`git apply\`. The diff should:
- Use proper unified diff format with headers
- Include line numbers and context
- Be syntactically correct for git apply
- Show exactly what changed between original and fixed

Output ONLY valid JSON (no markdown fences) with these exact fields:
- gitDiff: The unified diff string in proper git format
- explanation: A clear explanation of what changed and why
- affectedLines: An array of line numbers that were modified
- compilationCheckRequired: Boolean - true if this language requires compilation (rust, solidity, etc.), false for interpreted languages`;

    try {
      // Use the AI provider's chat method to generate the diff
      const response = await this.aiProvider.chat([
        {
          role: 'system',
          content: 'You are a senior developer expert in git diff generation and patch creation. You produce syntactically correct unified diffs that can be applied with git apply.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      // Parse the JSON response
      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1]?.trim() : response.content.trim();

      if (!jsonString) {
        throw new Error('No valid JSON response found');
      }

      const result = JSON.parse(jsonString) as AiDiffResponse;

      // Determine if compilation check is required
      if (!result.compilationCheckRequired) {
        result.compilationCheckRequired = this.requiresCompilation(request.language);
      }

      return result;
    } catch (error) {
      logger.error({ error, filePath: request.filePath }, 'Failed to generate AI diff');
      throw new Error(`Failed to generate diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async generateRevisedDiff(
    request: AiDiffRequest,
    compilationErrors: string[],
  ): Promise<AiDiffResponse> {
    const prompt = `The previous diff failed compilation. Generate a revised diff that fixes these compilation errors:

**File Path:** ${request.filePath}
**Language:** ${request.language}

**Original Code:**
\`\`\`${request.language}
${request.originalCode}
\`\`\`

**Fixed Code:**
\`\`\`${request.language}
${request.fixedCode}
\`\`\`

**Compilation Errors:**
${compilationErrors.join('\n')}

Revise the fixed code to address these compilation errors, then generate a new unified diff. Focus on:
- Fixing syntax errors
- Resolving type mismatches
- Ensuring all imports and dependencies are correct
- Maintaining the security fix while making it compile

Output ONLY valid JSON (no markdown fences) with these exact fields:
- gitDiff: The revised unified diff string
- explanation: Explanation of what was changed to fix compilation
- affectedLines: Array of modified line numbers
- compilationCheckRequired: true`;

    try {
      const response = await this.aiProvider.chat([
        {
          role: 'system',
          content: 'You are a senior developer expert in fixing compilation errors and generating valid git diffs.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1]?.trim() : response.content.trim();

      if (!jsonString) {
        throw new Error('No valid JSON response found');
      }

      return JSON.parse(jsonString) as AiDiffResponse;
    } catch (error) {
      logger.error({ error, filePath: request.filePath }, 'Failed to generate revised diff');
      throw new Error(`Failed to generate revised diff: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async runSandboxCompileCheck(code: string, language: string): Promise<CompileCheckResult> {
    const tempDir = `temp_compile_${Date.now()}`;
    const fileName = this.getFileNameForLanguage(language);

    try {
      // Create temporary directory and file
      await this.createTempFile(tempDir, fileName, code);

      // Run language-specific compile check
      const command = this.getCompileCommand(language, tempDir, fileName);
      const result = await this.executeCommand(command);

      return {
        success: result.exitCode === 0,
        errors: this.parseErrors(result.stderr, language),
        warnings: this.parseWarnings(result.stdout, language),
        output: result.stdout + result.stderr,
      };
    } catch (error) {
      logger.error({ error, language }, 'Sandbox compile check failed');
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown compile error'],
        warnings: [],
        output: '',
      };
    } finally {
      // Cleanup temp directory
      await this.cleanupTempDir(tempDir);
    }
  }

  private requiresCompilation(language: string): boolean {
    const compiledLanguages = ['rust', 'solidity', 'c++', 'cpp', 'c', 'go', 'java'];
    return compiledLanguages.includes(language.toLowerCase());
  }

  private getFileNameForLanguage(language: string): string {
    const extensions: Record<string, string> = {
      rust: 'lib.rs',
      solidity: 'Contract.sol',
      'c++': 'main.cpp',
      cpp: 'main.cpp',
      c: 'main.c',
      go: 'main.go',
      java: 'Main.java',
    };
    return extensions[language.toLowerCase()] || 'main.txt';
  }

  private getCompileCommand(language: string, tempDir: string, fileName: string): string {
    const commands: Record<string, string> = {
      rust: `cd ${tempDir} && cargo check --message-format short 2>&1`,
      solidity: `cd ${tempDir} && npx solc ${fileName} 2>&1`,
      'c++': `cd ${tempDir} && g++ -fsyntax-only ${fileName} 2>&1`,
      cpp: `cd ${tempDir} && g++ -fsyntax-only ${fileName} 2>&1`,
      c: `cd ${tempDir} && gcc -fsyntax-only ${fileName} 2>&1`,
      go: `cd ${tempDir} && go build ${fileName} 2>&1`,
      java: `cd ${tempDir} && javac ${fileName} 2>&1`,
    };
    return commands[language.toLowerCase()] || `echo "No compile check for ${language}"`;
  }

  private async executeCommand(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code || 1 : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        });
      });
    });
  }

  private parseErrors(output: string, language: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (this.isErrorLine(line, language)) {
        errors.push(line.trim());
      }
    }

    return errors;
  }

  private parseWarnings(output: string, language: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (this.isWarningLine(line, language)) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }

  private isErrorLine(line: string, language: string): boolean {
    const lowerLine = line.toLowerCase();
    const errorIndicators = ['error', 'failed', 'cannot', 'undefined', 'expected'];

    return errorIndicators.some((indicator) => lowerLine.includes(indicator));
  }

  private isWarningLine(line: string, language: string): boolean {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes('warning');
  }

  private async createTempFile(dir: string, fileName: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), content);

    // Create minimal project structure for compiled languages
    if (fileName.endsWith('.rs')) {
      await this.createRustProject(dir);
    } else if (fileName.endsWith('.sol')) {
      // Solidity doesn't need project structure
    }
  }

  private async createRustProject(dir: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create minimal Cargo.toml
    const cargoToml = `[package]
name = "temp_check"
version = "0.1.0"
edition = "2021"

[dependencies]
soroban-sdk = "21.0.1"`;

    await fs.writeFile(path.join(dir, 'Cargo.toml'), cargoToml);
  }

  private async cleanupTempDir(dir: string): Promise<void> {
    const fs = await import('fs/promises');
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      logger.warn({ error, dir }, 'Failed to cleanup temp directory');
    }
  }
}
