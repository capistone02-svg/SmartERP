import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import PasswordGate from "@/components/layout/PasswordGate"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/features/auth/AuthContext"
import LoginPage from "@/features/auth/LoginPage"
import InventoryLayout from "@/features/inventory/InventoryLayout"
import InventoryOverview from "@/features/inventory/InventoryOverview"
import MovementsPage from "@/features/inventory/MovementsPage"
import ProductsPage from "@/features/inventory/ProductsPage"
import StockPage from "@/features/inventory/StockPage"
import SuppliersPage from "@/features/inventory/SuppliersPage"
import WarehousePage from "@/features/inventory/WarehousePage"
import ProfilePage from "@/features/profile/ProfilePage"
import CustomersPage from "@/features/sales/CustomersPage"
import MarketingPage from "@/features/sales/MarketingPage"
import PromotionsPage from "@/features/sales/PromotionsPage"
import SalesLayout from "@/features/sales/SalesLayout"
import SalesOverview from "@/features/sales/SalesOverview"
import TransactionsPage from "@/features/sales/TransactionsPage"
import { GuestOnly, RequireAccess, RequireAuth } from "@/routes/guards"
import EntriesPage from "@/features/finance/EntriesPage"
import FinanceLayout from "@/features/finance/FinanceLayout"
import FinanceOverview from "@/features/finance/FinanceOverview"
import CasesPage from "@/features/customer-service/CasesPage"
import CustomerServiceLayout from "@/features/customer-service/CustomerServiceLayout"
import CustomerServiceOverview from "@/features/customer-service/CustomerServiceOverview"
import AccountsPage from "@/features/hr/AccountsPage"
import EmployeesPage from "@/features/hr/EmployeesPage"
import HrLayout from "@/features/hr/HrLayout"
import HrOverview from "@/features/hr/HrOverview"
import OnboardingPage from "@/features/hr/OnboardingPage"
import EmployeeProfilePage from "@/features/people/EmployeeProfilePage"
import TeamPage from "@/features/people/TeamPage"
import AdministrationLayout from "@/features/administration/AdministrationLayout"
import PermissionsPage from "@/features/administration/PermissionsPage"
import UsersPage from "@/features/administration/UsersPage"
import ReportsPage from "@/features/reports/ReportsPage"
import SettingsPage from "@/features/settings/SettingsPage"
import { installAuthAudit } from "@/lib/auditAuth"
import ActivityLogPage from "@/features/administration/ActivityLogPage"
import ArchivePage from "@/features/administration/ArchivePage"
import LoginLogPage from "@/features/administration/LoginLogPage"
import ApprovalsPage from "@/features/approvals/ApprovalsPage"
import HomePage from "@/features/home/HomePage"
import CaseTypePage from "@/features/customer-service/CaseTypePage"
import AreaSignInsPage from "@/features/activity/AreaSignInsPage"
import SalesRefundsPage from "@/features/sales/SalesRefundsPage"


installAuthAudit()

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<PasswordGate />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* One person, one file: HR sees the personnel file, their own department head
                    sees the work profile, anyone else sees only their own record. */}
                <Route path="/people/:id" element={<EmployeeProfilePage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route element={<RequireAccess area="human_resources" />}>
                  <Route path="/hr" element={<HrLayout />}>
                    <Route index element={<HrOverview />} />
                    <Route path="employees" element={<EmployeesPage />} />
                    <Route path="onboarding" element={<OnboardingPage />} />
                    <Route path="accounts" element={<AccountsPage />} />
                    <Route path="sign-ins" element={<AreaSignInsPage />} />
                  </Route>
                </Route>
                <Route element={<RequireAccess area="finance_accounting" />}>
                  <Route path="/finance" element={<FinanceLayout />}>
                    <Route path="approvals" element={<ApprovalsPage module="finance" />} />
                    <Route index element={<FinanceOverview />} />
                    <Route path="entries" element={<EntriesPage />} />
                  </Route>
                </Route>
                <Route element={<RequireAccess area="inventory_warehouse" />}>
                  <Route path="/inventory" element={<InventoryLayout />}>
                    <Route path="approvals" element={<ApprovalsPage module="inventory" />} />
                    <Route index element={<InventoryOverview />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="stock" element={<StockPage />} />
                    <Route path="movements" element={<MovementsPage />} />
                    <Route path="suppliers" element={<SuppliersPage />} />
                    <Route path="warehouse" element={<WarehousePage />} />
                  </Route>
                </Route>
                <Route element={<RequireAccess area="sales_marketing" />}>
                  <Route path="/sales" element={<SalesLayout />}>
                    <Route index element={<SalesOverview />} />
                    <Route path="approvals" element={<ApprovalsPage module="sales" />} />
                    <Route path="transactions" element={<TransactionsPage />} />
                    <Route path="refunds" element={<SalesRefundsPage />} />
                    <Route path="customers" element={<CustomersPage />} />
                    <Route path="promotions" element={<PromotionsPage />} />
                    <Route path="marketing" element={<MarketingPage />} />
                  </Route>
                </Route>
                <Route element={<RequireAccess area="customer_service" />}>
      <Route path="/customer-service" element={<CustomerServiceLayout />}>
        <Route index element={<CustomerServiceOverview />} />
        <Route path="complaints" element={<CaseTypePage key="complaint" kind="complaint" />} />
        <Route path="refunds" element={<CaseTypePage key="refund" kind="refund" />} />
        <Route path="inquiries" element={<CaseTypePage key="inquiry" kind="inquiry" />} />
        <Route path="feedback" element={<CaseTypePage key="feedback" kind="feedback" />} />
        <Route path="cases" element={<CasesPage />} />
        {/* Team tab: Department Head + Admin of this department */}
        <Route path="team" element={<TeamPage area="customer_service" />} />
        <Route path="sign-ins" element={<AreaSignInsPage />} />
      </Route>
                </Route>
                <Route element={<RequireAccess adminOnly />}>
                  <Route path="/administration" element={<AdministrationLayout />}>
                    <Route index element={<UsersPage />} />
                    <Route path="permissions" element={<PermissionsPage />} />
                    <Route path="activity" element={<ActivityLogPage />} />
                    <Route path="logins" element={<LoginLogPage />} />
                    <Route path="archive" element={<ArchivePage />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
