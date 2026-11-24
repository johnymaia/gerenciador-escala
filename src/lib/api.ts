import type {
  EmployeeHoursReport,
  HolidayItem,
  PublicEmployee,
  ScheduleDay,
  ShopSettings,
  UserRole,
} from '../../shared/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(data.error || 'Erro ao comunicar com o servidor.', res.status);
  }
  return data;
}

export interface AuthResponse {
  user: PublicEmployee;
  settings: ShopSettings;
}

export interface ScheduleResponse {
  today: string;
  from: string;
  to: string;
  settings: ShopSettings;
  employees: PublicEmployee[];
  days: ScheduleDay[];
}

export interface HoursResponse {
  today: string;
  week: { from: string; to: string };
  month: { key: string; from: string; to: string };
  daily_hours: number;
  reports: EmployeeHoursReport[];
}

export interface HolidaysResponse {
  year: number;
  holidays: HolidayItem[];
  optional_suggestions: Array<{ date: string; name: string }>;
}

export const api = {
  me: () => request<AuthResponse>('/api/auth/me'),
  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getSchedule: (from: string, to: string) =>
    request<ScheduleResponse>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  getHours: (weekDate: string, month: string) =>
    request<HoursResponse>(`/api/hours?weekDate=${encodeURIComponent(weekDate)}&month=${encodeURIComponent(month)}`),

  // Admin: Funcionários
  listEmployees: () => request<{ employees: PublicEmployee[] }>('/api/admin/employees'),
  createEmployee: (payload: {
    name: string;
    username: string;
    password: string;
    role: UserRole;
    in_rotation: boolean;
    rotation_order?: number;
    color?: string;
  }) =>
    request<PublicEmployee>('/api/admin/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateEmployee: (
    id: number,
    payload: Partial<{
      name: string;
      username: string;
      password: string;
      role: UserRole;
      in_rotation: boolean;
      rotation_order: number;
      color: string;
      active: boolean;
    }>,
  ) =>
    request<PublicEmployee>(`/api/admin/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteEmployee: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/employees/${id}`, { method: 'DELETE' }),

  // Admin: Feriados
  listHolidays: (year: number) =>
    request<HolidaysResponse>(`/api/admin/holidays?year=${year}`),
  saveHoliday: (payload: { date: string; name?: string; is_closed?: boolean }) =>
    request<{ ok: boolean }>('/api/admin/holidays', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteHoliday: (date: string) =>
    request<{ ok: boolean }>(`/api/admin/holidays/${encodeURIComponent(date)}`, {
      method: 'DELETE',
    }),

  // Admin: Exceções / Trocas de folga
  setScheduleOverride: (payload: {
    date: string;
    employee_id: number;
    status: 'off' | 'work';
    note?: string;
  }) =>
    request<{ ok: boolean }>('/api/admin/overrides', {
      method: 'POST',
      body: JSON.stringify({ action: 'set', ...payload }),
    }),
  swapDaysOff: (payload: {
    date_a: string;
    employee_a: number;
    date_b: string;
    employee_b: number;
    note?: string;
  }) =>
    request<{ ok: boolean }>('/api/admin/overrides', {
      method: 'POST',
      body: JSON.stringify({ action: 'swap', ...payload }),
    }),
  clearScheduleOverride: (date: string, employeeId?: number) => {
    const qs = employeeId ? `?date=${date}&employee_id=${employeeId}` : `?date=${date}`;
    return request<{ ok: boolean }>(`/api/admin/overrides${qs}`, { method: 'DELETE' });
  },

  // Admin: Ajustes de horas
  addHourAdjustment: (payload: {
    date: string;
    employee_id: number;
    hours_delta: number;
    reason?: string;
  }) =>
    request<{ ok: boolean; id: number }>('/api/admin/adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteHourAdjustment: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/adjustments?id=${id}`, { method: 'DELETE' }),

  // Admin: Configurações
  updateConfig: (
    payload: Partial<ShopSettings> & {
      rotation_orders?: Array<{ id: number; rotation_order: number }>;
    },
  ) =>
    request<{ settings: ShopSettings }>('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
