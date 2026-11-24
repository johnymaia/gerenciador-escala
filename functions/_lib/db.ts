import type {
  HolidayOverrideRecord,
  HourAdjustmentRecord,
  PublicEmployee,
  ScheduleOverrideRecord,
  ShopSettings,
  UserRole,
} from '../../shared/types';
import { getMondayOfWeek, getTodayBrazilYmd } from '../../shared/schedule';
import { hashPassword } from './auth';
import type { Env } from './http';

const DEFAULT_COLORS = ['#0F766E', '#0284C7', '#7C3AED', '#DB2777', '#D97706', '#059669'];

let seededInIsolate = false;

/**
 * Garante que na primeira inicialização (local ou produção) exista o admin padrão
 * e as 6 funcionárias iniciais de exemplo para o site já abrir pronto para uso.
 */
export async function ensureSeeded(env: Env): Promise<void> {
  if (seededInIsolate) return;

  // Garante criação automática das tabelas caso o banco D1 acabe de ser criado no painel
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
      in_rotation INTEGER NOT NULL DEFAULT 1,
      rotation_order INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#0F766E',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL DEFAULT 'Lotérica',
      open_time TEXT NOT NULL DEFAULT '10:00',
      close_time TEXT NOT NULL DEFAULT '19:00',
      lunch_hours REAL NOT NULL DEFAULT 1,
      daily_hours REAL NOT NULL DEFAULT 8,
      rotation_start_date TEXT NOT NULL DEFAULT '2026-11-23'
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS holiday_overrides (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 1,
      is_custom INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_overrides (
      date TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('off', 'work')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (date, employee_id),
      FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS hour_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      employee_id INTEGER NOT NULL,
      hours_delta REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
  ]);

  const existing = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
  if (existing && existing.total > 0) {
    seededInIsolate = true;
    return;
  }

  const monday = getMondayOfWeek(getTodayBrazilYmd());
  await env.DB.prepare(
    `INSERT OR IGNORE INTO settings (id, shop_name, open_time, close_time, lunch_hours, daily_hours, rotation_start_date)
     VALUES (1, 'Lotérica', '10:00', '19:00', 1, 8, ?)`,
  )
    .bind(monday)
    .run();

  const adminHash = await hashPassword('admin123');
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (name, username, password_hash, role, in_rotation, rotation_order, color, active)
     VALUES (?, ?, ?, 'admin', 0, 0, '#0F172A', 1)`,
  )
    .bind('Administrador', 'admin', adminHash)
    .run();

  const sampleEmployees = [
    { name: 'Ana', username: 'ana', order: 1, color: DEFAULT_COLORS[0] },
    { name: 'Beatriz', username: 'bia', order: 2, color: DEFAULT_COLORS[1] },
    { name: 'Carla', username: 'carla', order: 3, color: DEFAULT_COLORS[2] },
    { name: 'Daniela', username: 'dani', order: 4, color: DEFAULT_COLORS[3] },
    { name: 'Érica', username: 'erica', order: 5, color: DEFAULT_COLORS[4] },
    { name: 'Fernanda', username: 'fernanda', order: 6, color: DEFAULT_COLORS[5] },
  ];

  const empHash = await hashPassword('123456');
  for (const emp of sampleEmployees) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (name, username, password_hash, role, in_rotation, rotation_order, color, active)
       VALUES (?, ?, ?, 'employee', 1, ?, ?, 1)`,
    )
      .bind(emp.name, emp.username, empHash, emp.order, emp.color)
      .run();
  }

  seededInIsolate = true;
}

export async function getSettings(env: Env): Promise<ShopSettings> {
  const row = await env.DB.prepare(
    `SELECT shop_name, open_time, close_time, lunch_hours, daily_hours, rotation_start_date
     FROM settings WHERE id = 1`,
  ).first<ShopSettings>();

  if (row) return row;
  return {
    shop_name: 'Lotérica',
    open_time: '10:00',
    close_time: '19:00',
    lunch_hours: 1,
    daily_hours: 8,
    rotation_start_date: getMondayOfWeek(getTodayBrazilYmd()),
  };
}

export async function getAllEmployees(env: Env, includeInactive = false): Promise<PublicEmployee[]> {
  const sql = includeInactive
    ? `SELECT id, name, username, role, in_rotation, rotation_order, color, active
       FROM users ORDER BY active DESC, in_rotation DESC, rotation_order ASC, name ASC`
    : `SELECT id, name, username, role, in_rotation, rotation_order, color, active
       FROM users WHERE active = 1 ORDER BY in_rotation DESC, rotation_order ASC, name ASC`;

  const { results } = await env.DB.prepare(sql).all<{
    id: number;
    name: string;
    username: string;
    role: UserRole;
    in_rotation: number;
    rotation_order: number;
    color: string;
    active: number;
  }>();

  return (results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    role: r.role,
    in_rotation: Boolean(r.in_rotation),
    rotation_order: r.rotation_order,
    color: r.color,
    active: Boolean(r.active),
  }));
}

export async function getHolidayOverrides(env: Env): Promise<HolidayOverrideRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT date, name, is_closed, is_custom FROM holiday_overrides ORDER BY date ASC`,
  ).all<{ date: string; name: string; is_closed: number; is_custom: number }>();

  return (results ?? []).map((r) => ({
    date: r.date,
    name: r.name,
    is_closed: Boolean(r.is_closed),
    is_custom: Boolean(r.is_custom),
  }));
}

export async function getScheduleOverrides(
  env: Env,
  from: string,
  to: string,
): Promise<ScheduleOverrideRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT date, employee_id, status, note FROM schedule_overrides WHERE date >= ? AND date <= ?`,
  )
    .bind(from, to)
    .all<ScheduleOverrideRecord>();

  return results ?? [];
}

export async function getHourAdjustments(
  env: Env,
  from: string,
  to: string,
  employeeId?: number,
): Promise<HourAdjustmentRecord[]> {
  if (employeeId !== undefined) {
    const { results } = await env.DB.prepare(
      `SELECT id, date, employee_id, hours_delta, reason
       FROM hour_adjustments
       WHERE employee_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC, id ASC`,
    )
      .bind(employeeId, from, to)
      .all<HourAdjustmentRecord>();
    return results ?? [];
  }

  const { results } = await env.DB.prepare(
    `SELECT id, date, employee_id, hours_delta, reason
     FROM hour_adjustments
     WHERE date >= ? AND date <= ?
     ORDER BY date ASC, id ASC`,
  )
    .bind(from, to)
    .all<HourAdjustmentRecord>();

  return results ?? [];
}
