import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { logger } from '@veridion/logger';

import { GithubWebhookService } from './github-webhook.service';

export interface GithubPullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    number: number;
    state: string;
    title: string;
    body: string | null;
    user: {
      login: string;
    };
    head: {
      ref: string;
      sha: string;
      repo: {
        full_name: string;
        clone_url: string;
      };
    };
    base: {
      ref: string;
      sha: string;
    };
    html_url: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    private: boolean;
  };
  sender: {
    login: string;
  };
}

@ApiTags('GitHub Webhooks')
@Controller('github-webhook')
export class GithubWebhookController {
  constructor(
    private readonly githubWebhookService: GithubWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('pull-request')
  @ApiOperation({ summary: 'Handle GitHub pull request webhooks' })
  @ApiHeader({
    name: 'X-GitHub-Event',
    description: 'GitHub event type',
    required: true,
  })
  @ApiHeader({
    name: 'X-Hub-Signature-256',
    description: 'HMAC signature for verification',
    required: false,
  })
  async handlePullRequest(
    @Headers('x-github-event') eventType: string,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: GithubPullRequestEvent,
  ) {
    logger.info(
      {
        eventType,
        repo: payload.repository?.full_name,
        prNumber: payload.pull_request?.number,
        action: payload.action,
      },
      'GitHub webhook received',
    );

    // Verify webhook signature if configured
    const webhookSecret = this.config.get<string>('GITHUB_WEBHOOK_SECRET');
    if (webhookSecret && signature) {
      const isValid = this.githubWebhookService.verifySignature(
        JSON.stringify(payload),
        signature,
        webhookSecret,
      );
      if (!isValid) {
        logger.warn({ repo: payload.repository?.full_name }, 'Invalid webhook signature');
        throw new Error('Invalid signature');
      }
    }

    // Handle different pull request events
    if (
      eventType === 'pull_request' &&
      ['opened', 'synchronize', 'reopened'].includes(payload.action)
    ) {
      await this.githubWebhookService.handlePullRequestEvent(payload);
    }

    return { status: 'processed' };
  }

  @Post('push')
  @ApiOperation({ summary: 'Handle GitHub push webhooks' })
  async handlePush(
    @Headers('x-github-event') eventType: string,
    @Body() _payload: Record<string, unknown>,
  ) {
    logger.info({ eventType }, 'GitHub push webhook received');
    // Implement push event handling if needed
    return { status: 'processed' };
  }
}
