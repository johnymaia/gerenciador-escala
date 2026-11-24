export type UserRole = 'admin' | 'employee';

export interface PublicEmployee {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  in_rotation: boolean;
  rotation_order: number;
  color: string;
  active: boolean;
}

export interface ShopSettings {
  shop_name: string;
  open_time: string;
  close_time: string;
  lunch_hours: number;
  daily_hours: number;
  rotation_start_date: string; // YYYY-MM-DD (Monday)
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

export interface ScheduleDayEmployee {
  employee_id: number;
  name: string;
  color: string;
  status: 'work' | 'off' | 'holiday' | 'sunday';
  is_override: boolean;
  note: string;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  is_sunday: boolean;
  holiday: HolidayItem | null;
  off_employee_ids: number[];
  base_off_employee_id: number | null;
  employees: ScheduleDayEmployee[];
}

export interface EmployeeDayHours {
  date: string;
  weekday: number;
  status: 'work' | 'off' | 'holiday' | 'sunday';
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
