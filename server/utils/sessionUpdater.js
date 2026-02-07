const Session = require('../models/session');
const DoctorAvailability = require('../models/doctorAvailability');

/**
 * Updates status of past sessions from 'scheduled' to 'completed'.
 * Also releases any booked slots for cancelled sessions if missed.
 */
const updateSessionStatuses = async () => {
    try {
        const now = new Date();

        // 1. Find all scheduled sessions
        const scheduledSessions = await Session.find({
            status: 'scheduled'
        });

        let updatedCount = 0;

        for (const session of scheduledSessions) {
            // Parse time from UTC-based sessionTime
            const [hours, minutes] = session.sessionTime.split(':').map(Number);
            const sessionStart = new Date(session.sessionDate);
            sessionStart.setUTCHours(hours, minutes, 0, 0);

            const sessionEnd = new Date(sessionStart.getTime() + (session.duration * 60000));

            // If session end time is in the past, mark as completed
            if (sessionEnd < now) {
                // Strict Completion Rule: Both must have joined
                if (session.doctorJoined && session.patientJoined) {
                    session.status = 'completed';
                    session.callStatus = 'completed'; // If using this field
                    // The original code had session.paymentStatus = 'paid';
                    // This is removed as per the provided change.
                } else {
                    // If time passed but both didn't join, it's a no-show or expired
                    // For now, let's mark it as 'no-show' to distinguish from successful completion
                    session.status = 'no-show';
                    // The original code had logic to update callStatus if it was stuck.
                    // This new logic only sets callStatus to 'completed' if both joined.
                    // For 'no-show', callStatus will remain as is (e.g., 'not-started').
                }
                await session.save();
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            console.log(`[SESSION UPDATER] Updated ${updatedCount} sessions to 'completed'`);
        }

        return updatedCount;
    } catch (error) {
        console.error('[SESSION UPDATER] Error updating session statuses:', error);
        return 0;
    }
};

module.exports = { updateSessionStatuses };
