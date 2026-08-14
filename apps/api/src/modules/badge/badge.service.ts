import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import { SorobanClient } from '../blockchain/soroban-client';

interface BadgeData {
  contractId: string;
  status: 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REVOKED';
  securityScore: number;
  badgeLevel: string;
  verifiedAt: Date;
}

@Injectable()
export class BadgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanClient,
  ) {}

  async generateBadge(contractId: string): Promise<string> {
    // Try to get badge data from blockchain first
    let badgeData: BadgeData;

    try {
      // Query on-chain badge
      const onChainBadge = await this.soroban.getBadge(contractId);
      if (onChainBadge) {
        badgeData = {
          contractId,
          status: this.mapBadgeLevelToStatus(onChainBadge.badge_level),
          securityScore: onChainBadge.security_score,
          badgeLevel: onChainBadge.badge_level,
          verifiedAt: new Date(onChainBadge.issued_at * 1000),
        };
      } else {
        // Fallback to database
        badgeData = await this.getBadgeFromDatabase(contractId);
      }
    } catch (error) {
      // Fallback to database if blockchain query fails
      badgeData = await this.getBadgeFromDatabase(contractId);
    }

    return this.generateSvgBadge(badgeData);
  }

  private async getBadgeFromDatabase(contractId: string): Promise<BadgeData> {
    const audit = await this.prisma.db.audit.findFirst({
      where: {
        project: {
          contracts: {
            some: {
              hash: contractId,
            },
          },
        },
        status: 'VERIFIED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!audit) {
      return {
        contractId,
        status: 'PENDING',
        securityScore: 0,
        badgeLevel: 'NONE',
        verifiedAt: new Date(),
      };
    }

    const badgeLevel = this.calculateBadgeLevel(audit.securityScore || 0);

    return {
      contractId,
      status: audit.chainStatus as 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REVOKED',
      securityScore: audit.securityScore || 0,
      badgeLevel,
      verifiedAt: audit.completedAt || audit.createdAt,
    };
  }

  private calculateBadgeLevel(score: number): string {
    if (score >= 90) return 'GOLD';
    if (score >= 75) return 'SILVER';
    if (score >= 60) return 'BRONZE';
    return 'NONE';
  }

  private mapBadgeLevelToStatus(
    badgeLevel: string,
  ): 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REVOKED' {
    if (badgeLevel === 'FLAGGED') return 'FLAGGED';
    if (badgeLevel === 'REVOKED') return 'REVOKED';
    if (badgeLevel === 'NONE') return 'PENDING';
    return 'VERIFIED';
  }

  private generateSvgBadge(data: BadgeData): string {
    const colors = {
      GOLD: { bg: '#FFD700', text: '#000000', border: '#B8860B' },
      SILVER: { bg: '#C0C0C0', text: '#000000', border: '#808080' },
      BRONZE: { bg: '#CD7F32', text: '#FFFFFF', border: '#8B4513' },
      NONE: { bg: '#808080', text: '#FFFFFF', border: '#696969' },
      PENDING: { bg: '#FFA500', text: '#000000', border: '#FF8C00' },
      FLAGGED: { bg: '#FF6347', text: '#FFFFFF', border: '#DC143C' },
      REVOKED: { bg: '#DC143C', text: '#FFFFFF', border: '#8B0000' },
    };

    const color = colors[data.badgeLevel as keyof typeof colors] || colors.NONE;

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <defs>
    <linearGradient id="badge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${color.bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color.border};stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect x="0" y="0" width="200" height="40" rx="6" fill="url(#badge-gradient)" stroke="${color.border}" stroke-width="2"/>
  
  <!-- Shield Icon -->
  <path d="M20 8 L20 8 C20 8 12 10 12 15 C12 22 20 28 20 28 C20 28 28 22 28 15 C28 10 20 8 20 8 Z" fill="${color.text}" opacity="0.9"/>
  
  <!-- Text -->
  <text x="38" y="16" font-family="Arial, sans-serif" font-size="8" font-weight="bold" fill="${color.text}">
    Veridion Security
  </text>
  <text x="38" y="28" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="${color.text}">
    ${data.badgeLevel} - ${data.securityScore}/100
  </text>
  
  <!-- Status Indicator -->
  <circle cx="180" cy="20" r="6" fill="${data.status === 'VERIFIED' ? '#00FF00' : data.status === 'FLAGGED' ? '#FF0000' : '#FFA500'}"/>
</svg>
    `.trim();
  }
}
