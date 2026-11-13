export type AppRoute =
  | 'home'
  | 'signin'
  | 'signup'
  | 'app'
  | 'about'
  | 'contact'
  | 'docs'
  | 'privacy'
  | 'terms';

export interface NavLinkItem {
  label: string;
  href: string;
}

export interface FAQItemData {
  id: string;
  question: string;
  answer: string;
}

export interface FeatureItemData {
  id: string;
  category: string;
  title: string;
  description: string;
}
