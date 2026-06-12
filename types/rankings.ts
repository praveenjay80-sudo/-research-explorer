export interface OAField {
  id: string;           // "https://openalex.org/fields/27"
  display_name: string;
  works_count: number;
}

export interface OASubfield {
  id: string;           // "https://openalex.org/subfields/2730"
  display_name: string;
  works_count: number;
  field: { id: string; display_name: string };
}

export interface RankedScientist {
  rank: number;
  openAlexId: string;   // short form e.g. "A5100710698"
  name: string;
  institution: string;
  country: string;
  citedByCount: number;       // career total citations (for profile detail)
  fieldCitedByCount: number;  // citations from papers in this specific subfield (ranking basis)
  worksCount: number;
  hIndex: number;
  field: string;
  fieldId: string;
  subfield: string;
  subfieldId: string;
  dataSource: 'openalex' | 'stanford' | 'snapshot';
  cScore?: number;
}

export interface ScientistWork {
  id: string;
  title: string;
  year: number | null;
  citationCount: number;
  doi?: string;
  journal?: string;
  url: string;
}

export interface CitationYear {
  year: number;
  works_count: number;
  cited_by_count: number;
}

export interface ScientistProfile {
  openAlexId: string;
  name: string;
  institution: string;
  country: string;
  citedByCount: number;
  worksCount: number;
  hIndex: number;
  i10Index: number;
  twoYrMeanCitedness: number;
  field: string;
  fieldId: string;
  subfield: string;
  subfieldId: string;
  firstYear?: number;
  lastYear?: number;
  orcid?: string;
  scopusId?: string;
  topics: string[];
  citationsByYear: CitationYear[];
  topWorks: ScientistWork[];
  dataSource: 'openalex' | 'stanford' | 'snapshot';
}

// Stanford XLSX parsed format stored in data/stanford/YYYY.json
export interface StanfordEntry {
  rank: number;
  name: string;
  institution: string;
  country: string;
  field: string;
  subfield: string;
  citedByCount: number;
  hIndex: number;
  worksCount: number;
  cScore: number;
  firstYear?: number;
  lastYear?: number;
  openAlexId?: string;
  scopusId?: string;
}

export interface StanfordYearData {
  year: number;
  total: number;
  entries: StanfordEntry[];
}

// OpenAlex snapshot saved by the "Capture" button
export interface SnapshotData {
  subfieldId: string;
  subfieldName: string;
  fieldId: string;
  fieldName: string;
  year: number;
  capturedAt: string;
  source: 'openalex';
  scientists: RankedScientist[];
  total: number;
}
