// Curated picks: projects by other creators that we recommend. Each entry must be
// approved by the site owner before it is added. Links go to the original site;
// these projects do NOT get a vibe-show subdomain unless the creator applies.
export interface Pick {
  name: string;
  url: string;
  category: 'tool' | 'creative' | 'game';
  zh: string;
  en: string;
  creator: string;
  creatorUrl?: string;
  shot?: string; // path under /picks/
}

export const picks: Pick[] = [];
