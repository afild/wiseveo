-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_month_year_categoryId_key" ON "Budget"("userId", "month", "year", "categoryId");
