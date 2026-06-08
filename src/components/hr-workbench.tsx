"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, FileText, Plus } from "lucide-react";
import type { Attendance, Employee, LeaveRequest, PayrollRun } from "@/lib/domain/types";
import { calculatePayrollRun, journalizePayrollRun } from "@/lib/hr/payroll";
import { money } from "@/lib/format";

export function HrWorkbench({
  employees,
  attendance,
}: {
  employees: Employee[];
  attendance: Attendance[];
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id ?? "");
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0];
  const payroll = useMemo<PayrollRun | null>(() => {
    if (!selectedEmployee) return null;
    return calculatePayrollRun({
      businessId: selectedEmployee.businessId,
      employee: selectedEmployee,
      period: "2026-06",
      workDays: 22,
      attendance,
      components: [
        { name: "Tunjangan makan", amount: 250000, type: "earning" },
        { name: "Kasbon", amount: 100000, type: "deduction" },
      ],
      taxWithheld: selectedEmployee.contractType === "daily" ? 0 : 150000,
    });
  }, [attendance, selectedEmployee]);
  const payrollJournal = payroll ? journalizePayrollRun(payroll, "2026-06-28") : null;

  function addLeave(formData: FormData) {
    setLeaveRequests((current) => [
      {
        id: `leave-${Date.now()}`,
        businessId: "demo-business",
        employeeId: String(formData.get("employeeId")),
        startDate: String(formData.get("startDate")),
        endDate: String(formData.get("endDate")),
        reason: String(formData.get("reason")),
        status: "pending",
      },
      ...current,
    ]);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Data karyawan</h2>
        <div className="mt-4 space-y-3">
          {employees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onClick={() => setSelectedEmployeeId(employee.id)}
              className={`w-full rounded-lg border p-4 text-left ${
                selectedEmployeeId === employee.id ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{employee.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{employee.role} - {employee.contractType}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {employee.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <FileText className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Payroll preview</h2>
            <p className="text-sm text-gray-500">Payroll menghasilkan jurnal otomatis.</p>
          </div>
        </div>
        {payroll ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-500">Gross</p>
                <p className="mt-1 font-semibold">{money(payroll.grossPay)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-500">Potongan</p>
                <p className="mt-1 font-semibold">{money(payroll.deductions + payroll.taxWithheld)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-500">Net pay</p>
                <p className="mt-1 font-semibold">{money(payroll.netPay)}</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  {payrollJournal?.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-medium">{line.accountName}</td>
                      <td className="px-3 py-2 text-right">{line.debit ? money(line.debit) : "-"}</td>
                      <td className="px-3 py-2 text-right">{line.credit ? money(line.credit) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">Pengajuan cuti</h2>
        </div>
        <form action={addLeave} className="space-y-3">
          <select name="employeeId" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.name}</option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="startDate" type="date" defaultValue="2026-06-29" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input name="endDate" type="date" defaultValue="2026-06-30" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <input name="reason" defaultValue="Keperluan keluarga" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
            <Plus className="size-4" aria-hidden />
            Ajukan cuti
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">Daftar cuti lokal</h2>
        <div className="mt-4 space-y-3">
          {leaveRequests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
              Belum ada pengajuan cuti.
            </p>
          ) : (
            leaveRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium">{employees.find((employee) => employee.id === request.employeeId)?.name}</p>
                <p className="mt-1 text-sm text-gray-500">{request.startDate} sampai {request.endDate} - {request.reason}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
