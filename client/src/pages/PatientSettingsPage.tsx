import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const ComingSoonBadge = () => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 800);
  };

  return (
    <div 
      onClick={handleClick}
      className={`
        px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase rounded-full cursor-pointer shrink-0 select-none
        transition-all duration-300 transform
        ${isAnimating 
          ? 'bg-teal-50 text-teal-600 scale-95' 
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
        }
      `}
    >
      {isAnimating ? 'Stay tuned...' : 'Coming Soon'}
    </div>
  );
};

const PatientSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const queryClient = useQueryClient();

  const updatePasswordMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/auth/update-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Password updated successfully');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      console.error('Password update error:', error);
      toast.error(error.message || 'An error occurred while updating password');
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/auth/delete-account`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete account');
      return data;
    },
    onSuccess: async () => {
      toast.success('Account deleted successfully');
      await logout(); // Clear frontend state and redirect
      queryClient.clear(); // Clear all queries
    },
    onError: (error: any) => {
      console.error('Account deletion error:', error);
      toast.error(error.message || 'An error occurred while deleting account');
    }
  });

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    updatePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleDeleteAccount = () => {
    const confirmDelete = window.confirm('Are you absolutely sure you want to permanently delete your account? This action cannot be undone.');
    if (!confirmDelete) return;
    deleteAccountMutation.mutate();
  };

  const isUpdatingPassword = updatePasswordMutation.isPending;
  const isDeleting = deleteAccountMutation.isPending;

  return (
    <div className="bg-[#f8fafc] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/patient-dashboard')} 
            className="p-2 bg-white rounded-full shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>Settings</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Account Preferences</h2>
            <p className="text-gray-500 text-sm">Manage your account details and preferences.</p>
          </div>
          
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-gray-800 font-medium">Email Notifications</h3>
                <p className="text-gray-500 text-sm mt-0.5">Receive updates about your appointments and sessions.</p>
              </div>
              <ComingSoonBadge />
            </div>
            
            <hr className="border-gray-100" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-gray-800 font-medium">SMS Alerts</h3>
                <p className="text-gray-500 text-sm mt-0.5">Get text messages for immediate reminders.</p>
              </div>
              <ComingSoonBadge />
            </div>

            <hr className="border-gray-100" />
            
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="text-gray-800 font-medium">Change Password</h3>
                <p className="text-gray-500 text-sm mt-0.5">Update your account password securely.</p>
              </div>
              {!showPasswordForm ? (
                <button 
                  onClick={() => setShowPasswordForm(true)}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors shadow-sm shrink-0"
                >
                  Update Password
                </button>
              ) : (
                <form onSubmit={handleUpdatePassword} className="w-full sm:w-auto mt-4 sm:mt-0 flex flex-col gap-3 min-w-[250px]">
                  <input
                    type="password"
                    placeholder="Current Password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="px-3 py-1.5 text-sm text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isUpdatingPassword ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <hr className="border-gray-100" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-red-600 font-medium">Delete Account</h3>
                <p className="text-red-400 text-sm mt-0.5">Permanently remove your account and all data.</p>
              </div>
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors shadow-sm shrink-0 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientSettingsPage;
