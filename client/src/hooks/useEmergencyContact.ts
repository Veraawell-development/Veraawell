import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import type { EmergencyContactValue } from '../utils/emergencyContact';

/**
 * Saves (or, with null, removes) the patient's emergency contact and brings
 * every copy of it up to date: the signed-in user (dashboard banner, call
 * room) and the profile page's query. The modals used to save without either,
 * so the dashboard kept saying "Add an emergency contact" and the call room
 * asked for it again right after it was given.
 */
export function useSaveEmergencyContact() {
  const { checkAuth } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(async (contact: EmergencyContactValue | null) => {
    const response = await fetch(`${API_BASE_URL}/patients/emergency-contact`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactName: contact?.name ?? '',
        contactPhone: contact?.phone ?? '',
        contactRelationship: contact?.relationship ?? '',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || "Couldn't save your emergency contact. Please try again.");
    }
    await refreshPatient(checkAuth, queryClient);
    return data.emergencyContact as EmergencyContactValue | null;
  }, [checkAuth, queryClient]);
}

/** After any profile or contact change: re-read the signed-in user and the profile page's data. */
export function useRefreshPatient() {
  const { checkAuth } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(() => refreshPatient(checkAuth, queryClient), [checkAuth, queryClient]);
}

async function refreshPatient(
  checkAuth: (o?: { force?: boolean }) => Promise<boolean>,
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all([
    checkAuth({ force: true }),
    queryClient.invalidateQueries({ queryKey: ['patient', 'profile'] }),
  ]);
}
