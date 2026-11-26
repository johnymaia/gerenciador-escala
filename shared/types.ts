export type UserRole = 'admin' | 'employee';

export const DEFAULT_USER_PASSWORD = '123456';

export interface PublicEmployee {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  in_rotation: boolean;
  rotation_order: number;
  color: string;
  active: boolean;
  must_change_password: boolean;
}

export interface ShopSettings {
  shop_name: string;
  open_time: string;
  close_time: string;
  lunch_hours: number;
  daily_hours: number;
  rotation_start_date: string; // YYYY-MM-DD (primeiro dia do cálculo do rodízio)
  saturday_vacation_cascade: boolean;
}

export interface HolidayOverrideRecord {
  date: string; // YYYY-MM-DD
  name: string;
  is_closed: boolean;
  is_custom: boolean;
}

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
  scope: 'nacional' | 'bh' | 'manual';
  is_closed: boolean;
  is_custom: boolean;
}

export interface ScheduleOverrideRecord {
  date: string; // YYYY-MM-DD
  employee_id: number;
  status: 'off' | 'work';
  note: string;
}

export interface HourAdjustmentRecord {
  id: number;
  date: string; // YYYY-MM-DD
  employee_id: number;
  hours_delta: number;
  reason: string;
}

export type DayEmployeeStatus = 'work' | 'off' | 'vacation' | 'holiday' | 'sunday' | 'before_start';

export interface ScheduleDayEmployee {
  employee_id: number;
  name: string;
  color: string;
  status: DayEmployeeStatus;
  is_override: boolean;
  note: string;
}

export interface DaySwapSummary {
  id: number;
  requester_id: number;
  requester_name: string;
  requester_color: string;
  requester_date: string;
  target_id: number;
  target_name: string;
  target_color: string;
  target_date: string;
  reason: string;
  approved_by_name: string | null;
  is_open_swap: boolean;
}

export type VacationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface DayVacationSummary {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_color: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  days_count: number;
  reason: string;
  status: 'pending' | 'approved';
  approved_by_name: string | null;
}

export interface VacationRequestItem {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_color: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  days_count: number;
  reason: string;
  status: VacationStatus;
  created_by: number;
  created_by_name: string;
  admin_decided_by: number | null;
  admin_decided_by_name: string | null;
  admin_decided_at: string | null;
  created_at: string;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  is_sunday: boolean;
  is_before_start: boolean;
  holiday: HolidayItem | null;
  off_employee_ids: number[];
  base_off_employee_id: number | null;
  is_open_off: boolean;
  cascade_info: string | null;
  employees: ScheduleDayEmployee[];
  swaps: DaySwapSummary[];
  vacations: DayVacationSummary[];
  has_manual_change: boolean;
}

export interface EmployeeDayHours {
  date: string;
  weekday: number;
  status: DayEmployeeStatus;
  holiday_name: string | null;
  base_hours: number;
  adjustment_hours: number;
  total_hours: number;
  adjustments: HourAdjustmentRecord[];
  note: string;
}

export interface PeriodHoursSummary {
  from: string;
  to: string;
  total_hours: number;
  base_hours: number;
  adjustment_hours: number;
  worked_days: number;
  off_days: number;
  holiday_days: number;
  sunday_days: number;
  days: EmployeeDayHours[];
}

export interface EmployeeHoursReport {
  employee: PublicEmployee;
  week: PeriodHoursSummary;
  month: PeriodHoursSummary;
}

export type ApprovalState = 'pending' | 'approved' | 'rejected';
export type SwapOverallStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface SwapRequestItem {
  id: number;
  requester_id: number;
  requester_name: string;
  requester_color: string;
  requester_date: string;
  target_id: number;
  target_name: string;
  target_color: string;
  target_date: string;
  reason: string;
  is_open_swap: boolean;
  target_status: ApprovalState;
  target_decided_at: string | null;
  admin_status: ApprovalState;
  admin_decided_by: number | null;
  admin_decided_by_name: string | null;
  admin_decided_at: string | null;
  status: SwapOverallStatus;
  created_at: string;
}
