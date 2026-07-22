/**
 * 搜索适配器接口。
 * 文档第六章：适配器模式 SearchProvider，实现可替换。
 * 环境变量 SEARCH_PROVIDER=serp|mock 控制使用哪个实现。
 */

/** 搜索结果条目 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

/** 搜索查询参数 */
export interface SearchQuery {
  /** 项目名称 */
  projectName: string;
  /** 搜索关键词 */
  query: string;
  /** 指定搜索源（可选，不指定则搜索所有启用的源） */
  source?: string;
  /** 最大结果数 */
  maxResults?: number;
}

/**
 * 搜索提供者抽象接口。
 * 实现类：MockSearchProvider（开发）、SerpSearchProvider（生产）等。
 */
export interface SearchProvider {
  /** 提供者名称 */
  readonly name: string;

  /**
   * 执行搜索，返回结果列表。
   * 硬约束：返回的每条结果必须有真实可访问的 URL。
   * Mock 模式下返回模拟数据，但结构一致。
   */
  search(query: SearchQuery): Promise<SearchResult[]>;

  /**
   * 检查提供者是否可用。
   */
  isAvailable(): boolean;
}
