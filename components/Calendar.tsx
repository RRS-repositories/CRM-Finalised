
import React, { useState, useMemo, useEffect } from 'react';
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
  Check,
  Search,
  Repeat,
  Users,
  UserPlus,
  History,
  CheckCircle,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Task, TaskType, TaskStatus, TaskReminder } from '../types';

type CalendarView = 'month' | 'week' | 'day';

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  appointment: { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  call: { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-500', text: 'text-green-700 dark:text-green-300' },
  meeting: { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  deadline: { bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-500', text: 'text-red-700 dark:text-red-300' },
  reminder: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  follow_up: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: '',
  in_progress: 'ring-2 ring-blue-400',
  completed: 'opacity-60 line-through',
  cancelled: 'opacity-40 line-through',
  rescheduled: 'opacity-50 italic',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const Calendar: React.FC = () => {
  const {
    tasks, fetchTasks, addTask, updateTask, deleteTask, completeTask, rescheduleTask,
    contacts, claims, users, currentUser, addNotification
  } = useCRM();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form state for new/edit event
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    startTime: '09:00',
    endTime: '10:00',
    description: '',
    type: 'appointment' as TaskType,
    // Assignment
    assignedTo: '',
    selfAssigned: true,
    // Recurrence
    isRecurring: false,
    recurrencePattern: '' as 'daily' | 'weekly' | 'monthly' | '',
    recurrenceEndDate: '',
    // Entity Linking
    contactIds: [] as string[],
    claimIds: [] as string[],
    // Reminders
    reminders: [] as { time: string; unit: 'minutes' | 'hours' | 'days' }[],
  });

  // Fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Contact search state for searchable dropdown
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Generate RR-YYMMDD-XXXX format reference ID for a contact
  const getContactRefId = (contact: typeof contacts[0]) => {
    if (contact.clientId) return contact.clientId;

    // Generate RR-YYMMDD-XXXX format from createdAt and id
    const date = contact.createdAt ? new Date(contact.createdAt) : new Date();
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const xxxx = contact.id.toString().padStart(4, '0');

    return `RR-${yy}${mm}${dd}-${xxxx}`;
  };

  // Filter contacts based on search (name or reference ID)
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const search = contactSearch.toLowerCase();
    return contacts.filter(c => {
      const refId = getContactRefId(c).toLowerCase();
      return c.fullName.toLowerCase().includes(search) ||
        refId.includes(search) ||
        c.id.toLowerCase().includes(search);
    });
  }, [contacts, contactSearch]);

  // Get display text for selected contact
  const getContactDisplayText = (contactId: string) => {
    if (!contactId) return '';
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return '';
    return `${contact.fullName} (${getContactRefId(contact)})`;
  };

  // Get tasks for display (tasks already have the right format)
  const getTasksForDate = (date: Date) => {
    const dateKey = formatDateKey(date);
    return tasks.filter(t => t.date.startsWith(dateKey));
  };

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

  // Close event modal with cleanup
  const closeEventModal = () => {
    setShowEventModal(false);
    setContactSearch('');
    setShowContactDropdown(false);
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

  const handleSaveEvent = async () => {
    if (!eventForm.title || !eventForm.date) {
      addNotification('error', 'Please fill in required fields');
      return;
    }

    // Convert reminder times to actual timestamps
    const reminderTimestamps: TaskReminder[] = eventForm.reminders.map((r, idx) => {
      const eventDate = new Date(`${eventForm.date}T${eventForm.startTime || '09:00'}:00`);
      let reminderTime = new Date(eventDate);

      const timeValue = parseInt(r.time) || 0;
      if (r.unit === 'minutes') {
        reminderTime.setMinutes(reminderTime.getMinutes() - timeValue);
      } else if (r.unit === 'hours') {
        reminderTime.setHours(reminderTime.getHours() - timeValue);
      } else if (r.unit === 'days') {
        reminderTime.setDate(reminderTime.getDate() - timeValue);
      }

      return {
        id: `temp_${idx}`,
        taskId: '',
        reminderTime: reminderTime.toISOString(),
        reminderType: 'in_app' as const,
        isSent: false
      };
    });

    const taskData = {
      title: eventForm.title,
      description: eventForm.description,
      type: eventForm.type,
      date: eventForm.date,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      assignedTo: eventForm.selfAssigned ? currentUser?.id : eventForm.assignedTo || undefined,
      isRecurring: eventForm.isRecurring,
      recurrencePattern: eventForm.isRecurring ? eventForm.recurrencePattern as 'daily' | 'weekly' | 'monthly' : undefined,
      recurrenceEndDate: eventForm.isRecurring ? eventForm.recurrenceEndDate : undefined,
      contactIds: eventForm.contactIds,
      claimIds: eventForm.claimIds,
      reminders: reminderTimestamps,
    };

    if (isEditing && selectedTask) {
      await updateTask(selectedTask.id, taskData);
    } else {
      await addTask(taskData);
    }

    closeEventModal();
    resetEventForm();
  };

  const resetEventForm = () => {
    setEventForm({
      title: '',
      date: '',
      startTime: '09:00',
      endTime: '10:00',
      description: '',
      type: 'appointment',
      assignedTo: '',
      selfAssigned: true,
      isRecurring: false,
      recurrencePattern: '',
      recurrenceEndDate: '',
      contactIds: [],
      claimIds: [],
      reminders: [],
    });
    setIsEditing(false);
    setSelectedTask(null);
  };

  const handleTaskClick = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTask(task);
  };

  const handleEditTask = (task: Task) => {
    setEventForm({
      title: task.title,
      date: task.date.split('T')[0],
      startTime: task.startTime || '09:00',
      endTime: task.endTime || '10:00',
      description: task.description || '',
      type: task.type,
      assignedTo: task.assignedTo || '',
      selfAssigned: task.assignedTo === currentUser?.id,
      isRecurring: task.isRecurring,
      recurrencePattern: task.recurrencePattern || '',
      recurrenceEndDate: task.recurrenceEndDate || '',
      contactIds: task.contactIds || [],
      claimIds: task.claimIds || [],
      reminders: [],
    });
    setIsEditing(true);
    setSelectedTask(task);
    setShowEventModal(true);
  };

  const handleCompleteTask = async (taskId: string) => {
    await completeTask(taskId);
    setSelectedTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId);
      setSelectedTask(null);
    }
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
      const dayEvents = getTasksForDate(date);

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
            {dayEvents.slice(0, 3).map((task) => {
              const colors = EVENT_COLORS[task.type] || EVENT_COLORS.appointment;
              const statusStyle = STATUS_STYLES[task.status] || '';
              return (
                <div
                  key={task.id}
                  className={`text-xs p-1 rounded truncate border-l-2 ${colors.bg} ${colors.border} ${colors.text} ${statusStyle}`}
                  onClick={(e) => handleTaskClick(task, e)}
                >
                  {task.isRecurring && <Repeat size={10} className="inline mr-1" />}
                  {task.startTime && <span className="font-medium">{task.startTime} </span>}
                  {task.title}
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
                const dayEvents = getTasksForDate(date).filter(
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
                    {dayEvents.map((task) => {
                      const colors = EVENT_COLORS[task.type] || EVENT_COLORS.appointment;
                      const statusStyle = STATUS_STYLES[task.status] || '';
                      return (
                        <div
                          key={task.id}
                          className={`text-xs p-1 rounded mb-1 truncate border-l-2 ${colors.bg} ${colors.border} ${colors.text} ${statusStyle}`}
                          onClick={(e) => handleTaskClick(task, e)}
                        >
                          {task.isRecurring && <Repeat size={10} className="inline mr-1" />}
                          {task.title}
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
    const dayEvents = getTasksForDate(currentDate);

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
                  {hourEvents.map((task) => {
                    const colors = EVENT_COLORS[task.type] || EVENT_COLORS.appointment;
                    const statusStyle = STATUS_STYLES[task.status] || '';
                    const contactNames = task.linkedContacts?.map(c => c.name).join(', ');
                    return (
                      <div
                        key={task.id}
                        className={`p-2 rounded mb-1 border-l-4 ${colors.bg} ${colors.border} cursor-pointer ${statusStyle}`}
                        onClick={(e) => handleTaskClick(task, e)}
                      >
                        <div className={`font-medium ${colors.text} flex items-center gap-1`}>
                          {task.isRecurring && <Repeat size={12} />}
                          {task.status === 'completed' && <CheckCircle size={12} />}
                          {task.title}
                        </div>
                        {contactNames && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                            <User size={12} />
                            {contactNames}
                          </div>
                        )}
                        {task.assignedToName && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <UserPlus size={12} />
                            {task.assignedToName}
                          </div>
                        )}
                        {task.startTime && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Clock size={12} />
                            {task.startTime} - {task.endTime || ''}
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

      {/* Upcoming Tasks Sidebar */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <h3 className="text-lg font-bold text-navy-900 dark:text-white mb-4">Upcoming Tasks</h3>
        <div className="space-y-3">
          {tasks
            .filter(t => new Date(t.date) >= new Date() && t.status !== 'completed' && t.status !== 'cancelled')
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 5)
            .map((task) => {
              const colors = EVENT_COLORS[task.type] || EVENT_COLORS.appointment;
              const taskDate = new Date(task.date);
              const contactNames = task.linkedContacts?.map(c => c.name).join(', ');
              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${colors.bg} ${colors.border} cursor-pointer hover:shadow-sm transition-shadow`}
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="shrink-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {taskDate.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </div>
                    <div className="text-lg font-bold text-navy-900 dark:text-white">
                      {taskDate.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${colors.text} flex items-center gap-1`}>
                      {task.isRecurring && <Repeat size={12} />}
                      {task.title}
                    </div>
                    {task.startTime && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock size={12} />
                        {task.startTime}
                      </div>
                    )}
                    {contactNames && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <User size={12} />
                        {contactNames}
                      </div>
                    )}
                    {task.assignedToName && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <UserPlus size={12} />
                        {task.assignedToName}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {tasks.filter(t => new Date(t.date) >= new Date() && t.status !== 'completed').length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CalendarIcon className="mx-auto mb-2 opacity-50" size={32} />
              <p>No upcoming tasks</p>
            </div>
          )}
        </div>
      </div>

      {/* New/Edit Task Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-navy-900 dark:text-white">
                {isEditing ? 'Edit Task' : 'New Task'}
              </h3>
              <button
                onClick={closeEventModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                  placeholder="Task title"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Task Type
                </label>
                <select
                  value={eventForm.type}
                  onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as TaskType })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white"
                >
                  <option value="appointment">Appointment</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="deadline">Deadline</option>
                  <option value="reminder">Reminder</option>
                  <option value="follow_up">Follow-up</option>
                </select>
              </div>

              {/* Date and Time */}
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

              {/* Assignment Section */}
              <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <UserPlus size={16} />
                  Assignment
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={eventForm.selfAssigned}
                      onChange={(e) => setEventForm({
                        ...eventForm,
                        selfAssigned: e.target.checked,
                        assignedTo: e.target.checked ? '' : eventForm.assignedTo
                      })}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Self-assign to me</span>
                  </label>
                  {!eventForm.selfAssigned && (
                    <select
                      value={eventForm.assignedTo}
                      onChange={(e) => setEventForm({ ...eventForm, assignedTo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                    >
                      <option value="">Select team member...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Recurrence Section */}
              <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Repeat size={16} />
                  Recurrence
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={eventForm.isRecurring}
                      onChange={(e) => setEventForm({ ...eventForm, isRecurring: e.target.checked })}
                      className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-300">Recurring task</span>
                  </label>
                  {eventForm.isRecurring && (
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={eventForm.recurrencePattern}
                        onChange={(e) => setEventForm({ ...eventForm, recurrencePattern: e.target.value as any })}
                        className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                      >
                        <option value="">Select pattern...</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <input
                        type="date"
                        value={eventForm.recurrenceEndDate}
                        onChange={(e) => setEventForm({ ...eventForm, recurrenceEndDate: e.target.value })}
                        placeholder="End date"
                        className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Link to Contacts (Multi-select) */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Users size={16} />
                  Link to Contacts
                </label>
                {/* Selected contacts */}
                {eventForm.contactIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {eventForm.contactIds.map(id => {
                      const contact = contacts.find(c => c.id === id);
                      return contact ? (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                          {contact.fullName}
                          <button
                            type="button"
                            onClick={() => setEventForm({
                              ...eventForm,
                              contactIds: eventForm.contactIds.filter(cid => cid !== id)
                            })}
                            className="hover:text-blue-900"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={16} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => {
                      setContactSearch(e.target.value);
                      setShowContactDropdown(true);
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    onBlur={() => setTimeout(() => setShowContactDropdown(false), 200)}
                    placeholder="Search contacts..."
                    className="w-full pl-10 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                  />
                </div>
                {showContactDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredContacts
                      .filter(c => !eventForm.contactIds.includes(c.id))
                      .slice(0, 10)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEventForm({
                              ...eventForm,
                              contactIds: [...eventForm.contactIds, c.id]
                            });
                            setContactSearch('');
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600 dark:text-white"
                        >
                          <span className="font-medium">{c.fullName}</span>
                          <span className="ml-2 text-gray-500 dark:text-gray-400">({getContactRefId(c)})</span>
                        </button>
                      ))}
                    {filteredContacts.filter(c => !eventForm.contactIds.includes(c.id)).length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        No more contacts
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reminders Section */}
              <div className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Bell size={16} />
                  Reminders
                </label>
                <div className="space-y-2">
                  {eventForm.reminders.map((reminder, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={reminder.time}
                        onChange={(e) => {
                          const newReminders = [...eventForm.reminders];
                          newReminders[idx] = { ...reminder, time: e.target.value };
                          setEventForm({ ...eventForm, reminders: newReminders });
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                        min="1"
                      />
                      <select
                        value={reminder.unit}
                        onChange={(e) => {
                          const newReminders = [...eventForm.reminders];
                          newReminders[idx] = { ...reminder, unit: e.target.value as any };
                          setEventForm({ ...eventForm, reminders: newReminders });
                        }}
                        className="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
                      >
                        <option value="minutes">minutes before</option>
                        <option value="hours">hours before</option>
                        <option value="days">days before</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setEventForm({
                            ...eventForm,
                            reminders: eventForm.reminders.filter((_, i) => i !== idx)
                          });
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setEventForm({
                        ...eventForm,
                        reminders: [...eventForm.reminders, { time: '30', unit: 'minutes' }]
                      });
                    }}
                    className="text-sm text-brand-orange hover:text-orange-600 flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Add reminder
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-transparent dark:bg-slate-700 dark:text-white resize-none text-sm"
                  placeholder="Add notes or details..."
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => { closeEventModal(); resetEventForm(); }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEvent}
                className="px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
              >
                <Check size={18} />
                {isEditing ? 'Update Task' : 'Save Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && !showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className={`p-6 border-b ${(EVENT_COLORS[selectedTask.type] || EVENT_COLORS.appointment).bg} ${(EVENT_COLORS[selectedTask.type] || EVENT_COLORS.appointment).border} border-l-4 rounded-t-xl`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium uppercase ${(EVENT_COLORS[selectedTask.type] || EVENT_COLORS.appointment).text}`}>
                      {selectedTask.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      selectedTask.status === 'completed' ? 'bg-green-100 text-green-700' :
                      selectedTask.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                      selectedTask.status === 'rescheduled' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedTask.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-navy-900 dark:text-white mt-1 flex items-center gap-2">
                    {selectedTask.isRecurring && <Repeat size={16} />}
                    {selectedTask.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
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
                  {new Date(selectedTask.date).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {selectedTask.startTime && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Clock size={18} className="shrink-0" />
                  <span>
                    {selectedTask.startTime} - {selectedTask.endTime || 'No end time'}
                  </span>
                </div>
              )}
              {selectedTask.linkedContacts && selectedTask.linkedContacts.length > 0 && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Users size={18} className="shrink-0" />
                  <span>{selectedTask.linkedContacts.map(c => c.name).join(', ')}</span>
                </div>
              )}
              {selectedTask.assignedToName && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <UserPlus size={18} className="shrink-0" />
                  <span>Assigned to: {selectedTask.assignedToName}</span>
                </div>
              )}
              {selectedTask.isRecurring && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Repeat size={18} className="shrink-0" />
                  <span>Repeats {selectedTask.recurrencePattern}</span>
                </div>
              )}
              {selectedTask.reminders && selectedTask.reminders.length > 0 && (
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                  <Bell size={18} className="shrink-0" />
                  <span>{selectedTask.reminders.length} reminder(s) set</span>
                </div>
              )}
              {selectedTask.description && (
                <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedTask.description}</p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-slate-700 flex flex-wrap justify-between gap-3">
              <div className="flex gap-2">
                {selectedTask.status === 'pending' && (
                  <button
                    onClick={() => handleCompleteTask(selectedTask.id)}
                    className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-1 text-sm"
                  >
                    <CheckCircle size={16} />
                    Complete
                  </button>
                )}
                <button
                  onClick={() => handleEditTask(selectedTask)}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-1 text-sm"
                >
                  <Edit3 size={16} />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1 text-sm"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
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
