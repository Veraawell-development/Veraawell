import React, { useState, useEffect } from 'react';
import { FiDownload, FiCheck, FiEye, FiArrowLeft, FiClock, FiMoreHorizontal, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ViewContentModal from '../components/ViewContentModal';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import { useToast } from '../hooks/useToast';
import type { Task } from '../types';
import { generateTaskPDF } from '../utils/pdfGenerator';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PersonalTask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

type DragItem = { type: 'clinical' | 'personal'; id: string };

const PendingTasksPage: React.FC = () => {
  // Personal Tasks State
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [newPersonalTask, setNewPersonalTask] = useState('');

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState<'pending' | 'personal' | 'done' | null>(null);

  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const { data: clinicalTasks = { pending: [], completed: [] }, isLoading: loading } = useQuery({
    queryKey: ['patient', 'tasks', user?.userId],
    queryFn: async () => {
      if (!user) return { pending: [], completed: [] };
      const [pendingRes, completedRes] = await Promise.all([
        fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user.userId}?status=pending`, { credentials: 'include' }),
        fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user.userId}?status=completed`, { credentials: 'include' })
      ]);

      if (!pendingRes.ok || !completedRes.ok) throw new Error('Failed to fetch tasks');

      const pendingData = await pendingRes.json();
      const completedData = await completedRes.json();

      const sortTasks = (tasks: any[]) => Array.isArray(tasks)
        ? tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [];

      return {
        pending: sortTasks(pendingData.tasks || []),
        completed: sortTasks(completedData.tasks || [])
      };
    },
    enabled: !!user
  });

  const pendingTasks = clinicalTasks.pending;
  const completedTasks = clinicalTasks.completed;

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: 'pending' | 'completed' }) => {
      const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onMutate: async ({ taskId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['patient', 'tasks', user?.userId] });
      const previousTasks = queryClient.getQueryData(['patient', 'tasks', user?.userId]);
      queryClient.setQueryData(['patient', 'tasks', user?.userId], (old: any) => {
        if (!old) return old;
        const allTasks = [...old.pending, ...old.completed];
        const task = allTasks.find(t => t._id === taskId);
        if (!task) return old;
        const updatedTask = { ...task, status: newStatus };
        return {
          pending: newStatus === 'pending'
            ? [updatedTask, ...old.pending.filter((t: any) => t._id !== taskId)]
            : old.pending.filter((t: any) => t._id !== taskId),
          completed: newStatus === 'completed'
            ? [updatedTask, ...old.completed.filter((t: any) => t._id !== taskId)]
            : old.completed.filter((t: any) => t._id !== taskId),
        };
      });
      return { previousTasks };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['patient', 'tasks', user?.userId], context?.previousTasks);
      showError('Failed to update task status');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'tasks', user?.userId] });
    },
    onSuccess: (data, variables) => {
      showSuccess(`Task marked as ${variables.newStatus}!`);
    }
  });

  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`personalTasks_${user.userId}`);
      if (stored) {
        setPersonalTasks(JSON.parse(stored));
      }
    }
  }, [user]);

  const savePersonalTasks = (tasks: PersonalTask[]) => {
    setPersonalTasks(tasks);
    if (user) {
      localStorage.setItem(`personalTasks_${user.userId}`, JSON.stringify(tasks));
    }
  };

  const handleAddPersonalTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonalTask.trim()) return;
    
    const task: PersonalTask = {
      id: Date.now().toString(),
      title: newPersonalTask.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    savePersonalTasks([task, ...personalTasks]);
    setNewPersonalTask('');
  };

  const togglePersonalTask = (taskId: string, forceStatus?: boolean) => {
    const updated = personalTasks.map(t => 
      t.id === taskId ? { ...t, completed: forceStatus !== undefined ? forceStatus : !t.completed } : t
    );
    savePersonalTasks(updated);
  };

  const deletePersonalTask = (taskId: string) => {
    const updated = personalTasks.filter(t => t.id !== taskId);
    savePersonalTasks(updated);
  };

  const handleUpdateStatus = (taskId: string, newStatus: 'pending' | 'completed') => {
    updateTaskStatusMutation.mutate({ taskId, newStatus });
  };

  const handleDownload = (task: Task) => generateTaskPDF(task);
  const handleView = (task: Task) => { setSelectedTask(task); setViewModalOpen(true); };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, type: 'clinical' | 'personal', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
    // Slightly delay hiding the dragged element so HTML5 drag preview still captures it
    setTimeout(() => {
        const el = document.getElementById(`card-${id}`);
        if (el) el.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent, id: string) => {
    setDraggedItem(null);
    setDragOverCol(null);
    const el = document.getElementById(`card-${id}`);
    if (el) el.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent, col: 'pending' | 'personal' | 'done') => {
    e.preventDefault();
    if (dragOverCol !== col) setDragOverCol(col);
  };

  const handleDrop = async (e: React.DragEvent, targetCol: 'pending' | 'personal' | 'done') => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedItem) return;

    const { type, id } = draggedItem;

    if (type === 'clinical') {
      if (targetCol === 'done' && pendingTasks.find(t => t._id === id)) {
        await handleUpdateStatus(id, 'completed');
      } else if (targetCol === 'pending' && completedTasks.find(t => t._id === id)) {
        await handleUpdateStatus(id, 'pending');
      }
    } else if (type === 'personal') {
      if (targetCol === 'done') {
        togglePersonalTask(id, true);
      } else if (targetCol === 'personal') {
        togglePersonalTask(id, false);
      }
    }
    setDraggedItem(null);
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#00B4D8] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-[13px] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>Loading your board...</p>
        </div>
      </div>
    );
  }

  const pendingPersonalTasks = personalTasks.filter(t => !t.completed);
  const donePersonalTasks = personalTasks.filter(t => t.completed);

  return (
    <div className="h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans selection:bg-[#F0FBFF] overflow-hidden flex flex-col box-border">
      <div className="flex-1 max-w-[1500px] mx-auto w-full px-6 py-6 flex flex-col min-h-0">
        
        {/* Header Section */}
        <div className="mb-6 shrink-0 flex items-center gap-4">
            <button 
                onClick={() => navigate('/patient-dashboard')} 
                className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-[#00B4D8] hover:border-[#00B4D8] hover:shadow-sm transition-all group"
                title="Back to Dashboard"
            >
                <FiArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <h1 className="text-[24px] font-extrabold text-gray-800 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                Tasks Board
            </h1>
        </div>

        {/* Board Container */}
        <div className="flex-1 flex flex-col lg:flex-row items-stretch justify-center gap-6 overflow-x-auto pb-4 custom-scrollbar min-h-0">
            
            {/* COLUMN 1: CLINICAL TASKS */}
            <div 
                className={`w-full lg:w-[350px] shrink-0 rounded-[24px] p-5 border flex flex-col h-full transition-all duration-300 ${dragOverCol === 'pending' ? 'bg-[#F0FBFF]/50 border-[#00B4D8]/30 shadow-inner' : 'bg-gray-50/80 border-gray-100'}`}
                onDragOver={(e) => handleDragOver(e, 'pending')}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, 'pending')}
            >
                <div className="flex items-center justify-between mb-5 px-1 shrink-0">
                    <h2 className="text-[14px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Clinical Tasks
                        <span className="bg-white text-gray-500 text-[11px] px-2 py-0.5 rounded-full border border-gray-200 shadow-sm">
                            {pendingTasks.length}
                        </span>
                    </h2>
                    <FiMoreHorizontal className="text-gray-400 w-5 h-5" />
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2">
                    {pendingTasks.length === 0 ? (
                        <div className="border-2 border-dashed border-gray-200 rounded-[16px] p-8 text-center bg-white/50 h-32 flex items-center justify-center">
                            <p className="text-[13px] font-medium text-gray-400">No pending clinical tasks.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {pendingTasks.map((task) => (
                                <motion.div 
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                    key={task._id}
                                    id={`card-${task._id}`}
                                    draggable
                                    onDragStart={(e: any) => handleDragStart(e, 'clinical', task._id)}
                                    onDragEnd={(e: any) => handleDragEnd(e, task._id)}
                                    onClick={() => handleView(task)}
                                    className="bg-white rounded-[16px] p-5 mb-4 shadow-sm border border-gray-200 hover:border-[#00B4D8] hover:shadow-md transition-all cursor-grab active:cursor-grabbing group"
                                >
                                    <div className="flex justify-between items-start mb-3 pointer-events-none">
                                        <span className="bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border border-orange-100/50">
                                            Assigned
                                        </span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(task._id, 'completed'); }}
                                            className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-[#00B4D8] hover:border-[#00B4D8] hover:text-white transition-all pointer-events-auto"
                                        >
                                            <FiCheck className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <h3 className="text-[15px] font-bold text-gray-800 mb-2 leading-tight pointer-events-none">{task.title || 'Untitled Task'}</h3>
                                    <p className="text-[13px] text-gray-500 line-clamp-2 mb-4 leading-relaxed pointer-events-none">{task.description || 'No description provided.'}</p>
                                    <div className="flex items-center justify-between border-t border-gray-50 pt-4 mt-auto pointer-events-none">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-full bg-[#F0FBFF] border border-[#BDEBFF] flex items-center justify-center text-[#0096B4] text-[11px] font-bold uppercase">
                                                {task.doctorId?.firstName?.[0] || 'D'}{task.doctorId?.lastName?.[0] || 'R'}
                                            </div>
                                            <span className="text-[11px] font-bold text-gray-500">Dr. {task.doctorId?.lastName || 'Unknown'}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* COLUMN 2: MY OWN TASKS */}
            <div 
                className={`w-full lg:w-[350px] shrink-0 rounded-[24px] p-5 border border-dashed flex flex-col h-full transition-all duration-300 shadow-[0_0_15px_-3px_rgba(0,180,216,0.05)] ${dragOverCol === 'personal' ? 'bg-[#F0FBFF]/70 border-[#00B4D8]' : 'bg-white/60 border-[#00B4D8]/30'}`}
                onDragOver={(e) => handleDragOver(e, 'personal')}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, 'personal')}
            >
                <div className="flex items-center justify-between mb-5 px-1 shrink-0">
                    <h2 className="text-[14px] font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        My Own Tasks
                        <span className="bg-[#F0FBFF] text-[#00B4D8] text-[11px] px-2 py-0.5 rounded-full font-bold">
                            {pendingPersonalTasks.length}
                        </span>
                    </h2>
                </div>
                
                <form onSubmit={handleAddPersonalTask} className="mb-4 shrink-0">
                    <div className="relative">
                        <input
                            type="text"
                            value={newPersonalTask}
                            onChange={(e) => setNewPersonalTask(e.target.value)}
                            placeholder="Add a personal to-do..."
                            className="w-full bg-white border border-gray-200 rounded-[12px] pl-4 pr-10 py-2.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00B4D8]/30 focus:border-[#00B4D8] transition-all shadow-sm"
                        />
                        <button 
                            type="submit"
                            disabled={!newPersonalTask.trim()}
                            className="absolute right-2 top-1.5 p-1.5 bg-[#00B4D8] text-white rounded-lg disabled:opacity-50 disabled:bg-gray-300 transition-colors"
                        >
                            <FiPlus className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </form>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2">
                    {pendingPersonalTasks.length === 0 ? (
                        <div className="border-2 border-dashed border-gray-100 rounded-[16px] h-32 flex items-center justify-center text-center bg-white/30">
                            <p className="text-[13px] font-medium text-gray-400">Drag items here or add new ones.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {pendingPersonalTasks.map((task) => (
                                <motion.div 
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                    key={task.id}
                                    id={`card-${task.id}`}
                                    draggable
                                    onDragStart={(e: any) => handleDragStart(e, 'personal', task.id)}
                                    onDragEnd={(e: any) => handleDragEnd(e, task.id)}
                                    className="bg-white rounded-[14px] p-4 mb-3 shadow-sm border-y border-r border-l-4 border-y-gray-100 border-r-gray-100 border-l-[#00B4D8] hover:shadow-md transition-all flex items-start gap-3 group cursor-grab active:cursor-grabbing"
                                >
                                    <button 
                                        onClick={() => togglePersonalTask(task.id, true)}
                                        className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-colors border-2 border-gray-300 text-transparent hover:border-[#00B4D8]"
                                    >
                                        <FiCheck className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="flex-1 min-w-0 pointer-events-none">
                                        <p className="text-[14px] font-medium text-gray-700 leading-snug break-words" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {task.title}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => deletePersonalTask(task.id)}
                                        className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-300 hover:text-red-500 p-1 transition-all"
                                    >
                                        <FiTrash2 className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* COLUMN 3: DONE */}
            <div 
                className={`w-full lg:w-[350px] shrink-0 rounded-[24px] p-5 border flex flex-col h-full transition-all duration-300 ${dragOverCol === 'done' ? 'bg-emerald-50/50 border-emerald-200 shadow-inner' : 'bg-gray-50/40 border-gray-100/50'}`}
                onDragOver={(e) => handleDragOver(e, 'done')}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, 'done')}
            >
                <div className="flex items-center justify-between mb-5 px-1 shrink-0">
                    <h2 className="text-[14px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Done
                        <span className="bg-white text-gray-400 text-[11px] px-2 py-0.5 rounded-full border border-gray-100 shadow-sm">
                            {completedTasks.length + donePersonalTasks.length}
                        </span>
                    </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2">
                    {completedTasks.length === 0 && donePersonalTasks.length === 0 ? (
                        <div className="border-2 border-dashed border-gray-100 rounded-[16px] p-8 text-center bg-white/30 h-32 flex items-center justify-center">
                            <p className="text-[13px] font-medium text-gray-400">No completed tasks.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {/* Render Completed Clinical Tasks */}
                            {completedTasks.map((task) => (
                                <motion.div 
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                    key={`clin-${task._id}`}
                                    id={`card-${task._id}`}
                                    draggable
                                    onDragStart={(e: any) => handleDragStart(e, 'clinical', task._id)}
                                    onDragEnd={(e: any) => handleDragEnd(e, task._id)}
                                    onClick={() => handleView(task)}
                                    className="bg-white/80 rounded-[16px] p-5 mb-4 border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing opacity-75 hover:opacity-100 group"
                                >
                                    <div className="flex justify-between items-start mb-3 pointer-events-none">
                                        <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border border-emerald-100/50">
                                            Completed
                                        </span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(task._id, 'pending'); }}
                                            className="text-[11px] font-bold text-gray-400 hover:text-orange-500 underline decoration-transparent hover:decoration-orange-500 transition-all uppercase tracking-wide pointer-events-auto"
                                        >
                                            Undo
                                        </button>
                                    </div>
                                    <h3 className="text-[15px] font-bold text-gray-600 mb-2 leading-tight line-through decoration-gray-300 pointer-events-none">{task.title || 'Untitled Task'}</h3>
                                    <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-auto pointer-events-none">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase">
                                                {task.doctorId?.lastName?.[0] || 'D'}
                                            </div>
                                            <span className="text-[11px] font-bold text-gray-400">Dr. {task.doctorId?.lastName || 'Unknown'}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                            
                            {/* Render Completed Personal Tasks */}
                            {donePersonalTasks.map((task) => (
                                <motion.div 
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                                    key={`pers-${task.id}`}
                                    id={`card-${task.id}`}
                                    draggable
                                    onDragStart={(e: any) => handleDragStart(e, 'personal', task.id)}
                                    onDragEnd={(e: any) => handleDragEnd(e, task.id)}
                                    className="bg-white/60 rounded-[14px] p-4 mb-3 shadow-sm border-y border-r border-l-4 border-y-gray-100 border-r-gray-100 border-l-gray-300 opacity-60 hover:opacity-100 transition-all flex items-start gap-3 group cursor-grab active:cursor-grabbing"
                                >
                                    <button 
                                        onClick={() => togglePersonalTask(task.id, false)}
                                        className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-colors bg-emerald-100 text-emerald-600 hover:bg-gray-200 hover:text-gray-500"
                                    >
                                        <FiCheck className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="flex-1 min-w-0 pointer-events-none">
                                        <p className="text-[14px] font-medium text-gray-400 line-through leading-snug break-words" style={{ fontFamily: 'Inter, sans-serif' }}>
                                            {task.title}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => deletePersonalTask(task.id)}
                                        className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-300 hover:text-red-500 p-1 transition-all"
                                    >
                                        <FiTrash2 className="w-3.5 h-3.5" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>

        </div>
      </div>

      <ViewContentModal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        title={selectedTask?.title || 'Task Details'}
        content={selectedTask?.description || 'No description available.'}
        date={selectedTask?.dueDate || ''}
        doctorName={selectedTask ? `Dr. ${selectedTask.doctorId?.firstName || ''} ${selectedTask.doctorId?.lastName || ''}` : ''}
        type={selectedTask?.status === 'completed' ? 'Completed Task' : 'Pending Task'}
        onDownload={() => selectedTask && handleDownload(selectedTask)}
      />
    </div>
  );
};

export default PendingTasksPage;
