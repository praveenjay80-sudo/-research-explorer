export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  citationCount: number;
  abstract?: string;
  url?: string;
  source: 'semantic-scholar' | 'openalex' | 'merged' | 'pdfvector' | 'google-scholar';
  fieldsOfStudy?: string[];
  doi?: string;
  concepts?: string[];
  workType?: string;
}

export interface ConceptNode {
  id: string;
  name: string;
  level: number;
  score: number;
  worksCount: number;
  description?: string;
  isMain?: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface ConceptLink {
  source: string | ConceptNode;
  target: string | ConceptNode;
  type: 'broader' | 'related';
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  links: ConceptLink[];
}

export interface SearchResult {
  papers: Paper[];
  totalCount: number;
  conceptGraph: ConceptGraph;
  page: number;
}
