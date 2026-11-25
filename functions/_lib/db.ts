import {
  DEFAULT_USER_PASSWORD,
  type HolidayOverrideRecord,
  type HourAdjustmentRecord,
  type PublicEmployee,
  type ScheduleOverrideRecord,
  type ShopSettings,
  type UserRole,
} from '../../shared/types';
import { getMondayOfWeek, getTodayBrazilYmd } from '../../shared/schedule';
import { hashPassword } from './auth';
import type { Env } from './http';

const DEFAULT_COLORS = ['#0F766E', '#0284C7', '#7C3AED', '#DB2777', '#D97706', '#059669'];

let seededInIsolate = false;

/**
 * Garante schema atualizado (inclusive coluna must_change_password) e seed inicial
 * com senha padrão 123456 para todos (inclusive admin), exigindo troca no 1º acesso.
 */
export async function ensureSeeded(env: Env): Promise<void> {
  if (seededInIsolate) return;

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
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL DEFAULT 'Lotérica Daimond',
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS swap_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL,
      requester_date TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      target_status TEXT NOT NULL DEFAULT 'pending' CHECK (target_status IN ('pending', 'approved', 'rejected')),
      target_decided_at TEXT,
      admin_status TEXT NOT NULL DEFAULT 'pending' CHECK (admin_status IN ('pending', 'approved', 'rejected')),
      admin_decided_by INTEGER,
      admin_decided_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_decided_by) REFERENCES users(id) ON DELETE SET NULL
    )`),
  ]);

  // Garante coluna must_change_password em bancos já existentes
  const cols = await env.DB.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  const hasMustChange = (cols.results ?? []).some((c) => c.name === 'must_change_password');
  if (!hasMustChange) {
    await env.DB.prepare(
      'ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1',
    ).run();
  }

  const existing = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
  if (existing && existing.total > 0) {
    seededInIsolate = true;
    return;
  }

  const monday = getMondayOfWeek(getTodayBrazilYmd());
  await env.DB.prepare(
    `INSERT OR IGNORE INTO settings (id, shop_name, open_time, close_time, lunch_hours, daily_hours, rotation_start_date)
     VALUES (1, 'Lotérica Daimond', '10:00', '19:00', 1, 8, ?)`,
  )
    .bind(monday)
    .run();

  const defaultHash = await hashPassword(DEFAULT_USER_PASSWORD);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (name, username, password_hash, role, in_rotation, rotation_order, color, active, must_change_password)
     VALUES (?, ?, ?, 'admin', 0, 0, '#0F172A', 1, 1)`,
  )
    .bind('Administrador', 'admin', defaultHash)
    .run();

  const sampleEmployees = [
    { name: 'Ana', username: 'ana', order: 1, color: DEFAULT_COLORS[0] },
    { name: 'Beatriz', username: 'bia', order: 2, color: DEFAULT_COLORS[1] },
    { name: 'Carla', username: 'carla', order: 3, color: DEFAULT_COLORS[2] },
    { name: 'Daniela', username: 'dani', order: 4, color: DEFAULT_COLORS[3] },
    { name: 'Érica', username: 'erica', order: 5, color: DEFAULT_COLORS[4] },
    { name: 'Fernanda', username: 'fernanda', order: 6, color: DEFAULT_COLORS[5] },
  ];

  for (const emp of sampleEmployees) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO users (name, username, password_hash, role, in_rotation, rotation_order, color, active, must_change_password)
       VALUES (?, ?, ?, 'employee', 1, ?, ?, 1, 1)`,
    )
      .bind(emp.name, emp.username, defaultHash, emp.order, emp.color)
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
    shop_name: 'Lotérica Daimond',
    open_time: '10:00',
    close_time: '19:00',
    lunch_hours: 1,
    daily_hours: 8,
    rotation_start_date: getMondayOfWeek(getTodayBrazilYmd()),
  };
}

export async function getAllEmployees(env: Env, includeInactive = false): Promise<PublicEmployee[]> {
  const sql = includeInactive
    ? `SELECT id, name, username, role, in_rotation, rotation_order, color, active, must_change_password
       FROM users ORDER BY active DESC, in_rotation DESC, rotation_order ASC, name ASC`
    : `SELECT id, name, username, role, in_rotation, rotation_order, color, active, must_change_password
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
    must_change_password: number;
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
    must_change_password: Boolean(r.must_change_password),
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
