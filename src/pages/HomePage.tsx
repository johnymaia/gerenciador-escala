import { CalendarDays, Clock, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDaysYmd } from '../../shared/holidays';
import { getMondayOfWeek, getTodayBrazilYmd } from '../../shared/schedule';
import type { PublicEmployee, ScheduleDay, ShopSettings } from '../../shared/types';
import { api } from '../lib/api';
import {
  formatDayMonth,
  formatFriendlyDate,
  formatHours,
  weekdayFull,
  weekdayShort,
} from '../lib/format';

interface HomePageProps {
  user: PublicEmployee;
  settings: ShopSettings;
  onNavigate: (tab: 'schedule' | 'hours') => void;
}

export function HomePage({ user, settings, onNavigate }: HomePageProps) {
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [today, setToday] = useState(getTodayBrazilYmd());
  const [weekHours, setWeekHours] = useState<number | null>(null);
  const [monthHours, setMonthHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const nowYmd = getTodayBrazilYmd();
    const thisMonday = getMondayOfWeek(nowYmd);
    const threeWeeksEnd = addDaysYmd(thisMonday, 20);

    Promise.all([
      api.getSchedule(thisMonday, threeWeeksEnd),
      api.getHours(nowYmd, nowYmd.slice(0, 7)),
    ])
      .then(([schedRes, hoursRes]) => {
        if (!active) return;
        setDays(schedRes.days);
        setToday(schedRes.today);
        const myReport = hoursRes.reports.find((r) => r.employee.id === user.id);
        if (myReport) {
          setWeekHours(myReport.week.total_hours);
          setMonthHours(myReport.month.total_hours);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user.id]);

  const thisWeekDays = days.slice(0, 7);
  const nextWeekDays = days.slice(7, 14);

  const myThisWeekOff = thisWeekDays.find((d) => d.off_employee_ids.includes(user.id));
  const myNextWeekOff = nextWeekDays.find((d) => d.off_employee_ids.includes(user.id));
  const upcomingHoliday = days.find((d) => d.holiday && d.date >= today);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-44 animate-pulse rounded-3xl bg-white border border-slate-200/70" />
        <div className="h-28 animate-pulse rounded-2xl bg-white border border-slate-200/70" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cartão principal: Sua folga desta semana */}
      <section className="relative overflow-hidden rounded-3xl bg-teal-700 p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <p className="text-xs font-medium uppercase tracking-wider text-teal-100">
          Sua folga desta semana
        </p>

        {myThisWeekOff ? (
          <div className="mt-2">
            <h2 className="text-3xl font-bold tracking-tight">
              {weekdayFull(myThisWeekOff.weekday)}
            </h2>
            <p className="mt-1 text-base text-teal-100">
              {formatFriendlyDate(myThisWeekOff.date)}
              {myThisWeekOff.date === today && (
                <span className="ml-2 inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white">
                  É hoje!
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {user.in_rotation ? 'Sem folga avulsa nesta semana' : 'Fora do rodízio semanal'}
            </h2>
            <p className="mt-1 text-sm text-teal-100">
              {user.in_rotation
                ? 'Semana com feriado — sua folga foi empurrada para o próximo ciclo.'
                : 'Acompanhe a escala completa na aba Escala.'}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-sm">
          <div>
            <span className="text-teal-200">Próxima semana: </span>
            <span className="font-semibold text-white">
              {myNextWeekOff
                ? `${weekdayShort(myNextWeekOff.weekday)}, ${formatDayMonth(myNextWeekOff.date)}`
                : 'A definir'}
            </span>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-teal-50">
            Domingos sempre folga
          </span>
        </div>
      </section>

      {/* Feriado próximo */}
      {upcomingHoliday && upcomingHoliday.holiday && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Próximo feriado:</span>{' '}
            {weekdayShort(upcomingHoliday.weekday)}, {formatDayMonth(upcomingHoliday.date)} —{' '}
            {upcomingHoliday.holiday.name}
          </div>
        </div>
      )}

      {/* Linha visual da semana atual */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Sua semana</h3>
          <span className="text-xs text-slate-400">
            {settings.open_time} – {settings.close_time}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {thisWeekDays.map((day) => {
            const isToday = day.date === today;
            const isMyOff = day.off_employee_ids.includes(user.id);
            const isHoliday = Boolean(day.holiday);
            const isSun = day.is_sunday;

            let pillClass = 'border-slate-200/80 bg-white text-slate-700';
            let label = 'Trab.';
            if (isMyOff) {
              pillClass = 'border-emerald-300 bg-emerald-50 text-emerald-800';
              label = 'Folga';
            } else if (isHoliday) {
              pillClass = 'border-amber-200 bg-amber-50 text-amber-800';
              label = 'Fer.';
            } else if (isSun) {
              pillClass = 'border-slate-200/60 bg-slate-100/80 text-slate-400';
              label = 'Dom';
            }

            return (
              <div
                key={day.date}
                className={`flex flex-col items-center rounded-xl border px-1 py-2 text-center transition ${pillClass} ${
                  isToday ? 'ring-2 ring-teal-600 ring-offset-1' : ''
                }`}
              >
                <span className="text-[10px] font-medium uppercase opacity-75">
                  {weekdayShort(day.weekday)}
                </span>
                <span className="mt-0.5 text-sm font-bold tabular-nums">
                  {day.date.slice(8, 10)}
                </span>
                <span className="mt-1 text-[10px] font-semibold">{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('hours')}
          className="flex flex-col items-start rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition hover:border-slate-300 active:scale-[0.99]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Clock className="h-4 w-4" />
          </div>
          <span className="mt-3 text-xs font-medium text-slate-500">Minhas horas</span>
          <span className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
            {weekHours !== null ? formatHours(weekHours) : '—'}
            <span className="ml-1 text-xs font-normal text-slate-400">sem.</span>
          </span>
          {monthHours !== null && (
            <span className="text-xs text-slate-400 tabular-nums">
              {formatHours(monthHours)} no mês
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onNavigate('schedule')}
          className="flex flex-col items-start rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition hover:border-slate-300 active:scale-[0.99]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <CalendarDays className="h-4 w-4" />
          </div>
          <span className="mt-3 text-xs font-medium text-slate-500">Escala da equipe</span>
          <span className="mt-0.5 text-base font-semibold text-slate-900">Ver todas</span>
          <span className="text-xs text-slate-400">Semana e mês</span>
        </button>
      </div>

      {/* Info de folga hoje */}
      {(() => {
        const todayData = thisWeekDays.find((d) => d.date === today);
        if (!todayData || todayData.is_sunday || todayData.holiday) return null;
        const offToday = todayData.employees.filter((e) => e.status === 'off');
        if (offToday.length === 0) return null;
        return (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Sun className="h-4 w-4 text-teal-600" />
              <span>Folga hoje:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {offToday.map((emp) => (
                <span
                  key={emp.employee_id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: emp.color }}
                  />
                  {emp.name}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
