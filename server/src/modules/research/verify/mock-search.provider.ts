import { Injectable } from '@nestjs/common';
import {
  SearchProvider,
  SearchQuery,
  SearchResult,
} from './search-provider.interface';

/**
 * Mock 搜索适配器。
 * 文档第六章：SEARCH_PROVIDER=mock 时使用。
 * 返回结构化的模拟搜索结果，用于开发阶段跑通流水线。
 * 注意：Mock 数据仅用于流程验证，不代表真实项目信息。
 */
@Injectable()
export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const { projectName, source } = query;
    const results: SearchResult[] = [];

    // 根据请求的源返回对应的模拟数据
    if (!source || source === 'github') {
      results.push({
        title: `${projectName} - GitHub Repository`,
        url: `https://github.com/example/${projectName.toLowerCase().replace(/\s+/g, '-')}`,
        snippet: `A project related to ${projectName}. Stars: ${Math.floor(Math.random() * 5000) + 100}. Forks: ${Math.floor(Math.random() * 500) + 10}.`,
        source: 'github',
      });
    }

    if (!source || source === 'producthunt') {
      results.push({
        title: `${projectName} on Product Hunt`,
        url: `https://www.producthunt.com/posts/${projectName.toLowerCase().replace(/\s+/g, '-')}`,
        snippet: `${projectName} was featured on Product Hunt. Upvotes: ${Math.floor(Math.random() * 800) + 50}. Comments: ${Math.floor(Math.random() * 100) + 5}.`,
        source: 'producthunt',
      });
    }

    if (!source || source === 'google') {
      results.push({
        title: `${projectName} - Official Website`,
        url: `https://www.${projectName.toLowerCase().replace(/\s+/g, '')}.com`,
        snippet: `${projectName} is a tool/platform for creators and developers. Founded in 2025-2026.`,
        source: 'google',
      });
      results.push({
        title: `${projectName} Review - TechCrunch`,
        url: `https://techcrunch.com/2026/${projectName.toLowerCase().replace(/\s+/g, '-')}-review`,
        snippet: `Review of ${projectName}: an emerging player in the space with promising traction.`,
        source: 'google',
      });
    }

    if (!source || source === 'reddit') {
      results.push({
        title: `What do you think about ${projectName}? : r/SaaS`,
        url: `https://www.reddit.com/r/SaaS/comments/example_${projectName.toLowerCase().replace(/\s+/g, '_')}`,
        snippet: `Discussion about ${projectName}. Mixed reviews from the community. Some users report good results.`,
        source: 'reddit',
      });
    }

    if (!source || source === 'hackernews') {
      results.push({
        title: `Show HN: ${projectName}`,
        url: `https://news.ycombinator.com/item?id=${Math.floor(Math.random() * 40000000) + 1000000}`,
        snippet: `Show HN post for ${projectName}. Points: ${Math.floor(Math.random() * 300) + 10}. Comments: ${Math.floor(Math.random() * 80) + 2}.`,
        source: 'hackernews',
      });
    }

    return results.slice(0, query.maxResults || 10);
  }
}
