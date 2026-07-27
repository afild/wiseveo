// Demo dataset catalog — every merchant name is fictional and English (user premise).
// Values were calibrated against BLS CES 2024 / IBGE POF shares and validated by
// the approved sample (seed 20260726). Change only with a new approved sample.

export const CUTOFF_MODE: "fixed" | "dynamic" = "dynamic" // D1 (testes pinam o corte fixo)
export const SAVINGS_INITIAL_BALANCE = 6000 // D2
export const OVERDUE_SHOWCASE = true // D3
export const CHECKING_INITIAL_BALANCE = 973.0 // P2

export const SEED = 20260726

// Salário (INCOME, dia 5, sempre ,00): aumento anual em janeiro (padrão EUA — D6)
export function salaryFor(y: number): number {
  if (y === 2025) return 11800
  if (y === 2026) return 12200
  return 12700
}

export type FixedBill = {
  description: string; payee: string; group: number; cat: string; day: number
  values: Record<number, number> // por ano — reajuste anual
}

export const FIXED_BILLS: FixedBill[] = [
  { description: "Apartment Rent", payee: "Blue Harbor Realty", group: 200, cat: "200.001", day: 5, values: { 2025: 3214.75, 2026: 3381.92, 2027: 3537.49 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "HOA Dues", payee: "Harbor View HOA", group: 200, cat: "200.002", day: 8, values: { 2025: 486.3, 2026: 511.2, 2027: 534.85 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Renters Insurance", payee: "NestGuard Insurance", group: 200, cat: "200.002", day: 24, values: { 2025: 19.9, 2026: 20.9, 2027: 21.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Fiber Internet 600MB", payee: "Cloudpine Broadband", group: 200, cat: "200.004", day: 10, values: { 2025: 129.9, 2026: 139.9, 2027: 149.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Mobile Plan", payee: "Cloudpine Mobile", group: 200, cat: "200.004", day: 10, values: { 2025: 79.9, 2026: 84.9, 2027: 89.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Health Plan", payee: "SecureLife Health Insurance", group: 500, cat: "500.001", day: 20, values: { 2025: 612.35, 2026: 668.27, 2027: 731.44 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Gym Membership", payee: "IronWorks Fitness Club", group: 600, cat: "600.002", day: 3, values: { 2025: 149.9, 2026: 159.9, 2027: 169.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Streaming Subscription", payee: "StreamVerse", group: 600, cat: "600.002", day: 9, values: { 2025: 44.9, 2026: 49.9, 2027: 54.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Music Subscription", payee: "TuneWave Music", group: 600, cat: "600.002", day: 6, values: { 2025: 21.9, 2026: 22.9, 2027: 23.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Cloud Storage", payee: "CloudNest Storage", group: 600, cat: "600.002", day: 2, values: { 2025: 12.9, 2026: 12.9, 2027: 14.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Shopping Club Subscription", payee: "Parcel Perks Club", group: 600, cat: "600.002", day: 22, values: { 2025: 19.9, 2026: 21.9, 2027: 23.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Online Course Subscription", payee: "SkillForge Online Academy", group: 700, cat: "700.001", day: 7, values: { 2025: 89.9, 2026: 89.9, 2027: 99.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Car Insurance", payee: "ShieldSure Auto Insurance", group: 400, cat: "400.003", day: 18, values: { 2025: 214.65, 2026: 226.4, 2027: 238.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Account Maintenance Fee", payee: "Copperleaf Bank", group: 800, cat: "800.002", day: 28, values: { 2025: 24.9, 2026: 24.9, 2027: 27.9 } }, // i18n-ignore: fictional demo seed data, not UI copy
]

// D4: utilities com DIA fixo e valor sazonal (estações dos EUA — A/C no verão, aquecimento no inverno)
export type SeasonalUtility = FixedBill & { factor: (m: number) => number }
export const SEASONAL_UTILITY_BILLS: SeasonalUtility[] = [
  { description: "Water Bill", payee: "ClearFlow Water Utility", group: 200, cat: "200.003", day: 12, values: { 2025: 94.37, 2026: 98.9, 2027: 103.45 }, factor: (m) => (m >= 5 && m <= 8 ? 1.1 : 1.0) }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Electricity Bill", payee: "Lumenta Power & Light", group: 200, cat: "200.003", day: 14, values: { 2025: 287.64, 2026: 301.15, 2027: 315.8 }, factor: (m) => (m >= 5 && m <= 7 ? 1.18 : m === 4 || m === 8 ? 1.08 : m === 11 || m <= 1 ? 1.05 : 1.0) }, // i18n-ignore: fictional demo seed data, not UI copy
  { description: "Gas Bill", payee: "CityFlame Gas Co.", group: 200, cat: "200.003", day: 16, values: { 2025: 68.4, 2026: 71.8, 2027: 75.3 }, factor: (m) => (m === 11 || m <= 1 ? 1.45 : m === 2 || m === 10 ? 1.2 : m >= 5 && m <= 7 ? 0.72 : 1.0) }, // i18n-ignore: fictional demo seed data, not UI copy
]

export type VariableTemplate = {
  description: string; payee: string | string[]; cat: string
  n: [number, number]; range: [number, number]; weekendP: number
}

// weekendP = probabilidade de cair no fim de semana (P12: ~75% em dias úteis)
export const VARIABLE_TEMPLATES: Record<number, VariableTemplate[]> = {
  300: [
    { description: "Groceries", payee: "Golden Acre Supermarket", cat: "300.001", n: [4, 5], range: [260, 540], weekendP: 0.35 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Quick Groceries", payee: "Corner Basket Market", cat: "300.001", n: [2, 4], range: [22, 85], weekendP: 0.2 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Dinner Out", payee: ["Bella Notte Trattoria", "Smokey Joe's Grill", "Golden Dragon Express"], cat: "300.002", n: [3, 4], range: [58, 175], weekendP: 0.4 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Food Delivery", payee: "QuickBite Delivery", cat: "300.002", n: [3, 5], range: [34, 92], weekendP: 0.3 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Coffee", payee: "Brew & Bean Coffee", cat: "300.002", n: [5, 8], range: [11, 26], weekendP: 0.05 },
  ],
  400: [
    { description: "Fuel", payee: "Blue Comet Fuel Station", cat: "400.001", n: [3, 3], range: [170, 265], weekendP: 0.15 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Ride-Hailing Trip", payee: "HopLine Rides", cat: "400.002", n: [4, 7], range: [14, 46], weekendP: 0.3 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Parking", payee: "ParkEasy Garage", cat: "400.002", n: [2, 4], range: [8, 24], weekendP: 0.05 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Car Wash", payee: "Shiny Wheels Car Wash", cat: "400.003", n: [1, 1], range: [35, 55], weekendP: 0.3 }, // i18n-ignore: fictional demo seed data, not UI copy
  ],
  500: [
    { description: "Medicines", payee: "GreenLeaf Pharmacy", cat: "500.001", n: [1, 3], range: [42, 160], weekendP: 0.1 }, // i18n-ignore: fictional demo seed data, not UI copy
  ],
  600: [
    { description: "Movie Night", payee: "Starlight Cinema", cat: "600.001", n: [1, 2], range: [42, 88], weekendP: 0.5 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Drinks With Friends", payee: "Hoppy Frog Pub", cat: "600.001", n: [1, 3], range: [55, 140], weekendP: 0.5 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Hobby Supplies", payee: "HobbyHive Store", cat: "600.001", n: [0, 2], range: [38, 145], weekendP: 0.3 }, // i18n-ignore: fictional demo seed data, not UI copy
  ],
  700: [
    { description: "Books", payee: "PageTurner Books", cat: "700.001", n: [0, 2], range: [45, 140], weekendP: 0.2 }, // i18n-ignore: fictional demo seed data, not UI copy
  ],
  800: [
    { description: "Haircut", payee: "SharpCut Barbershop", cat: "800.001", n: [1, 1], range: [52, 74], weekendP: 0.35 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Household Items", payee: "HomeNest Essentials", cat: "800.001", n: [1, 2], range: [42, 190], weekendP: 0.35 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Pet Supplies", payee: "Waggy Tails Pet Shop", cat: "800.001", n: [1, 2], range: [55, 175], weekendP: 0.25 }, // i18n-ignore: fictional demo seed data, not UI copy
    { description: "Clothing", payee: "UrbanThread Apparel", cat: "800.001", n: [0, 2], range: [85, 320], weekendP: 0.35 }, // i18n-ignore: fictional demo seed data, not UI copy
  ],
}

// Renda extra (INCOME): freelance dia 15–20 (múltiplo de 50), dividendos dia 1–3 (centavos livres)
export const INCOME_EXTRA = {
  freelance: { description: "Freelance Web Project", payee: "Pixel Falcon Studio", cat: "100.002", min: 1000, max: 3400 }, // i18n-ignore: fictional demo seed data, not UI copy
  dividends: { description: "Monthly Dividends", payee: "Nest Egg Investment Fund", cat: "100.003", min: 160, max: 440 }, // i18n-ignore: fictional demo seed data, not UI copy
  salary: { description: "Monthly Salary", payee: "Moonrise Digital Agency", cat: "100.001", day: 5 }, // i18n-ignore: fictional demo seed data, not UI copy
}

// Faixas % das entradas por grupo de despesa (P5–P7) — validadas na amostra
export const GROUPS_EXPENSE_RANGES: Record<number, [number, number]> = {
  200: [28, 36], 300: [16, 24], 400: [8, 15], 500: [5, 11], 600: [6, 17], 700: [0.5, 3.5], 800: [3, 12],
}

// Ponto de partida da alocação (% das entradas) antes da sazonalidade/redistribuição
export const BASE_PCT: Record<number, number> = { 300: 19.5, 400: 10.5, 500: 6.8, 600: 9.5, 700: 1.6, 800: 5.6 }

// Multiplicador sazonal do "pool" variável por grupo (jan..dez)
export function seasonMult(group: number, m: number): number {
  if (group === 300) return m === 11 ? 1.15 : 1.0
  if (group === 400) return m === 0 || m === 6 ? 1.12 : 1.0
  if (group === 600) return [1.15, 0.85, 0.9, 1, 1, 0.9, 1.25, 0.9, 0.95, 1, 1.05, 1.35][m]
  if (group === 800) return m === 11 ? 1.25 : m === 10 ? 1.1 : 1.0
  return 1.0
}

export const FILLER_ALLOWANCE: Record<number, number> = { 300: 190, 400: 55 }
