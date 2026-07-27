export const defaultGroups = [
  { id: "grp-income-100", code: 100, name: "INCOME & EARNINGS", type: "INCOME" as const },
  { id: "grp-housing-200", code: 200, name: "HOUSING", type: "EXPENSE" as const },
  { id: "grp-food-300", code: 300, name: "FOOD & DINING", type: "EXPENSE" as const },
  { id: "grp-transport-400", code: 400, name: "TRANSPORTATION", type: "EXPENSE" as const },
  { id: "grp-health-500", code: 500, name: "HEALTH", type: "EXPENSE" as const },
  { id: "grp-leisure-600", code: 600, name: "LEISURE & LIFESTYLE", type: "EXPENSE" as const },
  { id: "grp-education-700", code: 700, name: "EDUCATION", type: "EXPENSE" as const },
  { id: "grp-others-800", code: 800, name: "OTHERS", type: "EXPENSE" as const },
  { id: "grp-transfer-900", code: 900, name: "TRANSFERS", type: "TRANSFER" as const },
];

export const defaultCategories = [
  // Income (100)
  { id: "cat-salario", code: "100.001", name: "Salary", type: "INCOME" as const, groupId: "grp-income-100" },
  { id: "cat-freelance", code: "100.002", name: "Freelance / Services", type: "INCOME" as const, groupId: "grp-income-100" },
  { id: "cat-rendimentos", code: "100.003", name: "Investment Income", type: "INCOME" as const, groupId: "grp-income-100" },

  // Housing (200)
  { id: "cat-aluguel", code: "200.001", name: "Rent / Mortgage", type: "EXPENSE" as const, groupId: "grp-housing-200" },
  { id: "cat-condominio", code: "200.002", name: "HOA / Condo Fees", type: "EXPENSE" as const, groupId: "grp-housing-200" },
  { id: "cat-consumo", code: "200.003", name: "Utilities (Power/Water/Gas)", type: "EXPENSE" as const, groupId: "grp-housing-200" },
  { id: "cat-internet", code: "200.004", name: "Internet / TV", type: "EXPENSE" as const, groupId: "grp-housing-200" },

  // Food & Dining (300)
  { id: "cat-supermercado", code: "300.001", name: "Groceries", type: "EXPENSE" as const, groupId: "grp-food-300" },
  { id: "cat-restaurantes", code: "300.002", name: "Restaurants / Delivery", type: "EXPENSE" as const, groupId: "grp-food-300" },

  // Transportation (400)
  { id: "cat-combustivel", code: "400.001", name: "Fuel", type: "EXPENSE" as const, groupId: "grp-transport-400" },
  { id: "cat-transp-publico", code: "400.002", name: "Public Transit / Rides", type: "EXPENSE" as const, groupId: "grp-transport-400" },
  { id: "cat-manut-veiculo", code: "400.003", name: "Vehicle Maintenance", type: "EXPENSE" as const, groupId: "grp-transport-400" },

  // Health (500)
  { id: "cat-saude-geral", code: "500.001", name: "Health Plan / Pharmacy", type: "EXPENSE" as const, groupId: "grp-health-500" },

  // Leisure & Lifestyle (600)
  { id: "cat-cinema", code: "600.001", name: "Movies / Shows / Travel", type: "EXPENSE" as const, groupId: "grp-leisure-600" },
  { id: "cat-assinaturas", code: "600.002", name: "Subscriptions (Streaming etc.)", type: "EXPENSE" as const, groupId: "grp-leisure-600" },

  // Education (700)
  { id: "cat-cursos", code: "700.001", name: "Courses / College / Books", type: "EXPENSE" as const, groupId: "grp-education-700" },

  // Others (800)
  { id: "cat-despesas-diversas", code: "800.001", name: "Miscellaneous", type: "EXPENSE" as const, groupId: "grp-others-800" },
  { id: "cat-impostos", code: "800.002", name: "Taxes / Fees", type: "EXPENSE" as const, groupId: "grp-others-800" },

  // Transfers (900)
  { id: "cat-transferencia", code: "900.001", name: "Transfer Between Accounts", type: "TRANSFER" as const, groupId: "grp-transfer-900" },
];

export const defaultStatuses = [
  { id: "st-pago", code: 1, name: "Paid" },
  { id: "st-pendente", code: 2, name: "Pending" },
  { id: "st-vencido", code: 3, name: "Overdue" },
  { id: "st-agendado", code: 4, name: "Scheduled" },
];

export const defaultAccounts = [
  { id: 1, name: "Checking Account", type: "CHECKING" as const, balance: 0.0 },
  { id: 2, name: "Savings Reserve", type: "SAVINGS" as const, balance: 0.0 },
  { id: 3, name: "Wallet", type: "WALLET" as const, balance: 0.0 },
];
