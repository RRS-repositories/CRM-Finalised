
import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  X,
  MapPin,
  Bell,
  Trash2,
  Edit3,
  Check
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';

type CalendarView = 'month' | 'week' | 'day';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  contactId?: string;
  contactName?: string;
  description?: string;
  type: 'appointment' | 'call' | 'meeting' | 'deadline' | 'reminder';
  color?: string;
}

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  appointment: { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  call: { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-500', text: 'text-green-700 dark:text-green-300' },
  meeting: { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  deadline: { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-500', text: 'text-red-700 dark:text-red-300' },
  reminder: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-500', text: 'text-orange-700 dark:text-orange-300' },
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const Calendar: React.FC = () => {
  const { appointments, addAppointment, contacts, addNotification } = useCRM();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Form state for new/edit event
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    contactId: '',
    description: '',
    type: 'appointment' as CalendarEvent['type'],
  });

  // Convert appointments from context to CalendarEvent format
  const events: CalendarEvent[] = useMemo(() => {
    return appointments.map(apt => {
      const contact = contacts.find(c => c.id === apt.contactId);
      return {
        id: apt.id,
        title: apt.title,
        date: apt.date,
        startTime: apt.date.includes('T') ? apt.date.split('T')[1]?.substring(0, 5) : '09:00',
        endTime: '10:00',
        contactId: apt.contactId,
        contactName: contact?.fullName,
        description: apt.description,
        type: 'appointment' as const,
      };
    });
  }, [appointments, contacts]);

  // Calendar calculations
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const formatDateKey = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const getEventsForDate = (date: Date) => {
    const dateKey = formatDateKey(date);
    return events.filter(e => e.date.startsWith(dateKey));
  };

  // Navigation
  const navigate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(currentDate.getMonth() + direction);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() + direction * 7);
    } else {
      newDate.setDate(currentDate.getDate() + direction);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Event handlers
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setEventForm({
      ...eventForm,
      date: formatDateKey(date),
    });
    setShowEventModal(true);
  };

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
  };

  const handleSaveEvent = () => {
    if (!eventForm.title || !eventForm.date) {
      addNotification('error', 'Please fill in required fields');
      return;
    }

    const dateTime = `${eventForm.date}T${eventForm.startTime}:00`;
    addAppointment({
      title: eventForm.title,
      date: dateTime,
      contactId: eventForm.contactId || undefined,
      description: eventForm.description,
    });

    setShowEventModal(false);
    setEventForm({
      title: '',
      date: '',
      startTime: '09:00',
      endTime: '10:00',
      contactId: '',
      description: '',
      type: 'appointment',
    });
  };

  // Render month view
  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const prevMonthDays = getDaysInMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    const today = new Date();

    const days: React.ReactNode[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, dayNum);
      days.push(
        <div
          key={`prev-${i}`}
          className="min-h-[100px] p-2 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700/50"
          onClick={() => handleDateClick(date)}
        >
          <span className="text-sm text-gray-400">{dayNum}</span>
        </div>
      );
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const isToday = formatDateKey(date) === formatDateKey(today);
      const dayEvents = getEventsForDate(date);

      days.push(
        <div
          key={day}
          className={`min-h-[100px] p-2 border border-gray-100 dark:border-slate-700 cursor-pointer transition-colors
            ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
          onClick={() => handleDateClick(date)}
        >
          <div className="flex justify-between items-start">
            <span className={`text-sm font-medium ${isToday ? 'bg-brand-orange text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700 dark:text-gray-200'}`}>
              {day}
            </span>
            {dayEvents.length > 0 && (
              <span className="text-xs bg-navy-700 text-white px-1.5 py-0.5 rounded">
                {dayEvents.length}
              </span>
            )}
          </div>
          <div className="mt-1 space-y-1">
            {dayEvents.slice(0, 3).map((event) => {
              const colors = EVENT_COLORS[event.type];
              return (
                <div
                  key={event.id}
                  className={`text-xs p-1 rounded truncate border-l-2 ${colors.bg} ${colors.border} ${colors.text}`}
                  onClick={(e) => handleEventClick(event, e)}
                >
                  {event.startTime && <span className="font-medium">{event.startTime} </span>}
                  {event.title}
                </div>
              );
            })}
            {dayEvents.length > 3 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                +{dayEvents.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    }

    // Next month days
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, i);
      days.push(
        <div
          key={`next-${i}`}
          className="min-h-[100px] p-2 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700/50"
          onClick={() => handleDateClick(date)}
        >
          <span className="text-sm text-gray-400">{i}</span>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-slate-900">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-slate-700">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">{days}</div>
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const weekDates = getWeekDates(currentDate);
    const today = new Date();

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-8 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700">
          <div className="p-3 text-center text-sm font-semibold text-gray-500 dark:text-gray-400"></div>
          {weekDates.map((date, i) => {
            const isToday = formatDateKey(date) === formatDateKey(today);
            return (
              <div key={i} className={`p-3 text-center border-l border-gray-100 dark:border-slate-700 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <div className="text-xs text-gray-500 dark:text-gray-400">{DAYS_OF_WEEK[i]}</div>
                <div className={`text-lg font-semibold ${isToday ? 'text-brand-orange' : 'text-gray-700 dark:text-gray-200'}`}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time slots */}
        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-gray-100 dark:border-slate-700">
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 text-right pr-3 border-r border-gray-100 dark:border-slate-700">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {weekDates.map((date, i) => {
                const hourStr = hour.toString().padStart(2, '0');
                const dayEvents = getEventsForDate(date).filter(
                  e => e.startTime?.startsWith(hourStr)
                );
                return (
                  <div
                    key={i}
                    className="min-h-[50px] p-1 border-l border-gray-100 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
                    onClick={() => {
                      const newDate = new Date(date);
                      newDate.setHours(hour);
                      setEventForm({
                        ...eventForm,
                        date: formatDateKey(date),
                        startTime: `${hourStr}:00`,
                        endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
                      });
                      setSelectedDate(newDate);
                      setShowEventModal(true);
                    }}
                  >
                    {dayEvents.map((event) => {
                      const colors = EVENT_COLORS[event.type];
                      return (
                        <div
                          key={event.id}
                          className={`text-xs p-1 rounded mb-1 truncate border-l-2 ${colors.bg} ${colors.border} ${colors.text}`}
                          onClick={(e) => handleEventClick(event, e)}
                        >
                          {event.title}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render day view
  const renderDayView = () => {
    const today = new Date();
    const isToday = formatDateKey(currentDate) === formatDateKey(today);
    const dayEvents = getEventsForDate(currentDate);

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className={`p-4 border-b border-gray-100 dark:border-slate-700 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-slate-900'}`}>
          <div className="text-sm text-gray-500 dark:text-gray-400">{DAYS_OF_WEEK[currentDate.getDay()]}</div>
          <div className={`text-3xl font-bold ${isToday ? 'text-brand-orange' : 'text-gray-700 dark:text-gray-200'}`}>
            {currentDate.getDate()}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Time slots */}
        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map((hour) => {
            const hourStr = hour.toString().padStart(2, '0');
            const hourEvents = dayEvents.filter(e => e.startTime?.startsWith(hourStr));

            return (
              <div key={hour} className="flex border-b border-gray-100 dark:border-slate-700">
                <div className="w-20 p-3 text-sm text-gray-500 dark:text-gray-400 text-right border-r border-gray-100 dark:border-slate-700 shrink-0">
                  {hourStr}:00
                </div>
                <div
                  className="flex-1 min-h-[60px] p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  onClick={() => {
                    setEventForm({
                      ...eventForm,
                      date: formatDateKey(currentDate),
                      startTime: `${hourStr}:00`,
                      endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
                    });
                    setSelectedDate(currentDate);
                    setShowEventModal(true);
                  }}
                >
                  {hourEvents.map((event) => {
                    const colors = EVENT_COLORS[event.type];
                    return (
                      <div
                        key={event.id}
                        className={`p-2 rounded mb-1 border-l-4 ${colors.bg} ${colors.border} cursor-pointer`}
                        onClick={(e) => handleEventClick(event, e)}
                      >
                        <div className={`font-medium ${colors.text}`}>{event.title}</div>
                        {event.contactName && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                            <User size={12} />
                            {event.contactName}
                          </div>
                        )}
                        {event.startTime && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock size={12} />
                            {event.startTime} - {event.endTime || ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-navy-700 rounded-lg">
            <CalendarIcon className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Calendar</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage appointments, calls, and deadlines
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setSelectedDate(new Date());
            setEventForm({
              ...eventForm,
              date: formatDateKey(new Date()),
            });
            setShowEventModal(true);
          }}
          className="flex items-center gap-2 bg-brand-orange text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
        >
          <Plus size={18} />
          New Event
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="text-gray-600 dark:text-gray-300" size={20} />
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ChevronRight className="text-gray-600 dark:text-gray-300" size={20} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium text-navy-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Today
          </button>
          <h2 className="text-lg font-semibold text-navy-900 dark:text-white ml-2">
            {currentDate.toLocaleDateString('en-GB', {
              month: 'long',
              year: 'numeric',
              ...(view === 'day' && { day: 'numeric', weekday: 'long' }),
            })}
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 p-1 rounded-lg">
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize
                ${view === v
                  ? 'bg-white dark:bg-slate-600 text-navy-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-navy-900 dark:hover:text-white'
                }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar View */}
      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {/* Upcoming Events Sidebar */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-4">Upcoming Events</h3>
        <div className="space-y-3">
          {events
            .filter(e => new Date(e.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 5)
            .map((event) => {
              const colors = EVENT_COLORS[event.type];
              const eventDate = new Date(event.date);
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${colors.bg} ${colors.border} cursor-pointer hover:shadow-sm transition-shadow`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="shrink-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {eventDate.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-navy-900 dark:text-white">
                      {eventDate.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${colors.text}`}>{event.title}</div>
                    {event.startTime && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock size={12} />
                        {event.startTime}
                      </div>
                    )}
                    {event.contactName && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <User size={12} />
                        {event.contactName}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {events.filter(e => new Date(e.date) >= new Date()).length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CalendarIcon className="mx-auto mb-2 opacity-50" size={32} />
              <p>No upcoming events</p>
            </div>
          )}
        </div>
      </div>

      {/* New Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-navy-900 dark:text-white">New Event</h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="Event title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Event Type
                </label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as CalendarEvent['type'] })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="appointment">Appointment</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="deadline">Deadline</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Link to Contact
                </label>
                <select
                  value={eventForm.contactId}
                  onChange={(e) => setEventForm({ ...eventForm, contactId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="">No contact linked</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white resize-none"
                  placeholder="Add notes or details..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEvent}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
              >
                <Check size={18} />
                Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className={`p-6 border-b ${EVENT_COLORS[selectedEvent.type].bg} ${EVENT_COLORS[selectedEvent.type].border} border-l-4 rounded-t-xl`}>
              <div className="flex justify-between items-start">
                <div>
                  <span className={`text-xs font-medium uppercase ${EVENT_COLORS[selectedEvent.type].text}`}>
                    {selectedEvent.type}
                  </span>
                  <h3 className="text-lg font-bold text-navy-900 dark:text-white mt-1">
                    {selectedEvent.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                <CalendarIcon size={18} className="shrink-0" />
                <span>
                  {new Date(selectedEvent.date).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {selectedEvent.startTime && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Clock size={18} className="shrink-0" />
                  <span>
                    {selectedEvent.startTime} - {selectedEvent.endTime || 'No end time'}
                  </span>
                </div>
              )}
              {selectedEvent.contactName && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <User size={18} className="shrink-0" />
                  <span>{selectedEvent.contactName}</span>
                </div>
              )}
              {selectedEvent.description && (
                <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedEvent.description}</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
