'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useTimetableService, TimeSlot } from '@/services/api/timetable-service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, Calendar, Clock, BookOpen, GraduationCap } from 'lucide-react';
import { useTenant } from '@/hooks/use-tenant';

const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayLabels: Record<string, string> = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
};

export default function TeacherWeeklySchedule() {
    const { getMySchedule, loading } = useTimetableService();
    const [slots, setSlots] = useState<TimeSlot[]>([]);
    const { tenant } = useTenant();

    useEffect(() => {
        getMySchedule().then(setSlots).catch(console.error);
    }, [getMySchedule]);

    const scheduleByDay = useMemo(() => {
        const grouped: Record<string, TimeSlot[]> = {};
        slots.forEach(slot => {
            const day = slot.day_of_week.toLowerCase();
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(slot);
        });

        // Sort each day's slots by start time
        Object.keys(grouped).forEach(day => {
            grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
        });

        return grouped;
    }, [slots]);

    const allTimeRanges = useMemo(() => {
        const ranges = new Set<string>();
        slots.forEach(s => ranges.add(`${s.start_time}-${s.end_time}`));
        return Array.from(ranges).sort();
    }, [slots]);

    if (loading && slots.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                <p className="text-slate-500 font-medium italic">Loading your personal schedule...</p>
            </div>
        );
    }

    if (slots.length === 0) {
        return (
            <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                <CardContent className="flex flex-col items-center justify-center py-20">
                    <div className="p-4 bg-slate-50 rounded-full mb-4">
                        <Calendar className="w-12 h-12 text-slate-300" />
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-800">No Lessons Scheduled</CardTitle>
                    <CardDescription className="text-center mt-2 max-w-sm">
                        You don't have any lessons assigned in the current timetables.
                        Please contact the administrator if this is incorrect.
                    </CardDescription>
                </CardContent>
            </Card>
        );
    }

    const getSubjectColor = (subjectId: string | undefined) => {
        const colors = [
            'bg-blue-50 border-blue-200 text-blue-700',
            'bg-emerald-50 border-emerald-200 text-emerald-700',
            'bg-violet-50 border-violet-200 text-violet-700',
            'bg-amber-50 border-amber-200 text-amber-700',
            'bg-rose-50 border-rose-200 text-rose-700',
            'bg-cyan-50 border-cyan-200 text-cyan-700',
        ];
        if (!subjectId) return 'bg-slate-50 border-slate-200 text-slate-700';
        const hash = subjectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    return (
        <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50 bg-slate-50/50 pb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
                            <Clock className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">Weekly Schedule</CardTitle>
                            <CardDescription className="font-medium text-slate-500 flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5" />
                                Your personal teaching timetable for the current academic year
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 gap-2" onClick={() => window.print()}>
                            <Printer className="w-4 h-4" />
                            Print Schedule
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[70vh] custom-scrollbar">
                    <table className="w-full border-collapse min-w-[1000px]">
                        <thead className="sticky top-0 z-20 bg-white">
                            <tr className="bg-slate-50/50">
                                <th className="p-3 text-xs font-black uppercase tracking-widest text-slate-400 text-left w-24 border-b border-slate-100 bg-white">Time</th>
                                {daysOfWeek.map(day => (
                                    <th key={day} className="p-3 text-xs font-black uppercase tracking-widest text-slate-400 text-center border-b border-r border-slate-100 last:border-r-0 bg-white">
                                        {dayLabels[day]}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {allTimeRanges.map(range => {
                                const [start, end] = range.split('-');
                                return (
                                    <tr key={range} className="group hover:bg-slate-50/20 transition-colors">
                                        <td className="p-3 border-b border-slate-100 align-top">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-800">{start}</span>
                                                <span className="text-[9px] font-bold text-slate-400">{end}</span>
                                            </div>
                                        </td>
                                        {daysOfWeek.map(day => {
                                            const slot = scheduleByDay[day]?.find(s => s.start_time === start && s.end_time === end);
                                            return (
                                                <td key={day} className="p-1.5 border-b border-r border-slate-100 last:border-r-0 align-top min-h-[80px]">
                                                    {slot ? (
                                                        <div className={`p-2.5 rounded-xl border-2 shadow-sm h-full flex flex-col gap-1.5 transition-transform hover:scale-[1.01] duration-200 ${getSubjectColor(slot.subject_id)}`}>
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-1 opacity-60">
                                                                    <BookOpen className="w-2.5 h-2.5" />
                                                                    <span className="text-[8px] uppercase font-black tracking-wider">Subject</span>
                                                                </div>
                                                                <div className="font-black text-[11px] leading-tight uppercase tracking-tight truncate">
                                                                    {slot.subject_name || 'Subject'}
                                                                </div>
                                                            </div>

                                                            <div className="mt-auto pt-1.5 border-t border-current/10 flex flex-col">
                                                                <div className="flex items-center gap-1 opacity-60">
                                                                    <GraduationCap className="w-2.5 h-2.5" />
                                                                    <span className="text-[8px] uppercase font-black tracking-wider">Class</span>
                                                                </div>
                                                                <div className="text-[10px] font-bold truncate">
                                                                    {slot.name || 'Assigned Class'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="h-full min-h-[60px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-100" />
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
