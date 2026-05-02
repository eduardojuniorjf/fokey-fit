export const DASHBOARD_CARDS = [
  { id: "goal", label: "Meta de peso" },
  { id: "kpi-steps", label: "Passos hoje" },
  { id: "kpi-cardio", label: "Pontos cardio" },
  { id: "kpi-energy", label: "Energia hoje" },
  { id: "kpi-weight", label: "Peso atual" },
  { id: "insight", label: "Insight do dia" },
  { id: "month", label: "Painel do mês" },
  { id: "quick-actions", label: "Registrar agora" },
  { id: "habits", label: "Hábitos hoje" },
  { id: "weight-chart", label: "Evolução do peso" },
  { id: "activity-7d", label: "Atividade — 7 dias" },
  { id: "calories", label: "Calorias — últimos 30 dias" },
] as const;

export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]["id"];

export interface DashboardPrefs {
  mobile_hidden: string[];
  desktop_hidden: string[];
}

export const EMPTY_PREFS: DashboardPrefs = { mobile_hidden: [], desktop_hidden: [] };
