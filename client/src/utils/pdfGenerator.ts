import jsPDF from 'jspdf';

interface Report {
    _id: string;
    title: string;
    reportType: string;
    content: string;
    createdAt: string;
    doctorId: { firstName: string; lastName: string };
    patientId: { firstName: string; lastName: string };
}

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

export const generateReportPDF = (report: Report) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(56, 171, 174); // Teal color #38ABAE
    doc.text('VEERAWELL MENTAL HEALTH PLATFORM', 105, 20, { align: 'center' });

    doc.setFontSize(14);
    doc.text('Patient Report', 105, 30, { align: 'center' });

    // Report Details
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    let yPos = 50;
    doc.text(`Report Title: ${report.title}`, 20, yPos);
    yPos += 10;
    doc.text(`Report Type: ${report.reportType}`, 20, yPos);
    yPos += 10;
    doc.text(`Date: ${new Date(report.createdAt).toLocaleDateString()}`, 20, yPos);
    yPos += 15;

    doc.text(`Patient: ${report.patientId.firstName} ${report.patientId.lastName}`, 20, yPos);
    yPos += 10;
    doc.text(`Doctor: Dr. ${report.doctorId.firstName} ${report.doctorId.lastName}`, 20, yPos);
    yPos += 15;

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Content
    doc.setFontSize(11);
    doc.text('Report Content:', 20, yPos);
    yPos += 10;

    const splitContent = doc.splitTextToSize(report.content, 170);
    doc.text(splitContent, 20, yPos);

    // Calculate position for footer
    const contentHeight = splitContent.length * 7;
    yPos += contentHeight + 15;

    // Add new page if content is too long
    if (yPos > 270) {
        doc.addPage();
        yPos = 20;
    }

    // Footer
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yPos);
    doc.text(`Report ID: ${report._id}`, 20, yPos + 5);

    // Save
    const fileName = `Report_${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);
};

export const generateTaskPDF = (task: Task) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(56, 171, 174); // Teal color #38ABAE
    doc.text('VEERAWELL MENTAL HEALTH PLATFORM', 105, 20, { align: 'center' });

    doc.setFontSize(14);
    doc.text('Task Assignment', 105, 30, { align: 'center' });

    // Task Details
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);

    let yPos = 50;
    doc.text(`Task: ${task.title}`, 20, yPos);
    yPos += 10;

    // Priority with color coding
    const priorityColor: [number, number, number] = task.priority === 'high' ? [220, 38, 38] :
        task.priority === 'medium' ? [234, 179, 8] :
            [34, 197, 94];
    doc.setTextColor(priorityColor[0], priorityColor[1], priorityColor[2]);
    doc.text(`Priority: ${task.priority.toUpperCase()}`, 20, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    doc.text(`Due Date: ${new Date(task.dueDate).toLocaleDateString()}`, 20, yPos);
    yPos += 10;
    doc.text(`Status: ${task.status.charAt(0).toUpperCase() + task.status.slice(1)}`, 20, yPos);
    yPos += 15;

    doc.text(`Assigned by: Dr. ${task.doctorId.firstName} ${task.doctorId.lastName}`, 20, yPos);
    yPos += 10;
    // Note: patientId is just a string ID, not an object with name
    doc.text(`Patient ID: ${task.patientId}`, 20, yPos);
    yPos += 15;

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Description
    doc.setFontSize(11);
    doc.text('Description:', 20, yPos);
    yPos += 10;

    const splitDesc = doc.splitTextToSize(task.description, 170);
    doc.text(splitDesc, 20, yPos);

    // Calculate position for footer
    const descHeight = splitDesc.length * 7;
    yPos += descHeight + 15;

    // Add new page if content is too long
    if (yPos > 270) {
        doc.addPage();
        yPos = 20;
    }

    // Footer
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    doc.setFontSize(9);
    doc.setTextColor(128, 128, 128);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yPos);
    doc.text(`Task ID: ${task._id}`, 20, yPos + 5);

    // Save
    const fileName = `Task_${task.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);
};
