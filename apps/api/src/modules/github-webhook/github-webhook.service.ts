import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { logger } from '@veridion/logger';
import { createHmac } from 'crypto';

import type { GithubPullRequestEvent } from './github-webhook.controller';

interface Project {
  id: string;
  name: string;
  repoUrl: string;
}

@Injectable()
export class GithubWebhookService {
  constructor(
    private readonly config: ConfigService,
  ) {}

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    return `sha256=${digest}` === signature;
  }

  async handlePullRequestEvent(event: GithubPullRequestEvent): Promise<void> {
    logger.info(
      {
        repo: event.repository.full_name,
        prNumber: event.pull_request.number,
        action: event.action,
      },
      'Handling pull request event',
    );

    // Find or create project based on repo URL
    const project = await this.findOrCreateProject(event.repository);

    // Trigger audit analysis
    await this.analyzePullRequest(event, project);

    // Post security comment to PR (mock for now)
    await this.postSecurityComment(event);
  }

  private async findOrCreateProject(repository: GithubPullRequestEvent['repository']) {
    // Mock implementation - in production, this would query the database
    logger.info({ repo: repository.full_name }, 'Finding or creating project');
    return {
      id: 'project-123',
      name: repository.name,
      repoUrl: `https://github.com/${repository.full_name}`,
    };
  }

  private async analyzePullRequest(event: GithubPullRequestEvent, project: Project) {
    // Mock implementation - in production, this would trigger the AI engine
    logger.info(
      {
        projectId: project.id,
        commitHash: event.pull_request.head.sha,
      },
      'Analyzing pull request',
    );
  }

  private async postSecurityComment(event: GithubPullRequestEvent) {
    const githubToken = this.config.get<string>('GITHUB_TOKEN');
    if (!githubToken) {
      logger.warn('GitHub token not configured, skipping comment');
      return;
    }

    // Mock implementation - in production, this would use Octokit to post comments
    logger.info(
      { repo: event.repository.full_name, prNumber: event.pull_request.number },
      'Security comment posting (mock)',
    );
  }
}
