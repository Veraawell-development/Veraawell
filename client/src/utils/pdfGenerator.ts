import { doctorDisplayName } from './doctorName';

interface Task {
    _id: string;
    title: string;
    description: string;
    dueDate: string;
    priority: string;
    status: string;
    doctorId: { firstName: string; lastName: string };
    patientId: string; // Task has patientId as string, not object
    createdAt: string;
}

// IST, like every date on the platform — the device's zone could print the
// day before or after the one the therapist set.
const IST = 'Asia/Kolkata';
const istDay = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: IST });

/**
 * The report PDF that lived here is gone — see utils/reportPdf.ts.
 *
 * There were four generators across two libraries, and two of them rendered
 * the same Report with different layouts, so a patient and their doctor could
 * download one session and hold two different-looking documents. This file
 * now owns only the task/homework PDF, which is a genuinely different thing.
 */
const PRIORITY: Record<string, { fill: string; color: string }> = {
    high: { fill: '#fde4e4', color: '#b42318' },
    medium: { fill: '#fdf0d5', color: '#9a6700' },
    low: { fill: '#dcf3e6', color: '#1a7f4b' },
};

/** The task sheet, in the same look as the report (utils/pdfTheme.ts). */
export const buildTaskPdf = async (task: Task) => {
    // Loaded on demand, like reportPdf.ts: a static import put jsPDF (and its
    // html2canvas/DOMPurify dependencies) in the main bundle for every visitor.
    const { jsPDF } = await import('jspdf');
    const theme = await import('./pdfTheme');
    const { C, MARGIN, CONTENT_W, BODY_BOTTOM, BODY_LEAD } = theme;
    const doc = new jsPDF({ compress: true });
    const logo = await theme.loadLogo();

    const priority = (task.priority || 'medium').toLowerCase();
    let y = theme.masthead(doc, logo, 'Therapy task', { text: `${priority} priority`, ...(PRIORITY[priority] || PRIORITY.medium) });
    y = theme.title(doc, task.title || 'Your task', y + 6, task.dueDate ? `Due ${istDay(task.dueDate)}` : undefined);

    // (It used to print the patient's and the task's raw ids, which mean nothing to anyone.)
    const status = task.status ? task.status.charAt(0).toUpperCase() + task.status.slice(1) : '—';
    y = theme.factsCard(doc, [
        ['Assigned by', task.doctorId?.firstName ? doctorDisplayName(task.doctorId.firstName, task.doctorId.lastName) : 'Your therapist'],
        ['Due', task.dueDate ? istDay(task.dueDate) : 'No date'],
        ['Status', status],
        ['Assigned on', task.createdAt ? istDay(task.createdAt) : '—'],
    ], y);

    y = theme.sectionHeading(doc, 1, 'What to do', y);
    theme.bodyText(doc);
    const lines: string[] = doc.splitTextToSize(task.description || 'Your therapist did not add details.', CONTENT_W);
    for (const line of lines) {
        if (y > BODY_BOTTOM - 4) {
            doc.addPage();
            y = MARGIN + 6;
            theme.bodyText(doc);
        }
        doc.text(line, MARGIN, y);
        y += BODY_LEAD;
    }

    // A gentle closing note, as on paper handed over in a session.
    y += 8;
    if (y < BODY_BOTTOM - 22) {
        doc.setFillColor(C.TEAL_WASH);
        doc.roundedRect(MARGIN, y, CONTENT_W, 16, 3, 3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        doc.setTextColor(C.TEAL_DARK);
        doc.text('Mark this task done in Veraawell when you finish it, so your therapist can see it before your next session.', MARGIN + 6, y + 9.2, { maxWidth: CONTENT_W - 12 });
    }

    theme.footers(doc, `Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: IST })}`);
    return doc;
};

export const generateTaskPDF = async (task: Task): Promise<void> => {
    const doc = await buildTaskPdf(task);
    const { fileName } = await import('./pdfTheme');
    doc.save(`Task_${fileName(task.title || 'task')}.pdf`);
};
