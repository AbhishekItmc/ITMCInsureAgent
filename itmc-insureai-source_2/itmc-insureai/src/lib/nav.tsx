import { createContext, useContext } from 'react';

export type Area = 'portal' | 'ops';
export type PortalPage = 'products' | 'quote' | 'policies' | 'claim-new' | 'claims' | 'renewal';
export type OpsPage = 'overview' | 'orchestrator' | 'service' | 'quotes-policies' | 'claims' | 'claim' | 'command' | 'approvals' | 'renewals' | 'audit';

export interface Route {
  area: Area;
  page: PortalPage | OpsPage;
  params?: Record<string, string>;
}

export interface NavCtx {
  route: Route;
  go: (area: Area, page: Route['page'], params?: Record<string, string>) => void;
  viewer: string; // portal customer id
  setViewer: (id: string) => void;
}

export const Nav = createContext<NavCtx>(null as unknown as NavCtx);
export const useNav = () => useContext(Nav);
