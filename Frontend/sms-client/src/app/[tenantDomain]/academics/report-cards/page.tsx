'use client';

import { useState, useEffect, useMemo } from 'react';
import { useStudentService } from '@/services/api/student-service';
import { useStudentGradeService } from '@/services/api/student-grade-service';
import { useEnrollmentService } from '@/services/api/enrollment-service';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Printer,
    Download,
    User,
    BookOpen,
    FileText,
    Award,
    TrendingUp,
    Loader2,
    ChevronRight,
    Search,
    School,
    Calendar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useSettingsService } from '@/services/api/settings-service';
import { Settings, Save, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import { format } from 'date-fns';

export default function ReportCardPage() {
    const studentService = useStudentService();
    const gradeService = useStudentGradeService();
    const enrollmentService = useEnrollmentService();

    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [students, setStudents] = useState<any[]>([]);
    const [academicYears, setAcademicYears] = useState<any[]>([]);

    // Selection
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
    const [reportData, setReportData] = useState<any>(null);
    const [academicHistory, setAcademicHistory] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'report-card' | 'history'>('report-card');
    const [studentSearch, setStudentSearch] = useState('');

    // Reporting Config
    const settingsService = useSettingsService();
    const [config, setConfig] = useState<any>({
        periods_per_semester: 3,
        period_names: ["P1", "P2", "P3", "P4", "P5", "P6"],
        semester_names: ["S1", "S2"],
        show_final: true
    });
    const [showConfig, setShowConfig] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);

    const loadInitialData = async () => {
        try {
            const ays = await enrollmentService.getAcademicYears();
            setAcademicYears(ays || []);
            const current = (ays || []).find((a: any) => a.is_current);
            if (current) setSelectedAcademicYear(current.name);

            // Load settings
            try {
                const settings = await settingsService.getTenantSettings();
                if (settings?.settings?.reporting) {
                    setConfig(settings.settings.reporting);
                }
            } catch (settingsErr) {
                console.log('No tenant settings found, using defaults');
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleStudentSearch = async () => {
        if (studentSearch.length < 2) return;
        setSearching(true);
        try {
            const res = await studentService.getStudents({ search: studentSearch });
            setStudents(res.items || []);
        } catch (err) {
            toast.error('Search failed');
        } finally {
            setSearching(false);
        }
    };

    const fetchReportCard = async () => {
        if (!selectedStudentId || !selectedAcademicYear) return;
        setLoading(true);
        setViewMode('report-card');
        try {
            const res = await gradeService.getReportCard(selectedStudentId, selectedAcademicYear);
            setReportData(res);
            setAcademicHistory([]);
        } catch (err) {
            toast.error('Failed to generate report card');
            setReportData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleFetchHistory = async () => {
        if (!selectedStudentId) {
            toast.error('Please select a student first');
            return;
        }
        setLoading(true);
        setViewMode('history');
        try {
            const data = await gradeService.getStudentAcademicHistory(selectedStudentId);
            setAcademicHistory(data);
            setReportData(null);
        } catch (err) {
            toast.error('Failed to fetch academic history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedStudentId && selectedAcademicYear) fetchReportCard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStudentId, selectedAcademicYear]);

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        const element = document.getElementById('report-card-content');
        if (!element) return;

        setLoading(true);
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`ReportCard_${reportData.student_name.replace(/\s+/g, '_')}_${selectedAcademicYear}.pdf`);
            toast.success('Download started');
        } catch (err) {
            console.error(err);
            toast.error('Failed to generate PDF');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            // Attempt to save using the convenience method
            await settingsService.saveSettings({
                reporting: config
            });
            toast.success('Reporting configuration saved');
            setShowConfig(false);
            if (selectedStudentId && selectedAcademicYear) fetchReportCard();
        } catch (err) {
            console.error('Save failed, trying explicit create...', err);
            try {
                const tenantId = (window as any).__tenant_id || ''; // Fallback for safety
                // Fallback: Manually try to create if saveSettings fails
                await settingsService.createTenantSettings({
                    tenant_id: tenantId,
                    settings: { reporting: config },
                    is_active: true
                });
                toast.success('Reporting configuration created');
                setShowConfig(false);
                if (selectedStudentId && selectedAcademicYear) fetchReportCard();
            } catch (createErr) {
                toast.error('Failed to save configuration');
            }
        } finally {
            setSavingConfig(false);
        }
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50/30 min-h-screen print:bg-white print:p-0">
            {/* Header - Hidden on Print */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-extrabold text-indigo-950 flex items-center gap-2">
                        <FileText className="w-8 h-8 text-indigo-600" />
                        Report Card Generator
                    </h1>
                    <p className="text-muted-foreground">Detailed academic performance summaries for individual students.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setShowConfig(!showConfig)} className="gap-2">
                        <Settings className="w-4 h-4" /> Config
                    </Button>
                    <Button variant="outline" onClick={handlePrint} disabled={!reportData} className="gap-2">
                        <Printer className="w-4 h-4" /> Print
                    </Button>
                    <Button
                        onClick={handleDownloadPDF}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                        disabled={!reportData || loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download PDF
                    </Button>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    body {
                        background: white !important;
                    }
                    .print-full-width {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    nav, header, aside, .print-hidden, .no-print {
                        display: none !important;
                    }
                    tr {
                        page-break-inside: avoid;
                    }
                }

                /* CSS Shim for html2canvas compatibility with oklch (Tailwind v4) */
                #report-card-content {
                    --background: 0 0% 100%;
                    --foreground: 222 47% 11%;
                    --card: 0 0% 100%;
                    --card-foreground: 222 47% 11%;
                    --primary: 221 83% 53%;
                    --primary-foreground: 210 40% 98%;
                    --border: 214 32% 91%;
                    --muted: 210 40% 96.1%;
                    --muted-foreground: 215.4 16.3% 46.9%;
                }

                #report-card-content * {
                    color-scheme: light;
                }
            `}</style>

            {showConfig && (
                <Card className="border-indigo-100 bg-indigo-50/30 print:hidden">
                    <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-lg font-black text-indigo-950">Reporting Configuration</CardTitle>
                                <CardDescription>Define how periods and semesters are structured.</CardDescription>
                            </div>
                            <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig} className="bg-indigo-600">
                                {savingConfig ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}
                                Save Settings
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-gray-600">Periods Per Semester</Label>
                                <Select
                                    value={String(config.periods_per_semester)}
                                    onValueChange={(v) => {
                                        const num = parseInt(v);
                                        const names = [];
                                        for (let i = 1; i <= num * 2; i++) names.push(`P${i}`);
                                        setConfig({ ...config, periods_per_semester: num, period_names: names });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select count" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2">2 Periods (P1, P2 / S1, P3, P4 / S2)</SelectItem>
                                        <SelectItem value="3">3 Periods (P1, P2, P3 / S1, ...)</SelectItem>
                                        <SelectItem value="4">4 Periods (P1, P2, P3, P4 / S1, ...)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-[11px]">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>Changing structure will automatically update period names. You can customize them below.</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <Label className="text-xs font-bold text-gray-600">Custom Period Names</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {config.period_names.map((name: string, idx: number) => (
                                    <Input
                                        key={idx}
                                        value={name}
                                        onChange={(e) => {
                                            const newNames = [...config.period_names];
                                            newNames[idx] = e.target.value;
                                            setConfig({ ...config, period_names: newNames });
                                        }}
                                        className="text-xs h-8"
                                    />
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Selector Section - Hidden on Print */}
            <Card className="border-none shadow-sm print:hidden">
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-gray-400">1. Select Academic Year</Label>
                            <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                                <SelectTrigger><SelectValue placeholder="Academic Year" /></SelectTrigger>
                                <SelectContent>
                                    {academicYears.map(ay => <SelectItem key={ay.id} value={ay.name}>{ay.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 col-span-1 md:col-span-2">
                            <Label className="text-[10px] uppercase font-bold text-gray-400">2. Search Student</Label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input
                                        placeholder="Admission # or Name..."
                                        className="pl-10"
                                        value={studentSearch}
                                        onChange={e => setStudentSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleStudentSearch()}
                                    />
                                </div>
                                <Button variant="secondary" onClick={handleStudentSearch} disabled={searching}>
                                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    onClick={handleFetchHistory}
                                    disabled={!selectedStudentId || loading}
                                >
                                    <Award className="w-4 h-4" /> Academic History
                                </Button>
                            </div>
                            {students.length > 0 && !selectedStudentId && (
                                <div className="absolute z-20 mt-1 w-full max-w-[500px] bg-white border rounded-lg shadow-xl overflow-hidden max-h-[300px] overflow-y-auto">
                                    {students.map(s => (
                                        <div
                                            key={s.id}
                                            className="p-3 hover:bg-indigo-50 cursor-pointer flex items-center justify-between border-b last:border-0"
                                            onClick={() => {
                                                setSelectedStudentId(s.id);
                                                setStudentSearch(`${s.first_name} ${s.last_name}`);
                                                setStudents([]);
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs uppercase">
                                                    {s.first_name[0]}{s.last_name[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold">{s.first_name} {s.last_name}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase font-black">ID: {s.admission_number}</p>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-300" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Report Card Content */}
            {loading ? (
                <div className="h-[400px] flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-200" />
                    <p className="text-gray-400 mt-4 font-medium italic">Assembling performance data...</p>
                </div>
            ) : viewMode === 'history' && academicHistory.length > 0 ? (
                <div id="report-card-content" className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-5xl mx-auto print:shadow-none print:border-none print:m-0 print:rounded-none print-full-width">
                    <div className="bg-indigo-950 p-8 text-white flex justify-between items-start">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                                <Award className="w-10 h-10 text-indigo-300" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tighter">Official Academic Transcript</h2>
                                <p className="text-indigo-300 text-sm font-medium mt-1">Multi-Year Academic Performance History</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black uppercase tracking-widest opacity-50">Student ID</p>
                            <p className="text-lg font-mono font-bold">#{selectedStudentId.split('-')[0].toUpperCase()}</p>
                        </div>
                    </div>

                    <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div>
                            <Label className="text-[9px] uppercase font-black text-gray-400 mb-1 block tracking-wider">Student Name</Label>
                            <p className="font-bold text-lg text-gray-900">{studentSearch}</p>
                        </div>
                        <div className="text-right">
                            <Label className="text-[9px] uppercase font-black text-gray-400 mb-1 block tracking-wider">Date Issued</Label>
                            <p className="font-medium text-gray-600 italic text-sm">{format(new Date(), 'MMMM dd, yyyy')}</p>
                        </div>
                    </div>

                    <div className="p-8 space-y-12">
                        {academicHistory.map((year: any, idx: number) => (
                            <div key={idx} className="space-y-4">
                                <div className="flex justify-between items-end border-b-2 border-indigo-900/10 pb-2">
                                    <div>
                                        <h3 className="text-xl font-extrabold text-indigo-950 uppercase tracking-tight">{year.academic_year_name}</h3>
                                        <p className="text-sm font-bold text-indigo-600 uppercase">{year.grade_level}</p>
                                    </div>
                                    <div className="text-right">
                                        <Label className="text-[9px] uppercase font-black text-gray-400 mb-1 block tracking-wider">Annual GPA</Label>
                                        <Badge className="bg-indigo-900 text-white font-mono px-3 py-1 text-base">{year.gpa.toFixed(2)}</Badge>
                                    </div>
                                </div>

                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-none">
                                            <TableHead className="font-black text-gray-400 uppercase text-[10px]">Subject Course</TableHead>
                                            <TableHead className="text-right font-black text-gray-400 uppercase text-[10px]">Score %</TableHead>
                                            <TableHead className="text-right font-black text-gray-400 uppercase text-[10px]">Final Grade</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {year.subjects.map((sub: any, sIdx: number) => (
                                            <TableRow key={sIdx} className="hover:bg-transparent">
                                                <TableCell className="font-bold text-gray-700 py-4">{sub.subject_name}</TableCell>
                                                <TableCell className="text-right font-mono text-gray-600">{sub.final_percentage.toFixed(1)}%</TableCell>
                                                <TableCell className="text-right font-black text-indigo-700 text-lg">{sub.letter_grade}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ))}
                    </div>

                    <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-between items-center italic text-[10px] text-gray-400">
                        <p>This document is an unofficial academic transcript generated by the High School SMS.</p>
                        <p>End of Record</p>
                    </div>
                </div>
            ) : reportData ? (
                <div id="report-card-content" className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-5xl mx-auto print:shadow-none print:border-none print:m-0 print:rounded-none print-full-width">
                    {/* Report Header */}
                    <div className="bg-indigo-950 p-8 text-white flex justify-between items-start">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                                <School className="w-10 h-10 text-indigo-300" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tighter">Academic Progress Report</h2>
                                <div className="flex items-center gap-4 mt-1 opacity-70 text-sm font-medium">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Session {reportData.academic_year}</span>
                                    <span>•</span>
                                    <span>Period: Full Year</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black uppercase tracking-widest opacity-50">Report ID</p>
                            <p className="text-lg font-mono font-bold">#{reportData.student_id.split('-')[0].toUpperCase()}</p>
                        </div>
                    </div>

                    {/* Student Info Bar */}
                    <div className="bg-indigo-50/50 border-b border-indigo-100/50 px-8 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <Label className="text-[9px] uppercase font-black text-indigo-900/40 mb-1 block tracking-wider">Student Name</Label>
                            <p className="font-bold text-gray-900 flex items-center gap-2">
                                <User className="w-4 h-4 text-indigo-400" /> {reportData.student_name}
                            </p>
                        </div>
                        <div>
                            <Label className="text-[9px] uppercase font-black text-indigo-900/40 mb-1 block tracking-wider">Admission #</Label>
                            <p className="font-bold text-gray-900">{reportData.admission_number}</p>
                        </div>
                        <div>
                            <Label className="text-[9px] uppercase font-black text-indigo-900/40 mb-1 block tracking-wider">Level / Grade</Label>
                            <p className="font-bold text-gray-900 uppercase">Grade: {reportData.grade || 'N/A'}</p>
                        </div>
                        <div>
                            <Label className="text-[9px] uppercase font-black text-indigo-900/40 mb-1 block tracking-wider">Cumulative GPA</Label>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-black text-indigo-600">{reportData.gpa?.toFixed(2) || '0.00'}</p>
                                <Badge className="bg-indigo-600 text-white border-none py-0 px-2 h-5 text-[10px]">PASS</Badge>
                            </div>
                        </div>
                    </div>

                    {/* Performance Table */}
                    <div className="p-8">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-indigo-100 hover:bg-transparent">
                                    <TableHead className="text-indigo-950 font-black uppercase text-[10px] w-[200px]">Subject / Unit</TableHead>
                                    {(reportData.active_columns || []).map((col: string) => (
                                        <TableHead
                                            key={col}
                                            className={`text-center text-indigo-950 font-black uppercase text-[10px] ${['S1', 'S2', 'Final'].includes(col) ? 'bg-indigo-50' : 'bg-slate-50/50'}`}
                                        >
                                            {col}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reportData.subjects.map((sub: any) => (
                                    <TableRow key={sub.subject_id} className="border-indigo-50 group hover:bg-indigo-50/5 transition-colors">
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                                                    <BookOpen className="w-3 h-3" />
                                                </div>
                                                <span className="font-bold text-gray-800 text-sm">{sub.subject_name}</span>
                                            </div>
                                        </TableCell>
                                        {(reportData.active_columns || []).map((col: string) => {
                                            let value: any = '-';
                                            if (col.startsWith('P')) value = sub.period_grades?.[col];
                                            else if (col.startsWith('S')) value = sub.semester_grades?.[col];
                                            else if (col === 'Final') value = sub.percentage;

                                            const displayValue = value !== null && value !== undefined && value !== '-' ? Math.round(Number(value)) : '-';
                                            const isSummary = ['S1', 'S2', 'Final'].includes(col);

                                            return (
                                                <TableCell
                                                    key={col}
                                                    className={`text-center text-sm ${isSummary ? 'font-black text-indigo-700 bg-indigo-50/30' : 'font-bold text-gray-500 bg-slate-50/30'}`}
                                                >
                                                    {displayValue}{col === 'Final' && displayValue !== '-' ? '%' : ''}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Attendance Summary Grid */}
                    <div className="mx-8 mb-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar className="w-4 h-4 text-indigo-600" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-950">Attendance Summary</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(reportData.active_columns || []).filter((c: string) => c.startsWith('P')).map((p: string) => {
                                const att = reportData.period_attendance?.[p] || { absent: 0, late: 0, total: 0 };
                                return (
                                    <div key={p} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{p}</span>
                                            <span className="text-[9px] font-bold text-gray-400">Days: {att.total}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-gray-500 font-medium">Absent</span>
                                                <span className={`font-bold ${att.absent > 0 ? 'text-red-500' : 'text-gray-400'}`}>{att.absent}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-gray-500 font-medium">Tardy</span>
                                                <span className={`font-bold ${att.late > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{att.late}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer / Summary */}
                    <div className="mx-8 mb-8 p-6 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-xs font-black uppercase text-gray-400 flex items-center gap-2 mb-3">
                                <TrendingUp className="w-3 h-3" /> Teacher Remarks
                            </h4>
                            <div className="space-y-4">
                                {Object.entries(reportData.remarks || {}).filter(([p]) => reportData.active_columns?.includes(p)).map(([period, text]) => (
                                    <div key={period}>
                                        <Badge variant="outline" className="text-[9px] mb-1 font-black text-indigo-600 border-indigo-100 bg-indigo-50/50">{period}</Badge>
                                        <p className="text-sm text-gray-600 italic leading-relaxed">{text as string}</p>
                                    </div>
                                ))}
                                {Object.keys(reportData.remarks || {}).length === 0 && (
                                    <p className="text-sm text-gray-400 italic">
                                        {reportData.gpa >= 3.0
                                            ? "Excellent academic performance. Maintain the high standard."
                                            : "Satisfactory progress. Continued focus is recommended."}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-end justify-center">
                            <div className="flex items-center gap-3">
                                <Award className="w-8 h-8 text-indigo-600" />
                                <div>
                                    <p className="text-[10px] font-black uppercase text-gray-400">Academic Standing</p>
                                    <p className="text-lg font-black text-indigo-950 uppercase tracking-tighter">
                                        {reportData.gpa >= 3.5 ? 'HONOR ROLL' : 'COMPLETED'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Signature Area */}
                    <div className="px-8 pb-12 grid grid-cols-3 gap-12 mt-12">
                        {['class_teacher', 'academic_dean', 'principal'].map((key) => (
                            <div key={key} className="border-t border-gray-200 pt-4 text-center">
                                {reportData.signatures?.[key] ? (
                                    <img src={reportData.signatures[key]} alt="Signature" className="mx-auto h-12 mb-2 object-contain" />
                                ) : (
                                    <div className="h-12 flex items-center justify-center mb-2 italic text-gray-300 text-[10px] uppercase font-bold tracking-widest">
                                        Pending Signature
                                    </div>
                                )}
                                <p className="text-[10px] font-black uppercase text-gray-950 mb-0.5">
                                    {reportData.signatory_names?.[key] || key.replace('_', ' ')}
                                </p>
                                <p className="text-[8px] font-medium text-gray-400 uppercase tracking-widest">
                                    Official Signature
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="bg-gray-50 px-8 py-3 text-center border-t border-gray-100">
                        <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest">
                            Generated on {format(new Date(reportData.generated_date), 'PPP')} • Official Academic Document
                        </p>
                    </div>
                </div>
            ) : (
                <div className="h-[300px] border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center bg-gray-50/50">
                    <FileText className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium">Search and select a student to generate their report card.</p>
                </div>
            )}
        </div>
    );
}
